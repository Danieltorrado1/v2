import * as XLSX from 'xlsx';

export type CsvCellValue = string | number | boolean | null | undefined;

export interface CsvSection {
  headers: string[];
  rows: Array<Record<string, CsvCellValue>>;
  title: string;
}

const escapeCsv = (value: CsvCellValue): string => {
  const stringValue = value === null || value === undefined ? '' : String(value);

  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
};

export const buildCsv = (
  headers: string[],
  rows: Array<Record<string, CsvCellValue>>
): string => {
  const headerLine = headers.map(escapeCsv).join(',');
  const dataLines = rows.map((row) =>
    headers.map((header) => escapeCsv(row[header])).join(',')
  );

  return [headerLine, ...dataLines].join('\n');
};

export const buildSectionedCsv = (sections: CsvSection[]): string => {
  return sections
    .map((section) => {
      return [`=== ${section.title} ===`, buildCsv(section.headers, section.rows)].join('\n');
    })
    .join('\n\n');
};

export interface XlsxSheet {
  headers: string[];
  name: string;
  rows: Array<Record<string, CsvCellValue>>;
  currencyHeaders?: string[];
  integerHeaders?: string[];
}

export interface TurnoConsolidadoInput {
  cantidad: number | null | undefined;
  documento_reemplazante: string | null | undefined;
  modalidad: string | null | undefined;
  nombre_reemplazante: string | null | undefined;
  tipo_reemplazante: string;
  valor_total: number | null | undefined;
}

export interface TurnoConsolidadoRow {
  'CÉDULA REEMPLAZANTE': string | null;
  'NOMBRE REEMPLAZANTE': string | null;
  'TIPO REEMPLAZANTE': string;
  [modalidad: string]: CsvCellValue;
}

const normalizeTurnoModalidad = (value: string | null | undefined): string =>
  value?.trim() || 'SIN MODALIDAD';

export const buildTurnosConsolidado = (
  movements: TurnoConsolidadoInput[]
): { headers: string[]; rows: TurnoConsolidadoRow[] } => {
  const modalities: string[] = [];
  const modalitySet = new Set<string>();
  const grouped = new Map<string, TurnoConsolidadoRow & {
    total_turnos: number;
    total_pagar: number;
  }>();

  for (const movement of movements) {
    const modality = normalizeTurnoModalidad(movement.modalidad);
    if (!modalitySet.has(modality)) {
      modalitySet.add(modality);
      modalities.push(modality);
    }

    const document = movement.documento_reemplazante?.trim() || null;
    const name = movement.nombre_reemplazante?.trim() || null;
    const key = JSON.stringify([document, name, movement.tipo_reemplazante]);
    let row = grouped.get(key);
    if (!row) {
      row = {
        'CÉDULA REEMPLAZANTE': document,
        'NOMBRE REEMPLAZANTE': name,
        'TIPO REEMPLAZANTE': movement.tipo_reemplazante,
        total_turnos: 0,
        total_pagar: 0
      };
      grouped.set(key, row);
    }

    const cantidad = Number(movement.cantidad ?? 0);
    const valorTotal = Number(movement.valor_total ?? 0);
    row[modality] = Number(row[modality] ?? 0) + cantidad;
    row.total_turnos += cantidad;
    row.total_pagar += valorTotal;
  }

  const headers = [
    'CÉDULA REEMPLAZANTE',
    'NOMBRE REEMPLAZANTE',
    'TIPO REEMPLAZANTE',
    ...modalities,
    'TOTAL TURNOS',
    'TOTAL A PAGAR'
  ];
  const rows = Array.from(grouped.values()).map((row) => {
    const output: TurnoConsolidadoRow = {
      'CÉDULA REEMPLAZANTE': row['CÉDULA REEMPLAZANTE'],
      'NOMBRE REEMPLAZANTE': row['NOMBRE REEMPLAZANTE'],
      'TIPO REEMPLAZANTE': row['TIPO REEMPLAZANTE']
    };
    for (const modality of modalities) output[modality] = row[modality] ?? 0;
    output['TOTAL TURNOS'] = row.total_turnos;
    output['TOTAL A PAGAR'] = row.total_pagar;
    return output;
  });

  return { headers, rows };
};

export const buildPayrollXlsx = (sheets: XlsxSheet[]): Buffer => {
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows, { header: sheet.headers, skipHeader: false });
    worksheet['!freeze'] = { xSplit: 0, ySplit: 1 };
    worksheet['!autofilter'] = { ref: `A1:${XLSX.utils.encode_col(Math.max(sheet.headers.length - 1, 0))}${Math.max(sheet.rows.length + 1, 1)}` };
    worksheet['!cols'] = sheet.headers.map((header) => ({ wch: Math.max(12, Math.min(34, header.length + 4)) }));

    for (const header of sheet.currencyHeaders ?? []) {
      const column = sheet.headers.indexOf(header);
      if (column < 0) continue;
      for (let row = 2; row <= sheet.rows.length + 1; row += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ c: column, r: row - 1 })];
        if (cell) cell.z = '$ #,##0';
      }
    }
    for (const header of sheet.integerHeaders ?? []) {
      const column = sheet.headers.indexOf(header);
      if (column < 0) continue;
      for (let row = 2; row <= sheet.rows.length + 1; row += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ c: column, r: row - 1 })];
        if (cell) cell.z = '0';
      }
    }
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }

  return Buffer.from(XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }));
};
