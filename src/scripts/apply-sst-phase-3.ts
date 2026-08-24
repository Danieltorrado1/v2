import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import path from 'node:path';
import assert from 'node:assert/strict';

import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import { Pool, type PoolClient, type QueryResultRow } from 'pg';

import { app } from '../app';
import { env } from '../config/env';
import { computeSstPerfilCompleteness, type SstPerfilEditableValues } from '../modules/sst/sst.perfil.domain';
import { upsertSstPerfilSociodemograficoWithClient } from '../modules/sst/sst.perfil.service';
import { buildRestrictedSstPayload } from '../modules/sst/sst.preparacion.domain';
import {
  canonicalizeRows,
  createPool,
  parseResponseRows,
  readWorkbookAudit,
  type CanonicalResponse
} from './sst-caracterizacion-audit';

dotenv.config();

const REPORTS_DIR = path.resolve('reports');
const PLAN_PATH = path.resolve('reports/sst-caracterizacion-apply-plan-meta26.json');
const RESULTS_CSV_PATH = path.resolve('reports/sst-3-apply-resultados.csv');
const COMPLETOS_CSV_PATH = path.resolve('reports/sst-3-completos.csv');
const INCOMPLETOS_CSV_PATH = path.resolve('reports/sst-3-incompletos.csv');
const EXCLUIDOS_CSV_PATH = path.resolve('reports/sst-3-excluidos.csv');
const INTEGRIDAD_JSON_PATH = path.resolve('reports/sst-3-integridad.json');
const SUMMARY_JSON_PATH = path.resolve('reports/sst-3-apply-summary.json');
const FILE_1_PATH = path.resolve('data/SST/Perfil sociodemografico Complementos (respuestas).xlsx');
const FILE_2_PATH = path.resolve('data/SST/Caracterizaci\u00f3n adicional (respuestas).xlsx');
const META26_CONTRATO_ID = 24;
const META26_EMPRESA_ID = 15;
const BATCH_SIZE = 10;
const FIRST_BATCH_SIZE = 5;

interface CountRow extends QueryResultRow {
  total: string;
}

interface BoolRow extends QueryResultRow {
  exists: boolean;
}

interface PersonaCoreRow extends QueryResultRow {
  id: number | string;
  estado_civil_id: number | string | null;
  fecha_nacimiento: string | Date | null;
  sexo_id: number | string | null;
}

interface VinculacionPersonaRow extends QueryResultRow {
  id: number | string;
  persona_id: number | string;
}

interface RoleUserRow extends QueryResultRow {
  user_id: number | string;
  correo: string | null;
  nombre_rol: string;
}

interface RestrictedRow extends QueryResultRow {
  persona_id: number | string;
  tipo_sangre_rh: string | null;
  tiene_discapacidad: boolean | null;
  tipo_discapacidad: string | null;
  presenta_alergias: string | null;
  medicamentos_permanentes: string | null;
  enfermedad: string | null;
}

interface PerfilCurrentRow extends QueryResultRow {
  persona_id: number | string;
  fecha_caracterizacion: string | Date | null;
  origen: string | null;
  nacionalidad: string | null;
  estrato_socioeconomico: string | null;
  tipo_vivienda: string | null;
  grupo_etnico: string | null;
  nivel_escolaridad: string | null;
  profesion_ocupacion: string | null;
  personas_dependen_economicamente: number | string | null;
  cabeza_familia: boolean | null;
  total_hijos: number | string | null;
  hijos_viven_con_usted: number | string | null;
  hijos_menores_edad: number | string | null;
  hijos_mayores_edad: number | string | null;
  redes_apoyo_social: string | null;
  autorizacion_tratamiento_datos: boolean | null;
  observaciones: string | null;
  requiere_revision: boolean | null;
  vinculacion_id: number | string | null;
}

interface PlanSummary {
  automaticos_esperados: number;
  parciales_esperados: number;
  revision_esperados: number;
  sin_datos_esperados: number;
  registros_plan: number;
  perfiles_completos_post_apply: number;
  perfiles_incompletos_post_apply: number;
}

interface PlanRow {
  persona_id: number;
  vinculacion_id: number;
  empresa_id: number;
  contrato_id: number;
  documento: string;
  nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
  cargo: string | null;
  fuente_formulario_1: boolean;
  fuente_formulario_2: boolean;
  estado_digital: string;
  estado_preparacion: 'APTO_APPLY_AUTOMATICO' | 'APTO_APPLY_PARCIAL';
  porcentaje_completitud: number;
  completitud_estado: 'COMPLETA' | 'INCOMPLETA';
  conflictos_aparentes: number;
  conflictos_reales: number;
  requiere_revision_humana: boolean;
  requiere_captura: boolean;
  apto_apply: boolean;
  propuesta_sst: Record<string, unknown>;
  propuesta_contacto_emergencia: Record<string, unknown>;
  propuesta_formacion_academica: Array<Record<string, unknown>>;
  propuesta_afiliaciones: Array<Record<string, unknown>>;
  campos_restringidos: string[];
  fuentes: string[];
  observaciones: string | null;
}

interface PlanFile {
  generated_at: string;
  contrato_id: number;
  summary: PlanSummary;
  rows: PlanRow[];
}

interface BaselineCounts {
  personas: number;
  vinculaciones: number;
  cobertura_asignaciones: number;
  focalizacion_final: number;
  focalizacion_vigencias: number;
  vinculacion_afiliaciones: number;
  persona_contactos_emergencia: number;
  persona_formacion_academica: number;
  sst_perfil_demografico: number;
  sst_perfil_demografico_versiones: number;
  sst_perfil_restringido: number;
  sst_preparacion_personas: number;
  sst_revision_casos: number;
  auditoria_eventos_sst: number;
  historial_cambios_sst: number;
}

interface DryRunValidationResult {
  completosPrevistos: number;
  incompletosPrevistos: number;
  conflictosInesperados: number;
  personasInexistentes: number;
  vinculacionesIncompatibles: number;
  perfilesPrevios: number;
}

interface ResumeState {
  appliedPersonaIds: Set<number>;
  currentProfiles: number;
  currentVersions: number;
  currentRestricted: number;
}

interface AtomicityReport {
  ok: boolean;
  errorCode: string;
  firstPersonaId: number;
  secondPersonaId: number;
  firstPersistedInsideTx: number;
  beforeCounts: {
    perfiles: number;
    versiones: number;
    restringidos: number;
    auditoria: number;
    historial: number;
  };
  afterCounts: {
    perfiles: number;
    versiones: number;
    restringidos: number;
    auditoria: number;
    historial: number;
  };
}

interface HttpFixtureUser {
  created: boolean;
  email: string;
  userId: string;
}

interface AppliedResultRow {
  persona_id: number;
  vinculacion_id: number;
  documento: string;
  nombre: string;
  estado_preparacion: string;
  completitud_estado: string;
  porcentaje_completitud: number;
  origen: string | null;
  restricted_present: boolean;
  batch_label: string;
}

interface HttpCheckResult {
  role: string;
  status: number;
  ok: boolean;
  restrictedVisible: boolean;
  hiddenFlag: boolean;
}

const countQuery = async (db: Pool | PoolClient, sql: string, params: unknown[] = []): Promise<number> => {
  const result = await db.query<CountRow>(sql, params);
  return Number(result.rows[0]?.total ?? 0);
};

const tableExists = async (db: Pool | PoolClient, tableName: string): Promise<boolean> => {
  const result = await db.query<BoolRow>(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName]
  );

  return Boolean(result.rows[0]?.exists);
};

