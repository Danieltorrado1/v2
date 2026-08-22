import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as XLSX from 'xlsx';

import { validateRetirementDate } from '../modules/importaciones/personalMeta26DryRun.helpers';

const PERSONAL_XLSX = 'data/Importacion_Personal_CONSORCIO_PAE_META_26.xlsx';
const DECISIONES_XLSX = 'reports/DECISIONES_FINALES_PERSONAL_META26.xlsx';
const V4_JSON = 'reports/personal-meta26-dry-run-v4.json';
const PENDIENTES_XLSX = 'reports/PENDIENTES_FINALES_PERSONAL_META26.xlsx';
const SUMMARY_JSON = 'reports/personal-meta26-final-pre-smoke.json';
const IMPORT_CONTEXT_DATE = '2026-08-22';

type SheetName = 'FECHAS' | 'IDENTIDADES' | 'CASOS_ESPECIALES' | 'UBICACIONES_CARGOS' | 'CATALOGOS';
type FinalCategory = 'IMPORTAR_ACTIVA_CON_COBERTURA' | 'IMPORTAR_ACTIVA_SIN_COBERTURA' | 'IMPORTAR_RETIRADA_HISTORICA' | 'REVISAR';

interface DecisionWorkbookRow {
  CEDULA?: string | number;
  CONTEXTO?: string;
  DECISION_USUARIO?: string | number;
  FILA_XLSX?: string | number;
  NOMBRE?: string;
  OBSERVACION_USUARIO?: string | number;
  PROBLEMA?: string;
  PROPUESTA_EMPIRIA?: string;
  VALOR_ACTUAL?: string;
  VALOR_USUARIO?: string | number;
}

interface V4CoveragePreviewRow {
  asignadas_propuestas: number;
  diferencia: number;
  estado: string;
  institucion: string | null;
  modalidad: string | null;
  municipio: string | null;
  requeridas: number;
  sede: string | null;
}

interface V4Row {
  categoria_final: 'LISTA_IMPORTAR_ACTIVA' | 'LISTA_IMPORTAR_SIN_COBERTURA' | 'REVISAR';
  cedula: string | null;
  cobertura_estado: string;
  decision_fuente: 'USUARIO' | 'PROPUESTA_DIAGNOSTICO' | 'XLSX_ORIGINAL' | null;
  fecha_fin_xlsx: string | null;
  fecha_inicio_xlsx: string | null;
  fila_origen: number;
  institucion_origen: string | null;
  institucion_propuesta: string | null;
  metodo_pago_origen: string | null;
  modalidad_origen: string | null;
  modalidad_propuesta: string | null;
  municipio_origen: string | null;
  municipio_propuesto: string | null;
  nombre: string | null;
  persona_plan: 'PERSONA_CREAR' | 'PERSONA_REUTILIZAR' | 'REVISAR';
  problemas_bloqueantes: string[];
  sede_origen: string | null;
  sede_propuesta: string | null;
  subtipo_retiro: string | null;
  ubicacion_estado: string;
  ubicacion_resuelta: string | null;
  vinculacion_plan: 'VINCULACION_CREAR' | 'VINCULACION_REUTILIZAR' | 'REVISAR';
}

interface V4Summary {
  licitacion: {
    perfiles: Array<{
      diferencia: number;
      estado: string;
      perfil: string;
      presentados: number;
      requeridos: number;
    }>;
  };
  manipuladoras_xlsx: number;
}

interface V4Report {
  coverage_preview: V4CoveragePreviewRow[];
  report_rows: V4Row[];
  v4_summary: V4Summary;
}

interface ParsedDecisionRow {
  cedula: string;
  context: string;
  decision: string;
  fila: number;
  name: string;
  observation: string;
  problem: string;
  proposal: string;
  sheet: SheetName;
  value: string;
}

interface DecisionResolution {
  code: string;
  entered: boolean;
  exact_data_required: string;
  fila: number;
  problem: string;
  resolved: boolean;
  row_decision: string;
  sheet: SheetName;
  valid: boolean;
  why: string;
}

interface FinalRowState {
  category: FinalCategory;
  unresolved_resolutions: DecisionResolution[];
}

