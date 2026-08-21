import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as XLSX from 'xlsx';

import { dbPool } from '../config/db';
import {
  buildCsv,
  META26_FILE,
  runPersonalMeta26DryRun,
  type CoveragePreviewRow,
  type DryRunRowReport,
  type LicitacionPreviewRow,
} from '../modules/importaciones/personalMeta26DryRun';

const DECISIONS_FILE = 'reports/REVISION_PERSONAL_META26.xlsx';
const CORRECTIONS_FILE = 'reports/personal-meta26-correcciones-propuestas.csv';
const OUTPUT_JSON = 'reports/personal-meta26-dry-run-v4.json';
const OUTPUT_CSV = 'reports/personal-meta26-dry-run-v4.csv';
const OUTPUT_REVIEW = 'reports/personal-meta26-revisar-v4.csv';
const OUTPUT_COVERAGE = 'reports/personal-meta26-cobertura-preview-v4.csv';
const OUTPUT_LICITACION = 'reports/personal-meta26-licitacion-preview-v4.csv';
const OUTPUT_RETIREMENTS = 'reports/personal-meta26-retiros-v4.csv';

type FinalCategory = 'LISTA_IMPORTAR_ACTIVA' | 'LISTA_IMPORTAR_SIN_COBERTURA' | 'RETIRO_CONFIRMADO' | 'REVISAR';
type PendingType = 'FECHA_PENDIENTE' | 'IDENTIDAD_PENDIENTE' | 'CASO_ESPECIAL_PENDIENTE' | 'CARGO_PENDIENTE' | 'UBICACION_PENDIENTE' | 'TIPO_DOCUMENTO_PENDIENTE' | 'TIPO_VINCULACION_PENDIENTE' | 'OTRO';

interface HumanCoverageDecision {
  fila: number;
  cedula: string;
  decision: string;
  municipio: string;
  institucion: string;
  sede: string;
  modalidad: string;
  observacion: string;
}

interface HumanDataDecision {
  fila: number;
  tipo_problema: string;
  decision: string;
  valor_correcto: string;
  observacion: string;
}

interface SourceDates {
  fecha_inicio: string | null;
  fecha_fin: string | null;
  presentado_licitacion: boolean;
}

interface ExistingRetirementState {
  persona_id: number | null;
  persona_estado: string;
  vinculacion_id: number | null;
  vinculacion_estado: string;
  vinculacion_fecha_inicio: string | null;
  vinculacion_fecha_fin: string | null;
}

interface V4Row extends DryRunRowReport {
  categoria_final: FinalCategory;
  subtipo_retiro: string | null;
  pendientes_finales: PendingType[];
  decision_cobertura_usuario: string | null;
  observacion_usuario: string | null;
  decision_validada: boolean;
  decision_fuente: 'USUARIO' | 'PROPUESTA_DIAGNOSTICO' | 'XLSX_ORIGINAL' | null;
  municipio_propuesto: string | null;
  institucion_propuesta: string | null;
  sede_propuesta: string | null;
  modalidad_propuesta: string | null;
  fecha_inicio_xlsx: string | null;
  fecha_fin_xlsx: string | null;
  fecha_retiro_disponible: string | null;
  retiro_persona_estado: string | null;
  retiro_vinculacion_estado: string | null;
}