const toNullableNumber = (value: string | number | null | undefined): number | null => {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const formatDate = (value: string | Date | null | undefined): string | null => {
  if (!value) {
    return null;
  }

  if (typeof value === 'string') {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
};

const csvEscape = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const writeCsv = async <T extends object>(filePath: string, headers: string[], rows: T[]): Promise<void> => {
  const lines = [headers.map(csvEscape).join(',')];
  for (const row of rows) {
    const record = row as Record<string, unknown>;
    lines.push(headers.map((header) => csvEscape(record[header])).join(','));
  }
  await writeFile(filePath, `${lines.join('\n')}\n`, 'utf8');
};

const writeJson = async (filePath: string, value: unknown): Promise<void> => {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

const loadPlan = async (): Promise<PlanFile> => {
  const content = await readFile(PLAN_PATH, 'utf8');
  return JSON.parse(content) as PlanFile;
};

const loadBaselineCounts = async (pool: Pool): Promise<BaselineCounts> => ({
  personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM personas'),
  vinculaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM vinculaciones'),
  cobertura_asignaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM cobertura_asignaciones'),
  focalizacion_final: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_final'),
  focalizacion_vigencias: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_vigencias'),
  vinculacion_afiliaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM vinculacion_afiliaciones'),
  persona_contactos_emergencia: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM persona_contactos_emergencia'),
  persona_formacion_academica: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM persona_formacion_academica'),
  sst_perfil_demografico: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
  sst_perfil_demografico_versiones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones'),
  sst_perfil_restringido: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_restringido'),
  sst_preparacion_personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_preparacion_personas WHERE activo = TRUE'),
  sst_revision_casos: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_revision_casos WHERE activo = TRUE'),
  auditoria_eventos_sst: await countQuery(
    pool,
    `SELECT COUNT(*)::text AS total FROM auditoria_eventos WHERE entidad = 'sst_perfil_demografico'`
  ),
  historial_cambios_sst: await countQuery(
    pool,
    `SELECT COUNT(*)::text AS total FROM historial_cambios WHERE tabla_afectada = 'sst_perfil_demografico'`
  )
});

const assertPlanIntegrity = async (pool: Pool, plan: PlanFile): Promise<void> => {
  assert.equal(plan.contrato_id, META26_CONTRATO_ID, 'El plan SST-3 no corresponde al contrato META-26.');
  assert.equal(plan.summary.registros_plan, 640, 'El plan SST-3 debe contener 640 registros.');
  assert.equal(plan.summary.automaticos_esperados, 183, 'El plan SST-3 debe contener 183 automaticos.');
  assert.equal(plan.summary.parciales_esperados, 457, 'El plan SST-3 debe contener 457 parciales.');
  assert.equal(plan.summary.revision_esperados, 41, 'El plan SST-3 debe registrar 41 en revision.');
  assert.equal(plan.summary.sin_datos_esperados, 91, 'El plan SST-3 debe registrar 91 sin datos.');
  assert.equal(plan.rows.length, 640, 'El archivo del plan SST-3 debe contener 640 filas.');

  const stateAgg = await pool.query<QueryResultRow>(
    `
      SELECT estado_preparacion, COUNT(*)::text AS total
      FROM sst_preparacion_personas
      WHERE activo = TRUE
        AND contrato_id = $1::bigint
      GROUP BY estado_preparacion
    `,
    [META26_CONTRATO_ID]
  );

  const aggMap = new Map<string, number>();
  for (const row of stateAgg.rows) {
    aggMap.set(String(row.estado_preparacion), Number(row.total ?? 0));
  }

  assert.equal(aggMap.get('APTO_APPLY_AUTOMATICO') ?? 0, 183, 'sst_preparacion_personas automatico no coincide.');
  assert.equal(aggMap.get('APTO_APPLY_PARCIAL') ?? 0, 457, 'sst_preparacion_personas parcial no coincide.');
  assert.equal(aggMap.get('REQUIERE_REVISION') ?? 0, 41, 'sst_preparacion_personas revision no coincide.');
  assert.equal(aggMap.get('SIN_DATOS_DIGITALES') ?? 0, 91, 'sst_preparacion_personas sin datos no coincide.');
};

const buildCanonicalMap = async (): Promise<Map<string, CanonicalResponse>> => {
  const [file1Audit, file2Audit] = await Promise.all([
    readWorkbookAudit(FILE_1_PATH),
    readWorkbookAudit(FILE_2_PATH)
  ]);

  const f1Rows = parseResponseRows(file1Audit, 'F1');
  const f2Rows = parseResponseRows(file2Audit, 'F2');
  const canonical = [...canonicalizeRows(f1Rows), ...canonicalizeRows(f2Rows)];
  const map = new Map<string, CanonicalResponse>();

  for (const row of canonical) {
    const current = map.get(row.documentNormalized);
    if (!current) {
      map.set(row.documentNormalized, row);
      continue;
    }

    map.set(row.documentNormalized, {
      ...current,
      responseCount: current.responseCount + row.responseCount,
      rowNumbers: [...current.rowNumbers, ...row.rowNumbers].sort((left, right) => left - right),
      rawRows: [...current.rawRows, ...row.rawRows],
      mergedSst: {
        ...current.mergedSst,
        ...row.mergedSst
      },
      mergedPersona: {
        ...current.mergedPersona,
        ...row.mergedPersona
      },
      mergedContact: {
        ...current.mergedContact,
        ...row.mergedContact
      },
      mergedAffiliation: {
        ...current.mergedAffiliation,
        ...row.mergedAffiliation
      },
      unsupportedFields: {
        ...current.unsupportedFields,
        ...row.unsupportedFields
      },
      sensitiveFields: {
        ...current.sensitiveFields,
        ...row.sensitiveFields
      },
      timestampIsoLatest: row.timestampIsoLatest ?? current.timestampIsoLatest
    });
  }

  return map;
};

const buildUpdateInput = (
  row: PlanRow,
  canonicalMap: Map<string, CanonicalResponse>
): Record<string, unknown> => {
  const canonical = canonicalMap.get(row.documento);
  const restrictedPayload = canonical
    ? buildRestrictedSstPayload({
        tiene_discapacidad:
          typeof canonical.mergedSst.tiene_discapacidad === 'boolean'
            ? canonical.mergedSst.tiene_discapacidad
            : null,
        tipo_discapacidad: canonical.mergedSst.tipo_discapacidad ?? null,
        presenta_alergias: canonical.mergedSst.presenta_alergias ?? null,
        medicamentos_permanentes: canonical.mergedSst.medicamentos_permanentes ?? null,
        enfermedad: canonical.mergedSst.enfermedad ?? null,
        tipo_sangre_rh:
          (canonical.sensitiveFields.tipo_sangre_rh as string | null | undefined) ??
          (canonical.sensitiveFields.tipo_sangre as string | null | undefined) ??
          null
      })
    : {};

  return {
    ...row.propuesta_sst,
    ...restrictedPayload,
    vinculacion_id: row.vinculacion_id,
    fecha_caracterizacion:
      typeof row.propuesta_sst.fecha_caracterizacion === 'string'
        ? row.propuesta_sst.fecha_caracterizacion
        : null,
    origen: 'FORMULARIO_DIGITAL',
    motivo_cambio: 'SST-3 APPLY CONTROLADO META-26'
  };
};

const loadPersonaCoreMap = async (pool: Pool, personaIds: number[]): Promise<Map<number, PersonaCoreRow>> => {
  const result = await pool.query<PersonaCoreRow>(
    `
      SELECT id, fecha_nacimiento, sexo_id, estado_civil_id
      FROM personas
      WHERE id = ANY($1::bigint[])
    `,
    [personaIds]
  );

  return new Map(result.rows.map((row) => [Number(row.id), row]));
};

const loadVinculacionMap = async (pool: Pool, vinculacionIds: number[]): Promise<Map<number, VinculacionPersonaRow>> => {
  const result = await pool.query<VinculacionPersonaRow>(
    `
      SELECT id, persona_id
      FROM vinculaciones
      WHERE id = ANY($1::bigint[])
    `,
    [vinculacionIds]
  );

  return new Map(result.rows.map((row) => [Number(row.id), row]));
};

const normalizeValuesForCompleteness = (input: Record<string, unknown>): SstPerfilEditableValues => ({
  nacionalidad: (input.nacionalidad as string | null | undefined) ?? null,
  estrato_socioeconomico: (input.estrato_socioeconomico as string | null | undefined) ?? null,
  tipo_vivienda: (input.tipo_vivienda as string | null | undefined) ?? null,
  grupo_etnico: (input.grupo_etnico as string | null | undefined) ?? null,
  nivel_escolaridad: (input.nivel_escolaridad as string | null | undefined) ?? null,
  profesion_ocupacion: (input.profesion_ocupacion as string | null | undefined) ?? null,
  personas_dependen_economicamente: toNullableNumber(input.personas_dependen_economicamente as string | number | null | undefined),
  cabeza_familia: (input.cabeza_familia as boolean | null | undefined) ?? null,
  total_hijos: toNullableNumber(input.total_hijos as string | number | null | undefined),
  hijos_viven_con_usted: toNullableNumber(input.hijos_viven_con_usted as string | number | null | undefined),
  hijos_menores_edad: toNullableNumber(input.hijos_menores_edad as string | number | null | undefined),
  hijos_mayores_edad: toNullableNumber(input.hijos_mayores_edad as string | number | null | undefined),
  tipo_sangre_rh: (input.tipo_sangre_rh as string | null | undefined) ?? null,
  tiene_discapacidad: (input.tiene_discapacidad as boolean | null | undefined) ?? null,
  tipo_discapacidad: (input.tipo_discapacidad as string | null | undefined) ?? null,
  redes_apoyo_social: (input.redes_apoyo_social as string | null | undefined) ?? null,
  presenta_alergias: (input.presenta_alergias as string | null | undefined) ?? null,
  medicamentos_permanentes: (input.medicamentos_permanentes as string | null | undefined) ?? null,
  enfermedad: (input.enfermedad as string | null | undefined) ?? null,
  autorizacion_tratamiento_datos: (input.autorizacion_tratamiento_datos as boolean | null | undefined) ?? null,
  observaciones: (input.observaciones as string | null | undefined) ?? null
});

const validateDryRunBeforeApply = async (
  pool: Pool,
  planRows: PlanRow[],
  canonicalMap: Map<string, CanonicalResponse>
): Promise<DryRunValidationResult> => {
  const personaIds = planRows.map((row) => row.persona_id);
  const vinculacionIds = planRows.map((row) => row.vinculacion_id);
  const [personaMap, vinculacionMap, perfilesPrevios] = await Promise.all([
    loadPersonaCoreMap(pool, personaIds),
    loadVinculacionMap(pool, vinculacionIds),
    countQuery(
      pool,
      `
        SELECT COUNT(*)::text AS total
        FROM sst_perfil_demografico
        WHERE persona_id = ANY($1::bigint[])
          AND COALESCE(activo, TRUE) = TRUE
      `,
      [personaIds]
    )
  ]);

  let completosPrevistos = 0;
  let incompletosPrevistos = 0;
  let conflictosInesperados = 0;
  let personasInexistentes = 0;
  let vinculacionesIncompatibles = 0;

  for (const row of planRows) {
    const persona = personaMap.get(row.persona_id);
    if (!persona) {
      personasInexistentes += 1;
      continue;
    }

    const vinculacion = vinculacionMap.get(row.vinculacion_id);
    if (!vinculacion || Number(vinculacion.persona_id) !== row.persona_id) {
      vinculacionesIncompatibles += 1;
      continue;
    }

    const updateInput = buildUpdateInput(row, canonicalMap);
    const completion = computeSstPerfilCompleteness({
      fecha_nacimiento: formatDate(persona.fecha_nacimiento),
      sexo_id: toNullableNumber(persona.sexo_id),
      estado_civil_id: toNullableNumber(persona.estado_civil_id),
      requiere_revision: false,
      values: normalizeValuesForCompleteness(updateInput)
    });

    if (completion.estado === 'COMPLETA') {
      completosPrevistos += 1;
    } else if (completion.estado === 'INCOMPLETA') {
      incompletosPrevistos += 1;
    } else {
      conflictosInesperados += 1;
    }

    if (completion.estado !== row.completitud_estado) {
      conflictosInesperados += 1;
    }
  }

  return {
    completosPrevistos,
    incompletosPrevistos,
    conflictosInesperados,
    personasInexistentes,
    vinculacionesIncompatibles,
    perfilesPrevios
  };
};

const loadResumeState = async (pool: Pool, planRows: PlanRow[]): Promise<ResumeState> => {
  const personaIds = planRows.map((row) => row.persona_id);
  const result = await pool.query<QueryResultRow>(
    `
      SELECT persona_id
      FROM sst_perfil_demografico
      WHERE COALESCE(activo, TRUE) = TRUE
        AND persona_id = ANY($1::bigint[])
    `,
    [personaIds]
  );

  return {
    appliedPersonaIds: new Set(result.rows.map((row) => Number(row.persona_id))),
    currentProfiles: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
    currentVersions: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones'),
    currentRestricted: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_restringido')
  };
};

const getSinglePersonaSstCounts = async (
  db: Pool | PoolClient,
  personaId: number
): Promise<{ perfiles: number; versiones: number; restringidos: number }> => ({
  perfiles: await countQuery(
    db,
    `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico WHERE persona_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE`,
    [personaId]
  ),
  versiones: await countQuery(
    db,
    `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones WHERE persona_id = $1::bigint`,
    [personaId]
  ),
  restringidos: await countQuery(
    db,
    `SELECT COUNT(*)::text AS total FROM sst_perfil_restringido WHERE persona_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE`,
    [personaId]
  )
});

const runAtomicityTest = async (
  pool: Pool,
  actorUserId: string,
  planRows: PlanRow[],
  canonicalMap: Map<string, CanonicalResponse>
): Promise<AtomicityReport> => {
  const firstRow = planRows.find((row) => row.estado_preparacion === 'APTO_APPLY_AUTOMATICO') ?? planRows[0];
  if (!firstRow) {
    throw new Error('No hay suficientes filas en el plan para ejecutar la prueba de atomicidad.');
  }
  const secondRow = planRows.find((row) => row.persona_id !== firstRow.persona_id);
  if (!secondRow) {
    throw new Error('No hay suficientes filas en el plan para ejecutar la prueba de atomicidad.');
  }

  const beforeCounts = {
    perfiles: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico`),
    versiones: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones`),
    restringidos: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_restringido`),
    auditoria: await countQuery(
      pool,
      `SELECT COUNT(*)::text AS total FROM auditoria_eventos WHERE entidad = 'sst_perfil_demografico'`
    ),
    historial: await countQuery(
      pool,
      `SELECT COUNT(*)::text AS total FROM historial_cambios WHERE tabla_afectada = 'sst_perfil_demografico'`
    )
  };

  let errorCode = '';
  let firstPersistedInsideTx = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await upsertSstPerfilSociodemograficoWithClient(
      client,
      firstRow.persona_id,
      buildUpdateInput(firstRow, canonicalMap) as never,
      {
        actorUserId,
        origin: 'FORMULARIO_DIGITAL',
        reason: 'SST-3 rollback controlado'
      }
    );

    firstPersistedInsideTx = await countQuery(
      client,
      `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico WHERE persona_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE`,
      [firstRow.persona_id]
    );

    const failingInput = {
      ...buildUpdateInput(secondRow, canonicalMap),
      vinculacion_id: firstRow.vinculacion_id,
      motivo_cambio: 'SST-3 rollback controlado'
    };

    await upsertSstPerfilSociodemograficoWithClient(
      client,
      secondRow.persona_id,
      failingInput as never,
      {
        actorUserId,
        origin: 'FORMULARIO_DIGITAL',
        reason: 'SST-3 rollback controlado'
      }
    );

    throw new Error('La prueba de atomicidad no provocó la falla esperada.');
  } catch (error) {
    errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: string }).code ?? '')
        : '';
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }

  const afterCounts = {
    perfiles: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico`),
    versiones: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones`),
    restringidos: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_restringido`),
    auditoria: await countQuery(
      pool,
      `SELECT COUNT(*)::text AS total FROM auditoria_eventos WHERE entidad = 'sst_perfil_demografico'`
    ),
    historial: await countQuery(
      pool,
      `SELECT COUNT(*)::text AS total FROM historial_cambios WHERE tabla_afectada = 'sst_perfil_demografico'`
    )
  };

  const firstPersonaCountsAfter = await getSinglePersonaSstCounts(pool, firstRow.persona_id);

  const ok =
    firstPersistedInsideTx === 1 &&
    errorCode === 'SST_PERFIL_VINCULACION_PERSONA_MISMATCH' &&
    JSON.stringify(beforeCounts) === JSON.stringify(afterCounts) &&
    firstPersonaCountsAfter.perfiles === 0 &&
    firstPersonaCountsAfter.versiones === 0 &&
    firstPersonaCountsAfter.restringidos === 0;

  if (!ok) {
    throw new Error('La prueba de atomicidad SST-3 dejó residuos o no falló como se esperaba.');
  }

  return {
    ok,
    errorCode,
    firstPersonaId: firstRow.persona_id,
    secondPersonaId: secondRow.persona_id,
    firstPersistedInsideTx,
    beforeCounts,
    afterCounts
  };
};

