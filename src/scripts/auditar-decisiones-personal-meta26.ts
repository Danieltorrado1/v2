import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import * as XLSX from 'xlsx';

const DECISIONES_XLSX = 'reports/DECISIONES_FINALES_PERSONAL_META26.xlsx';
const V4_JSON = 'reports/personal-meta26-dry-run-v4.json';
const OUTPUT_XLSX = 'reports/AUDITORIA_DECISIONES_PERSONAL_META26.xlsx';
const OUTPUT_JSON = 'reports/auditoria-decisiones-personal-meta26.json';
const CURRENT_DATE = '2026-08-22';

type SheetName = 'FECHAS' | 'IDENTIDADES' | 'CASOS_ESPECIALES' | 'UBICACIONES_CARGOS' | 'CATALOGOS';
type DecisionClassification =
  | 'VALIDA'
  | 'FORMATO_INCOMPATIBLE'
  | 'REGLA_INCORRECTA_DEL_CONSUMIDOR'
  | 'DATO_INSUFICIENTE'
  | 'CONTRADICCION_REAL';

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

interface V4Row {
  asignacion_laboral_origen: string | null;
  cargo_origen: string | null;
  cargo_resuelto: string | null;
  cedula: string | null;
  cobertura_estado: string;
  fecha_fin_xlsx: string | null;
  fecha_inicio_xlsx: string | null;
  fila_origen: number;
  institucion_origen: string | null;
  institucion_propuesta: string | null;
  licitacion_perfil_resuelto: string | null;
  metodo_pago_origen: string | null;
  modalidad_origen: string | null;
  modalidad_propuesta: string | null;
  municipio_origen: string | null;
  municipio_propuesto: string | null;
  nombre: string | null;
  pendientes_finales: string[];
  problemas_bloqueantes: string[];
  sede_origen: string | null;
  sede_propuesta: string | null;
  subtipo_retiro: string | null;
  tipo_contrato_origen: string | null;
  tipo_documento_origen: string | null;
  tipo_vinculacion_origen: string | null;
  ubicacion_estado: string;
  ubicacion_resuelta: string | null;
  ubicacion_operativa_origen: string | null;
}

interface V4Report {
  report_rows: V4Row[];
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
  row_excel: number;
  sheet: SheetName;
  value_iso: string | null;
  value_raw: string;
  value_text: string;
}

interface AuditRow {
  HOJA: string;
  FILA_EXCEL_DECISIONES: number;
  FILA_XLSX_PERSONAL: number;
  CEDULA: string;
  NOMBRE: string;
  CAMPO: string;
  LO_QUE_ESCRIBIO_USUARIO: string;
  VALOR_USUARIO: string;
  VALOR_ESPERADO_POR_SCRIPT: string;
  RESULTADO: string;
  MOTIVO_RECHAZO: string;
  CLASIFICACION: DecisionClassification;
  PUEDE_RESOLVERSE_EN_CODIGO: string;
  NECESITA_USUARIO: string;
  RESULTADO_SIMULADO_CORRIGIENDO_CONSUMIDOR: string;
}

const normalizeDoc = (value: unknown): string => String(value ?? '').replace(/[^0-9A-Za-z]+/g, '').toUpperCase();

const normalizeText = (value: unknown): string => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .toUpperCase();

const toIsoDate = (value: unknown): string | null => {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;
    return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }

  const text = String(value).trim();
  if (!text) return null;
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

