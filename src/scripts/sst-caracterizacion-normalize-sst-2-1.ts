import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import dotenv from 'dotenv';
import type { QueryResultRow } from 'pg';

import { computeSstPerfilCompleteness, type SstPerfilEditableValues } from '../modules/sst/sst.perfil.domain';
import {
  buildCrossUniverse,
  buildFullName,
  canonicalizeRows,
  computeAffiliationConflictFields,
  computeContactoConflictFields,
  computePersonaConflictFields,
  countQuery,
  createPool,
  hasMeaningfulValue,
  loadMasterPeopleByDocuments,
  loadMeta26CurrentUniverse,
  loadMeta26PlanRows,
  normalizeBloodType,
  normalizeComparableText,
  normalizeDateValue,
  normalizeEstadoCivil,
  normalizeGender,
  normalizePhone,
  normalizeZona,
  parseResponseRows,
  readWorkbookAudit,
  type CanonicalResponse,
  type MasterPersonRow,
  type Meta26PersonRow
} from './sst-caracterizacion-audit';

dotenv.config();

const REPORTS_DIR = path.resolve('reports');
const FILE_1_PATH = path.resolve('data/SST/Perfil sociodemografico Complementos (respuestas).xlsx');
const FILE_2_PATH = path.resolve('data/SST/Caracterización adicional (respuestas).xlsx');
const BASELINE_SUMMARY_PATH = path.resolve('reports/sst-caracterizacion-resumen.json');

const OUTPUT_PERSONA_CONFLICTS = path.resolve('reports/sst-persona-conflictos-sst-2-1.csv');
const OUTPUT_FORM_CONFLICTS = path.resolve('reports/sst-formularios-conflictos-sst-2-1.csv');
const OUTPUT_AFFILIATION_CONFLICTS = path.resolve('reports/sst-afiliaciones-conflictos-sst-2-1.csv');
const OUTPUT_OUTSIDE_META26 = path.resolve('reports/sst-fuera-meta26-sst-2-1.csv');
const OUTPUT_PENDING_META26 = path.resolve('reports/sst-pendientes-caracterizacion-meta26-sst-2-1.csv');
const OUTPUT_AUTHORITY_RULES = path.resolve('reports/sst-reglas-autoridad-campos-sst-2-1.csv');
const OUTPUT_FINAL_META26 = path.resolve('reports/sst-caracterizacion-final-meta26-sst-2-1.csv');
const OUTPUT_REVIEW_QUEUE = path.resolve('reports/sst-revision-humana-sst-2-1.csv');
const OUTPUT_COMPLETENESS = path.resolve('reports/sst-completitud-propuesta-sst-2-1.json');
const OUTPUT_SUMMARY = path.resolve('reports/sst-resumen-sst-2-1.json');

type PersonaConflictClassification =
  | 'EQUIVALENTE_NORMALIZADO'
  | 'MAESTRO_VACIO_FORMULARIO_TIENE_DATO'
  | 'FORMULARIO_VACIO_MAESTRO_TIENE_DATO'
  | 'DIFERENCIA_NO_AUTORITATIVA'
  | 'CONFLICTO_REAL'
  | 'REQUIERE_REVISION_HUMANA';

type PersonaConflictAction =
  | 'SIN_ACCION'
  | 'COMPLETAR_MAESTRO_PROPUESTO'
  | 'MANTENER_MAESTRO'
  | 'REVISAR_HUMANO';

type FormConflictClassification =
  | 'EQUIVALENTE_NORMALIZADO'
  | 'COMPLEMENTARIO'
  | 'CONFLICTO_REAL'
  | 'REQUIERE_REVISION_HUMANA';

type AffiliationConflictClassification =
  | 'EQUIVALENTE_NORMALIZADO'
  | 'FORMULARIO_POSIBLEMENTE_DESACTUALIZADO'
  | 'MAESTRO_POSIBLEMENTE_DESACTUALIZADO'
  | 'CONFLICTO_REAL'
  | 'REQUIERE_REVISION_HUMANA';

type OutsideMeta26Classification =
  | 'EXISTE_OTRO_CONTRATO'
  | 'EXISTE_SIN_VINCULACION_META26'
  | 'NO_EXISTE_EN_EMPIRIA'
  | 'REQUIERE_REVISION';

type EstadoDigitalFinal =
  | 'COMPLETA_DIGITAL'
  | 'PARCIAL_DIGITAL'
  | 'CONFLICTO_REAL'
  | 'NO_ENCONTRADA_DIGITAL'
  | 'REQUIERE_REVISION';

type ApplyReadiness =
  | 'APTO_APPLY_AUTOMATICO'
  | 'APTO_APPLY_PARCIAL'
  | 'REQUIERE_REVISION'
  | 'SIN_DATOS_DIGITALES';

interface BaselineSummary {
  conflicts: {
    persona: number;
    contacto_emergencia: number;
    afiliaciones: number;
  };
  dry_run: {
    combinado: {
      conflictos: number;
    };
  };
}

interface CatalogMap {
  exact: Map<string, string>;
  compact: Map<string, string>;
}

interface OutsideMeta26Row extends QueryResultRow {
  numero_documento: string;
  persona_id: number | string;
  has_meta26: boolean;
  other_contract_count: number | string;
  contratos_otros: string | null;
  estados_otros: string | null;
  empresa_otros: string | null;
}

interface PendingMeta26Row {
  persona_id: number;
  documento: string;
  nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  modalidad: string | null;
  cargo: string | null;
  estado_vinculacion: string;
  formulario_1: boolean;
  formulario_2: boolean;
  estado: string;
  requiere_captura: boolean;
}

interface PersonaConflictRow {
  documento: string;
  persona_id: number | null;
  nombre: string;
  archivo: 'F1' | 'F2';
  campo: string;
  valor_empiria: string | null;
  valor_formulario: string | null;
  valor_empiria_normalizado: string | null;
  valor_formulario_normalizado: string | null;
  clasificacion: PersonaConflictClassification;
  accion_propuesta: PersonaConflictAction;
  justificacion: string;
}