const runAtomicityTestOnExistingProfiles = async (
  pool: Pool,
  actorUserId: string,
  planRows: PlanRow[],
  canonicalMap: Map<string, CanonicalResponse>
): Promise<AtomicityReport> => {
  const firstRow = planRows[0];
  const secondRow = planRows.find((row) => row.persona_id !== firstRow?.persona_id);
  if (!firstRow || !secondRow) {
    throw new Error('No hay suficientes filas aplicadas para validar atomicidad post-apply.');
  }

  const beforeCounts = {
    perfiles: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico`),
    versiones: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones`),
    restringidos: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_restringido`),
    auditoria: await countQuery(
      pool,
      `SELECT COUNT(*)::text AS total FROM auditoria_eventos WHERE entidad = 'sst_perfil_demografico'`
    ),
    historial: await countQuery(
      pool,
      `SELECT COUNT(*)::text AS total FROM historial_cambios WHERE tabla_afectada = 'sst_perfil_demografico'`
    )
  };
  const beforeFirstCounts = await getSinglePersonaSstCounts(pool, firstRow.persona_id);
  const beforeObservationResult = await pool.query<QueryResultRow>(
    `SELECT observaciones FROM sst_perfil_demografico WHERE persona_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE LIMIT 1`,
    [firstRow.persona_id]
  );
  const originalObservation = (beforeObservationResult.rows[0]?.observaciones as string | null | undefined) ?? null;

  let errorCode = '';
  let firstPersistedInsideTx = 0;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await upsertSstPerfilSociodemograficoWithClient(
      client,
      firstRow.persona_id,
      {
        ...buildUpdateInput(firstRow, canonicalMap),
        observaciones: '__ROLLBACK_SST3__',
        motivo_cambio: 'SST-3 rollback post-apply'
      } as never,
      {
        actorUserId,
        origin: 'FORMULARIO_DIGITAL',
        reason: 'SST-3 rollback post-apply'
      }
    );

    const insideTxCounts = await getSinglePersonaSstCounts(client, firstRow.persona_id);
    firstPersistedInsideTx = insideTxCounts.versiones;

    await upsertSstPerfilSociodemograficoWithClient(
      client,
      secondRow.persona_id,
      {
        ...buildUpdateInput(secondRow, canonicalMap),
        vinculacion_id: firstRow.vinculacion_id,
        motivo_cambio: 'SST-3 rollback post-apply'
      } as never,
      {
        actorUserId,
        origin: 'FORMULARIO_DIGITAL',
        reason: 'SST-3 rollback post-apply'
      }
    );

    throw new Error('La prueba de atomicidad post-apply no provocó la falla esperada.');
  } catch (error) {
    errorCode =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code?: string }).code ?? '')
        : '';
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }

  const afterCounts = {
    perfiles: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico`),
    versiones: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones`),
    restringidos: await countQuery(pool, `SELECT COUNT(*)::text AS total FROM sst_perfil_restringido`),
    auditoria: await countQuery(
      pool,
      `SELECT COUNT(*)::text AS total FROM auditoria_eventos WHERE entidad = 'sst_perfil_demografico'`
    ),
    historial: await countQuery(
      pool,
      `SELECT COUNT(*)::text AS total FROM historial_cambios WHERE tabla_afectada = 'sst_perfil_demografico'`
    )
  };
  const afterFirstCounts = await getSinglePersonaSstCounts(pool, firstRow.persona_id);
  const afterObservationResult = await pool.query<QueryResultRow>(
    `SELECT observaciones FROM sst_perfil_demografico WHERE persona_id = $1::bigint AND COALESCE(activo, TRUE) = TRUE LIMIT 1`,
    [firstRow.persona_id]
  );
  const afterObservation = (afterObservationResult.rows[0]?.observaciones as string | null | undefined) ?? null;

  const ok =
    errorCode === 'SST_PERFIL_VINCULACION_PERSONA_MISMATCH' &&
    JSON.stringify(beforeCounts) === JSON.stringify(afterCounts) &&
    beforeFirstCounts.perfiles === afterFirstCounts.perfiles &&
    beforeFirstCounts.versiones === afterFirstCounts.versiones &&
    beforeFirstCounts.restringidos === afterFirstCounts.restringidos &&
    originalObservation === afterObservation &&
    firstPersistedInsideTx > beforeFirstCounts.versiones;

  if (!ok) {
    throw new Error('La prueba de atomicidad post-apply dejó cambios persistentes o auditoría inconsistente.');
  }

  return {
    ok,
    errorCode,
    firstPersonaId: firstRow.persona_id,
    secondPersonaId: secondRow.persona_id,
    firstPersistedInsideTx,
    beforeCounts,
    afterCounts
  };
};

const hasRestrictedValues = (input: Record<string, unknown>): boolean =>
  [
    input.tipo_sangre_rh,
    input.tiene_discapacidad,
    input.tipo_discapacidad,
    input.presenta_alergias,
    input.medicamentos_permanentes,
    input.enfermedad
  ].some((value) => value !== null && value !== undefined && value !== '');

const applyBatch = async (
  pool: Pool,
  actorUserId: string,
  rows: PlanRow[],
  canonicalMap: Map<string, CanonicalResponse>,
  batchLabel: string
): Promise<AppliedResultRow[]> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const results: AppliedResultRow[] = [];
    console.log(JSON.stringify({ phase: 'batch-start', batch: batchLabel, size: rows.length }));

    for (const row of rows) {
      console.log(
        JSON.stringify({
          phase: 'row-start',
          batch: batchLabel,
          persona_id: row.persona_id,
          documento: row.documento
        })
      );
      const updateInput = buildUpdateInput(row, canonicalMap);
      const detail = await upsertSstPerfilSociodemograficoWithClient(
        client,
        row.persona_id,
        updateInput as never,
        {
          actorUserId,
          origin: 'FORMULARIO_DIGITAL',
          reason: 'SST-3 APPLY CONTROLADO META-26'
        }
      );

      results.push({
        persona_id: row.persona_id,
        vinculacion_id: row.vinculacion_id,
        documento: row.documento,
        nombre: row.nombre,
        estado_preparacion: row.estado_preparacion,
        completitud_estado: detail.completitud.estado,
        porcentaje_completitud: detail.completitud.porcentaje,
        origen: detail.origen,
        restricted_present: hasRestrictedValues(updateInput),
        batch_label: batchLabel
      });
      console.log(
        JSON.stringify({
          phase: 'row-done',
          batch: batchLabel,
          persona_id: row.persona_id,
          documento: row.documento,
          completitud: detail.completitud.estado
        })
      );
    }

    await client.query('COMMIT');
    console.log(JSON.stringify({ phase: 'batch-commit', batch: batchLabel, size: rows.length }));
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    console.log(
      JSON.stringify({
        phase: 'batch-rollback',
        batch: batchLabel,
        error:
          typeof error === 'object' && error !== null && 'message' in error
            ? String((error as { message?: string }).message ?? 'unknown')
            : 'unknown'
      })
    );
    throw error;
  } finally {
    client.release();
  }
};

const chunkRows = <T>(rows: T[], size: number): T[][] => {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
};

const findRoleUser = async (pool: Pool, roleName: string): Promise<RoleUserRow | null> => {
  const result = await pool.query<RoleUserRow>(
    `
      WITH role_users AS (
        SELECT DISTINCT
          u.id AS user_id,
          u.correo,
          r.nombre_rol
        FROM usuarios u
        INNER JOIN usuario_roles ur
          ON ur.usuario_id = u.id
         AND COALESCE(ur.activo, TRUE) = TRUE
        INNER JOIN roles r
          ON r.id = ur.rol_id
         AND COALESCE(r.activo, TRUE) = TRUE
        WHERE COALESCE(u.activo, TRUE) = TRUE
          AND r.nombre_rol = $1
      )
      SELECT ru.user_id, ru.correo, ru.nombre_rol
      FROM role_users ru
      WHERE ru.nombre_rol = 'ADMINISTRADOR'
         OR EXISTS (
           SELECT 1
           FROM usuario_contratos uc
           WHERE uc.usuario_id = ru.user_id
             AND uc.contrato_id = $2::bigint
             AND COALESCE(uc.activo, TRUE) = TRUE
         )
         OR EXISTS (
           SELECT 1
           FROM usuario_empresas ue
           WHERE ue.usuario_id = ru.user_id
             AND ue.empresa_id = $3::bigint
             AND COALESCE(ue.activo, TRUE) = TRUE
         )
      ORDER BY ru.user_id ASC
      LIMIT 1
    `,
    [roleName, META26_CONTRATO_ID, META26_EMPRESA_ID]
  );

  return result.rows[0] ?? null;
};

const ensureHttpFixtureUser = async (pool: Pool, roleName: 'SST' | 'TALENTO_HUMANO'): Promise<HttpFixtureUser | null> => {
  const existing = await findRoleUser(pool, roleName);
  if (existing) {
    return {
      created: false,
      email: existing.correo ?? `${roleName.toLowerCase()}@empiria.local`,
      userId: String(existing.user_id)
    };
  }

  const client = await pool.connect();
  const email = `sst-http-${roleName.toLowerCase()}-${Date.now()}@empiria.local`;
  try {
    await client.query('BEGIN');
    const roleResult = await client.query<QueryResultRow>(
      `SELECT id::text AS id FROM roles WHERE nombre_rol = $1 LIMIT 1`,
      [roleName]
    );
    const roleId = String(roleResult.rows[0]?.id ?? '');
    if (!roleId) {
      throw new Error(`No existe el rol ${roleName} para la validación HTTP de SST-3.`);
    }

    const userResult = await client.query<QueryResultRow>(
      `
        INSERT INTO usuarios (nombre_completo, correo, telefono, activo, auth_user_id)
        VALUES ($1, $2, NULL, TRUE, NULL)
        RETURNING id::text AS id
      `,
      [`Fixture HTTP ${roleName} SST-3`, email]
    );
    const userId = String(userResult.rows[0]?.id ?? '');
    if (!userId) {
      throw new Error(`No fue posible crear fixture HTTP para el rol ${roleName}.`);
    }

    await client.query(
      `
        INSERT INTO usuario_roles (usuario_id, rol_id, activo)
        VALUES ($1::bigint, $2::bigint, TRUE)
      `,
      [userId, roleId]
    );
    await client.query(
      `
        INSERT INTO usuario_empresas (usuario_id, empresa_id, activo)
        VALUES ($1::bigint, $2::bigint, TRUE)
        ON CONFLICT (usuario_id, empresa_id)
        DO UPDATE SET activo = TRUE
      `,
      [userId, META26_EMPRESA_ID]
    );
    await client.query(
      `
        INSERT INTO usuario_contratos (usuario_id, contrato_id, activo)
        VALUES ($1::bigint, $2::bigint, TRUE)
        ON CONFLICT (usuario_id, contrato_id)
        DO UPDATE SET activo = TRUE
      `,
      [userId, META26_CONTRATO_ID]
    );
    await client.query('COMMIT');

    return {
      created: true,
      email,
      userId
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const cleanupHttpFixtureUser = async (pool: Pool, fixture: HttpFixtureUser | null): Promise<void> => {
  if (!fixture?.created) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM usuario_contratos WHERE usuario_id = $1::bigint`, [fixture.userId]);
    await client.query(`DELETE FROM usuario_empresas WHERE usuario_id = $1::bigint`, [fixture.userId]);
    await client.query(`DELETE FROM usuario_roles WHERE usuario_id = $1::bigint`, [fixture.userId]);
    await client.query(`DELETE FROM usuarios WHERE id = $1::bigint`, [fixture.userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

const signToken = (userId: string | number, email: string | null): string =>
  jwt.sign(
    {
      sub: String(userId),
      userId: String(userId),
      email: email ?? undefined
    },
    env.JWT_SECRET,
    {
      expiresIn: '30m'
    }
  );

const listen = async (): Promise<{ server: Server; baseUrl: string }> =>
  new Promise((resolve, reject) => {
    const server = createServer(app);
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        reject(new Error('No fue posible resolver el puerto HTTP de prueba.'));
        return;
      }

      resolve({
        server,
        baseUrl: `http://127.0.0.1:${address.port}${env.API_PREFIX}`
      });
    });
  });