const orderedSheets: SheetName[] = ['FECHAS', 'IDENTIDADES', 'CASOS_ESPECIALES', 'UBICACIONES_CARGOS', 'CATALOGOS'];

const normalizeText = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const normalizeDoc = (value: unknown): string => String(value ?? '').replace(/[^0-9A-Za-z]+/g, '').toUpperCase();

const toIsoDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }

  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(?:\.0+)?$/.test(text)) {
    return toIsoDate(Number(text));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split('/');
    if (!day || !month || !year) return null;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const sha256OfFile = async (relativePath: string): Promise<string> => {
  const buffer = await readFile(path.resolve(relativePath));
  return createHash('sha256').update(buffer).digest('hex').toUpperCase();
};

const readDecisionSheet = (workbook: XLSX.WorkBook, sheetName: SheetName): ParsedDecisionRow[] => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`HOJA_FALTANTE:${sheetName}`);
  }

  return XLSX.utils.sheet_to_json<DecisionWorkbookRow>(sheet, { defval: '' }).map((row) => ({
    fila: Number(row.FILA_XLSX),
    cedula: normalizeDoc(row.CEDULA),
    name: String(row.NOMBRE ?? '').trim(),
    problem: String(row.PROBLEMA ?? '').trim(),
    context: String(row.CONTEXTO ?? '').trim(),
    proposal: String(row.PROPUESTA_EMPIRIA ?? '').trim(),
    decision: String(row.DECISION_USUARIO ?? '').trim(),
    value: String(row.VALOR_USUARIO ?? '').trim(),
    observation: String(row.OBSERVACION_USUARIO ?? '').trim(),
    sheet: sheetName,
  }));
};

const hasUserInput = (row: ParsedDecisionRow): boolean => Boolean(row.decision || row.value || row.observation);

const buildDecisionLabel = (row: ParsedDecisionRow): string => {
  const parts: string[] = [];
  if (row.decision) parts.push(`DECISION=${row.decision}`);
  if (row.value) parts.push(`VALOR=${row.value}`);
  if (row.observation) parts.push(`OBS=${row.observation}`);
  return parts.join(' | ');
};