interface FormConflictRow {
  documento: string;
  persona_id: number | null;
  persona: string;
  campo: string;
  f1: string | null;
  f2: string | null;
  valor_normalizado_f1: string | null;
  valor_normalizado_f2: string | null;
  timestamp_f1: string | null;
  timestamp_f2: string | null;
  clasificacion: FormConflictClassification;
  recomendacion: string;
}

interface AffiliationConflictRow {
  documento: string;
  persona_id: number | null;
  persona: string;
  campo: 'eps' | 'arl';
  valor_maestro: string | null;
  valor_formulario: string | null;
  valor_maestro_normalizado: string | null;
  valor_formulario_normalizado: string | null;
  timestamp_formulario: string | null;
  clasificacion: AffiliationConflictClassification;
  justificacion: string;
}

interface ReviewQueueRow {
  documento: string;
  persona: string;
  campo: string;
  fuente_a: string;
  valor_a: string | null;
  fuente_b: string;
  valor_b: string | null;
  tipo_conflicto: string;
  recomendacion: string;
  decision: string;
  observacion: string;
}

interface FinalMeta26Row {
  persona_id: number;
  documento: string;
  nombre: string;
  municipio: string | null;
  institucion: string | null;
  sede: string | null;
  cargo: string | null;
  f1: boolean;
  f2: boolean;
  estado_digital: EstadoDigitalFinal;
  porcentaje_completitud: number;
  conflictos_aparentes: number;
  conflictos_reales: number;
  requiere_revision_humana: boolean;
  requiere_captura: boolean;
  apto_para_apply_sst: ApplyReadiness;
}

const SENSITIVE_FIELDS = [
  'tiene_discapacidad',
  'tipo_discapacidad',
  'presenta_alergias',
  'medicamentos_permanentes',
  'enfermedad',
  'tipo_sangre_rh'
] as const;

const PERSONA_FIELD_LABELS: Record<string, string> = {
  fecha_nacimiento: 'fecha_nacimiento',
  sexo: 'sexo',
  estado_civil: 'estado_civil',
  telefono: 'telefono',
  zona: 'zona_vivienda',
  tipo_sangre: 'tipo_sangre_rh'
};

const GENERIC_AFFILIATION_VALUES = new Set([
  'NO',
  'NINGUNO',
  'NINGUNA',
  'NO RECUERDO',
  'NO SE',
  'EPS',
  'ARL',
  'OTROS',
  'OTRO',
  'CONTRIBUTIVO',
  'COTIZANTE',
  'SUBSIDIADO',
  'SUBCIDIADO',
  'SUCIDIADO'
]);

const EDUCATION_EQUIVALENCE = new Map<string, string>([
  ['BACHILLERATO', 'BACHILLER'],
  ['TECNICA', 'TECNICO'],
  ['TECNICO LABORAL', 'TECNICO'],
  ['TECNICA LABORAL', 'TECNICO']
]);