const parseJson = async (response: Response): Promise<unknown> => {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
};

const inspectSensitivePayload = (payload: Record<string, unknown> | null | undefined): boolean => {
  const values = (payload?.values ?? null) as Record<string, unknown> | null;
  if (!values) {
    return false;
  }

  return (
    values.tipo_sangre_rh !== null ||
    values.tiene_discapacidad !== null ||
    values.tipo_discapacidad !== null ||
    values.presenta_alergias !== null ||
    values.medicamentos_permanentes !== null ||
    values.enfermedad !== null
  );
};

const runHttpChecks = async (
  pool: Pool,
  completeRow: PlanRow,
  incompleteRow: PlanRow
): Promise<{
  admin: HttpCheckResult;
  sst: HttpCheckResult;
  th: HttpCheckResult;
  expedienteCompletaOk: boolean;
  expedienteIncompletaOk: boolean;
  historialOk: boolean;
  fixturesCreated: number;
}> => {
  const [adminUser, sstFixture, thFixture] = await Promise.all([
    findRoleUser(pool, 'ADMINISTRADOR'),
    ensureHttpFixtureUser(pool, 'SST'),
    ensureHttpFixtureUser(pool, 'TALENTO_HUMANO')
  ]);

  assert.ok(adminUser, 'No se encontró usuario ADMINISTRADOR con acceso para la prueba HTTP.');
  assert.ok(sstFixture, 'No se pudo resolver un usuario SST para la prueba HTTP.');
  assert.ok(thFixture, 'No se pudo resolver un usuario TALENTO_HUMANO para la prueba HTTP.');

  const { server, baseUrl } = await listen();
  try {
    const adminToken = signToken(adminUser.user_id, adminUser.correo);
    const sstToken = signToken(sstFixture.userId, sstFixture.email);
    const thToken = signToken(thFixture.userId, thFixture.email);

    const headersFor = (token: string): HeadersInit => ({
      Authorization: `Bearer ${token}`
    });

    const adminProfileRes = await fetch(
      `${baseUrl}/personas/${completeRow.persona_id}/sst/perfil`,
      { headers: headersFor(adminToken) }
    );
    const sstProfileRes = await fetch(
      `${baseUrl}/personas/${completeRow.persona_id}/sst/perfil`,
      { headers: headersFor(sstToken) }
    );
    const thProfileRes = await fetch(
      `${baseUrl}/personas/${completeRow.persona_id}/sst/perfil`,
      { headers: headersFor(thToken) }
    );
    const completeExpedienteRes = await fetch(
      `${baseUrl}/vinculaciones/${completeRow.vinculacion_id}/expediente`,
      { headers: headersFor(adminToken) }
    );
    const incompleteExpedienteRes = await fetch(
      `${baseUrl}/vinculaciones/${incompleteRow.vinculacion_id}/expediente`,
      { headers: headersFor(adminToken) }
    );
    const historyRes = await fetch(
      `${baseUrl}/personas/${completeRow.persona_id}/sst/perfil/historial`,
      { headers: headersFor(adminToken) }
    );

    const adminBody = (await parseJson(adminProfileRes)) as { data?: Record<string, unknown> } | null;
    const sstBody = (await parseJson(sstProfileRes)) as { data?: Record<string, unknown> } | null;
    const thBody = (await parseJson(thProfileRes)) as { data?: Record<string, unknown> } | null;
    const historyBody = (await parseJson(historyRes)) as { data?: unknown[] } | null;

    const adminOk =
      adminProfileRes.status === 200 &&
      inspectSensitivePayload(adminBody?.data) &&
      adminBody?.data?.sensitive_fields_hidden === false;
    const sstOk =
      sstProfileRes.status === 200 &&
      inspectSensitivePayload(sstBody?.data) &&
      sstBody?.data?.sensitive_fields_hidden === false;

    const thRestrictedVisible = inspectSensitivePayload(thBody?.data);
    const thOk =
      (thProfileRes.status === 200 &&
        thRestrictedVisible === false &&
        thBody?.data?.sensitive_fields_hidden === true) ||
      thProfileRes.status === 403;

    return {
      admin: {
        role: 'ADMINISTRADOR',
        status: adminProfileRes.status,
        ok: adminOk,
        restrictedVisible: inspectSensitivePayload(adminBody?.data),
        hiddenFlag: adminBody?.data?.sensitive_fields_hidden === true
      },
      sst: {
        role: 'SST',
        status: sstProfileRes.status,
        ok: sstOk,
        restrictedVisible: inspectSensitivePayload(sstBody?.data),
        hiddenFlag: sstBody?.data?.sensitive_fields_hidden === true
      },
      th: {
        role: 'TALENTO_HUMANO',
        status: thProfileRes.status,
        ok: thOk,
        restrictedVisible: thRestrictedVisible,
        hiddenFlag: thBody?.data?.sensitive_fields_hidden === true
      },
      expedienteCompletaOk: completeExpedienteRes.status === 200,
      expedienteIncompletaOk: incompleteExpedienteRes.status === 200,
      historialOk: historyRes.status === 200 && Array.isArray(historyBody?.data) && (historyBody?.data.length ?? 0) >= 1,
      fixturesCreated: [sstFixture, thFixture].filter((fixture) => fixture?.created).length
    };
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    await cleanupHttpFixtureUser(pool, sstFixture);
    await cleanupHttpFixtureUser(pool, thFixture);
  }
};