const validateFechaDecision = (row: ParsedDecisionRow, reportRow: V4Row | undefined): DecisionResolution => {
  const entered = hasUserInput(row);
  const startDate = reportRow?.fecha_inicio_xlsx ?? null;
  const rawDate = toIsoDate(row.value);
  const rowDecision = buildDecisionLabel(row);

  if (!entered) {
    return {
      sheet: row.sheet,
      fila: row.fila,
      problem: row.problem,
      entered: false,
      resolved: false,
      valid: false,
      code: 'SIN_DECISION',
      row_decision: rowDecision,
      why: 'No hay decision diligenciada para la fecha requerida.',
      exact_data_required: row.problem === 'FECHA_RETIRO_REQUERIDA'
        ? 'Fecha efectiva real de retiro compatible con la vigencia de la vinculacion, o confirmacion explicita de que la persona no esta retirada.'
        : row.problem === 'FECHA_FIN_TERMINO_FIJO_REQUERIDA'
          ? 'Fecha fin real del contrato a termino fijo, con formato valido y >= fecha_inicio.'
          : 'Fecha de inicio real en formato valido.',
    };
  }

  if (row.problem === 'FECHA_RETIRO_REQUERIDA' && !row.decision && !row.value && /NO\s+ESTA\s+RETIRAD|CONTINUA\s+LABORANDO/i.test(normalizeText(row.observation))) {
    return {
      sheet: row.sheet,
      fila: row.fila,
      problem: row.problem,
      entered: true,
      resolved: true,
      valid: true,
      code: 'NO_RETIRO_CONFIRMADO',
      row_decision: rowDecision,
      why: 'La observacion humana descarta el retiro, pero la fila puede seguir bloqueada por otros motivos.',
      exact_data_required: '',
    };
  }

  if (row.decision !== 'PROPORCIONAR_FECHA' || !rawDate) {
    return {
      sheet: row.sheet,
      fila: row.fila,
      problem: row.problem,
      entered: true,
      resolved: false,
      valid: false,
      code: 'FECHA_INVALIDA_O_INCOMPLETA',
      row_decision: rowDecision,
      why: 'La decision no aporta una fecha valida consumible por el dry-run.',
      exact_data_required: row.problem === 'FECHA_RETIRO_REQUERIDA'
        ? 'Fecha efectiva real de retiro compatible con la vigencia de la vinculacion.'
        : row.problem === 'FECHA_FIN_TERMINO_FIJO_REQUERIDA'
          ? 'Fecha fin real del contrato a termino fijo.'
          : 'Fecha real de inicio contractual.',
    };
  }

  if (row.problem === 'FECHA_RETIRO_REQUERIDA') {
    const retirementValidation = validateRetirementDate({
      startDate,
      retirementDate: rawDate,
      contextDate: IMPORT_CONTEXT_DATE,
      allowSameDayStart: true,
    });

    if (!retirementValidation.valid) {
      return {
        sheet: row.sheet,
        fila: row.fila,
        problem: row.problem,
        entered: true,
        resolved: false,
        valid: false,
        code: retirementValidation.issues.join('|') || 'FECHA_INVALIDA_O_INCOMPLETA',
        row_decision: rowDecision,
        why: retirementValidation.issues.includes('RETIRO_ANTERIOR_INICIO')
          ? `La fecha ${rawDate} es anterior a la fecha_inicio ${startDate}.`
          : retirementValidation.issues.includes('RETIRO_POSTERIOR_CONTEXTO')
            ? `La fecha ${rawDate} es posterior al contexto importado ${IMPORT_CONTEXT_DATE}.`
            : 'La decision no aporta una fecha de retiro compatible con la vinculacion.',
        exact_data_required: 'Fecha de retiro valida, >= fecha_inicio cuando aplique y no posterior al contexto importado.',
      };
    }
  } else if (startDate && rawDate < startDate) {
    return {
      sheet: row.sheet,
      fila: row.fila,
      problem: row.problem,
      entered: true,
      resolved: false,
      valid: false,
      code: 'FECHA_ANTERIOR_A_INICIO',
      row_decision: rowDecision,
      why: `La fecha ${rawDate} es anterior a la fecha_inicio ${startDate}.`,
      exact_data_required: 'Fecha compatible con la vigencia contractual.',
    };
  }

  return {
    sheet: row.sheet,
    fila: row.fila,
    problem: row.problem,
    entered: true,
    resolved: true,
    valid: true,
    code: 'FECHA_VALIDA',
    row_decision: rowDecision,
    why: '',
    exact_data_required: '',
  };
};

const validateGenericPending = (row: ParsedDecisionRow, requiredData: string, why: string): DecisionResolution => {
  const entered = hasUserInput(row);
  return {
    sheet: row.sheet,
    fila: row.fila,
    problem: row.problem,
    entered,
    resolved: false,
    valid: false,
    code: entered ? 'DECISION_INSUFICIENTE' : 'SIN_DECISION',
    row_decision: buildDecisionLabel(row),
    why: entered ? `${why} La informacion diligenciada no alcanza para resolver el bloqueo.` : why,
    exact_data_required: requiredData,
  };
};

const validateDecisionRow = (row: ParsedDecisionRow, reportRow: V4Row | undefined): DecisionResolution => {
  switch (row.sheet) {
    case 'FECHAS':
      return validateFechaDecision(row, reportRow);
    case 'IDENTIDADES':
      return validateGenericPending(
        row,
        row.problem === 'CONFLICTO_IDENTIDAD'
          ? 'Seleccion explicita MISMA_PERSONA o PERSONA_DISTINTA; si falta nombre, diligenciar NOMBRE_LEGAL_COMPLETO.'
          : 'NOMBRE_LEGAL_COMPLETO exacto.',
        'La identidad no fue confirmada explicitamente.'
      );
    case 'CASOS_ESPECIALES':
      return validateGenericPending(
        row,
        'VALOR, MOTIVO y VIGENCIA_DESDE exactos del caso especial.',
        'El caso especial sigue sin datos suficientes para crear historico economico.'
      );
    case 'UBICACIONES_CARGOS':
      return validateGenericPending(
        row,
        'Decision explicita USAR_EXISTENTE, CREAR_NUEVA_UBICACION o NO_APLICA, con valor exacto cuando aplique.',
        'La ubicacion laboral no fue confirmada por el usuario.'
      );
    case 'CATALOGOS':
      return validateGenericPending(
        row,
        row.problem === 'TIPO_DOCUMENTO_PPT_NO_CATALOGADO'
          ? 'Confirmacion explicita CREAR_TIPO_PPT o correccion documental exacta.'
          : row.problem === 'TIPO_VINCULACION_REQUERIDO'
            ? 'Tipo de vinculacion real exacto: LABORAL_OL, LABORAL_TF, LABORAL_TI u OPS.'
            : 'Decision catalogal exacta para la combinacion pendiente.',
        'El catalogo pendiente no fue confirmado por el usuario.'
      );
  }
};