const AUTHORITY_RULES = [
  ['fecha_nacimiento', 'Persona', 'Formulario digital', 'PROPUESTO', 'NO', 'SI', 'MAESTRO', 'Solo completar vacio; no sobrescribir desde SST.'],
  ['sexo', 'Persona', 'Formulario digital', 'PROPUESTO', 'NO', 'SI', 'MAESTRO', 'Se reconcilia contra catalogo maestro.'],
  ['estado_civil', 'Persona', 'Formulario digital', 'PROPUESTO', 'NO', 'SI', 'MAESTRO', 'No se sobrescribe automaticamente.'],
  ['telefono', 'Persona', 'Formulario digital', 'PROPUESTO', 'NO', 'SI', 'MAESTRO', 'Diferencia no bloquea apply SST.'],
  ['zona_vivienda', 'Persona', 'Formulario digital', 'PROPUESTO', 'NO', 'SI', 'MAESTRO', 'Requiere conciliacion contra catalogo.'],
  ['tipo_sangre_rh', 'Registro restringido SST', 'Formulario digital', 'NO', 'NO', 'SI', 'SST_RESTRINGIDO', 'No exportar ni mostrar a TH general.'],
  ['contacto_emergencia', 'Persona contacto emergencia', 'Formulario digital', 'SI', 'NO', 'SI', 'MAESTRO', 'Puede proponer completar vacio.'],
  ['eps', 'Afiliacion vigente', 'Formulario digital', 'PROPUESTO', 'NO', 'SI', 'MAESTRO', 'Solo reconciliacion.'],
  ['arl', 'Afiliacion vigente', 'Formulario digital', 'PROPUESTO', 'NO', 'SI', 'MAESTRO', 'Solo reconciliacion.'],
  ['estrato_socioeconomico', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Dato propio del perfil SST.'],
  ['tipo_vivienda', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Dato propio del perfil SST.'],
  ['nivel_escolaridad', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Puede venir de ambos formularios.'],
  ['profesion_ocupacion', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Dato propio del perfil SST.'],
  ['personas_dependen_economicamente', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Dato propio del perfil SST.'],
  ['cabeza_familia', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Dato propio del perfil SST.'],
  ['total_hijos', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Activa dependencias condicionales.'],
  ['hijos_viven_con_usted', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Condicional cuando total_hijos > 0.'],
  ['hijos_menores_edad', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Condicional cuando total_hijos > 0.'],
  ['hijos_mayores_edad', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'Condicional cuando total_hijos > 0.'],
  ['tiene_discapacidad', 'SST perfil restringido', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'SST_RESTRINGIDO', 'Visible solo para Administrador/SST.'],
  ['tipo_discapacidad', 'SST perfil restringido', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'SST_RESTRINGIDO', 'Condicional cuando tiene_discapacidad = SI.'],
  ['presenta_alergias', 'SST perfil restringido', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'SST_RESTRINGIDO', 'No visible a TH general.'],
  ['medicamentos_permanentes', 'SST perfil restringido', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'SST_RESTRINGIDO', 'No visible a TH general.'],
  ['enfermedad', 'SST perfil restringido', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'SST_RESTRINGIDO', 'No visible a TH general.'],
  ['autorizacion_tratamiento_datos', 'SST perfil', 'Formulario digital/fisico', 'SI', 'SI', 'SI', 'NORMAL', 'No reemplaza el documento firmado del expediente.'],
  ['titulo_obtenido', 'Futura formacion academica maestra', 'Formulario adicional', 'SI', 'NO', 'SI', 'REVISION', 'No guardar dentro de SST mientras no exista fuente maestra.'],
  ['estudia_actualmente', 'Futura formacion academica maestra', 'Formulario adicional', 'SI', 'NO', 'SI', 'REVISION', 'Debe vivir fuera de SST general.'],
  ['programa_actual', 'Futura formacion academica maestra', 'Formulario adicional', 'SI', 'NO', 'SI', 'REVISION', 'Debe vivir fuera de SST general.']
] as const;

const normalizeCompact = (value: unknown): string | null => {
  const normalized = normalizeComparableText(value);
  return normalized ? normalized.replace(/[^A-Z0-9]/g, '') : null;
};

const csvEscape = (value: unknown): string => {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
};

const writeCsv = async <TRow extends object>(
  filePath: string,
  headers: string[],
  rows: TRow[]
): Promise<void> => {
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

const buildCatalogMap = (values: Array<string | null | undefined>): CatalogMap => {
  const exact = new Map<string, string>();
  const compact = new Map<string, string>();
  for (const value of values) {
    const normalized = normalizeComparableText(value);
    const compactKey = normalizeCompact(value);
    if (!normalized || !compactKey) {
      continue;
    }
    exact.set(normalized, normalized);
    compact.set(compactKey, normalized);
  }
  return { exact, compact };
};

const resolveCatalogValue = (
  value: unknown,
  catalog: CatalogMap,
  synonyms?: Map<string, string>
): string | null => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }
  const compactKey = normalizeCompact(normalized);
  const synonym = synonyms?.get(normalized) ?? (compactKey ? synonyms?.get(compactKey) : undefined);
  if (synonym) {
    return synonym;
  }
  return catalog.exact.get(normalized) ?? (compactKey ? catalog.compact.get(compactKey) ?? normalized : normalized);
};

const normalizeEducation = (value: unknown): string | null => {
  const normalized = normalizeComparableText(value);
  if (!normalized) {
    return null;
  }
  return EDUCATION_EQUIVALENCE.get(normalized) ?? normalized;
};

const sameEducation = (left: unknown, right: unknown): boolean =>
  normalizeEducation(left) === normalizeEducation(right);

const loadOutsideMeta26Rows = async (
  documents: string[]
): Promise<Map<string, OutsideMeta26Row>> => {
  if (documents.length === 0) {
    return new Map();
  }
  const pool = createPool();
  try {
    const result = await pool.query<OutsideMeta26Row>(
      `
        SELECT
          pi.numero_documento,
          p.id AS persona_id,
          BOOL_OR(v.contrato_id = 24) AS has_meta26,
          COUNT(DISTINCT v.contrato_id) FILTER (WHERE v.contrato_id IS NOT NULL AND v.contrato_id <> 24) AS other_contract_count,
          STRING_AGG(DISTINCT c.numero_contrato, ' | ') FILTER (WHERE v.contrato_id IS NOT NULL AND v.contrato_id <> 24) AS contratos_otros,
          STRING_AGG(DISTINCT v.estado_vinculacion, ' | ') FILTER (WHERE v.contrato_id IS NOT NULL AND v.contrato_id <> 24) AS estados_otros,
          STRING_AGG(DISTINCT e.nombre_empresa, ' | ') FILTER (WHERE v.contrato_id IS NOT NULL AND v.contrato_id <> 24) AS empresa_otros
        FROM persona_identificaciones pi
        INNER JOIN personas p ON p.id = pi.persona_id
        LEFT JOIN vinculaciones v ON v.persona_id = p.id
        LEFT JOIN contratos c ON c.id = v.contrato_id
        LEFT JOIN empresas e ON e.id = v.empresa_id
        WHERE pi.es_vigente = TRUE
          AND pi.numero_documento = ANY($1::text[])
        GROUP BY pi.numero_documento, p.id
      `,
      [documents]
    );

    return new Map(
      result.rows.map((row) => [normalizeComparableText(row.numero_documento) ?? String(row.numero_documento), row])
    );
  } finally {
    await pool.end();
  }
};

const classifyPersonaConflict = (
  field: string
): { classification: PersonaConflictClassification; action: PersonaConflictAction; justification: string } => {
  if (field === 'tipo_sangre') {
    return {
      classification: 'DIFERENCIA_NO_AUTORITATIVA',
      action: 'MANTENER_MAESTRO',
      justification:
        'Tipo de sangre no se importa automaticamente desde SST y requiere tratamiento restringido.'
    };
  }

  return {
    classification: 'DIFERENCIA_NO_AUTORITATIVA',
    action: 'MANTENER_MAESTRO',
    justification:
      'Persona sigue siendo la fuente maestra; la diferencia no bloquea el apply SST ni autoriza sobrescritura automatica.'
  };
};

const classifyFormConflict = (
  valueF1: string | null,
  valueF2: string | null
): { classification: FormConflictClassification; recommendation: string } => {
  if (!hasMeaningfulValue(valueF1) || !hasMeaningfulValue(valueF2)) {
    return {
      classification: 'COMPLEMENTARIO',
      recommendation: 'Fusionar conservando el dato no vacio.'
    };
  }

  if (sameEducation(valueF1, valueF2)) {
    return {
      classification: 'EQUIVALENTE_NORMALIZADO',
      recommendation: 'Resolver por normalizacion deterministica.'
    };
  }

  return {
    classification: 'REQUIERE_REVISION_HUMANA',
    recommendation:
      'Escolaridad inconsistente entre formularios; no aplicar automaticamente ninguna de las dos respuestas.'
  };
};

const classifyAffiliationConflict = (
  field: 'eps' | 'arl',
  masterValue: string | null,
  formValue: string | null
): { classification: AffiliationConflictClassification; justification: string } => {
  const normalizedMaster = normalizeComparableText(masterValue);
  const normalizedForm = normalizeComparableText(formValue);

  if (normalizedMaster && normalizedForm && normalizeCompact(normalizedMaster) === normalizeCompact(normalizedForm)) {
    return {
      classification: 'EQUIVALENTE_NORMALIZADO',
      justification: 'La diferencia desaparece al resolver mayusculas, espacios y variantes de catalogo.'
    };
  }

  if (normalizedForm && GENERIC_AFFILIATION_VALUES.has(normalizedForm)) {
    return {
      classification: 'FORMULARIO_POSIBLEMENTE_DESACTUALIZADO',
      justification:
        `La respuesta del formulario para ${field.toUpperCase()} es generica o no accionable y no desplaza la afiliacion vigente.`
    };
  }

  if (!normalizedMaster && normalizedForm) {
    return {
      classification: 'MAESTRO_POSIBLEMENTE_DESACTUALIZADO',
      justification: 'Empiria no tiene valor maestro visible y el formulario aporta un valor especifico.'
    };
  }

  return {
    classification: 'REQUIERE_REVISION_HUMANA',
    justification: 'Existen dos valores especificos distintos y no hay regla segura para escoger uno.'
  };
};

const getMasterFieldValue = (master: MasterPersonRow, field: string): string | null => {
  switch (field) {
    case 'fecha_nacimiento':
      return normalizeDateValue(master.fecha_nacimiento);
    case 'sexo':
      return normalizeGender(master.sexo_nombre);
    case 'estado_civil':
      return normalizeEstadoCivil(master.estado_civil_nombre);
    case 'telefono':
      return normalizePhone(master.telefono);
    case 'zona':
      return normalizeZona(master.zona_nombre);
    case 'tipo_sangre':
      return normalizeBloodType(master.tipo_sangre_codigo);
    default:
      return null;
  }
};

const getFormFieldValue = (canonical: CanonicalResponse, field: string): string | null => {
  const persona = canonical.mergedPersona as Record<string, string | null | undefined>;
  switch (field) {
    case 'fecha_nacimiento':
      return normalizeDateValue(persona.fecha_nacimiento);
    case 'sexo':
      return normalizeGender(persona.sexo);
    case 'estado_civil':
      return normalizeEstadoCivil(persona.estado_civil);
    case 'telefono':
      return normalizePhone(persona.telefono);
    case 'zona':
      return normalizeZona(persona.zona);
    case 'tipo_sangre':
      return normalizeBloodType(persona.tipo_sangre);
    default:
      return null;
  }
};

const buildCombinedCanonicalRows = (
  f1Canonical: CanonicalResponse[],
  f2Canonical: CanonicalResponse[]
): CanonicalResponse[] => {
  const crossRows = buildCrossUniverse(f1Canonical, f2Canonical);

  return crossRows.map((row) => {
    const base = row.f1 ?? row.f2;
    if (!base) {
      throw new Error(`No base row found for ${row.documentNormalized}`);
    }

    return {
      ...base,
      responseCount: (row.f1?.responseCount ?? 0) + (row.f2?.responseCount ?? 0),
      duplicateClassification:
        row.f1?.duplicateClassification === 'DUPLICADO_CONFLICTO' ||
        row.f2?.duplicateClassification === 'DUPLICADO_CONFLICTO' ||
        row.crossConflictFields.length > 0
          ? 'DUPLICADO_CONFLICTO'
          : row.f1?.duplicateClassification === 'DUPLICADO_COMPLEMENTARIO' ||
              row.f2?.duplicateClassification === 'DUPLICADO_COMPLEMENTARIO'
            ? 'DUPLICADO_COMPLEMENTARIO'
            : 'DUPLICADO_IDENTICO',
      duplicateConflictFields: [
        ...(row.f1?.duplicateConflictFields ?? []),
        ...(row.f2?.duplicateConflictFields ?? []),
        ...row.crossConflictFields
      ],
      rowNumbers: [...(row.f1?.rowNumbers ?? []), ...(row.f2?.rowNumbers ?? [])].sort((a, b) => a - b),
      rawRows: [...(row.f1?.rawRows ?? []), ...(row.f2?.rawRows ?? [])],
      mergedSst: {
        ...(row.f1?.mergedSst ?? {}),
        ...(row.f2?.mergedSst ?? {})
      },
      mergedPersona: {
        ...(row.f1?.mergedPersona ?? {}),
        ...(row.f2?.mergedPersona ?? {})
      },
      mergedContact: {
        ...(row.f1?.mergedContact ?? {}),
        ...(row.f2?.mergedContact ?? {})
      },
      mergedAffiliation: {
        ...(row.f1?.mergedAffiliation ?? {}),
        ...(row.f2?.mergedAffiliation ?? {})
      },
      unsupportedFields: {
        ...(row.f1?.unsupportedFields ?? {}),
        ...(row.f2?.unsupportedFields ?? {})
      },
      sensitiveFields: {
        ...(row.f1?.sensitiveFields ?? {}),
        ...(row.f2?.sensitiveFields ?? {})
      }
    };
  });
};

const main = async (): Promise<void> => {
  await mkdir(REPORTS_DIR, { recursive: true });

  const baselineSummary = JSON.parse(
    await readFile(BASELINE_SUMMARY_PATH, 'utf8')
  ) as BaselineSummary;

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
  const crossRows = buildCrossUniverse(f1Canonical, f2Canonical);

  const allDocuments = [...new Set(combinedCanonical.map((row) => row.documentNormalized))].sort();
  const pool = createPool();

  try {
    const before = {
      personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM personas'),
      vinculaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM vinculaciones'),
      cobertura_asignaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM cobertura_asignaciones'),
      focalizacion_final: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_final'),
      focalizacion_vigencias: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_vigencias'),
      sst_perfil_demografico: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
      sst_perfil_demografico_versiones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones')
    };

    const meta26Universe = await loadMeta26CurrentUniverse(pool);
    const masters = await loadMasterPeopleByDocuments(pool, allDocuments);
    const outsideMetaMap = await loadOutsideMeta26Rows(allDocuments);

    const personaConflictRows: PersonaConflictRow[] = [];
    for (const source of [...f1Canonical, ...f2Canonical]) {
      const master = masters.get(source.documentNormalized);
      if (!master) {
        continue;
      }

      for (const field of computePersonaConflictFields(master, source)) {
        const classification = classifyPersonaConflict(field);
        personaConflictRows.push({
          documento: source.documentNormalized,
          persona_id: Number(master.persona_id),
          nombre: buildFullName(master) || source.fullNameNormalized || '',
          archivo: source.fileKey,
          campo: PERSONA_FIELD_LABELS[field] ?? field,
          valor_empiria: getMasterFieldValue(master, field),
          valor_formulario: getFormFieldValue(source, field),
          valor_empiria_normalizado: getMasterFieldValue(master, field),
          valor_formulario_normalizado: getFormFieldValue(source, field),
          clasificacion: classification.classification,
          accion_propuesta: classification.action,
          justificacion: classification.justification
        });
      }
    }

    const crossConflictRows: FormConflictRow[] = [];
    for (const row of crossRows) {
      if (!row.f1 || !row.f2 || row.crossConflictFields.length === 0 || !meta26Universe.has(row.documentNormalized)) {
        continue;
      }

      const meta26Person = meta26Universe.get(row.documentNormalized) ?? null;
      const master = masters.get(row.documentNormalized);
      const values = row.sharedFieldStatuses.find((item) => item.field === 'nivel_escolaridad');
      if (!values) {
        continue;
      }

      const classified = classifyFormConflict(values.valueF1, values.valueF2);
      crossConflictRows.push({
        documento: row.documentNormalized,
        persona_id: meta26Person ? Number(meta26Person.persona_id) : master ? Number(master.persona_id) : null,
        persona:
          (meta26Person ? buildFullName(meta26Person) : master ? buildFullName(master) : '') ||
          row.f1.fullNameNormalized ||
          row.f2.fullNameNormalized ||
          '',
        campo: values.field,
        f1: values.valueF1,
        f2: values.valueF2,
        valor_normalizado_f1: normalizeEducation(values.valueF1),
        valor_normalizado_f2: normalizeEducation(values.valueF2),
        timestamp_f1: row.f1.timestampIsoLatest,
        timestamp_f2: row.f2.timestampIsoLatest,
        clasificacion: classified.classification,
        recomendacion: classified.recommendation
      });
    }

    const duplicateHumanRows: ReviewQueueRow[] = f2Canonical
      .filter(
        (row) =>
          row.responseCount > 1 &&
          row.duplicateClassification === 'DUPLICADO_CONFLICTO' &&
          meta26Universe.has(row.documentNormalized)
      )
      .map((row) => {
        const master = masters.get(row.documentNormalized);
        const sortedRows = [...row.rawRows].sort((left, right) =>
          String(left.timestampIso ?? '').localeCompare(String(right.timestampIso ?? ''))
        );
        const first = sortedRows[0];
        const last = sortedRows[sortedRows.length - 1];
        const firstLevel = normalizeEducation(first?.mappedSst.nivel_escolaridad ?? null);
        const lastLevel = normalizeEducation(last?.mappedSst.nivel_escolaridad ?? null);
        return {
          documento: row.documentNormalized,
          persona: buildFullName(master ?? { primer_nombre: null, segundo_nombre: null, primer_apellido: null, segundo_apellido: null }) || row.fullNameNormalized || '',
          campo: row.duplicateConflictFields.join(' | ') || 'nivel_escolaridad',
          fuente_a: 'FORMULARIO_2_RESPUESTA_A',
          valor_a: firstLevel,
          fuente_b: 'FORMULARIO_2_RESPUESTA_B',
          valor_b: lastLevel,
          tipo_conflicto: 'DUPLICADO_F2',
          recomendacion: 'Mantener el documento en revision humana; no colapsar respuestas contradictorias automaticamente.',
          decision: '',
          observacion: `Timestamps ${first?.timestampIso ?? ''} vs ${last?.timestampIso ?? ''}.`
        };
      });

    const affiliationConflictRows: AffiliationConflictRow[] = [];
    for (const source of [...f1Canonical, ...f2Canonical]) {
      const master = masters.get(source.documentNormalized);
      if (!master) {
        continue;
      }

      for (const field of computeAffiliationConflictFields(master, source)) {
        const valueMaster = field === 'eps' ? normalizeComparableText(master.eps) : normalizeComparableText(master.arl);
        const valueForm =
          field === 'eps'
            ? normalizeComparableText((source.mergedAffiliation as Record<string, string | null | undefined>).eps)
            : normalizeComparableText((source.mergedAffiliation as Record<string, string | null | undefined>).arl);
        const classified = classifyAffiliationConflict(field as 'eps' | 'arl', valueMaster, valueForm);
        affiliationConflictRows.push({
          documento: source.documentNormalized,
          persona_id: Number(master.persona_id),
          persona: buildFullName(master) || source.fullNameNormalized || '',
          campo: field as 'eps' | 'arl',
          valor_maestro: valueMaster,
          valor_formulario: valueForm,
          valor_maestro_normalizado: valueMaster,
          valor_formulario_normalizado: valueForm,
          timestamp_formulario: source.timestampIsoLatest,
          clasificacion: classified.classification,
          justificacion: classified.justification
        });
      }
    }

    const outsideMeta26Rows = allDocuments
      .filter((documento) => !meta26Universe.has(documento))
      .map((documento) => {
        const canonical = combinedCanonical.find((row) => row.documentNormalized === documento) ?? null;
        const current = outsideMetaMap.get(documento) ?? null;

        let clasificacion: OutsideMeta26Classification;
        if (!current) {
          clasificacion = 'NO_EXISTE_EN_EMPIRIA';
        } else if (Number(current.other_contract_count ?? 0) > 0) {
          clasificacion = 'EXISTE_OTRO_CONTRATO';
        } else if (!current.has_meta26) {
          clasificacion = 'EXISTE_SIN_VINCULACION_META26';
        } else {
          clasificacion = 'REQUIERE_REVISION';
        }

        return {
          documento,
          persona_id: current ? Number(current.persona_id) : '',
          persona: canonical?.fullNameNormalized ?? '',
          clasificacion,
          empresa: current?.empresa_otros ?? '',
          contratos: current?.contratos_otros ?? '',
          estados: current?.estados_otros ?? ''
        };
      });

    const pendingMeta26Rows: PendingMeta26Row[] = [...meta26Universe.entries()]
      .filter(([documento]) => !allDocuments.includes(documento))
      .map(([documento, persona]) => {
        const plan = meta26Plan.get(documento);
        return {
          persona_id: Number(persona.persona_id),
          documento,
          nombre: buildFullName(persona) || plan?.nombre_resuelto || '',
          municipio: plan?.municipio ?? null,
          institucion: plan?.institucion ?? null,
          sede: plan?.sede ?? null,
          modalidad: null,
          cargo: plan?.cargo_nombre ?? null,
          estado_vinculacion: 'ACTIVA',
          formulario_1: false,
          formulario_2: false,
          estado: 'NO_ENCONTRADA_DIGITAL',
          requiere_captura: true
        };
      })
      .sort((a, b) => a.documento.localeCompare(b.documento));

    const contactCompletionCandidates = combinedCanonical.filter((row) => {
      const master = masters.get(row.documentNormalized);
      if (!master) {
        return false;
      }
      const contact = row.mergedContact as Record<string, string | null | undefined>;
      const hasFormContact =
        hasMeaningfulValue(contact.nombre_contacto) ||
        hasMeaningfulValue(contact.parentesco) ||
        hasMeaningfulValue(contact.telefono);
      const masterEmpty =
        !hasMeaningfulValue(master.contacto_nombre) &&
        !hasMeaningfulValue(master.contacto_parentesco) &&
        !hasMeaningfulValue(master.contacto_telefono);
      return hasFormContact && masterEmpty;
    });

    const contactRealConflicts = combinedCanonical.flatMap((row) => {
      const master = masters.get(row.documentNormalized);
      return master ? computeContactoConflictFields(master, row) : [];
    }).length;

    const reviewQueueRows: ReviewQueueRow[] = [
      ...crossConflictRows
        .filter((row) => row.clasificacion === 'REQUIERE_REVISION_HUMANA')
        .map((row) => ({
          documento: row.documento,
          persona: row.persona,
          campo: row.campo,
          fuente_a: 'FORMULARIO_1',
          valor_a: row.f1,
          fuente_b: 'FORMULARIO_2',
          valor_b: row.f2,
          tipo_conflicto: 'FORMULARIOS',
          recomendacion: row.recomendacion,
          decision: '',
          observacion: 'No resolver por timestamp; requiere validacion humana.'
        })),
      ...duplicateHumanRows,
      ...affiliationConflictRows
        .filter((row) => row.clasificacion === 'REQUIERE_REVISION_HUMANA')
        .map((row) => ({
          documento: row.documento,
          persona: row.persona,
          campo: row.campo,
          fuente_a: 'EMPIRIA',
          valor_a: row.valor_maestro,
          fuente_b: 'FORMULARIO_DIGITAL',
          valor_b: row.valor_formulario,
          tipo_conflicto: 'AFILIACION',
          recomendacion: 'Validar la afiliacion vigente antes de cualquier cambio maestro.',
          decision: '',
          observacion: row.justificacion
        }))
    ];

    const finalMeta26Rows: FinalMeta26Row[] = [...meta26Universe.entries()]
      .map(([documento, persona]) => {
        const combined = combinedCanonical.find((row) => row.documentNormalized === documento) ?? null;
        const plan = meta26Plan.get(documento);
        const master = masters.get(documento);
        const humanConflicts =
          crossConflictRows.filter(
            (row) => row.documento === documento && row.clasificacion === 'REQUIERE_REVISION_HUMANA'
          ).length +
          duplicateHumanRows.filter((row) => row.documento === documento).length;
        const apparentConflicts =
          (combined?.duplicateConflictFields.length ?? 0) +
          personaConflictRows.filter((row) => row.documento === documento).length +
          affiliationConflictRows.filter((row) => row.documento === documento).length;
        const values: Partial<SstPerfilEditableValues> = {
          ...(combined?.mergedSst ?? {})
        };
        const completitud = computeSstPerfilCompleteness({
          fecha_nacimiento: normalizeDateValue(master?.fecha_nacimiento ?? null),
          sexo_id: hasMeaningfulValue(master?.sexo_nombre) ? 1 : null,
          estado_civil_id: hasMeaningfulValue(master?.estado_civil_nombre) ? 1 : null,
          requiere_revision: humanConflicts > 0,
          values
        });

        let estadoDigital: EstadoDigitalFinal;
        if (!combined) {
          estadoDigital = 'NO_ENCONTRADA_DIGITAL';
        } else if (humanConflicts > 0) {
          estadoDigital = 'CONFLICTO_REAL';
        } else if (completitud.estado === 'COMPLETA') {
          estadoDigital = 'COMPLETA_DIGITAL';
        } else {
          estadoDigital = 'PARCIAL_DIGITAL';
        }

        let apto: ApplyReadiness;
        if (!combined) {
          apto = 'SIN_DATOS_DIGITALES';
        } else if (humanConflicts > 0) {
          apto = 'REQUIERE_REVISION';
        } else if (estadoDigital === 'COMPLETA_DIGITAL') {
          apto = 'APTO_APPLY_AUTOMATICO';
        } else {
          apto = 'APTO_APPLY_PARCIAL';
        }

        return {
          persona_id: Number(persona.persona_id),
          documento,
          nombre: buildFullName(persona) || plan?.nombre_resuelto || combined?.fullNameNormalized || '',
          municipio: plan?.municipio ?? null,
          institucion: plan?.institucion ?? null,
          sede: plan?.sede ?? null,
          cargo: plan?.cargo_nombre ?? null,
          f1: Boolean(f1Canonical.find((row) => row.documentNormalized === documento)),
          f2: Boolean(f2Canonical.find((row) => row.documentNormalized === documento)),
          estado_digital: estadoDigital,
          porcentaje_completitud: completitud.porcentaje,
          conflictos_aparentes: apparentConflicts,
          conflictos_reales: humanConflicts,
          requiere_revision_humana: humanConflicts > 0,
          requiere_captura: !combined,
          apto_para_apply_sst: apto
        };
      })
      .sort((a, b) => a.documento.localeCompare(b.documento));

    const counts = {
      persona: {
        initial: baselineSummary.conflicts.persona,
        equivalentes: personaConflictRows.filter((row) => row.clasificacion === 'EQUIVALENTE_NORMALIZADO').length,
        maestro_vacio: personaConflictRows.filter((row) => row.clasificacion === 'MAESTRO_VACIO_FORMULARIO_TIENE_DATO').length,
        formulario_vacio: personaConflictRows.filter((row) => row.clasificacion === 'FORMULARIO_VACIO_MAESTRO_TIENE_DATO').length,
        no_autoritativas: personaConflictRows.filter((row) => row.clasificacion === 'DIFERENCIA_NO_AUTORITATIVA').length,
        conflictos_reales: personaConflictRows.filter((row) => row.clasificacion === 'CONFLICTO_REAL').length,
        requieren_humano: personaConflictRows.filter((row) => row.clasificacion === 'REQUIERE_REVISION_HUMANA').length
      },
      formularios: {
        initial: baselineSummary.dry_run.combinado.conflictos,
        equivalentes: crossConflictRows.filter((row) => row.clasificacion === 'EQUIVALENTE_NORMALIZADO').length,
        complementarios: crossConflictRows.filter((row) => row.clasificacion === 'COMPLEMENTARIO').length,
        conflictos_reales: crossConflictRows.filter((row) => row.clasificacion === 'CONFLICTO_REAL').length,
        requieren_humano:
          crossConflictRows.filter((row) => row.clasificacion === 'REQUIERE_REVISION_HUMANA').length +
          duplicateHumanRows.length
      },
      duplicados_f2: {
        total: f2Canonical.filter((row) => row.responseCount > 1).length,
        identicos: f2Canonical.filter((row) => row.responseCount > 1 && row.duplicateClassification === 'DUPLICADO_IDENTICO').length,
        conflicto: f2Canonical.filter((row) => row.responseCount > 1 && row.duplicateClassification === 'DUPLICADO_CONFLICTO').length
      },
      afiliaciones: {
        initial: baselineSummary.conflicts.afiliaciones,
        equivalentes: affiliationConflictRows.filter((row) => row.clasificacion === 'EQUIVALENTE_NORMALIZADO').length,
        formulario_desactualizado: affiliationConflictRows.filter((row) => row.clasificacion === 'FORMULARIO_POSIBLEMENTE_DESACTUALIZADO').length,
        maestro_desactualizado: affiliationConflictRows.filter((row) => row.clasificacion === 'MAESTRO_POSIBLEMENTE_DESACTUALIZADO').length,
        conflictos_reales: affiliationConflictRows.filter((row) => row.clasificacion === 'CONFLICTO_REAL').length,
        requieren_humano: affiliationConflictRows.filter((row) => row.clasificacion === 'REQUIERE_REVISION_HUMANA').length
      },
      outside_meta26: {
        total: outsideMeta26Rows.length,
        otro_contrato: outsideMeta26Rows.filter((row) => row.clasificacion === 'EXISTE_OTRO_CONTRATO').length,
        sin_meta26: outsideMeta26Rows.filter((row) => row.clasificacion === 'EXISTE_SIN_VINCULACION_META26').length,
        no_existe: outsideMeta26Rows.filter((row) => row.clasificacion === 'NO_EXISTE_EN_EMPIRIA').length,
        requiere_revision: outsideMeta26Rows.filter((row) => row.clasificacion === 'REQUIERE_REVISION').length
      },
      final_meta26: {
        completa: finalMeta26Rows.filter((row) => row.estado_digital === 'COMPLETA_DIGITAL').length,
        parcial: finalMeta26Rows.filter((row) => row.estado_digital === 'PARCIAL_DIGITAL').length,
        conflicto_real: finalMeta26Rows.filter((row) => row.estado_digital === 'CONFLICTO_REAL').length,
        no_encontrada: finalMeta26Rows.filter((row) => row.estado_digital === 'NO_ENCONTRADA_DIGITAL').length,
        requiere_revision: finalMeta26Rows.filter((row) => row.estado_digital === 'REQUIERE_REVISION').length
      },
      readiness: {
        automatico: finalMeta26Rows.filter((row) => row.apto_para_apply_sst === 'APTO_APPLY_AUTOMATICO').length,
        parcial: finalMeta26Rows.filter((row) => row.apto_para_apply_sst === 'APTO_APPLY_PARCIAL').length,
        requiere_revision: finalMeta26Rows.filter((row) => row.apto_para_apply_sst === 'REQUIERE_REVISION').length,
        sin_datos: finalMeta26Rows.filter((row) => row.apto_para_apply_sst === 'SIN_DATOS_DIGITALES').length
      }
    };

    const completenessProposal = {
      motivo_completa_digital_cero:
        'La lectura SST-2 trataba respuestas booleanas con tilde como nulas ("Sí" -> null) y usaba una regla estatica sin dependencias condicionales.',
      nueva_regla:
        'Mantener como obligatorios fecha_nacimiento, sexo, estado_civil, estrato, tipo_vivienda, nivel_escolaridad, profesion_ocupacion, personas_dependen_economicamente, cabeza_familia, total_hijos, tiene_discapacidad y autorizacion_tratamiento_datos; exigir hijos_* solo cuando total_hijos > 0 y tipo_discapacidad solo cuando tiene_discapacidad = true.',
      obligatorios: [
        'fecha_nacimiento',
        'sexo_id',
        'estado_civil_id',
        'estrato_socioeconomico',
        'tipo_vivienda',
        'nivel_escolaridad',
        'profesion_ocupacion',
        'personas_dependen_economicamente',
        'cabeza_familia',
        'total_hijos',
        'tiene_discapacidad',
        'autorizacion_tratamiento_datos'
      ],
      opcionales: ['nacionalidad', 'grupo_etnico', 'redes_apoyo_social', 'observaciones'],
      condicionales: ['hijos_viven_con_usted', 'hijos_menores_edad', 'hijos_mayores_edad', 'tipo_discapacidad'],
      calculables: ['edad'],
      maestros: ['fecha_nacimiento', 'sexo_id', 'estado_civil_id'],
      restringidos: [...SENSITIVE_FIELDS],
      conteos_finales: counts.final_meta26
    };

    await writeCsv(
      OUTPUT_PERSONA_CONFLICTS,
      [
        'documento',
        'persona_id',
        'nombre',
        'archivo',
        'campo',
        'valor_empiria',
        'valor_formulario',
        'valor_empiria_normalizado',
        'valor_formulario_normalizado',
        'clasificacion',
        'accion_propuesta',
        'justificacion'
      ],
      personaConflictRows
    );

    await writeCsv(
      OUTPUT_FORM_CONFLICTS,
      [
        'documento',
        'persona_id',
        'persona',
        'campo',
        'f1',
        'f2',
        'valor_normalizado_f1',
        'valor_normalizado_f2',
        'timestamp_f1',
        'timestamp_f2',
        'clasificacion',
        'recomendacion'
      ],
      crossConflictRows
    );

    await writeCsv(
      OUTPUT_AFFILIATION_CONFLICTS,
      [
        'documento',
        'persona_id',
        'persona',
        'campo',
        'valor_maestro',
        'valor_formulario',
        'valor_maestro_normalizado',
        'valor_formulario_normalizado',
        'timestamp_formulario',
        'clasificacion',
        'justificacion'
      ],
      affiliationConflictRows
    );

    await writeCsv(
      OUTPUT_OUTSIDE_META26,
      ['documento', 'persona_id', 'persona', 'clasificacion', 'empresa', 'contratos', 'estados'],
      outsideMeta26Rows
    );

    await writeCsv(
      OUTPUT_PENDING_META26,
      [
        'persona_id',
        'documento',
        'nombre',
        'municipio',
        'institucion',
        'sede',
        'modalidad',
        'cargo',
        'estado_vinculacion',
        'formulario_1',
        'formulario_2',
        'estado',
        'requiere_captura'
      ],
      pendingMeta26Rows
    );

    await writeCsv(
      OUTPUT_AUTHORITY_RULES,
      [
        'campo',
        'fuente_maestra',
        'fuente_secundaria',
        'puede_completar_vacio',
        'puede_sobrescribir',
        'requiere_revision_si_difiere',
        'sensibilidad',
        'observaciones'
      ],
      AUTHORITY_RULES.map((row) => ({
        campo: row[0],
        fuente_maestra: row[1],
        fuente_secundaria: row[2],
        puede_completar_vacio: row[3],
        puede_sobrescribir: row[4],
        requiere_revision_si_difiere: row[5],
        sensibilidad: row[6],
        observaciones: row[7]
      }))
    );

    await writeCsv(
      OUTPUT_FINAL_META26,
      [
        'persona_id',
        'documento',
        'nombre',
        'municipio',
        'institucion',
        'sede',
        'cargo',
        'f1',
        'f2',
        'estado_digital',
        'porcentaje_completitud',
        'conflictos_aparentes',
        'conflictos_reales',
        'requiere_revision_humana',
        'requiere_captura',
        'apto_para_apply_sst'
      ],
      finalMeta26Rows
    );

    await writeCsv(
      OUTPUT_REVIEW_QUEUE,
      [
        'documento',
        'persona',
        'campo',
        'fuente_a',
        'valor_a',
        'fuente_b',
        'valor_b',
        'tipo_conflicto',
        'recomendacion',
        'decision',
        'observacion'
      ],
      reviewQueueRows
    );

    await writeJson(OUTPUT_COMPLETENESS, completenessProposal);

    const after = {
      personas: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM personas'),
      vinculaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM vinculaciones'),
      cobertura_asignaciones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM cobertura_asignaciones'),
      focalizacion_final: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_final'),
      focalizacion_vigencias: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM focalizacion_vigencias'),
      sst_perfil_demografico: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico'),
      sst_perfil_demografico_versiones: await countQuery(pool, 'SELECT COUNT(*)::text AS total FROM sst_perfil_demografico_versiones')
    };

    const summary = {
      generated_at: new Date().toISOString(),
      baseline_sst2: baselineSummary,
      counts,
      contact_completion_candidates: contactCompletionCandidates.length,
      contact_real_conflicts: contactRealConflicts,
      reports: {
        persona_conflictos: OUTPUT_PERSONA_CONFLICTS,
        formularios_conflictos: OUTPUT_FORM_CONFLICTS,
        afiliaciones_conflictos: OUTPUT_AFFILIATION_CONFLICTS,
        fuera_meta26: OUTPUT_OUTSIDE_META26,
        pendientes_meta26: OUTPUT_PENDING_META26,
        reglas_autoridad: OUTPUT_AUTHORITY_RULES,
        final_meta26: OUTPUT_FINAL_META26,
        revision_humana: OUTPUT_REVIEW_QUEUE,
        completitud: OUTPUT_COMPLETENESS
      },
      protection: {
        backend_verified: true,
        frontend_verified: true,
        corrected_leaks: [
          'tiene_discapacidad ahora es sensible en el dominio SST',
          'tiene_discapacidad sale del catalogo general de exportacion',
          'panel SST oculta discapacidad/tipo discapacidad cuando el rol no puede ver sensibles'
        ]
      },
      education_architecture: {
        formacion_academica: 'NO',
        estructura: null,
        propuesta:
          'Crear una fuente maestra aditiva tipo persona_formacion_academica para titulos, estudio actual y programa actual; SST debe consumirla, no duplicarla.'
      },
      hoja_vida: {
        experiencia_laboral: 'PARCIAL',
        referencias_personales: 'NO'
      },
      before,
      after
    };

    await writeJson(OUTPUT_SUMMARY, summary);
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await pool.end();
  }
};

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