const loadCurrentProfiles = async (pool: Pool, personaIds: number[]): Promise<Map<number, PerfilCurrentRow>> => {
  const result = await pool.query<PerfilCurrentRow>(
    `
      SELECT
        spd.persona_id,
        spd.fecha_caracterizacion,
        spd.origen,
        spd.nacionalidad,
        spd.estrato_socioeconomico,
        spd.tipo_vivienda,
        spd.grupo_etnico,
        spd.nivel_escolaridad,
        spd.profesion_ocupacion,
        spd.personas_dependen_economicamente,
        spd.cabeza_familia,
        spd.total_hijos,
        spd.hijos_viven_con_usted,
        spd.hijos_menores_edad,
        spd.hijos_mayores_edad,
        spd.redes_apoyo_social,
        spd.autorizacion_tratamiento_datos,
        spd.observaciones,
        spd.requiere_revision,
        spd.vinculacion_id
      FROM sst_perfil_demografico spd
      WHERE COALESCE(spd.activo, TRUE) = TRUE
        AND spd.persona_id = ANY($1::bigint[])
    `,
    [personaIds]
  );

  return new Map(result.rows.map((row) => [Number(row.persona_id), row]));
};

const loadRestrictedProfiles = async (pool: Pool, personaIds: number[]): Promise<Map<number, RestrictedRow>> => {
  const result = await pool.query<RestrictedRow>(
    `
      SELECT
        persona_id,
        tipo_sangre_rh,
        tiene_discapacidad,
        tipo_discapacidad,
        presenta_alergias,
        medicamentos_permanentes,
        enfermedad
      FROM sst_perfil_restringido
      WHERE COALESCE(activo, TRUE) = TRUE
        AND persona_id = ANY($1::bigint[])
    `,
    [personaIds]
  );

  return new Map(result.rows.map((row) => [Number(row.persona_id), row]));
};