const value = (row: Record<string, unknown>, key: string): string => String(row[key] ?? '').trim();
const normalizeDocument = (input: unknown): string => String(input ?? '').replace(/[^0-9A-Za-z]+/g, '').toUpperCase();
const repairMojibake = (input: string): string => {
  if (!/[ÃÂ]/.test(input)) return input;
  try {
    return Buffer.from(input, 'latin1').toString('utf8');
  } catch {
    return input;
  }
};
const normalize = (input: unknown): string => repairMojibake(String(input ?? ''))
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/�/g, '')
  .replace(/\bI\.?\s*E\.?\b/g, 'INSTITUCION EDUCATIVA')
  .replace(/\bC\.?\s*E\.?\b/g, 'CENTRO EDUCATIVO')
  .replace(/[^A-Za-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const editDistance = (left: string, right: string): number => {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= right.length; j += 1) {
      current[j] = Math.min(current[j - 1]! + 1, previous[j]! + 1, previous[j - 1]! + (left[i - 1] === right[j - 1] ? 0 : 1));
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length]!;
};

const similarity = (left: unknown, right: unknown): number => {
  const a = normalize(left);
  const b = normalize(right);
  if (!a || !b) return 0;
  if (a === b) return 100;
  if (a.includes(b) || b.includes(a)) return 94;
  return Math.round((1 - editDistance(a, b) / Math.max(a.length, b.length, 1)) * 100);
};
const similaritySede = (left: unknown, right: unknown): number => similarity(
  normalize(left).replace(/^(SEDE PRINCIPAL|SEDE|PRINCIPAL)\s+/, ''),
  normalize(right).replace(/^(SEDE PRINCIPAL|SEDE|PRINCIPAL)\s+/, ''),
);

const readSheet = (workbook: XLSX.WorkBook, name: string): Record<string, unknown>[] => {
  const sheet = workbook.Sheets[name];
  if (!sheet) throw new Error(`HOJA_DECISIONES_FALTANTE:${name}`);
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
};

const readHumanDecisions = (): { coverage: Map<number, HumanCoverageDecision>; data: Map<number, HumanDataDecision[]>; hash: string } => {
  const workbook = XLSX.readFile(path.resolve(DECISIONS_FILE), { cellDates: false });
  const coverage = new Map<number, HumanCoverageDecision>();
  for (const row of readSheet(workbook, 'REVISAR_COBERTURA')) {
    const fila = Number(row.FILA_XLSX_PERSONAL);
    coverage.set(fila, {
      fila,
      cedula: normalizeDocument(row.CEDULA),
      decision: value(row, 'DECISION_USUARIO').toUpperCase(),
      municipio: value(row, 'MUNICIPIO_CORRECTO'),
      institucion: value(row, 'INSTITUCION_CORRECTA'),
      sede: value(row, 'SEDE_CORRECTA'),
      modalidad: value(row, 'MODALIDAD_CORRECTA'),
      observacion: value(row, 'OBSERVACION_USUARIO'),
    });
  }
  const data = new Map<number, HumanDataDecision[]>();
  for (const row of readSheet(workbook, 'ERRORES_DATOS_PERSONAL')) {
    const fila = Number(row.FILA_XLSX);
    const decisions = data.get(fila) ?? [];
    decisions.push({
      fila,
      tipo_problema: value(row, 'TIPO_PROBLEMA'),
      decision: value(row, 'DECISION_USUARIO').toUpperCase(),
      valor_correcto: value(row, 'VALOR_CORRECTO'),
      observacion: value(row, 'OBSERVACION_USUARIO'),
    });
    data.set(fila, decisions);
  }
  const buffer = require('node:fs').readFileSync(path.resolve(DECISIONS_FILE)) as Buffer;
  const hash = require('node:crypto').createHash('sha256').update(buffer).digest('hex') as string;
  return { coverage, data, hash };
};

const readSourceDates = (): Map<number, SourceDates> => {
  const workbook = XLSX.readFile(path.resolve(META26_FILE), { cellDates: false });
  const sheet = workbook.Sheets.IMPORTACION_META;
  if (!sheet) throw new Error('HOJA_IMPORTACION_META_FALTANTE');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const result = new Map<number, SourceDates>();
  rows.forEach((row, index) => result.set(index + 2, {
    fecha_inicio: value(row, 'FECHA_INICIO_CONTRATO') || null,
    fecha_fin: value(row, 'FECHA_FIN_CONTRATO') || null,
    presentado_licitacion: ['SI', 'SÍ', 'TRUE', '1'].includes(value(row, 'PRESENTADO_LICITACION').toUpperCase()),
  }));
  return result;
};

const readCorrections = (): Map<number, Record<string, string>> => {
  const text = require('node:fs').readFileSync(path.resolve(CORRECTIONS_FILE), 'utf8') as string;
  const workbook = XLSX.read(text, { type: 'string' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]!];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet!, { defval: '' });
  const result = new Map<number, Record<string, string>>();
  for (const row of rows) {
    const fila = Number(row.fila);
    const current = result.get(fila) ?? {};
    current[value(row, 'campo')] = value(row, 'valor_propuesto');
    result.set(fila, current);
  }
  return result;
};

