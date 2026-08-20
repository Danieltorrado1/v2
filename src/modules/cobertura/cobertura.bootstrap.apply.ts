import { createHash } from 'node:crypto';

import type { BootstrapCatalogs, BootstrapDetail, BootstrapSourceRow } from './cobertura.bootstrap.domain';
import { normalizeFocalizacionText } from './cobertura.focalizacion.domain';

export const BOOTSTRAP_TARGET = 'CONSORCIO PAE META 26';
export const BOOTSTRAP_CONFIRMATION = 'CONSORCIO_PAE_META_26';
export const BOOTSTRAP_CONTRACT_ID = '24';

export interface InstitutionSpec { key: string; municipioId: string; codigoDane: string | null; nombreOriginal: string; nombreNormalizado: string; nombreVisible: string }
export interface SedeSpec { key: string; institutionKey: string; municipioId: string; codigoDane: string; consecutivo: string; nombreOriginal: string; nombreNormalizado: string; nombreVisible: string }
export interface RelationSpec { key: string; sedeKey: string; modalidadId: string }
export interface BootstrapApplyPlan { institutions: InstitutionSpec[]; sedes: SedeSpec[]; relations: RelationSpec[]; sourceHash: string; sourceRows: number }
export interface ApplyEntityResult { created: boolean; id: string }
export interface BootstrapApplyResult { institutions: { created: number; reused: number }; sedes: { created: number; reused: number }; relations: { created: number; reused: number } }

export interface BootstrapApplyStore {
  resolveInstitution(spec: InstitutionSpec): Promise<ApplyEntityResult>;
  ensureInstitutionHistory(id: string, spec: InstitutionSpec): Promise<void>;
  resolveSede(spec: SedeSpec, institutionId: string): Promise<ApplyEntityResult>;
  ensureSedeHistory(id: string, spec: SedeSpec): Promise<void>;
  ensureSedeInstitutionHistory(sedeId: string, institutionId: string): Promise<void>;
  resolveRelation(spec: RelationSpec, sedeId: string): Promise<ApplyEntityResult>;
  audit(result: BootstrapApplyResult, plan: BootstrapApplyPlan): Promise<void>;
  validate(plan: BootstrapApplyPlan, institutionIds: Map<string, string>, sedeIds: Map<string, string>): Promise<void>;
}

export interface TransactionClient { query(sql: string, params?: unknown[]): Promise<unknown> }

const digits = (value: string | null): string => value?.replace(/\D/g, '') ?? '';
const presentation = (value: string): string => normalizeFocalizacionText(value).replace(/^INSTITUCION EDUCATIVA\b/, 'INSTITUCIÓN EDUCATIVA');

export const validateApplyProtection = (args: { apply: boolean; confirm?: string; contractId?: string }): void => {
  if (!args.apply) return;
  if (args.contractId !== BOOTSTRAP_CONTRACT_ID) throw new Error('APPLY_CONTRACT_ID_INVALIDO');
  if (args.confirm !== BOOTSTRAP_CONFIRMATION) throw new Error('APPLY_CONFIRMACION_INVALIDA');
};