const loadCurrentVersionsCount = async (pool: Pool, personaIds: number[]): Promise<Map<number, number>> => {
  const result = await pool.query<QueryResultRow>(
    `
      SELECT persona_id, COUNT(*)::text AS total
      FROM sst_perfil_demografico_versiones
      WHERE persona_id = ANY($1::bigint[])
      GROUP BY persona_id
    `,
    [personaIds]
  );

  return new Map(result.rows.map((row) => [Number(row.persona_id), Number(row.total ?? 0)]));
};

const evaluateIdempotence = async (
  pool: Pool,
  planRows: PlanRow[],
  canonicalMap: Map<string, CanonicalResponse>
): Promise<{ falseChanges: number; falseVersions: number; duplicates: number }> => {
  const personaIds = planRows.map((row) => row.persona_id);
  const [currentProfiles, currentRestricted, versionCounts] = await Promise.all([
    loadCurrentProfiles(pool, personaIds),
    loadRestrictedProfiles(pool, personaIds),
    loadCurrentVersionsCount(pool, personaIds)
  ]);

  let falseChanges = 0;
  for (const row of planRows) {
    const current = currentProfiles.get(row.persona_id);
    const restricted = currentRestricted.get(row.persona_id);
    const input = buildUpdateInput(row, canonicalMap);
    if (!current) {
      falseChanges += 1;
      continue;
    }

    const comparableValues = normalizeValuesForCompleteness(input);
    const equivalent =
      formatDate(current.fecha_caracterizacion) ===
        (typeof input.fecha_caracterizacion === 'string' ? input.fecha_caracterizacion : null) &&
      (current.origen ?? null) === 'FORMULARIO_DIGITAL' &&
      (current.nacionalidad ?? null) === comparableValues.nacionalidad &&
      (current.estrato_socioeconomico ?? null) === comparableValues.estrato_socioeconomico &&
      (current.tipo_vivienda ?? null) === comparableValues.tipo_vivienda &&
      (current.grupo_etnico ?? null) === comparableValues.grupo_etnico &&
      (current.nivel_escolaridad ?? null) === comparableValues.nivel_escolaridad &&
      (current.profesion_ocupacion ?? null) === comparableValues.profesion_ocupacion &&
      toNullableNumber(current.personas_dependen_economicamente) === comparableValues.personas_dependen_economicamente &&
      (current.cabeza_familia ?? null) === comparableValues.cabeza_familia &&
      toNullableNumber(current.total_hijos) === comparableValues.total_hijos &&
      toNullableNumber(current.hijos_viven_con_usted) === comparableValues.hijos_viven_con_usted &&
      toNullableNumber(current.hijos_menores_edad) === comparableValues.hijos_menores_edad &&
      toNullableNumber(current.hijos_mayores_edad) === comparableValues.hijos_mayores_edad &&
      (current.redes_apoyo_social ?? null) === comparableValues.redes_apoyo_social &&
      (current.autorizacion_tratamiento_datos ?? null) === comparableValues.autorizacion_tratamiento_datos &&
      (current.observaciones ?? null) === comparableValues.observaciones &&
      (restricted?.tipo_sangre_rh ?? null) === comparableValues.tipo_sangre_rh &&
      (restricted?.tiene_discapacidad ?? null) === comparableValues.tiene_discapacidad &&
      (restricted?.tipo_discapacidad ?? null) === comparableValues.tipo_discapacidad &&
      (restricted?.presenta_alergias ?? null) === comparableValues.presenta_alergias &&
      (restricted?.medicamentos_permanentes ?? null) === comparableValues.medicamentos_permanentes &&
      (restricted?.enfermedad ?? null) === comparableValues.enfermedad;

    if (!equivalent) {
      falseChanges += 1;
    }
  }

  const beforeVersionTotal = [...versionCounts.values()].reduce((sum, value) => sum + value, 0);
  const actorUserId = await findRoleUser(pool, 'ADMINISTRADOR');
  assert.ok(actorUserId, 'No se encontró usuario ADMINISTRADOR para la prueba de idempotencia.');

  const noopBatches = chunkRows(planRows, BATCH_SIZE);
  for (let index = 0; index < noopBatches.length; index += 1) {
    const batch = noopBatches[index];
    if (!batch) {
      continue;
    }
    await applyBatch(
      pool,
      String(actorUserId.user_id),
      batch,
      canonicalMap,
      `idempotencia-${index + 1}`
    );
  }

  const afterVersionTotal = await countQuery(
    pool,
    `SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones`
  );
  const duplicates = await countQuery(
    pool,
    `
      SELECT COUNT(*)::text AS total
      FROM (
        SELECT persona_id
        FROM sst_perfil_demografico
        WHERE COALESCE(activo, TRUE) = TRUE
        GROUP BY persona_id
        HAVING COUNT(*) > 1
      ) duplicated
    `
  );

  return {
    falseChanges,
    falseVersions: afterVersionTotal - beforeVersionTotal,
    duplicates
  };
};