const isRetirement = (observation: string): boolean => /PERSONA\s+RETIRAD[AO]|\bRETIRAD[AO]\b|NO\s+ASIGNAR\s+A\s+COBERTURA\s+AGOSTO/i.test(normalize(observation));
const isManipuladora = (row: DryRunRowReport): boolean => normalize(row.cargo_resuelto ?? row.cargo_origen).includes('MANIPULADOR');
const coverageIssue = (problem: string): boolean => /^(MUNICIPIO_|INSTITUCION_|SEDE_|MODALIDAD_)/.test(problem);

const pendingType = (problem: string): PendingType => {
  if (problem.includes('FECHA_')) return 'FECHA_PENDIENTE';
  if (problem.includes('IDENTIDAD') || problem.includes('CEDULA') || problem.includes('DOCUMENTO_FALTANTE')) return 'IDENTIDAD_PENDIENTE';
  if (problem.includes('CASO_ESPECIAL')) return 'CASO_ESPECIAL_PENDIENTE';
  if (problem.includes('CARGO')) return 'CARGO_PENDIENTE';
  if (problem.includes('UBICACION')) return 'UBICACION_PENDIENTE';
  if (problem.includes('TIPO_DOCUMENTO')) return 'TIPO_DOCUMENTO_PENDIENTE';
  if (problem.includes('TIPO_VINCULACION')) return 'TIPO_VINCULACION_PENDIENTE';
  return 'OTRO';
};

const findCoverageCandidate = (
  preview: CoveragePreviewRow[],
  proposed: { municipio: string | null; institucion: string | null; sede: string | null; modalidad: string | null },
): CoveragePreviewRow | null => {
  const scored = preview.map((candidate) => {
    if (similarity(proposed.modalidad, candidate.modalidad) < 98) return { candidate, score: -1 };
    const scores = [
      similarity(proposed.municipio, candidate.municipio),
      similarity(proposed.institucion, candidate.institucion),
      similaritySede(proposed.sede, candidate.sede),
    ];
    return { candidate, score: scores[0]! * 2 + scores[1]! * 2 + scores[2]! * 5, minimum: Math.min(scores[0]!, scores[2]!) };
  }).filter((item) => item.score >= 0 && (item.minimum ?? 0) >= 78)
    .sort((left, right) => right.score - left.score);
  if (!scored[0] || (scored[1] && scored[0].score === scored[1].score)) return null;
  return scored[0].candidate;
};