export const buildBootstrapApplyPlan = (
  buffer: Buffer,
  rows: BootstrapSourceRow[],
  details: BootstrapDetail[],
  catalogs: BootstrapCatalogs,
): BootstrapApplyPlan => {
  if (rows.length !== details.length) throw new Error('APPLY_PLAN_DESALINEADO');
  const institutions = new Map<string, InstitutionSpec>();
  const sedes = new Map<string, SedeSpec>();
  const relations = new Map<string, RelationSpec>();
  rows.forEach((row, index) => {
    const detail = details[index];
    if (!detail || detail.estado === 'ERROR' || detail.estado === 'REVISAR') throw new Error(`APPLY_PLAN_NO_APROBABLE_FILA_${row.fila}`);
    const rowDigits = digits(row.consecutivo);
    const municipioCode = rowDigits.slice(1, 6);
    const municipio = catalogs.municipios.find((item) => item.codigo_dane === municipioCode);
    if (!municipio) throw new Error(`MUNICIPIO_NO_RECONOCIDO_FILA_${row.fila}`);
    const modalidad = catalogs.modalidades.find((item) => item.id === detail.modalidad_id);
    if (!modalidad) throw new Error(`MODALIDAD_NO_RECONOCIDA_FILA_${row.fila}`);
    if (rowDigits.length < 14) throw new Error(`CODIGO_DANE_INVALIDO_FILA_${row.fila}`);
    const instNorm = normalizeFocalizacionText(row.institucion);
    // El XLSX solo aporta CONSECUTIVO de sede; no se deriva de él un código de institución inexistente.
    const instKey = `${BOOTSTRAP_CONTRACT_ID}|${municipio.id}|${instNorm}`;
    institutions.set(instKey, { key: instKey, municipioId: municipio.id, codigoDane: null, nombreOriginal: row.institucion, nombreNormalizado: instNorm, nombreVisible: presentation(row.institucion) });
    const sedeNorm = normalizeFocalizacionText(row.sede);
    const sedeKey = `${instKey}|${rowDigits}`;
    const existingSede = sedes.get(sedeKey);
    if (existingSede && existingSede.nombreNormalizado !== sedeNorm) throw new Error(`SEDE_CODIGO_CONFLICTIVO_${rowDigits}`);
    sedes.set(sedeKey, { key: sedeKey, institutionKey: instKey, municipioId: municipio.id, codigoDane: rowDigits, consecutivo: rowDigits, nombreOriginal: row.sede, nombreNormalizado: sedeNorm, nombreVisible: presentation(row.sede) });
    const relationKey = `${sedeKey}|${modalidad.id}|${BOOTSTRAP_CONTRACT_ID}`;
    relations.set(relationKey, { key: relationKey, sedeKey, modalidadId: modalidad.id });
  });
  return { institutions: [...institutions.values()], sedes: [...sedes.values()], relations: [...relations.values()], sourceHash: createHash('sha256').update(buffer).digest('hex'), sourceRows: rows.length };
};

export const applyBootstrapPlan = async (store: BootstrapApplyStore, plan: BootstrapApplyPlan): Promise<BootstrapApplyResult> => {
  const result: BootstrapApplyResult = { institutions: { created: 0, reused: 0 }, sedes: { created: 0, reused: 0 }, relations: { created: 0, reused: 0 } };
  const institutionIds = new Map<string, string>();
  const sedeIds = new Map<string, string>();
  for (const spec of plan.institutions) {
    const entity = await store.resolveInstitution(spec); institutionIds.set(spec.key, entity.id);
    result.institutions[entity.created ? 'created' : 'reused'] += 1;
    await store.ensureInstitutionHistory(entity.id, spec);
  }
  for (const spec of plan.sedes) {
    const institutionId = institutionIds.get(spec.institutionKey);
    if (!institutionId) throw new Error(`INSTITUCION_INTERNA_NO_RESUELTA_${spec.institutionKey}`);
    const entity = await store.resolveSede(spec, institutionId); sedeIds.set(spec.key, entity.id);
    result.sedes[entity.created ? 'created' : 'reused'] += 1;
    await store.ensureSedeHistory(entity.id, spec);
    await store.ensureSedeInstitutionHistory(entity.id, institutionId);
  }
  for (const spec of plan.relations) {
    const sedeId = sedeIds.get(spec.sedeKey);
    if (!sedeId) throw new Error(`SEDE_INTERNA_NO_RESUELTA_${spec.sedeKey}`);
    const entity = await store.resolveRelation(spec, sedeId);
    result.relations[entity.created ? 'created' : 'reused'] += 1;
  }
  await store.validate(plan, institutionIds, sedeIds);
  await store.audit(result, plan);
  return result;
};

export const runApplyTransaction = async <T>(client: TransactionClient, operation: () => Promise<T>): Promise<T> => {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    const result = await operation();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};
