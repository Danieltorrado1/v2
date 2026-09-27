import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const NOMINA_RESUME_SNAPSHOT_SCHEMA_VERSION = '1.0';
export const NOMINA_RESUME_SCOPE = { empresa_id: '15', contrato_id: '24', periodo_id: '3' } as const;

export type RecoveryEconomicState = {
  empleado_id: string;
  empresa_id: string;
  contrato_id: string;
  periodo_id: string;
  dias_pagados: number;
  horas_trabajadas: number;
  devengado_basico: number;
  devengado_transporte: number;
  devengado_otros: number;
  salud: number;
  pension: number;
  total_adiciones: number;
  total_deducciones: number;
  neto_pagar: number;
  detalle_calculo_digest: string;
};

export type RecoverySnapshot = {
  schema_version: string;
  empleado_id: string;
  empresa_id: string;
  contrato_id: string;
  periodo_id: string;
  backup_manifest: string;
  digest_before: string;
  digest_after: string;
  before: RecoveryEconomicState;
  after: RecoveryEconomicState;
};

const allowedIds = new Set(['1020', '1021', '1022', '1023', '1097', '1098', '1099', '1101', '1102', '1104', '1105', '1106', '1107', '1108', '1109']);
const economicKeys = new Set(['empleado_id', 'empresa_id', 'contrato_id', 'periodo_id', 'dias_pagados', 'horas_trabajadas', 'devengado_basico', 'devengado_transporte', 'devengado_otros', 'salud', 'pension', 'total_adiciones', 'total_deducciones', 'neto_pagar', 'detalle_calculo_digest']);
const snapshotKeys = new Set(['schema_version', 'empleado_id', 'empresa_id', 'contrato_id', 'periodo_id', 'backup_manifest', 'digest_before', 'digest_after', 'before', 'after']);

const assertExactKeys = (value: Record<string, unknown>, allowed: Set<string>, label: string): void => {
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new Error(`${label} contiene campo desconocido: ${key}.`);
  for (const key of allowed) if (!(key in value)) throw new Error(`${label} carece de campo obligatorio: ${key}.`);
};

const assertDigest = (value: string, label: string): void => {
  if (!/^[a-f0-9]{64}$/.test(value)) throw new Error(`${label} no es SHA-256 hexadecimal.`);
};

export const canonicalizeResumeValue = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonicalizeResumeValue).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeResumeValue((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
};

export const digestResumeDetail = (value: unknown): string => createHash('sha256').update(canonicalizeResumeValue(value)).digest('hex');

export const validateRecoverySnapshot = (input: unknown, expectedBackupManifest?: string): RecoverySnapshot[] => {
  if (!Array.isArray(input) || input.length !== allowedIds.size) throw new Error('El snapshot debe contener exactamente 15 registros.');
  const ids = input.map((item) => String((item as Record<string, unknown>)?.empleado_id ?? ''));
  if (new Set(ids).size !== ids.length) throw new Error('El snapshot contiene empleado_id duplicados.');
  if (ids.some((id) => !allowedIds.has(id))) throw new Error('El snapshot contiene IDs fuera de los 15 autorizados.');
  for (const item of input) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Registro de snapshot inválido.');
    const row = item as Record<string, unknown>;
    assertExactKeys(row, snapshotKeys, 'snapshot');
    if (row.schema_version !== NOMINA_RESUME_SNAPSHOT_SCHEMA_VERSION) throw new Error('Versión de snapshot no soportada.');
    if (row.backup_manifest !== expectedBackupManifest && expectedBackupManifest) throw new Error('Referencia de backup inconsistente.');
    if (row.empresa_id !== NOMINA_RESUME_SCOPE.empresa_id || row.contrato_id !== NOMINA_RESUME_SCOPE.contrato_id || row.periodo_id !== NOMINA_RESUME_SCOPE.periodo_id) throw new Error(`Alcance inválido para empleado técnico ${row.empleado_id}.`);
    assertDigest(String(row.digest_before), 'digest_before'); assertDigest(String(row.digest_after), 'digest_after');
    for (const side of ['before', 'after'] as const) {
      const state = row[side];
      if (!state || typeof state !== 'object' || Array.isArray(state)) throw new Error(`${side} inválido.`);
      const economic = state as Record<string, unknown>;
      assertExactKeys(economic, economicKeys, side);
      if (economic.empleado_id !== row.empleado_id || economic.empresa_id !== row.empresa_id || economic.contrato_id !== row.contrato_id || economic.periodo_id !== row.periodo_id) throw new Error(`Alcance divergente en ${side} para ${row.empleado_id}.`);
      for (const key of ['dias_pagados','horas_trabajadas','devengado_basico','devengado_transporte','devengado_otros','salud','pension','total_adiciones','total_deducciones','neto_pagar']) if (typeof economic[key] !== 'number' || !Number.isFinite(economic[key] as number)) throw new Error(`${side}.${key} inválido.`);
      assertDigest(String(economic.detalle_calculo_digest), `${side}.detalle_calculo_digest`);
    }
    if (row.digest_before !== (row.before as Record<string, unknown>).detalle_calculo_digest || row.digest_after !== (row.after as Record<string, unknown>).detalle_calculo_digest) throw new Error(`Digests top-level inconsistentes para ${row.empleado_id}.`);
  }
  return input.map((item) => item as RecoverySnapshot).sort((a, b) => Number(a.empleado_id) - Number(b.empleado_id));
};

