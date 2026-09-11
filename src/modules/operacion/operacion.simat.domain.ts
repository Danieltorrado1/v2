import * as XLSX from 'xlsx';

export const SIMAT_HEADERS = ['ANO','ETC','ESTADO','JERARQUIA','INSTITUCION','DANE','SEDE','CODIGO_DANE_SEDE','CONSECUTIVO','ZONA_SEDE','JORNADA','GRADO_COD','GRUPO','RENOMBRE','MODELO','FECHAINI','ESTRATO','SISBEN IV','PER_ID','DOC','TIPODOC','APELLIDO1','APELLIDO2','NOMBRE1','NOMBRE2','GENERO','FECHA_NACIMIENTO','BARRIO','EPS','TIPO DE SANGRE','MATRICULACONTRATADA','FUENTE_RECURSOS','INTERNADO','NUM_CONTRATO','HA_ESTADO_VINCULADO_SRPA','ESTA_ACTIVO_SRPA','DISCAPACIDAD','PAIS_ORIGEN','CORREO','TELEFONO','ETNIA','TRA_ESP_APR_ESCOLAR','APOYO_ACADEMICO_ESPECIAL','LIST_CAP_EXCEPCIONALES','CAMPESINO','PAIS_NACIMIENTO','PAIS_NACIONALIDAD2','CATEGORIA_AULA','GRUPO ETARIO','FOCALIZACION','COMPLEMENTO'] as const;
const key = (v: unknown) => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
export const sourceKey = key;
export type SimatRow = Record<string, unknown> & { source_row: number; source_data: Record<string, unknown> };

export function parseSimatWorkbook(buffer: Buffer): { headers: string[]; rows: SimatRow[]; errors: string[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true, raw: false });
  const sheetName = workbook.SheetNames[0];
  const sheet = sheetName ? workbook.Sheets[sheetName] : undefined;
  if (!sheet) throw new Error('El archivo no contiene hojas.');
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, raw: false });
  const rawHeaders = (matrix[0] ?? []).map((v) => String(v ?? '').trim()).filter(Boolean);
  const expected = new Set(SIMAT_HEADERS.map(key));
  const missing = SIMAT_HEADERS.filter((h) => !rawHeaders.some((actual) => key(actual) === key(h)));
  if (missing.length) throw new Error(`Faltan columnas SIMAT: ${missing.join(', ')}`);
  const headers = rawHeaders;
  const rows = matrix.slice(1).map((cells, index) => {
    const source_data = Object.fromEntries(headers.map((header, col) => [header, cells[col] ?? null]));
    const row: SimatRow = { source_row: index + 2, source_data };
    headers.forEach((header, col) => { row[key(header)] = cells[col] ?? null; });
    return row;
  }).filter((row) => Object.values(row.source_data).some((v) => String(v ?? '').trim() !== ''));
  const errors: string[] = [];
  rows.forEach((row) => { if (!String(row.DOC ?? row.PERID ?? '').trim() && !String(row.PERID ?? '').trim()) errors.push(`Fila ${row.source_row}: requiere DOC o PER_ID.`); });
  return { headers, rows, errors };
}

export function deduplicationKey(row: SimatRow): string {
  const year = String(row.ANO ?? '').trim();
  const perId = String(row.PERID ?? '').trim();
  const doc = String(row.DOC ?? '').trim();
  if (perId) return `PER_ID|${perId}|${year}`;
  if (doc) return `DOC|${doc}|${year}`;
  return `SOURCE_ROW|${row.source_row}`;
}

export function summarizeRows(rows: SimatRow[]) {
  const unique = new Set(rows.map(deduplicationKey));
  return { total: rows.length, validas: rows.length, errores: 0, duplicadas: rows.length - unique.size, instituciones: new Set(rows.map((r) => String(r.INSTITUCION ?? '').trim()).filter(Boolean)).size, sedes: new Set(rows.map((r) => String(r.CODIGODANESEDE ?? r.SEDE ?? '').trim()).filter(Boolean)).size };
}
