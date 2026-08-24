import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import * as XLSX from 'xlsx';
import type { Pool, PoolClient, QueryResultRow } from 'pg';

import {
  buildFullName,
  canonicalizeRows,
  countQuery,
  createPool,
  loadMasterPeopleByDocuments,
  loadMeta26CurrentUniverse,
  loadMeta26PlanRows,
  parseResponseRows,
  readWorkbookAudit,
  type CanonicalResponse,
  type MasterPersonRow,
  type Meta26PersonRow
} from './sst-caracterizacion-audit';
import {
  type AcademicFormationDraft,
  buildAcademicFormationDrafts,
  buildRestrictedSstPayload,
  classifyEmergencyContactProposal,
  derivePreparationCompletenessStatus,
  type SstPreparationStatus
} from '../modules/sst/sst.preparacion.domain';

const REPORTS_DIR = path.resolve('reports');
const SUMMARY_PATH = path.resolve('reports/sst-resumen-sst-2-1.json');
const FINAL_META26_PATH = path.resolve('reports/sst-caracterizacion-final-meta26-sst-2-1.csv');
const REVIEW_QUEUE_PATH = path.resolve('reports/sst-revision-humana-sst-2-1.csv');
const OUTPUT_CONTACTS = path.resolve('reports/sst-contactos-emergencia-propuestos-sst-2-2.csv');
const OUTPUT_FORMACION = path.resolve('reports/sst-formacion-academica-propuesta-sst-2-2.csv');
const OUTPUT_PLAN_CSV = path.resolve('reports/sst-caracterizacion-apply-plan-meta26.csv');
const OUTPUT_PLAN_JSON = path.resolve('reports/sst-caracterizacion-apply-plan-meta26.json');
const OUTPUT_SUMMARY = path.resolve('reports/sst-resumen-sst-2-2.json');

const FILE_1_PATH = path.resolve('data/SST/Perfil sociodemografico Complementos (respuestas).xlsx');
const FILE_2_PATH = path.resolve('data/SST/Caracterización adicional (respuestas).xlsx');
const META26_CONTRATO_ID = 24;

interface SummaryJson {
  counts?: {
    readiness?: {
      automatico?: number;
      parcial?: number;
      requiere_revision?: number;
      sin_datos?: number;
    };
  };
}

interface FinalMeta26CsvRow {
  persona_id: string;
  documento: string;
  nombre: string;
  municipio: string;
  institucion: string;
  sede: string;
  cargo: string;
  f1: string;
  f2: string;
  estado_digital: string;
  porcentaje_completitud: string;
  conflictos_aparentes: string;
  conflictos_reales: string;
  requiere_revision_humana: string;
  requiere_captura: string;
  apto_para_apply_sst: string;
}

interface ReviewCsvRow {
  documento: string;
  persona: string;
  campo: string;
  fuente_a: string;
  valor_a: string;
  fuente_b: string;
  valor_b: string;
  tipo_conflicto: string;
  recomendacion: string;
  decision: string;
  observacion: string;
}

interface ContractRow extends QueryResultRow {
  empresa_id: number | string;
}

interface PreparationInsertRow {
  persona_id: number;
  vinculacion_id: number | null;
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
  estado_preparacion: SstPreparationStatus;
  porcentaje_completitud: number;
  completitud_estado: string;
  conflictos_aparentes: number;
  conflictos_reales: number;
  requiere_revision_humana: boolean;
  requiere_captura: boolean;
  apto_apply: boolean;
  propuesta_sst: Record<string, unknown>;
  propuesta_contacto_emergencia: Record<string, unknown>;
  propuesta_formacion_academica: AcademicFormationDraft[];
  propuesta_afiliaciones: Array<Record<string, unknown>>;
  campos_restringidos: string[];
  fuentes: string[];
  observaciones: string | null;
}

type DbRunner = Pool | PoolClient;

interface ContactProposalRow {
  persona_id: number;
  documento: string;
  nombre: string;
  clasificacion: string;
  en_meta26: boolean;
  nombre_contacto: string | null;
  parentesco: string | null;
  telefono: string | null;
}