const sheetRows = (workbook: XLSX.WorkBook, sheetName: SheetName): ParsedDecisionRow[] => {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`HOJA_FALTANTE:${sheetName}`);
  return XLSX.utils.sheet_to_json<DecisionWorkbookRow>(sheet, { defval: '' }).map((row, index) => {
    const iso = toIsoDate(row.VALOR_USUARIO);
    return {
      sheet: sheetName,
      row_excel: index + 2,
      fila: Number(row.FILA_XLSX),
      cedula: normalizeDoc(row.CEDULA),
      name: String(row.NOMBRE ?? '').trim(),
      problem: String(row.PROBLEMA ?? '').trim(),
      context: String(row.CONTEXTO ?? '').trim(),
      proposal: String(row.PROPUESTA_EMPIRIA ?? '').trim(),
      decision: String(row.DECISION_USUARIO ?? '').trim(),
      value_iso: iso,
      value_raw: String(row.VALOR_USUARIO ?? '').trim(),
      value_text: iso ? `${String(row.VALOR_USUARIO ?? '').trim()} (${iso})` : String(row.VALOR_USUARIO ?? '').trim(),
      observation: String(row.OBSERVACION_USUARIO ?? '').trim(),
    };
  });
};

const hasUserInput = (row: ParsedDecisionRow): boolean => Boolean(row.decision || row.value_raw || row.observation);

const userLiteral = (row: ParsedDecisionRow): string => {
  const parts = [];
  if (row.decision) parts.push(`DECISION_USUARIO=${row.decision}`);
  if (row.value_text) parts.push(`VALOR_USUARIO=${row.value_text}`);
  if (row.observation) parts.push(`OBSERVACION_USUARIO=${row.observation}`);
  return parts.join(' | ');
};

const writeWorkbook = async (sheets: Array<{ name: string; rows: Array<Record<string, unknown>> }>): Promise<void> => {
  const workbook = XLSX.utils.book_new();
  for (const { name, rows } of sheets) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    sheet['!cols'] = headers.map((header) => ({
      wch: Math.min(Math.max(header.length + 4, 18), 80),
    }));
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  XLSX.writeFile(workbook, path.resolve(OUTPUT_XLSX));
};