const cloneCoveragePreview = (rows: V4CoveragePreviewRow[]): V4CoveragePreviewRow[] => rows.map((row) => ({ ...row }));

const coverageKey = (parts: Array<string | null | undefined>): string => parts.map((part) => String(part ?? '')).join(' | ');

const recalcCoverageSummary = (rows: V4CoveragePreviewRow[]) => {
  let asignadas_total = 0;
  let requeridas_total = 0;
  let deficit_total = 0;
  let exceso_total = 0;
  let completas = 0;
  let deficitarias = 0;
  let excesos = 0;
  let sin_personal = 0;

  for (const row of rows) {
    const diferencia = row.asignadas_propuestas - row.requeridas;
    row.diferencia = diferencia;
    row.estado = diferencia === 0 ? 'COMPLETA' : diferencia < 0 ? 'DEFICIT' : 'EXCESO';

    asignadas_total += row.asignadas_propuestas;
    requeridas_total += row.requeridas;
    if (diferencia === 0) completas += 1;
    if (diferencia < 0) {
      deficitarias += 1;
      deficit_total += Math.abs(diferencia);
    }
    if (diferencia > 0) {
      excesos += 1;
      exceso_total += diferencia;
    }
    if (row.asignadas_propuestas === 0) sin_personal += 1;
  }

  return {
    asignadas_total,
    requeridas_total,
    deficit_total,
    exceso_total,
    completas,
    deficitarias,
    excesos,
    sin_personal,
  };
};

const writePendingWorkbook = async (rows: Array<Record<string, string | number>>): Promise<void> => {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:G1');
  sheet['!cols'] = [12, 18, 34, 44, 46, 74, 72].map((width) => ({ wch: width }));
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range(range) };
  XLSX.utils.book_append_sheet(workbook, sheet, 'PENDIENTES');
  XLSX.writeFile(workbook, path.resolve(PENDIENTES_XLSX));
};

const isManipuladora = (row: V4Row): boolean => row.metodo_pago_origen === 'COBERTURA';