const loadRetirementStates = async (documents: string[]): Promise<{ states: Map<string, ExistingRetirementState>; economicStructures: string[]; coverageBySedeModalidadId: Map<string, CoveragePreviewRow> }> => {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query(`SET LOCAL statement_timeout = '60s'`);
    const result = await client.query<{
      documento: string; persona_id: number; persona_estado: string | null; vinculacion_id: number | null;
      vinculacion_estado: string | null; fecha_inicio: Date | string | null; fecha_fin: Date | string | null;
    }>(`
      SELECT UPPER(REGEXP_REPLACE(TRIM(pi.numero_documento), '[^0-9A-Za-z]+', '', 'g')) AS documento,
             p.id AS persona_id, 'EXISTENTE'::text AS persona_estado,
             v.id AS vinculacion_id, v.estado_vinculacion AS vinculacion_estado, v.fecha_inicio, v.fecha_fin
      FROM persona_identificaciones pi
      JOIN personas p ON p.id = pi.persona_id
      LEFT JOIN LATERAL (
        SELECT vx.* FROM vinculaciones vx
        WHERE vx.persona_id = p.id
        ORDER BY (vx.contrato_id = 24) DESC, vx.fecha_inicio DESC NULLS LAST, vx.id DESC
        LIMIT 1
      ) v ON TRUE
      WHERE pi.es_vigente = TRUE
        AND UPPER(REGEXP_REPLACE(TRIM(pi.numero_documento), '[^0-9A-Za-z]+', '', 'g')) = ANY($1::text[])
    `, [documents]);
    const structures = await client.query<{ table_name: string; column_name: string }>(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (table_name ILIKE '%caso%especial%' OR column_name ILIKE '%caso%especial%')
      ORDER BY table_name, ordinal_position
    `);
    const coverageRows = await client.query<{
      sede_modalidad_id: string; municipio: string | null; institucion: string | null; sede: string | null; modalidad: string | null; requeridas: number;
    }>(`
      SELECT ff.sede_modalidad_id::text,
             ff.municipio_texto AS municipio,
             COALESCE(ff.institucion_final, i.nombre_institucion) AS institucion,
             ff.sede_final AS sede,
             ff.modalidad_final AS modalidad,
             COALESCE(ff.cobertura_requerida, 0)::int AS requeridas
      FROM focalizacion_final ff
      LEFT JOIN instituciones i ON i.id = ff.institucion_id
      WHERE ff.contrato_id = 24
    `);
    const states = new Map<string, ExistingRetirementState>();
    for (const row of result.rows) {
      states.set(row.documento, {
        persona_id: row.persona_id,
        persona_estado: row.persona_estado ?? 'EXISTENTE',
        vinculacion_id: row.vinculacion_id,
        vinculacion_estado: row.vinculacion_estado ?? (row.vinculacion_id ? 'SIN_ESTADO' : 'NO_EXISTE'),
        vinculacion_fecha_inicio: row.fecha_inicio ? new Date(row.fecha_inicio).toISOString().slice(0, 10) : null,
        vinculacion_fecha_fin: row.fecha_fin ? new Date(row.fecha_fin).toISOString().slice(0, 10) : null,
      });
    }
    await client.query('ROLLBACK');
    return {
      states,
      economicStructures: [...new Set(structures.rows.map((row) => `${row.table_name}.${row.column_name}`))],
      coverageBySedeModalidadId: new Map(coverageRows.rows.map((row) => [row.sede_modalidad_id, {
        municipio: row.municipio,
        institucion: row.institucion,
        sede: row.sede,
        modalidad: row.modalidad,
        requeridas: row.requeridas,
        asignadas_propuestas: 0,
        diferencia: -row.requeridas,
        estado: row.requeridas > 0 ? 'DEFICIT' : 'COMPLETA',
      }])),
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
};

const main = async (): Promise<void> => {
  const human = readHumanDecisions();
  const sourceDates = readSourceDates();
  const corrections = readCorrections();
  const base = await runPersonalMeta26DryRun(META26_FILE);
  const retiredDocuments = [...human.coverage.values()].filter((item) => isRetirement(item.observacion)).map((item) => item.cedula);
  const retirementContext = await loadRetirementStates(retiredDocuments);
  const humanDataConsumed = [...human.data.values()].flat().filter((item) => item.decision || item.valor_correcto || item.observacion).length;
  const finalRows: V4Row[] = [];

  for (const row of base.report_rows) {
    const humanCoverage = human.coverage.get(row.fila_origen);
    const dataDecisions = human.data.get(row.fila_origen) ?? [];
    const dates = sourceDates.get(row.fila_origen) ?? { fecha_inicio: null, fecha_fin: null, presentado_licitacion: false };
    const retired = Boolean(humanCoverage && isRetirement(humanCoverage.observacion));
    const existing = retirementContext.states.get(normalizeDocument(row.cedula));
    const retirementDate = dates.fecha_fin ?? (existing?.vinculacion_fecha_fin ?? null);
    let candidate: CoveragePreviewRow | null = null;
    let decisionSource: V4Row['decision_fuente'] = null;

    if (isManipuladora(row) && !retired) {
      let proposed = {
        municipio: row.municipio_origen,
        institucion: row.institucion_origen,
        sede: row.sede_origen,
        modalidad: row.modalidad_origen,
      };
      if (humanCoverage?.decision === 'CORREGIR_MANUALMENTE') {
        proposed = {
          municipio: humanCoverage.municipio || proposed.municipio,
          institucion: humanCoverage.institucion || proposed.institucion,
          sede: humanCoverage.sede || proposed.sede,
          modalidad: humanCoverage.modalidad || proposed.modalidad,
        };
        decisionSource = 'USUARIO';
      } else if (humanCoverage?.decision === 'MANTENER_DATO_PERSONAL') {
        decisionSource = 'USUARIO';
      } else if (corrections.has(row.fila_origen)) {
        const correction = corrections.get(row.fila_origen)!;
        proposed = {
          municipio: correction.municipio || proposed.municipio,
          institucion: correction.institucion || proposed.institucion,
          sede: correction.sede || proposed.sede,
          modalidad: correction.modalidad || proposed.modalidad,
        };
        decisionSource = 'PROPUESTA_DIAGNOSTICO';
      } else {
        decisionSource = 'XLSX_ORIGINAL';
      }
      candidate = row.cobertura_estado === 'ASIGNACION_OK' && row.sede_modalidad_id
        ? retirementContext.coverageBySedeModalidadId.get(String(row.sede_modalidad_id)) ?? null
        : findCoverageCandidate(base.coverage_preview, proposed);
    }

    const unresolvedProblems = row.problemas_bloqueantes.filter((problem) => {
      if (coverageIssue(problem)) return isManipuladora(row) && !retired && !candidate;
      const humanDecision = dataDecisions.find((item) => normalize(item.tipo_problema).includes(normalize(problem).split(' ')[0] ?? ''));
      return !(humanDecision && (humanDecision.decision || humanDecision.valor_correcto));
    });
    const pending = [...new Set(unresolvedProblems.map(pendingType))];
    if (isManipuladora(row) && !retired && !candidate && pending.length === 0) pending.push('OTRO');
    let category: FinalCategory;
    let retirementSubtype: string | null = null;
    if (retired) {
      if (retirementDate) {
        category = 'RETIRO_CONFIRMADO';
        retirementSubtype = 'RETIRO_CONFIRMADO_USUARIO';
      } else {
        category = 'REVISAR';
        retirementSubtype = 'RETIRO_CONFIRMADO_FECHA_PENDIENTE';
        if (!pending.includes('FECHA_PENDIENTE')) pending.push('FECHA_PENDIENTE');
      }
    } else if (pending.length > 0 || (isManipuladora(row) && !candidate)) {
      category = 'REVISAR';
    } else {
      category = isManipuladora(row) ? 'LISTA_IMPORTAR_ACTIVA' : 'LISTA_IMPORTAR_SIN_COBERTURA';
    }

    finalRows.push({
      ...row,
      categoria_final: category,
      subtipo_retiro: retirementSubtype,
      pendientes_finales: pending,
      decision_cobertura_usuario: humanCoverage?.decision || null,
      observacion_usuario: humanCoverage?.observacion || dataDecisions.map((item) => item.observacion).filter(Boolean).join(' | ') || null,
      decision_validada: retired || Boolean(candidate) || !isManipuladora(row),
      decision_fuente: decisionSource,
      municipio_propuesto: candidate?.municipio ?? null,
      institucion_propuesta: candidate?.institucion ?? null,
      sede_propuesta: candidate?.sede ?? null,
      modalidad_propuesta: candidate?.modalidad ?? null,
      fecha_inicio_xlsx: dates.fecha_inicio,
      fecha_fin_xlsx: dates.fecha_fin,
      fecha_retiro_disponible: retirementDate,
      retiro_persona_estado: retired ? existing?.persona_estado ?? (row.persona_existente_id ? 'EXISTENTE' : 'NO_EXISTE') : null,
      retiro_vinculacion_estado: retired ? existing?.vinculacion_estado ?? (row.vinculacion_existente_id ? 'EXISTENTE' : 'NO_EXISTE') : null,
    });
  }

  const assigned = new Map<string, number>();
  for (const row of finalRows.filter((item) => item.categoria_final === 'LISTA_IMPORTAR_ACTIVA')) {
    const key = [row.municipio_propuesto, row.institucion_propuesta, row.sede_propuesta, row.modalidad_propuesta].map(normalize).join('|');
    assigned.set(key, (assigned.get(key) ?? 0) + 1);
  }
  const coveragePreview = base.coverage_preview.map((item) => {
    const key = [item.municipio, item.institucion, item.sede, item.modalidad].map(normalize).join('|');
    const assignedCount = assigned.get(key) ?? 0;
    return { ...item, asignadas_propuestas: assignedCount, diferencia: assignedCount - item.requeridas, estado: item.requeridas === assignedCount ? 'COMPLETA' : assignedCount < item.requeridas ? 'DEFICIT' : 'EXCESO' };
  });
  const coverageSummary = {
    requeridas_total: coveragePreview.reduce((sum, row) => sum + row.requeridas, 0),
    asignadas_total: coveragePreview.reduce((sum, row) => sum + row.asignadas_propuestas, 0),
    deficit_total: coveragePreview.reduce((sum, row) => sum + Math.max(0, row.requeridas - row.asignadas_propuestas), 0),
    exceso_total: coveragePreview.reduce((sum, row) => sum + Math.max(0, row.asignadas_propuestas - row.requeridas), 0),
    completas: coveragePreview.filter((row) => row.estado === 'COMPLETA').length,
    deficitarias: coveragePreview.filter((row) => row.estado === 'DEFICIT').length,
    excesos: coveragePreview.filter((row) => row.estado === 'EXCESO').length,
    sin_personal: coveragePreview.filter((row) => row.asignadas_propuestas === 0).length,
  };

  const eligibleLicitacion = finalRows.filter((row) => sourceDates.get(row.fila_origen)?.presentado_licitacion && !row.subtipo_retiro && row.categoria_final !== 'REVISAR');
  const licitacionPreview = base.licitacion_preview.map((item): LicitacionPreviewRow => {
    const presented = eligibleLicitacion.filter((row) => row.licitacion_perfil_resuelto === item.perfil).length;
    return { ...item, presentados: presented, diferencia: presented - item.requeridos, estado: presented === item.requeridos ? 'CUMPLE' : presented < item.requeridos ? 'DEFICIT' : 'EXCESO' };
  });

  const categories = Object.fromEntries((['LISTA_IMPORTAR_ACTIVA', 'LISTA_IMPORTAR_SIN_COBERTURA', 'RETIRO_CONFIRMADO', 'REVISAR'] as FinalCategory[]).map((category) => [category, finalRows.filter((row) => row.categoria_final === category).length])) as Record<FinalCategory, number>;
  const duplicatedCategories = finalRows.length - new Set(finalRows.map((row) => row.fila_origen)).size;
  const retirementRows = finalRows.filter((row) => row.subtipo_retiro);
  const readyRows = finalRows.filter((row) => row.categoria_final !== 'REVISAR');
  const pendingCounts = Object.fromEntries((['FECHA_PENDIENTE', 'IDENTIDAD_PENDIENTE', 'CASO_ESPECIAL_PENDIENTE', 'CARGO_PENDIENTE', 'UBICACION_PENDIENTE', 'TIPO_DOCUMENTO_PENDIENTE', 'TIPO_VINCULACION_PENDIENTE', 'OTRO'] as PendingType[]).map((type) => [type, finalRows.filter((row) => row.pendientes_finales.includes(type)).length])) as Record<PendingType, number>;
  const hasReusableSpecialCaseModel = retirementContext.economicStructures.some((item) => /valor/i.test(item))
    && retirementContext.economicStructures.some((item) => /vigencia_desde/i.test(item));
  const blockers = [
    ...(finalRows.some((row) => row.categoria_final === 'REVISAR') ? ['FILAS_REVISAR_PENDIENTES'] : []),
    ...(pendingCounts.CASO_ESPECIAL_PENDIENTE > 0 && !hasReusableSpecialCaseModel ? ['MODELO_CASO_ESPECIAL_PENDIENTE'] : []),
  ];
  const summary = {
    decisions_file: path.resolve(DECISIONS_FILE), decisions_sha256: human.hash,
    decisiones_humanas_encontradas: [...human.coverage.values()].filter((item) => item.decision || item.observacion || item.municipio || item.institucion || item.sede || item.modalidad).length + humanDataConsumed,
    decisiones_cobertura_consumidas: [...human.coverage.values()].filter((item) => item.decision || item.observacion).length,
    decisiones_datos_consumidas: humanDataConsumed,
    total_filas: finalRows.length, categorias: categories,
    retiro_confirmado_fecha_pendiente: retirementRows.filter((row) => row.subtipo_retiro === 'RETIRO_CONFIRMADO_FECHA_PENDIENTE').length,
    revisar_original_baseline: 307,
    revisar_base_actual: base.report_rows.filter((row) => row.estado_importacion.includes('REVISAR')).length,
    reduccion_revisar: 307 - categories.REVISAR,
    manipuladoras_xlsx: finalRows.filter(isManipuladora).length,
    manipuladoras_activas: finalRows.filter((row) => isManipuladora(row) && !row.subtipo_retiro).length,
    manipuladoras_retiradas: retirementRows.filter(isManipuladora).length,
    manipuladoras_asignables: finalRows.filter((row) => row.categoria_final === 'LISTA_IMPORTAR_ACTIVA').length,
    manipuladoras_pendientes: finalRows.filter((row) => isManipuladora(row) && row.categoria_final === 'REVISAR' && !row.subtipo_retiro).length,
    coverage: coverageSummary,
    puerto_gaitan: { retiros: retirementRows.filter((row) => normalize(row.municipio_origen) === 'PUERTO GAITAN').length, asignadas_agosto: retirementRows.filter((row) => normalize(row.municipio_origen) === 'PUERTO GAITAN' && row.municipio_propuesto).length },
    puerto_lopez: { retiros: retirementRows.filter((row) => normalize(row.municipio_origen) === 'PUERTO LOPEZ').length, asignadas_agosto: retirementRows.filter((row) => normalize(row.municipio_origen) === 'PUERTO LOPEZ' && row.municipio_propuesto).length },
    pendientes: pendingCounts,
    modelo_caso_especial: hasReusableSpecialCaseModel
      ? { estado: 'ESTRUCTURA_HISTORICA_ECONOMICA_REUTILIZABLE', estructuras: retirementContext.economicStructures }
      : { estado: 'MODELO_CASO_ESPECIAL_PENDIENTE', estructuras_inspeccionadas: retirementContext.economicStructures, propuesta: 'Crear en una fase posterior una estructura histórica por vinculación con valor, vigencia_desde, vigencia_hasta y motivo. No aplicar migración en este dry-run.' },
    licitacion: { total_contractual: 167, total_presentaciones_validas: licitacionPreview.reduce((sum, row) => sum + row.presentados, 0), perfiles: licitacionPreview },
    unique_people: base.unique_people,
    ready_plan_counts: {
      personas_crear: readyRows.filter((row) => row.persona_plan === 'PERSONA_CREAR').length,
      personas_reutilizar: readyRows.filter((row) => row.persona_plan === 'PERSONA_REUTILIZAR').length,
      vinculaciones_crear: readyRows.filter((row) => row.vinculacion_plan === 'VINCULACION_CREAR').length,
      vinculaciones_reutilizar: readyRows.filter((row) => row.vinculacion_plan === 'VINCULACION_REUTILIZAR').length,
    },
    duplicadas_entre_categorias: duplicatedCategories,
    bd_before: base.bd_before, bd_after: base.bd_after, escrituras_bd: 0,
    baseline_cobertura: { focalizacion: 76650, requeridas: 662, instituciones: 111, sedes: 605, sede_modalidades: 687, focalizacion_final: 687, municipio_incorrecto: 0 },
    blockers, seguro_smoke_real: blockers.length === 0,
  };
  if (finalRows.length !== 772 || Object.values(categories).reduce((sum, count) => sum + Number(count), 0) !== 772 || duplicatedCategories !== 0) throw new Error('CONTROL_772_FALLIDO');
  if (JSON.stringify(base.bd_before) !== JSON.stringify(base.bd_after)) throw new Error('CONTEOS_BD_CAMBIARON');

  const rowColumns: Array<keyof V4Row> = ['fila_origen', 'cedula', 'nombre', 'categoria_final', 'subtipo_retiro', 'pendientes_finales', 'persona_plan', 'persona_existente_id', 'vinculacion_plan', 'vinculacion_existente_id', 'cargo_origen', 'municipio_origen', 'institucion_origen', 'sede_origen', 'modalidad_origen', 'decision_cobertura_usuario', 'observacion_usuario', 'decision_validada', 'decision_fuente', 'municipio_propuesto', 'institucion_propuesta', 'sede_propuesta', 'modalidad_propuesta', 'fecha_inicio_xlsx', 'fecha_fin_xlsx', 'fecha_retiro_disponible', 'retiro_persona_estado', 'retiro_vinculacion_estado', 'licitacion_perfil_resuelto', 'problemas_bloqueantes'];
  const coverageColumns: Array<keyof CoveragePreviewRow> = ['municipio', 'institucion', 'sede', 'modalidad', 'requeridas', 'asignadas_propuestas', 'diferencia', 'estado'];
  const licitacionColumns: Array<keyof LicitacionPreviewRow> = ['perfil', 'requeridos', 'presentados', 'diferencia', 'estado'];
  await mkdir(path.resolve('reports'), { recursive: true });
  await Promise.all([
    writeFile(path.resolve(OUTPUT_JSON), JSON.stringify({ ...base, report_rows: finalRows, review_rows: finalRows.filter((row) => row.categoria_final === 'REVISAR'), coverage_preview: coveragePreview, coverage_summary: coverageSummary, licitacion_preview: licitacionPreview, v4_summary: summary }, null, 2), 'utf8'),
    writeFile(path.resolve(OUTPUT_CSV), buildCsv(finalRows, rowColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_REVIEW), buildCsv(finalRows.filter((row) => row.categoria_final === 'REVISAR'), rowColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_COVERAGE), buildCsv(coveragePreview, coverageColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_LICITACION), buildCsv(licitacionPreview, licitacionColumns), 'utf8'),
    writeFile(path.resolve(OUTPUT_RETIREMENTS), buildCsv(retirementRows, rowColumns), 'utf8'),
  ]);
  console.log(JSON.stringify(summary, null, 2));
  await dbPool.end();
};

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  await dbPool.end().catch(() => undefined);
  process.exitCode = 1;
});