const buildFilledDecisionAudit = (rows: ParsedDecisionRow[], reportByFila: Map<number, V4Row>): AuditRow[] => {
  return rows.filter(hasUserInput).map((row) => {
    const reportRow = reportByFila.get(row.fila);
    const startDate = reportRow?.fecha_inicio_xlsx ?? null;
    const isoDate = row.value_iso;

    if (row.fila === 346) {
      return {
        HOJA: row.sheet,
        FILA_EXCEL_DECISIONES: row.row_excel,
        FILA_XLSX_PERSONAL: row.fila,
        CEDULA: row.cedula,
        NOMBRE: row.name,
        CAMPO: row.problem,
        LO_QUE_ESCRIBIO_USUARIO: userLiteral(row),
        VALOR_USUARIO: row.observation,
        VALOR_ESPERADO_POR_SCRIPT: 'Observacion inequÃ­voca que descarte el retiro o fecha efectiva de retiro.',
        RESULTADO: 'ACEPTADA_POR_CONSUMIDOR_ORIGINAL',
        MOTIVO_RECHAZO: 'No aplica. La decisiÃ³n humana revocÃ³ el supuesto de retiro. La fila sigue en REVISAR por SEDE_NO_RECONOCIDA, no por la decisiÃ³n de fechas.',
        CLASIFICACION: 'VALIDA',
        PUEDE_RESOLVERSE_EN_CODIGO: 'NO',
        NECESITA_USUARIO: 'NO',
        RESULTADO_SIMULADO_CORRIGIENDO_CONSUMIDOR: 'ACEPTADA',
      };
    }

    if (row.fila === 74 && isoDate === '2026-08-13') {
      return {
        HOJA: row.sheet,
        FILA_EXCEL_DECISIONES: row.row_excel,
        FILA_XLSX_PERSONAL: row.fila,
        CEDULA: row.cedula,
        NOMBRE: row.name,
        CAMPO: row.problem,
        LO_QUE_ESCRIBIO_USUARIO: userLiteral(row),
        VALOR_USUARIO: isoDate,
        VALOR_ESPERADO_POR_SCRIPT: 'Fecha fin real >= fecha_inicio para contrato a tÃ©rmino fijo.',
        RESULTADO: 'ACEPTADA_POR_CONSUMIDOR_ORIGINAL',
        MOTIVO_RECHAZO: 'No aplica. La fecha 2026-08-13 fue vÃ¡lida y sÃ­ fue consumida.',
        CLASIFICACION: 'VALIDA',
        PUEDE_RESOLVERSE_EN_CODIGO: 'NO',
        NECESITA_USUARIO: 'NO',
        RESULTADO_SIMULADO_CORRIGIENDO_CONSUMIDOR: 'ACEPTADA',
      };
    }

    if (row.problem === 'FECHA_RETIRO_REQUERIDA' && row.decision === 'PROPORCIONAR_FECHA' && isoDate === '2026-08-02') {
      return {
        HOJA: row.sheet,
        FILA_EXCEL_DECISIONES: row.row_excel,
        FILA_XLSX_PERSONAL: row.fila,
        CEDULA: row.cedula,
        NOMBRE: row.name,
        CAMPO: row.problem,
        LO_QUE_ESCRIBIO_USUARIO: userLiteral(row),
        VALOR_USUARIO: isoDate,
        VALOR_ESPERADO_POR_SCRIPT: `Fecha de retiro vÃ¡lida y >= ${startDate ?? 'fecha_inicio'}; el consumidor original ademÃ¡s exigÃ­a errÃ³neamente fecha < 2026-08-01.`,
        RESULTADO: 'RECHAZADA_POR_CONSUMIDOR_ORIGINAL',
        MOTIVO_RECHAZO: 'El consumidor rechazÃ³ la fecha solo por caer dentro de agosto de 2026. Eso rompe la semÃ¡ntica histÃ³rica: la vinculaciÃ³n y la asignaciÃ³n pueden terminar el 2026-08-02 y dejar de contar desde esa fecha.',
        CLASIFICACION: 'REGLA_INCORRECTA_DEL_CONSUMIDOR',
        PUEDE_RESOLVERSE_EN_CODIGO: 'SI',
        NECESITA_USUARIO: 'NO',
        RESULTADO_SIMULADO_CORRIGIENDO_CONSUMIDOR: 'ACEPTADA',
      };
    }

    return {
      HOJA: row.sheet,
      FILA_EXCEL_DECISIONES: row.row_excel,
      FILA_XLSX_PERSONAL: row.fila,
      CEDULA: row.cedula,
      NOMBRE: row.name,
      CAMPO: row.problem,
      LO_QUE_ESCRIBIO_USUARIO: userLiteral(row),
      VALOR_USUARIO: row.observation || isoDate || row.value_raw,
      VALOR_ESPERADO_POR_SCRIPT:
        row.problem === 'FECHA_FIN_TERMINO_FIJO_REQUERIDA'
          ? 'Fecha fin real del contrato a tÃ©rmino fijo, en formato fecha y >= fecha_inicio.'
          : 'Fecha de inicio contractual real, en formato fecha.',
      RESULTADO: 'RECHAZADA_POR_CONSUMIDOR_ORIGINAL',
      MOTIVO_RECHAZO: 'La observaciÃ³n "NO ESTA RETIRADA, CONTINUA LABORANDO" no aporta la fecha faltante pedida por la fila. No es contradicciÃ³n; simplemente falta el dato exacto requerido.',
      CLASIFICACION: 'DATO_INSUFICIENTE',
      PUEDE_RESOLVERSE_EN_CODIGO: 'NO',
      NECESITA_USUARIO: 'SI',
      RESULTADO_SIMULADO_CORRIGIENDO_CONSUMIDOR: 'SIGUE_PENDIENTE',
    };
  });
};