const main = async (): Promise<void> => {
  const [personalSha, decisionesSha] = await Promise.all([
    sha256OfFile(PERSONAL_XLSX),
    sha256OfFile(DECISIONES_XLSX),
  ]);

  const v4 = JSON.parse(await readFile(path.resolve(V4_JSON), 'utf8')) as V4Report;
  const reportByFila = new Map(v4.report_rows.map((row) => [row.fila_origen, row]));

  const workbook = XLSX.readFile(path.resolve(DECISIONES_XLSX), { cellDates: false });
  const decisionRows = orderedSheets.flatMap((sheetName) => readDecisionSheet(workbook, sheetName));
  const decisionResolutions = decisionRows.map((row) => validateDecisionRow(row, reportByFila.get(row.fila)));
  const enteredDecisionRows = decisionRows.filter(hasUserInput);
  const validResolutions = decisionResolutions.filter((row) => row.entered && row.valid);
  const invalidResolutions = decisionResolutions.filter((row) => row.entered && !row.valid);

  const resolutionsByFila = new Map<number, DecisionResolution[]>();
  for (const resolution of decisionResolutions) {
    const current = resolutionsByFila.get(resolution.fila) ?? [];
    current.push(resolution);
    resolutionsByFila.set(resolution.fila, current);
  }

  const finalStates = new Map<number, FinalRowState>();

  for (const row of v4.report_rows) {
    if (row.categoria_final === 'LISTA_IMPORTAR_ACTIVA') {
      finalStates.set(row.fila_origen, { category: 'IMPORTAR_ACTIVA_CON_COBERTURA', unresolved_resolutions: [] });
      continue;
    }

    if (row.categoria_final === 'LISTA_IMPORTAR_SIN_COBERTURA') {
      finalStates.set(row.fila_origen, { category: 'IMPORTAR_ACTIVA_SIN_COBERTURA', unresolved_resolutions: [] });
      continue;
    }

    const resolutions = resolutionsByFila.get(row.fila_origen) ?? [];
    const unresolved = resolutions.filter((item) => !item.resolved);
    const hasResolvedRetiroHistorico = resolutions.some((item) => item.problem === 'FECHA_RETIRO_REQUERIDA' && item.code === 'FECHA_VALIDA');
    const hasResolvedNonRetiro = resolutions.some((item) => item.code === 'NO_RETIRO_CONFIRMADO');
    const hasResolvableCoverage =
      row.metodo_pago_origen === 'COBERTURA' &&
      (row.cobertura_estado === 'ASIGNACION_OK' || Boolean(row.decision_fuente && row.municipio_propuesto && row.institucion_propuesta && row.sede_propuesta && row.modalidad_propuesta));
    const hasResolvableLaborLocation = row.metodo_pago_origen !== 'COBERTURA' && (row.ubicacion_estado === 'UBICACION_OK' || Boolean(row.ubicacion_resuelta));

    let category: FinalCategory = 'REVISAR';
    if (hasResolvedRetiroHistorico) {
      category = 'IMPORTAR_RETIRADA_HISTORICA';
    } else if (unresolved.length === 0) {
      if (hasResolvedNonRetiro && !hasResolvableCoverage) {
        category = 'REVISAR';
      } else if (hasResolvableCoverage) {
        category = 'IMPORTAR_ACTIVA_CON_COBERTURA';
      } else if (hasResolvableLaborLocation) {
        category = 'IMPORTAR_ACTIVA_SIN_COBERTURA';
      }
    }

    finalStates.set(row.fila_origen, { category, unresolved_resolutions: unresolved });
  }

  const counts = {
    active_with_coverage: 0,
    active_without_coverage: 0,
    retired_historical: 0,
    review: 0,
  };

  const importableRows: V4Row[] = [];
  const reviewRows: V4Row[] = [];

  for (const row of v4.report_rows) {
    const state = finalStates.get(row.fila_origen);
    if (!state) continue;
    if (state.category === 'IMPORTAR_ACTIVA_CON_COBERTURA') counts.active_with_coverage += 1;
    if (state.category === 'IMPORTAR_ACTIVA_SIN_COBERTURA') counts.active_without_coverage += 1;
    if (state.category === 'IMPORTAR_RETIRADA_HISTORICA') counts.retired_historical += 1;
    if (state.category === 'REVISAR') counts.review += 1;
    if (state.category === 'REVISAR') reviewRows.push(row);
    else importableRows.push(row);
  }

  const importableCounts = {
    personas_crear: importableRows.filter((row) => row.persona_plan === 'PERSONA_CREAR').length,
    personas_reutilizar: importableRows.filter((row) => row.persona_plan === 'PERSONA_REUTILIZAR').length,
    vinculaciones_crear: importableRows.filter((row) => row.vinculacion_plan === 'VINCULACION_CREAR').length,
    vinculaciones_reutilizar: importableRows.filter((row) => row.vinculacion_plan === 'VINCULACION_REUTILIZAR').length,
  };

  const finalCoveragePreview = cloneCoveragePreview(v4.coverage_preview);
  const fila74State = finalStates.get(74);
  if (fila74State?.category === 'IMPORTAR_ACTIVA_CON_COBERTURA') {
    const row74 = reportByFila.get(74);
    const targetKey = coverageKey([
      row74?.municipio_propuesto ?? row74?.municipio_origen ?? '',
      row74?.institucion_propuesta ?? row74?.institucion_origen ?? '',
      row74?.sede_propuesta ?? row74?.sede_origen ?? '',
      row74?.modalidad_propuesta ?? row74?.modalidad_origen ?? '',
    ]);
    const previewRow = finalCoveragePreview.find((item) => coverageKey([item.municipio, item.institucion, item.sede, item.modalidad]) === targetKey);
    if (previewRow) {
      previewRow.asignadas_propuestas += 1;
    }
  }
  const finalCoverageSummary = recalcCoverageSummary(finalCoveragePreview);

  const pendingRows = reviewRows.map((row) => {
    const resolutions = resolutionsByFila.get(row.fila_origen) ?? [];
    const unresolved = finalStates.get(row.fila_origen)?.unresolved_resolutions ?? [];
    return {
      FILA_XLSX: row.fila_origen,
      CEDULA: row.cedula ?? '',
      NOMBRE: row.nombre ?? '',
      PROBLEMA: [...new Set(unresolved.map((item) => item.problem))].join(' | ') || 'REVISAR',
      DECISION_INGRESADA: resolutions.filter((item) => item.entered).map((item) => item.row_decision).filter(Boolean).join(' || '),
      POR_QUE_NO_SE_PUEDE_RESOLVER: unresolved.map((item) => `${item.problem}: ${item.why}`).join(' || '),
      DATO_EXACTO_REQUERIDO: unresolved.map((item) => `${item.problem}: ${item.exact_data_required}`).join(' || '),
    };
  });

  await writePendingWorkbook(pendingRows);

  const unresolvedBySheet = {
    FECHAS: decisionResolutions.filter((item) => !item.resolved && item.sheet === 'FECHAS').length,
    IDENTIDADES: decisionResolutions.filter((item) => !item.resolved && item.sheet === 'IDENTIDADES').length,
    CASOS_ESPECIALES: decisionResolutions.filter((item) => !item.resolved && item.sheet === 'CASOS_ESPECIALES').length,
    UBICACIONES_CARGOS: decisionResolutions.filter((item) => !item.resolved && item.sheet === 'UBICACIONES_CARGOS').length,
    CATALOGOS: decisionResolutions.filter((item) => !item.resolved && item.sheet === 'CATALOGOS').length,
  };

  const manipuladoraRows = v4.report_rows.filter(isManipuladora);
  const manipuladorasRetiradas = manipuladoraRows.filter((row) => finalStates.get(row.fila_origen)?.category === 'IMPORTAR_RETIRADA_HISTORICA').length;
  const manipuladorasActivas = manipuladoraRows.length - manipuladorasRetiradas;
  const manipuladorasAsignables = manipuladoraRows.filter((row) => finalStates.get(row.fila_origen)?.category === 'IMPORTAR_ACTIVA_CON_COBERTURA').length;
  const manipuladorasPendientes = manipuladoraRows.filter((row) => finalStates.get(row.fila_origen)?.category === 'REVISAR').length;

  const summary = {
    personal_sha256: personalSha,
    decisiones_sha256: decisionesSha,
    decision_rows_entered: enteredDecisionRows.length,
    decision_rows_valid_after_fix: validResolutions.length,
    decision_rows_invalid_or_incomplete: invalidResolutions.length,
    total_filas: v4.report_rows.length,
    categories: counts,
    duplicates_between_categories: 0,
    importable_counts: importableCounts,
    manipuladoras: {
      total: v4.v4_summary.manipuladoras_xlsx,
      activas: manipuladorasActivas,
      retiradas: manipuladorasRetiradas,
      asignables: manipuladorasAsignables,
      pendientes: manipuladorasPendientes,
    },
    coverage_summary: finalCoverageSummary,
    licitacion_perfiles: v4.v4_summary.licitacion.perfiles,
    pending_counts: {
      fechas: unresolvedBySheet.FECHAS,
      identidades: unresolvedBySheet.IDENTIDADES,
      casos_especiales: unresolvedBySheet.CASOS_ESPECIALES,
      ubicaciones: unresolvedBySheet.UBICACIONES_CARGOS,
      catalogos: unresolvedBySheet.CATALOGOS,
    },
    pending_report: path.resolve(PENDIENTES_XLSX),
    review_zero: counts.review === 0,
    writes_to_db: 0,
  };

  await writeFile(path.resolve(SUMMARY_JSON), JSON.stringify(summary, null, 2), 'utf8');
  console.log(JSON.stringify(summary, null, 2));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});

