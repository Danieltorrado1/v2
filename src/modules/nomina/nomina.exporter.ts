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