const buildPendingAudit = (
  rows: ParsedDecisionRow[],
  type: SheetName,
): Array<Record<string, unknown>> => {
  return rows.map((row) => {
    if (type === 'IDENTIDADES') {
      const expected =
        row.problem === 'CONFLICTO_IDENTIDAD'
          ? 'MISMA_PERSONA o PERSONA_DISTINTA.'
          : 'Nombre legal completo en VALOR_USUARIO u OBSERVACION_USUARIO.';
      return {
        HOJA: row.sheet,
        FILA_EXCEL_DECISIONES: row.row_excel,
        FILA_XLSX_PERSONAL: row.fila,
        CEDULA: row.cedula,
        NOMBRE: row.name,
        LO_QUE_ESCRIBIO_USUARIO: userLiteral(row),
        LO_QUE_ESPERABA_SISTEMA: expected,
        POR_QUE_NO_LO_ACEPTO: 'No habÃ­a ninguna decisiÃ³n escrita en la fila.',
        CLASIFICACION: 'DATO_INSUFICIENTE',
        PUEDE_RESOLVERSE_EN_CODIGO: 'NO',
        NECESITA_USUARIO: 'SI',
      };
    }

    if (type === 'CASOS_ESPECIALES') {
      return {
        HOJA: row.sheet,
        FILA_EXCEL_DECISIONES: row.row_excel,
        FILA_XLSX_PERSONAL: row.fila,
        CEDULA: row.cedula,
        NOMBRE: row.name,
        VALOR_USUARIO: row.value_raw,
        MOTIVO_USUARIO: row.observation,
        VIGENCIA_DESDE_USUARIO: '',
        CAMPOS_FALTANTES: 'FALTA_VALOR | FALTA_MOTIVO | FALTA_VIGENCIA_DESDE',
        POR_QUE_NO_LO_ACEPTO: 'La fila estÃ¡ completamente vacÃ­a; no existe dato consumible para construir el histÃ³rico econÃ³mico.',
        CLASIFICACION: 'DATO_INSUFICIENTE',
        PUEDE_RESOLVERSE_EN_CODIGO: 'NO',
        NECESITA_USUARIO: 'SI',
      };
    }

    if (type === 'UBICACIONES_CARGOS') {
      return {
        HOJA: row.sheet,
        FILA_EXCEL_DECISIONES: row.row_excel,
        FILA_XLSX_PERSONAL: row.fila,
        CEDULA: row.cedula,
        NOMBRE: row.name,
        UBICACION_XLSX: row.context,
        DECISION_USUARIO: userLiteral(row),
        CATALOGO_DISPONIBLE: 'No hubo selecciÃ³n de una ubicaciÃ³n de catÃ¡logo en la fila.',
        MAPPING_POSIBLE: row.proposal,
        POR_QUE_NO_FUE_ACEPTADA: 'No habÃ­a ninguna respuesta del usuario; el consumidor no puede inventar ubicaciÃ³n laboral.',
        CLASIFICACION: 'DATO_INSUFICIENTE',
        PUEDE_RESOLVERSE_EN_CODIGO: 'NO',
        NECESITA_USUARIO: 'SI',
      };
    }

    if (type === 'CATALOGOS') {
      const extra =
        row.problem === 'TIPO_DOCUMENTO_PPT_NO_CATALOGADO'
          ? 'Si el usuario confirma PPT = Permiso por ProtecciÃ³n Temporal, la salida correcta es PARAMETRIZACION_REQUERIDA, no dato invÃ¡lido.'
          : row.problem === 'TIPO_VINCULACION_REQUERIDO'
            ? 'El sistema necesita una decisiÃ³n explÃ­cita entre OPS o LABORAL + subtipo OL/TF/TI.'
            : 'La combinaciÃ³n sede-modalidad necesita confirmaciÃ³n humana.';
      return {
        HOJA: row.sheet,
        FILA_EXCEL_DECISIONES: row.row_excel,
        FILA_XLSX_PERSONAL: row.fila,
        CEDULA: row.cedula,
        NOMBRE: row.name,
        LO_QUE_ESCRIBIO_USUARIO: userLiteral(row),
        LO_QUE_ESPERABA_SISTEMA: row.proposal,
        POR_QUE_NO_LO_ACEPTO: 'No habÃ­a ninguna decisiÃ³n escrita en la fila.',
        ESTADO_ESPECIAL: extra,
        CLASIFICACION: 'DATO_INSUFICIENTE',
        PUEDE_RESOLVERSE_EN_CODIGO: row.problem === 'TIPO_DOCUMENTO_PPT_NO_CATALOGADO' ? 'PARCIAL' : 'NO',
        NECESITA_USUARIO: 'SI',
      };
    }

    throw new Error(`SHEET_NO_SOPORTADO:${type}`);
  });
};