interface FormationProposalRow {
  persona_id: number;
  documento: string;
  nombre: string;
  nivel_educativo: string | null;
  titulo_programa: string | null;
  estado_formacion: string;
  actualmente_estudia: boolean;
}

const readSheetRows = <T>(filePath: string): T[] => {
  const workbook = XLSX.readFile(filePath, { raw: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return [];
  }

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return [];
  }

  return XLSX.utils.sheet_to_json<T>(sheet, {
    defval: '',
    raw: false
  });
};

const toBoolean = (value: unknown): boolean => {
  const normalized = String(value ?? '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  return ['true', 'si', '1', 'yes'].includes(normalized);
};

const toNumber = (value: unknown): number => {
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : 0;
};

const nullIfBlank = (value: unknown): string | null => {
  const text = String(value ?? '').trim();
  return text.length > 0 ? text : null;
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

const buildCanonicalMap = (rows: CanonicalResponse[]): Map<string, CanonicalResponse> =>
  new Map(rows.map((row) => [row.documentNormalized, row]));

const buildCombinedCanonicalRows = (
  f1Canonical: CanonicalResponse[],
  f2Canonical: CanonicalResponse[]
): CanonicalResponse[] => {
  const documents = new Set([
    ...f1Canonical.map((row) => row.documentNormalized),
    ...f2Canonical.map((row) => row.documentNormalized)
  ]);

  const f1Map = buildCanonicalMap(f1Canonical);
  const f2Map = buildCanonicalMap(f2Canonical);
  const rows: CanonicalResponse[] = [];

  for (const document of documents) {
    const left = f1Map.get(document) ?? null;
    const right = f2Map.get(document) ?? null;
    const base = left ?? right;
    if (!base) {
      continue;
    }

    rows.push({
      ...base,
      responseCount: (left?.responseCount ?? 0) + (right?.responseCount ?? 0),
      rowNumbers: [...(left?.rowNumbers ?? []), ...(right?.rowNumbers ?? [])].sort((a, b) => a - b),
      rawRows: [...(left?.rawRows ?? []), ...(right?.rawRows ?? [])],
      mergedSst: {
        ...(left?.mergedSst ?? {}),
        ...(right?.mergedSst ?? {})
      },
      mergedPersona: {
        ...(left?.mergedPersona ?? {}),
        ...(right?.mergedPersona ?? {})
      },
      mergedContact: {
        ...(left?.mergedContact ?? {}),
        ...(right?.mergedContact ?? {})
      },
      mergedAffiliation: {
        ...(left?.mergedAffiliation ?? {}),
        ...(right?.mergedAffiliation ?? {})
      },
      unsupportedFields: {
        ...(left?.unsupportedFields ?? {}),
        ...(right?.unsupportedFields ?? {})
      },
      sensitiveFields: {
        ...(left?.sensitiveFields ?? {}),
        ...(right?.sensitiveFields ?? {})
      },
      timestampIsoLatest: right?.timestampIsoLatest ?? left?.timestampIsoLatest ?? null,
      duplicateClassification:
        left?.duplicateClassification === 'DUPLICADO_CONFLICTO' ||
        right?.duplicateClassification === 'DUPLICADO_CONFLICTO'
          ? 'DUPLICADO_CONFLICTO'
          : left?.duplicateClassification === 'DUPLICADO_COMPLEMENTARIO' ||
              right?.duplicateClassification === 'DUPLICADO_COMPLEMENTARIO'
            ? 'DUPLICADO_COMPLEMENTARIO'
            : 'DUPLICADO_IDENTICO',
      duplicateConflictFields: [
        ...(left?.duplicateConflictFields ?? []),
        ...(right?.duplicateConflictFields ?? [])
      ]
    });
  }

  return rows;
};

const loadContractCompanyId = async (db: DbRunner, contratoId: number): Promise<number> => {
  const result = await db.query<ContractRow>(
    `
      SELECT empresa_id
      FROM contratos
      WHERE id = $1::bigint
      LIMIT 1
    `,
    [contratoId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error(`Contrato ${contratoId} no encontrado`);
  }

  return Number(row.empresa_id);
};

const buildPreparationRows = (
  finalRows: FinalMeta26CsvRow[],
  meta26Universe: Map<string, Meta26PersonRow>,
  meta26Plan: Map<string, { municipio: string | null; institucion: string | null; sede: string | null; cargo_nombre: string | null }>,
  masters: Map<string, MasterPersonRow>,
  combinedCanonicalMap: Map<string, CanonicalResponse>,
  empresaId: number
): {
  rows: PreparationInsertRow[];
  contacts: ContactProposalRow[];
  formation: FormationProposalRow[];
} => {
  const rows: PreparationInsertRow[] = [];
  const contacts: ContactProposalRow[] = [];
  const formation: FormationProposalRow[] = [];

  for (const row of finalRows) {
    const documento = String(row.documento).trim();
    const persona = meta26Universe.get(documento);
    if (!persona) {
      continue;
    }

    const master = masters.get(documento);
    const canonical = combinedCanonicalMap.get(documento) ?? null;
    const plan = meta26Plan.get(documento);
    const estadoPreparacion = row.apto_para_apply_sst as SstPreparationStatus;
    const porcentaje = toNumber(row.porcentaje_completitud);
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

    const contactProposal = canonical && master
      ? classifyEmergencyContactProposal(
          {
            nombre_contacto: master.contacto_nombre,
            parentesco: master.contacto_parentesco,
            telefono: master.contacto_telefono
          },
          {
            nombre_contacto: canonical.mergedContact.nombre_contacto ?? null,
            parentesco: canonical.mergedContact.parentesco ?? null,
            telefono: canonical.mergedContact.telefono ?? null
          }
        )
      : { classification: 'COINCIDE' as const, payload: null };

    const formationDrafts = canonical
      ? buildAcademicFormationDrafts({
          nivel_escolaridad: canonical.mergedSst.nivel_escolaridad ?? null,
          titulo_obtenido:
            (canonical.unsupportedFields.titulo_obtenido_de_los_estudios_realizados as string | null | undefined) ??
            null,
          estudia_actualmente:
            (canonical.unsupportedFields.actualmente_se_encuentra_estudiando as string | boolean | null | undefined) ??
            null,
          programa_actual:
            (canonical.unsupportedFields.si_aplica_que_esta_estudiando as string | null | undefined) ??
            null
        })
      : [];

    const proposalSst =
      estadoPreparacion === 'APTO_APPLY_AUTOMATICO' || estadoPreparacion === 'APTO_APPLY_PARCIAL'
        ? {
            fecha_caracterizacion: canonical?.timestampIsoLatest?.slice(0, 10) ?? null,
            origen: 'FORMULARIO_DIGITAL',
            ...canonical?.mergedSst
          }
        : {};

    if (contactProposal.payload) {
      contacts.push({
        persona_id: Number(persona.persona_id),
        documento,
        nombre: row.nombre,
        clasificacion: contactProposal.classification,
        en_meta26: true,
        nombre_contacto: contactProposal.payload.nombre_contacto,
        parentesco: contactProposal.payload.parentesco,
        telefono: contactProposal.payload.telefono
      });
    }

    for (const draft of formationDrafts) {
      formation.push({
        persona_id: Number(persona.persona_id),
        documento,
        nombre: row.nombre,
        nivel_educativo: draft.nivel_educativo,
        titulo_programa: draft.titulo_programa,
        estado_formacion: draft.estado_formacion,
        actualmente_estudia: draft.actualmente_estudia
      });
    }

    rows.push({
      persona_id: Number(persona.persona_id),
      vinculacion_id: Number(persona.vinculacion_id),
      empresa_id: empresaId,
      contrato_id: META26_CONTRATO_ID,
      documento,
      nombre: row.nombre,
      municipio: nullIfBlank(row.municipio) ?? plan?.municipio ?? null,
      institucion: nullIfBlank(row.institucion) ?? plan?.institucion ?? null,
      sede: nullIfBlank(row.sede) ?? plan?.sede ?? null,
      modalidad: null,
      cargo: nullIfBlank(row.cargo) ?? plan?.cargo_nombre ?? null,
      fuente_formulario_1: toBoolean(row.f1),
      fuente_formulario_2: toBoolean(row.f2),
      estado_digital: row.estado_digital,
      estado_preparacion: estadoPreparacion,
      porcentaje_completitud: porcentaje,
      completitud_estado: derivePreparationCompletenessStatus(estadoPreparacion, porcentaje),
      conflictos_aparentes: toNumber(row.conflictos_aparentes),
      conflictos_reales: toNumber(row.conflictos_reales),
      requiere_revision_humana: toBoolean(row.requiere_revision_humana),
      requiere_captura: toBoolean(row.requiere_captura),
      apto_apply:
        estadoPreparacion === 'APTO_APPLY_AUTOMATICO' || estadoPreparacion === 'APTO_APPLY_PARCIAL',
      propuesta_sst: proposalSst,
      propuesta_contacto_emergencia:
        contactProposal.classification === 'CONTACTO_NUEVO' ||
        contactProposal.classification === 'POSIBLE_ACTUALIZACION'
          ? {
              clasificacion: contactProposal.classification,
              ...contactProposal.payload
            }
          : {},
      propuesta_formacion_academica: formationDrafts,
      propuesta_afiliaciones: [],
      campos_restringidos: Object.keys(restrictedPayload),
      fuentes: [
        ...(toBoolean(row.f1) ? ['FORMULARIO_1'] : []),
        ...(toBoolean(row.f2) ? ['FORMULARIO_2'] : [])
      ],
      observaciones:
        estadoPreparacion === 'SIN_DATOS_DIGITALES'
          ? 'Pendiente de captura fisica/manual.'
          : estadoPreparacion === 'REQUIERE_REVISION'
            ? 'Pendiente de resolucion humana antes de SST-3.'
            : null
    });
  }

  return { rows, contacts, formation };
};

const buildGlobalContactProposalRows = (
  combinedCanonical: CanonicalResponse[],
  masters: Map<string, MasterPersonRow>,
  meta26Universe: Map<string, Meta26PersonRow>
): ContactProposalRow[] =>
  combinedCanonical.flatMap((row) => {
    const master = masters.get(row.documentNormalized);
    if (!master) {
      return [];
    }

    const proposal = classifyEmergencyContactProposal(
      {
        nombre_contacto: master.contacto_nombre,
        parentesco: master.contacto_parentesco,
        telefono: master.contacto_telefono
      },
      {
        nombre_contacto: row.mergedContact.nombre_contacto ?? null,
        parentesco: row.mergedContact.parentesco ?? null,
        telefono: row.mergedContact.telefono ?? null
      }
    );

    if (!proposal.payload) {
      return [];
    }

    return [
      {
        persona_id: Number(master.persona_id),
        documento: row.documentNormalized,
        nombre: buildFullName(master),
        clasificacion: proposal.classification,
        en_meta26: meta26Universe.has(row.documentNormalized),
        nombre_contacto: proposal.payload.nombre_contacto,
        parentesco: proposal.payload.parentesco,
        telefono: proposal.payload.telefono
      }
    ];
  });

const upsertPreparationRows = async (db: DbRunner, rows: PreparationInsertRow[]): Promise<Map<number, number>> => {
  await db.query(
    `
      UPDATE sst_preparacion_personas
      SET activo = FALSE, updated_at = NOW()
      WHERE contrato_id = $1::bigint
    `,
    [META26_CONTRATO_ID]
  );

  const map = new Map<number, number>();
  for (const row of rows) {
    const result = await db.query<{ id: number }>(
      `
        INSERT INTO sst_preparacion_personas (
          persona_id,
          vinculacion_id,
          empresa_id,
          contrato_id,
          documento,
          nombre,
          municipio,
          institucion,
          sede,
          modalidad,
          cargo,
          fuente_formulario_1,
          fuente_formulario_2,
          estado_digital,
          estado_preparacion,
          porcentaje_completitud,
          completitud_estado,
          conflictos_aparentes,
          conflictos_reales,
          requiere_revision_humana,
          requiere_captura,
          apto_apply,
          propuesta_sst,
          propuesta_contacto_emergencia,
          propuesta_formacion_academica,
          propuesta_afiliaciones,
          campos_restringidos,
          fuentes,
          origen_principal,
          observaciones,
          activo,
          updated_at
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16::int,
          $17,
          $18::int,
          $19::int,
          $20,
          $21,
          $22,
          $23::jsonb,
          $24::jsonb,
          $25::jsonb,
          $26::jsonb,
          $27::jsonb,
          $28::jsonb,
          'FORMULARIO_DIGITAL',
          $29,
          TRUE,
          NOW()
        )
        ON CONFLICT (contrato_id, persona_id)
        DO UPDATE SET
          vinculacion_id = EXCLUDED.vinculacion_id,
          empresa_id = EXCLUDED.empresa_id,
          documento = EXCLUDED.documento,
          nombre = EXCLUDED.nombre,
          municipio = EXCLUDED.municipio,
          institucion = EXCLUDED.institucion,
          sede = EXCLUDED.sede,
          modalidad = EXCLUDED.modalidad,
          cargo = EXCLUDED.cargo,
          fuente_formulario_1 = EXCLUDED.fuente_formulario_1,
          fuente_formulario_2 = EXCLUDED.fuente_formulario_2,
          estado_digital = EXCLUDED.estado_digital,
          estado_preparacion = EXCLUDED.estado_preparacion,
          porcentaje_completitud = EXCLUDED.porcentaje_completitud,
          completitud_estado = EXCLUDED.completitud_estado,
          conflictos_aparentes = EXCLUDED.conflictos_aparentes,
          conflictos_reales = EXCLUDED.conflictos_reales,
          requiere_revision_humana = EXCLUDED.requiere_revision_humana,
          requiere_captura = EXCLUDED.requiere_captura,
          apto_apply = EXCLUDED.apto_apply,
          propuesta_sst = EXCLUDED.propuesta_sst,
          propuesta_contacto_emergencia = EXCLUDED.propuesta_contacto_emergencia,
          propuesta_formacion_academica = EXCLUDED.propuesta_formacion_academica,
          propuesta_afiliaciones = EXCLUDED.propuesta_afiliaciones,
          campos_restringidos = EXCLUDED.campos_restringidos,
          fuentes = EXCLUDED.fuentes,
          observaciones = EXCLUDED.observaciones,
          activo = TRUE,
          updated_at = NOW()
        RETURNING id
      `,
      [
        row.persona_id,
        row.vinculacion_id,
        row.empresa_id,
        row.contrato_id,
        row.documento,
        row.nombre,
        row.municipio,
        row.institucion,
        row.sede,
        row.modalidad,
        row.cargo,
        row.fuente_formulario_1,
        row.fuente_formulario_2,
        row.estado_digital,
        row.estado_preparacion,
        row.porcentaje_completitud,
        row.completitud_estado,
        row.conflictos_aparentes,
        row.conflictos_reales,
        row.requiere_revision_humana,
        row.requiere_captura,
        row.apto_apply,
        JSON.stringify(row.propuesta_sst),
        JSON.stringify(row.propuesta_contacto_emergencia),
        JSON.stringify(row.propuesta_formacion_academica),
        JSON.stringify(row.propuesta_afiliaciones),
        JSON.stringify(row.campos_restringidos),
        JSON.stringify(row.fuentes),
        row.observaciones
      ]
    );

    map.set(row.persona_id, Number(result.rows[0]?.id ?? 0));
  }

  return map;
};

const buildCaseFingerprint = (row: ReviewCsvRow): string =>
  [
    row.documento,
    row.tipo_conflicto,
    row.campo,
    row.fuente_a,
    row.valor_a,
    row.fuente_b,
    row.valor_b
  ]
    .map((value) => String(value ?? '').trim())
    .join('|')
    .toLowerCase();

const upsertReviewRows = async (
  db: DbRunner,
  rows: ReviewCsvRow[],
  finalByDocument: Map<string, FinalMeta26CsvRow>,
  meta26Universe: Map<string, Meta26PersonRow>,
  preparationIds: Map<number, number>,
  empresaId: number
): Promise<number> => {
  await db.query(
    `
      UPDATE sst_revision_casos
      SET activo = FALSE, updated_at = NOW()
      WHERE contrato_id = $1::bigint
    `,
    [META26_CONTRATO_ID]
  );

  let inserted = 0;
  for (const row of rows) {
    const documento = String(row.documento).trim();
    const finalRow = finalByDocument.get(documento);
    const meta26 = meta26Universe.get(documento);
    const personaId = meta26 ? Number(meta26.persona_id) : null;
    const vinculacionId = meta26 ? Number(meta26.vinculacion_id) : null;
    const preparationId = personaId ? preparationIds.get(personaId) ?? null : null;
    const fingerprint = buildCaseFingerprint(row);

    await db.query(
      `
        INSERT INTO sst_revision_casos (
          preparacion_id,
          persona_id,
          vinculacion_id,
          empresa_id,
          contrato_id,
          documento,
          persona_nombre,
          municipio,
          institucion,
          sede,
          cargo,
          tipo_conflicto,
          campo,
          fuente_a,
          valor_a,
          fuente_b,
          valor_b,
          recomendacion,
          decision,
          valor_resuelto,
          estado,
          observacion,
          contexto,
          huella,
          activo,
          updated_at
        )
        VALUES (
          $1::bigint,
          $2::bigint,
          $3::bigint,
          $4::bigint,
          $5::bigint,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          NULLIF($19, ''),
          NULL,
          CASE WHEN NULLIF($19, '') IS NULL THEN 'PENDIENTE' ELSE 'RESUELTO' END,
          NULLIF($20, ''),
          $21::jsonb,
          $22,
          TRUE,
          NOW()
        )
        ON CONFLICT (huella)
        DO UPDATE SET
          preparacion_id = EXCLUDED.preparacion_id,
          persona_id = EXCLUDED.persona_id,
          vinculacion_id = EXCLUDED.vinculacion_id,
          empresa_id = EXCLUDED.empresa_id,
          contrato_id = EXCLUDED.contrato_id,
          documento = EXCLUDED.documento,
          persona_nombre = EXCLUDED.persona_nombre,
          municipio = EXCLUDED.municipio,
          institucion = EXCLUDED.institucion,
          sede = EXCLUDED.sede,
          cargo = EXCLUDED.cargo,
          tipo_conflicto = EXCLUDED.tipo_conflicto,
          campo = EXCLUDED.campo,
          fuente_a = EXCLUDED.fuente_a,
          valor_a = EXCLUDED.valor_a,
          fuente_b = EXCLUDED.fuente_b,
          valor_b = EXCLUDED.valor_b,
          recomendacion = EXCLUDED.recomendacion,
          observacion = EXCLUDED.observacion,
          contexto = EXCLUDED.contexto,
          activo = TRUE,
          updated_at = NOW()
      `,
      [
        preparationId,
        personaId,
        vinculacionId,
        empresaId,
        META26_CONTRATO_ID,
        documento,
        row.persona,
        finalRow?.municipio ?? null,
        finalRow?.institucion ?? null,
        finalRow?.sede ?? null,
        finalRow?.cargo ?? null,
        row.tipo_conflicto,
        row.campo,
        row.fuente_a,
        nullIfBlank(row.valor_a),
        row.fuente_b,
        nullIfBlank(row.valor_b),
        nullIfBlank(row.recomendacion),
        row.decision ?? '',
        row.observacion ?? '',
        JSON.stringify({
          origen: 'SST_2_2_META26_DIGITAL',
          requiere_revision_humana: true
        }),
        fingerprint
      ]
    );

    inserted += 1;
  }

  return inserted;
};

const main = async (): Promise<void> => {
  await mkdir(REPORTS_DIR, { recursive: true });

  const summary = JSON.parse(await readFile(SUMMARY_PATH, 'utf8')) as SummaryJson;
  const finalRows = readSheetRows<FinalMeta26CsvRow>(FINAL_META26_PATH);
  const reviewRows = readSheetRows<ReviewCsvRow>(REVIEW_QUEUE_PATH);

  const [file1Audit, file2Audit, meta26Plan] = await Promise.all([
    readWorkbookAudit(FILE_1_PATH),
    readWorkbookAudit(FILE_2_PATH),
    loadMeta26PlanRows()
  ]);

  const f1Rows = parseResponseRows(file1Audit, 'F1');
  const f2Rows = parseResponseRows(file2Audit, 'F2');
  const f1Canonical = canonicalizeRows(f1Rows);
  const f2Canonical = canonicalizeRows(f2Rows);
  const combinedCanonical = buildCombinedCanonicalRows(f1Canonical, f2Canonical);
  const combinedCanonicalMap = buildCanonicalMap(combinedCanonical);
  const allDocuments = [...new Set(combinedCanonical.map((row) => row.documentNormalized))];
  const pool = createPool();

  try {
    const before = {
      personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM personas'),
      vinculaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM vinculaciones'),
      cobertura_asignaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM cobertura_asignaciones'),
      focalizacion_final: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_final'),
      focalizacion_vigencias: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_vigencias'),
      sst_perfil_demografico: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
      sst_perfil_demografico_versiones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones'),
      sst_preparacion_personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_preparacion_personas'),
      sst_revision_casos: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_revision_casos'),
      persona_formacion_academica: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM persona_formacion_academica')
    };

    const [empresaId, meta26Universe, masters] = await Promise.all([
      loadContractCompanyId(pool, META26_CONTRATO_ID),
      loadMeta26CurrentUniverse(pool),
      loadMasterPeopleByDocuments(pool, allDocuments)
    ]);

    const built = buildPreparationRows(
      finalRows,
      meta26Universe,
      meta26Plan,
      masters,
      combinedCanonicalMap,
      empresaId
    );
    const globalContactRows = buildGlobalContactProposalRows(combinedCanonical, masters, meta26Universe);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const preparationIds = await upsertPreparationRows(client, built.rows);
      const loadedReviewCases = await upsertReviewRows(
        client,
        reviewRows,
        new Map(finalRows.map((row) => [String(row.documento).trim(), row])),
        meta26Universe,
        preparationIds,
        empresaId
      );
      await client.query('COMMIT');

      const after = {
        personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM personas'),
        vinculaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM vinculaciones'),
        cobertura_asignaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM cobertura_asignaciones'),
        focalizacion_final: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_final'),
        focalizacion_vigencias: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_vigencias'),
        sst_perfil_demografico: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
        sst_perfil_demografico_versiones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones'),
        sst_preparacion_personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_preparacion_personas'),
        sst_revision_casos: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_revision_casos'),
        persona_formacion_academica: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM persona_formacion_academica')
      };

      const planRows = built.rows.filter((row) => row.apto_apply);
      const fullProfiles = planRows.filter((row) => row.completitud_estado === 'COMPLETA').length;
      const incompleteProfiles = planRows.filter((row) => row.completitud_estado !== 'COMPLETA').length;

      await writeCsv(
        OUTPUT_CONTACTS,
        ['persona_id', 'documento', 'nombre', 'clasificacion', 'en_meta26', 'nombre_contacto', 'parentesco', 'telefono'],
        globalContactRows
      );
      await writeCsv(
        OUTPUT_FORMACION,
        ['persona_id', 'documento', 'nombre', 'nivel_educativo', 'titulo_programa', 'estado_formacion', 'actualmente_estudia'],
        built.formation
      );
      await writeCsv(
        OUTPUT_PLAN_CSV,
        [
          'persona_id',
          'documento',
          'nombre',
          'estado_preparacion',
          'estado_digital',
          'porcentaje_completitud',
          'completitud_estado',
          'municipio',
          'institucion',
          'sede',
          'cargo',
          'fuentes',
          'propuesta_sst',
          'propuesta_contacto_emergencia',
          'propuesta_formacion_academica',
          'campos_restringidos'
        ],
        planRows.map((row) => ({
          persona_id: row.persona_id,
          documento: row.documento,
          nombre: row.nombre,
          estado_preparacion: row.estado_preparacion,
          estado_digital: row.estado_digital,
          porcentaje_completitud: row.porcentaje_completitud,
          completitud_estado: row.completitud_estado,
          municipio: row.municipio,
          institucion: row.institucion,
          sede: row.sede,
          cargo: row.cargo,
          fuentes: row.fuentes.join('|'),
          propuesta_sst: JSON.stringify(row.propuesta_sst),
          propuesta_contacto_emergencia: JSON.stringify(row.propuesta_contacto_emergencia),
          propuesta_formacion_academica: JSON.stringify(row.propuesta_formacion_academica),
          campos_restringidos: JSON.stringify(row.campos_restringidos)
        }))
      );
      await writeJson(OUTPUT_PLAN_JSON, {
        generated_at: new Date().toISOString(),
        contrato_id: META26_CONTRATO_ID,
        summary: {
          automaticos_esperados: summary.counts?.readiness?.automatico ?? 183,
          parciales_esperados: summary.counts?.readiness?.parcial ?? 457,
          revision_esperados: summary.counts?.readiness?.requiere_revision ?? 41,
          sin_datos_esperados: summary.counts?.readiness?.sin_datos ?? 91,
          registros_plan: planRows.length,
          perfiles_completos_post_apply: fullProfiles,
          perfiles_incompletos_post_apply: incompleteProfiles,
          contactos_propuestos_total: globalContactRows.length,
          contactos_propuestos_meta26: built.contacts.length,
          formacion_propuesta: built.formation.length,
          casos_revision: loadedReviewCases
        },
        rows: planRows
      });

      await writeJson(OUTPUT_SUMMARY, {
        generated_at: new Date().toISOString(),
        baseline: summary,
        outputs: {
          contactos: OUTPUT_CONTACTS,
          formacion: OUTPUT_FORMACION,
          plan_csv: OUTPUT_PLAN_CSV,
          plan_json: OUTPUT_PLAN_JSON
        },
        before,
        after,
        counts: {
          plan_total: planRows.length,
          automaticos: planRows.filter((row) => row.estado_preparacion === 'APTO_APPLY_AUTOMATICO').length,
          parciales: planRows.filter((row) => row.estado_preparacion === 'APTO_APPLY_PARCIAL').length,
          revision: built.rows.filter((row) => row.estado_preparacion === 'REQUIERE_REVISION').length,
          sin_datos: built.rows.filter((row) => row.estado_preparacion === 'SIN_DATOS_DIGITALES').length,
          contactos_propuestos_total: globalContactRows.length,
          contactos_propuestos_meta26: built.contacts.length,
          contactos_conflicto: 0,
          formacion_propuesta: built.formation.length,
          review_cases: loadedReviewCases,
          perfiles_completos_post_apply: fullProfiles,
          perfiles_incompletos_post_apply: incompleteProfiles
        }
      });

      console.log(
        JSON.stringify(
          {
            plan_total: planRows.length,
            automaticos: planRows.filter((row) => row.estado_preparacion === 'APTO_APPLY_AUTOMATICO').length,
            parciales: planRows.filter((row) => row.estado_preparacion === 'APTO_APPLY_PARCIAL').length,
            review_cases: loadedReviewCases,
            contacts_total: globalContactRows.length,
            contacts_meta26: built.contacts.length,
            formation: built.formation.length,
            before,
            after
          },
          null,
          2
        )
      );
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    throw error;
  } finally {
    await pool.end();
  }
};

void main();