export const loadRecoverySnapshotFile = (path: string, expectedBackupManifest?: string): RecoverySnapshot[] =>
  validateRecoverySnapshot(JSON.parse(readFileSync(path, 'utf8').replace(/^\uFEFF/, '')), expectedBackupManifest);

export const buildRecoverySnapshot = (
  beforeRows: Array<Record<string, unknown>>,
  afterRows: Array<Record<string, unknown>>,
  backupManifest: string
): RecoverySnapshot[] => {
  const byId = (rows: Array<Record<string, unknown>>): Map<string, Record<string, unknown>> => {
    const result = new Map<string, Record<string, unknown>>();
    for (const row of rows) {
      if (typeof row.empleado_id !== 'string') throw new Error('El productor exige empleado_id; no acepta id como sustituto.');
      if (result.has(row.empleado_id)) throw new Error(`empleado_id duplicado: ${row.empleado_id}.`);
      result.set(row.empleado_id, row);
    }
    return result;
  };
  const state = (row: Record<string, unknown>): RecoveryEconomicState => {
    const numeric = (key: string): number => {
      const value = Number(row[key] ?? 0);
      if (!Number.isFinite(value)) throw new Error(`${key} inválido para ${row.empleado_id}.`);
      return value;
    };
    if (typeof row.detalle_calculo !== 'object' || row.detalle_calculo === null) throw new Error(`detalle_calculo ausente para ${row.empleado_id}.`);
    return {
      empleado_id: String(row.empleado_id), ...NOMINA_RESUME_SCOPE,
      dias_pagados: numeric('dias_pagados'), horas_trabajadas: numeric('horas_trabajadas'),
      devengado_basico: numeric('devengado_basico'), devengado_transporte: numeric('devengado_transporte'), devengado_otros: numeric('devengado_otros'),
      salud: numeric('salud'), pension: numeric('pension'), total_adiciones: numeric('total_adiciones'), total_deducciones: numeric('total_deducciones'), neto_pagar: numeric('neto_pagar'),
      detalle_calculo_digest: digestResumeDetail(row.detalle_calculo)
    };
  };
  const before = byId(beforeRows); const after = byId(afterRows);
  if (before.size !== after.size) throw new Error('before y after no tienen la misma cardinalidad.');
  const snapshots = [...before.keys()].sort((a, b) => Number(a) - Number(b)).map((empleado_id) => {
    const beforeState = state(before.get(empleado_id)!); const afterState = state(after.get(empleado_id)!);
    return { schema_version: NOMINA_RESUME_SNAPSHOT_SCHEMA_VERSION, empleado_id, ...NOMINA_RESUME_SCOPE, backup_manifest: backupManifest, digest_before: beforeState.detalle_calculo_digest, digest_after: afterState.detalle_calculo_digest, before: beforeState, after: afterState };
  });
  return validateRecoverySnapshot(snapshots, backupManifest);
};