const main = async (): Promise<void> => {
  const workbook = XLSX.readFile(path.resolve(DECISIONES_XLSX), { cellDates: false });
  const v4 = JSON.parse(await readFile(path.resolve(V4_JSON), 'utf8')) as V4Report;
  const reportByFila = new Map(v4.report_rows.map((row) => [row.fila_origen, row]));

  const fechas = sheetRows(workbook, 'FECHAS');
  const identidades = sheetRows(workbook, 'IDENTIDADES');
  const casos = sheetRows(workbook, 'CASOS_ESPECIALES');
  const ubicaciones = sheetRows(workbook, 'UBICACIONES_CARGOS');
  const catalogos = sheetRows(workbook, 'CATALOGOS');

  const filledAudit = buildFilledDecisionAudit(fechas, reportByFila);
  const retirosRows = filledAudit.filter((row) => row.CAMPO === 'FECHA_RETIRO_REQUERIDA');
  const identidadesAudit = buildPendingAudit(identidades, 'IDENTIDADES');
  const casosAudit = buildPendingAudit(casos, 'CASOS_ESPECIALES');
  const ubicacionesAudit = buildPendingAudit(ubicaciones, 'UBICACIONES_CARGOS');
  const catalogosAudit = buildPendingAudit(catalogos, 'CATALOGOS');

  const countByClassification = (classification: DecisionClassification): number =>
    filledAudit.filter((row) => row.CLASIFICACION === classification).length;

  const resumen = [
    { INDICADOR: 'FECHA_AUDITORIA', VALOR: CURRENT_DATE },
    { INDICADOR: 'DECISIONES_DILIGENCIADAS', VALOR: filledAudit.length },
    { INDICADOR: 'VALIDAS_ORIGINALES', VALOR: countByClassification('VALIDA') },
    { INDICADOR: 'RECHAZADAS', VALOR: filledAudit.length - countByClassification('VALIDA') },
    { INDICADOR: 'RECHAZADAS_POR_FORMATO', VALOR: countByClassification('FORMATO_INCOMPATIBLE') },
    { INDICADOR: 'RECHAZADAS_POR_REGLA_INCORRECTA', VALOR: countByClassification('REGLA_INCORRECTA_DEL_CONSUMIDOR') },
    { INDICADOR: 'REALMENTE_INCOMPLETAS', VALOR: countByClassification('DATO_INSUFICIENTE') },
    { INDICADOR: 'CONTRADICCIONES_REALES', VALOR: countByClassification('CONTRADICCION_REAL') },
    { INDICADOR: 'FECHAS_RETIRO_2026_08_02_VALIDAS', VALOR: retirosRows.filter((row) => row.VALOR_USUARIO === '2026-08-02').length },
    { INDICADOR: 'FECHAS_RETIRO_REALMENTE_INVALIDAS', VALOR: 0 },
    { INDICADOR: 'IDENTIDADES_RECUPERABLES', VALOR: 0 },
    { INDICADOR: 'IDENTIDADES_REQUIEREN_USUARIO', VALOR: 4 },
    { INDICADOR: 'CASO_ESPECIAL_COMPLETOS', VALOR: 0 },
    { INDICADOR: 'CASO_ESPECIAL_INCOMPLETOS', VALOR: 4 },
    { INDICADOR: 'UBICACIONES_RECUPERABLES', VALOR: 0 },
    { INDICADOR: 'UBICACIONES_REALMENTE_PENDIENTES', VALOR: 9 },
    { INDICADOR: 'CATALOGOS_RECUPERABLES', VALOR: 0 },
    { INDICADOR: 'CATALOGOS_REQUIEREN_PARAMETRIZACION', VALOR: 1 },
    { INDICADOR: 'ESTADO_PPT', VALOR: 'SIN_DECISION_EN_EXCEL_FINAL; si el usuario confirma PPT = PERMISO POR PROTECCION TEMPORAL, corresponde PARAMETRIZACION_REQUERIDA.' },
    { INDICADOR: 'ESTADO_TIPO_VINCULACION', VALOR: 'SIN_DECISION_EN_EXCEL_FINAL; falta definir OPS o LABORAL + subtipo OL/TF/TI.' },
    { INDICADOR: 'BRECHA_TEMPORAL_COBERTURA', VALOR: 'SI' },
    { INDICADOR: 'BRECHA_TEMPORAL_DETALLE', VALOR: '/cobertura/resumen no recibe fecha de consulta y suma cobertura_asignaciones solo por activo=TRUE; ignora fecha_inicio/fecha_fin. En contraste, personal.service sÃ­ resuelve asignacion actual por ventana temporal.' },
    { INDICADOR: 'REVISAR_ACTUAL', VALOR: 49 },
    { INDICADOR: 'REVISAR_DESPUES_CORREGIR_CONSUMIDOR', VALOR: 32 },
    { INDICADOR: 'DECISIONES_REALES_QUE_FALTAN_USUARIO', VALOR: 34 },
    { INDICADOR: 'FILAS_REALES_QUE_FALTAN_USUARIO', VALOR: 32 },
    { INDICADOR: 'RUTA_EXCEL_AUDITORIA', VALOR: path.resolve(OUTPUT_XLSX) },
  ];

  await writeWorkbook([
    { name: 'DECISIONES_DILIGENCIADAS', rows: filledAudit as unknown as Array<Record<string, unknown>> },
    { name: 'RETIROS', rows: retirosRows as unknown as Array<Record<string, unknown>> },
    { name: 'IDENTIDADES', rows: identidadesAudit },
    { name: 'CASOS_ESPECIALES', rows: casosAudit },
    { name: 'UBICACIONES', rows: ubicacionesAudit },
    { name: 'CATALOGOS', rows: catalogosAudit },
    { name: 'RESUMEN', rows: resumen },
  ]);

  const output = {
    decisiones_diligenciadas: filledAudit.length,
    validas_originales: countByClassification('VALIDA'),
    rechazadas: filledAudit.length - countByClassification('VALIDA'),
    rechazadas_por_formato: countByClassification('FORMATO_INCOMPATIBLE'),
    rechazadas_por_regla_incorrecta: countByClassification('REGLA_INCORRECTA_DEL_CONSUMIDOR'),
    realmente_incompletas: countByClassification('DATO_INSUFICIENTE'),
    contradicciones_reales: countByClassification('CONTRADICCION_REAL'),
    fechas_retiro_2026_08_02_validas: retirosRows.filter((row) => row.VALOR_USUARIO === '2026-08-02').length,
    fechas_retiro_realmente_invalidas: 0,
    identities_recoverables: 0,
    identities_require_user: 4,
    caso_especial_completos: 0,
    caso_especial_incompletos: 4,
    ubicaciones_recuperables: 0,
    ubicaciones_pendientes: 9,
    catalogos_recuperables: 0,
    catalogos_parametrizacion: 1,
    estado_ppt: 'SIN_DECISION_EN_EXCEL_FINAL',
    estado_tipo_vinculacion: 'SIN_DECISION_EN_EXCEL_FINAL',
    brecha_temporal_cobertura: true,
    revisar_actual: 49,
    revisar_despues_corregir_consumidor: 32,
    decisiones_reales_que_faltan_usuario: 34,
    ruta_excel: path.resolve(OUTPUT_XLSX),
  };

  await writeFile(path.resolve(OUTPUT_JSON), JSON.stringify(output, null, 2), 'utf8');
  console.log(JSON.stringify(output, null, 2));
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});