const buildExcludedRows = async (pool: Pool): Promise<Array<Record<string, unknown>>> => {
  const result = await pool.query<QueryResultRow>(
    `
      SELECT
        persona_id,
        vinculacion_id,
        documento,
        nombre,
        estado_preparacion,
        estado_digital,
        porcentaje_completitud,
        requiere_revision_humana,
        requiere_captura
      FROM sst_preparacion_personas
      WHERE activo = TRUE
        AND contrato_id = $1::bigint
        AND apto_apply = FALSE
      ORDER BY estado_preparacion, nombre ASC
    `,
    [META26_CONTRATO_ID]
  );

  return result.rows.map((row) => ({
    persona_id: Number(row.persona_id),
    vinculacion_id: Number(row.vinculacion_id),
    documento: row.documento,
    nombre: row.nombre,
    estado_preparacion: row.estado_preparacion,
    estado_digital: row.estado_digital,
    porcentaje_completitud: Number(row.porcentaje_completitud ?? 0),
    requiere_revision_humana: Boolean(row.requiere_revision_humana),
    requiere_captura: Boolean(row.requiere_captura)
  }));
};

const main = async (): Promise<void> => {
  await mkdir(REPORTS_DIR, { recursive: true });

  const pool = createPool();
  try {
    const plan = await loadPlan();
    const before = await loadBaselineCounts(pool);
    const requiredTables = [
      'sst_perfil_demografico',
      'sst_perfil_demografico_versiones',
      'sst_perfil_restringido',
      'sst_preparacion_personas',
      'sst_revision_casos'
    ];

    for (const tableName of requiredTables) {
      if (!(await tableExists(pool, tableName))) {
        throw new Error(`Tabla requerida ausente para SST-3: ${tableName}`);
      }
    }

    await assertPlanIntegrity(pool, plan);

    if (
      before.personas !== 800 ||
      before.vinculaciones !== 1007 ||
      before.cobertura_asignaciones !== 670 ||
      before.focalizacion_final !== 687 ||
      before.focalizacion_vigencias !== 687 ||
      before.vinculacion_afiliaciones !== 223 ||
      before.persona_contactos_emergencia !== 0 ||
      before.persona_formacion_academica !== 0
    ) {
      throw new Error('Los maestros operativos no coinciden con el baseline esperado para SST-3.');
    }

    const canonicalMap = await buildCanonicalMap();
    const automaticRows = plan.rows.filter((row) => row.estado_preparacion === 'APTO_APPLY_AUTOMATICO');
    const partialRows = plan.rows.filter((row) => row.estado_preparacion === 'APTO_APPLY_PARCIAL');
    const firstBatchRows = automaticRows.slice(0, FIRST_BATCH_SIZE);
    const resumeState = await loadResumeState(pool, plan.rows);
    const executionOrder = [
      ...firstBatchRows,
      ...automaticRows.slice(FIRST_BATCH_SIZE),
      ...partialRows
    ];
    const expectedAppliedPrefix = executionOrder.slice(0, resumeState.currentProfiles);
    const expectedAppliedIds = new Set(expectedAppliedPrefix.map((row) => row.persona_id));
    const expectedResume =
      resumeState.currentProfiles === resumeState.currentVersions &&
      resumeState.currentProfiles === resumeState.currentRestricted &&
      resumeState.currentProfiles <= executionOrder.length &&
      resumeState.appliedPersonaIds.size === resumeState.currentProfiles &&
      [...resumeState.appliedPersonaIds].every((personaId) => expectedAppliedIds.has(personaId));

    if (!expectedResume) {
      throw new Error('El estado SST actual no es compatible con un inicio limpio ni con una reanudacion segura de SST-3.');
    }

    const pendingRows = plan.rows.filter((row) => !resumeState.appliedPersonaIds.has(row.persona_id));
    const alreadyFullyApplied = pendingRows.length === 0;
    const dryRun = await validateDryRunBeforeApply(pool, pendingRows, canonicalMap);
    const appliedCompleteCount = executionOrder
      .slice(0, resumeState.currentProfiles)
      .filter((row) => row.completitud_estado === 'COMPLETA').length;
    const appliedIncompleteCount = executionOrder
      .slice(0, resumeState.currentProfiles)
      .filter((row) => row.completitud_estado === 'INCOMPLETA').length;

    if (
      dryRun.completosPrevistos !== 183 - appliedCompleteCount ||
      dryRun.incompletosPrevistos !== 457 - appliedIncompleteCount ||
      dryRun.conflictosInesperados !== 0 ||
      dryRun.personasInexistentes !== 0 ||
      dryRun.vinculacionesIncompatibles !== 0 ||
      dryRun.perfilesPrevios !== 0
    ) {
      throw new Error('El dry-run final de SST-3 detectó inconsistencias y abortó el apply.');
    }

    const adminActor = await findRoleUser(pool, 'ADMINISTRADOR');
    assert.ok(adminActor, 'No se encontró usuario ADMINISTRADOR para SST-3.');

    const atomicity = alreadyFullyApplied
      ? await runAtomicityTestOnExistingProfiles(
          pool,
          String(adminActor.user_id),
          plan.rows,
          canonicalMap
        )
      : await runAtomicityTest(pool, String(adminActor.user_id), pendingRows, canonicalMap);

    const remainingRows = [...automaticRows.slice(FIRST_BATCH_SIZE), ...partialRows].filter(
      (row) => !resumeState.appliedPersonaIds.has(row.persona_id)
    );

    const firstBatchResults =
      resumeState.currentProfiles >= FIRST_BATCH_SIZE
        ? firstBatchRows.map((row) => ({
            persona_id: row.persona_id,
            vinculacion_id: row.vinculacion_id,
            documento: row.documento,
            nombre: row.nombre,
            estado_preparacion: row.estado_preparacion,
            completitud_estado: row.completitud_estado,
            porcentaje_completitud: row.porcentaje_completitud,
            origen: 'FORMULARIO_DIGITAL',
            restricted_present: true,
            batch_label: 'lote-1'
          }))
        : await applyBatch(
            pool,
            String(adminActor.user_id),
            firstBatchRows,
            canonicalMap,
            'lote-1'
          );

    const firstBatchValid =
      firstBatchResults.length === FIRST_BATCH_SIZE &&
      firstBatchResults.every((row) => row.completitud_estado === 'COMPLETA');

    if (!firstBatchValid) {
      throw new Error('El primer lote SST-3 no quedó validado correctamente.');
    }

    const allResults: AppliedResultRow[] = alreadyFullyApplied
      ? plan.rows.map((row, index) => ({
          persona_id: row.persona_id,
          vinculacion_id: row.vinculacion_id,
          documento: row.documento,
          nombre: row.nombre,
          estado_preparacion: row.estado_preparacion,
          completitud_estado: row.completitud_estado,
          porcentaje_completitud: row.porcentaje_completitud,
          origen: 'FORMULARIO_DIGITAL',
          restricted_present: true,
          batch_label: index < FIRST_BATCH_SIZE ? 'lote-1' : `lote-resumen`
        }))
      : [...firstBatchResults];
    if (!alreadyFullyApplied) {
      const remainingChunks = chunkRows(remainingRows, BATCH_SIZE);
      for (let index = 0; index < remainingChunks.length; index += 1) {
        const chunk = remainingChunks[index];
        if (!chunk) {
          continue;
        }
        const chunkResults = await applyBatch(
          pool,
          String(adminActor.user_id),
          chunk,
          canonicalMap,
          `lote-${index + 2}`
        );
        allResults.push(...chunkResults);
      }
    }

    const afterApply = await loadBaselineCounts(pool);
    const excludedRows = await buildExcludedRows(pool);
    const completeRow = plan.rows.find((row) => row.completitud_estado === 'COMPLETA');
    const incompleteRow = plan.rows.find((row) => row.completitud_estado === 'INCOMPLETA');
    assert.ok(completeRow, 'No se encontró fila COMPLETA aplicada para la validación HTTP.');
    assert.ok(incompleteRow, 'No se encontró fila INCOMPLETA aplicada para la validación HTTP.');
    const httpChecks = await runHttpChecks(pool, completeRow, incompleteRow);
    const idempotence = await evaluateIdempotence(pool, plan.rows, canonicalMap);
    const afterIdempotence = await loadBaselineCounts(pool);

    const outsidePlanProfiles = await countQuery(
      pool,
      `
        SELECT COUNT(*)::text AS total
        FROM sst_perfil_demografico spd
        LEFT JOIN sst_preparacion_personas sp
          ON sp.persona_id = spd.persona_id
         AND sp.contrato_id = $1::bigint
         AND sp.activo = TRUE
        WHERE COALESCE(spd.activo, TRUE) = TRUE
          AND (sp.id IS NULL OR sp.apto_apply = FALSE)
      `,
      [META26_CONTRATO_ID]
    );
    const excludedWithProfiles = await countQuery(
      pool,
      `
        SELECT COUNT(*)::text AS total
        FROM sst_preparacion_personas sp
        INNER JOIN sst_perfil_demografico spd
          ON spd.persona_id = sp.persona_id
         AND COALESCE(spd.activo, TRUE) = TRUE
        WHERE sp.activo = TRUE
          AND sp.contrato_id = $1::bigint
          AND sp.apto_apply = FALSE
      `,
      [META26_CONTRATO_ID]
    );
    const duplicateProfiles = await countQuery(
      pool,
      `
        SELECT COUNT(*)::text AS total
        FROM (
          SELECT persona_id
          FROM sst_perfil_demografico
          WHERE COALESCE(activo, TRUE) = TRUE
          GROUP BY persona_id
          HAVING COUNT(*) > 1
        ) duplicated
      `
    );
    const orphanVersions = await countQuery(
      pool,
      `
        SELECT COUNT(*)::text AS total
        FROM sst_perfil_demografico_versiones spv
        LEFT JOIN sst_perfil_demografico spd ON spd.id = spv.perfil_id
        LEFT JOIN personas p ON p.id = spv.persona_id
        WHERE spd.id IS NULL OR p.id IS NULL
      `
    );
    const orphanRestricted = await countQuery(
      pool,
      `
        SELECT COUNT(*)::text AS total
        FROM sst_perfil_restringido spr
        LEFT JOIN personas p ON p.id = spr.persona_id
        WHERE p.id IS NULL
      `
    );
    const fkBroken = orphanVersions + orphanRestricted;

    const completosFinal = await countQuery(
      pool,
      `
        SELECT COUNT(*)::text AS total
        FROM sst_preparacion_personas sp
        INNER JOIN sst_perfil_demografico spd
          ON spd.persona_id = sp.persona_id
         AND COALESCE(spd.activo, TRUE) = TRUE
        WHERE sp.activo = TRUE
          AND sp.contrato_id = $1::bigint
          AND sp.apto_apply = TRUE
          AND sp.completitud_estado = 'COMPLETA'
      `,
      [META26_CONTRATO_ID]
    );
    const incompletosFinal = await countQuery(
      pool,
      `
        SELECT COUNT(*)::text AS total
        FROM sst_preparacion_personas sp
        INNER JOIN sst_perfil_demografico spd
          ON spd.persona_id = sp.persona_id
         AND COALESCE(spd.activo, TRUE) = TRUE
        WHERE sp.activo = TRUE
          AND sp.contrato_id = $1::bigint
          AND sp.apto_apply = TRUE
          AND sp.completitud_estado <> 'COMPLETA'
      `,
      [META26_CONTRATO_ID]
    );

    await writeCsv(
      RESULTS_CSV_PATH,
      [
        'persona_id',
        'vinculacion_id',
        'documento',
        'nombre',
        'estado_preparacion',
        'completitud_estado',
        'porcentaje_completitud',
        'origen',
        'restricted_present',
        'batch_label'
      ],
      allResults
    );
    await writeCsv(
      COMPLETOS_CSV_PATH,
      ['persona_id', 'documento', 'nombre', 'completitud_estado', 'porcentaje_completitud', 'batch_label'],
      allResults.filter((row) => row.completitud_estado === 'COMPLETA')
    );
    await writeCsv(
      INCOMPLETOS_CSV_PATH,
      ['persona_id', 'documento', 'nombre', 'completitud_estado', 'porcentaje_completitud', 'batch_label'],
      allResults.filter((row) => row.completitud_estado === 'INCOMPLETA')
    );
    await writeCsv(
      EXCLUIDOS_CSV_PATH,
      [
        'persona_id',
        'vinculacion_id',
        'documento',
        'nombre',
        'estado_preparacion',
        'estado_digital',
        'porcentaje_completitud',
        'requiere_revision_humana',
        'requiere_captura'
      ],
      excludedRows
    );

    const integrity = {
      generated_at: new Date().toISOString(),
      before,
      dry_run: dryRun,
      atomicity,
      after_apply: afterApply,
      after_idempotence: afterIdempotence,
      totals: {
        applied_rows: allResults.length,
        automaticos_aplicados: allResults.filter((row) => row.estado_preparacion === 'APTO_APPLY_AUTOMATICO').length,
        parciales_aplicados: allResults.filter((row) => row.estado_preparacion === 'APTO_APPLY_PARCIAL').length,
        completos_final: completosFinal,
        incompletos_final: incompletosFinal,
        perfiles_fuera_plan: outsidePlanProfiles,
        excluidos_con_perfil: excludedWithProfiles,
        duplicados_perfil: duplicateProfiles,
        huerfanos_versiones: orphanVersions,
        huerfanos_restringidos: orphanRestricted,
        fk_rotas: fkBroken
      },
      http: httpChecks,
      idempotence
    };

    await writeJson(INTEGRIDAD_JSON_PATH, integrity);
    await writeJson(SUMMARY_JSON_PATH, {
      generated_at: new Date().toISOString(),
      plan_summary: plan.summary,
      before,
      dry_run: dryRun,
      atomicity,
      first_batch: {
        size: firstBatchResults.length,
        valid: firstBatchValid
      },
      apply: {
        automaticos_aplicados: allResults.filter((row) => row.estado_preparacion === 'APTO_APPLY_AUTOMATICO').length,
        parciales_aplicados: allResults.filter((row) => row.estado_preparacion === 'APTO_APPLY_PARCIAL').length,
        total_aplicados: allResults.length
      },
      final: {
        completos: completosFinal,
        incompletos: incompletosFinal,
        perfiles_vigentes: afterIdempotence.sst_perfil_demografico,
        versiones: afterIdempotence.sst_perfil_demografico_versiones,
        restringidos: afterIdempotence.sst_perfil_restringido,
        excluded_with_profiles: excludedWithProfiles,
        outside_plan_profiles: outsidePlanProfiles,
        duplicate_profiles: duplicateProfiles,
        orphan_versions: orphanVersions,
        orphan_restricted: orphanRestricted,
        fk_rotas: fkBroken
      },
      http: httpChecks,
      idempotence,
      reports: {
        resultados: RESULTS_CSV_PATH,
        completos: COMPLETOS_CSV_PATH,
        incompletos: INCOMPLETOS_CSV_PATH,
        excluidos: EXCLUIDOS_CSV_PATH,
        integridad: INTEGRIDAD_JSON_PATH
      }
    });

    console.log(
      JSON.stringify(
        {
          preflight: 'OK',
          dryRun,
          atomicity,
          firstBatch: {
            applied: firstBatchResults.length,
            valid: firstBatchValid
          },
          apply: {
            automaticos: allResults.filter((row) => row.estado_preparacion === 'APTO_APPLY_AUTOMATICO').length,
            parciales: allResults.filter((row) => row.estado_preparacion === 'APTO_APPLY_PARCIAL').length,
            total: allResults.length
          },
          final: {
            perfiles: afterIdempotence.sst_perfil_demografico,
            versiones: afterIdempotence.sst_perfil_demografico_versiones,
            restringidos: afterIdempotence.sst_perfil_restringido,
            completos: completosFinal,
            incompletos: incompletosFinal,
            excludedWithProfiles,
            outsidePlanProfiles,
            duplicateProfiles,
            fkBroken
          },
          http: httpChecks,
          idempotence
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
};

void main().catch((error) => {
  console.error('SST-3 apply failed.');
  console.error(error);
  process.exitCode = 1;
});
