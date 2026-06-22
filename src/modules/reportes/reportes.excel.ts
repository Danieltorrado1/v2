import { Response } from 'express';
import * as XLSX from 'xlsx';

export interface ReportColumn {
  header: string;
  key: string;
}

export interface ExcelReportInput {
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  sheetName: string;
}

const sanitizeSheetName = (value: string): string => {
  return value.replace(/[\\/*?:[\]]/g, '').slice(0, 31) || 'Reporte';
};

export const buildExcelBuffer = (input: ExcelReportInput): Buffer => {
  const worksheetRows = [
    input.columns.map((column) => column.header),
    ...input.rows.map((row) => input.columns.map((column) => row[column.key] ?? ''))
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(input.sheetName));

  return XLSX.write(workbook, {
    bookType: 'xlsx',
    type: 'buffer'
  }) as Buffer;
};

export const sendExcelResponse = (
  res: Response,
  fileName: string,
  buffer: Buffer
): Response => {
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}.xlsx"`);

  return res.status(200).send(buffer);
};
