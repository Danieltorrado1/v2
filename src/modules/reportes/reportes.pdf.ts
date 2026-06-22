import { Response } from 'express';
import PDFDocument from 'pdfkit';

import { ReportColumn } from './reportes.excel';

export interface PdfReportInput {
  columns: ReportColumn[];
  rows: Array<Record<string, unknown>>;
  title: string;
}

const normalizeCellValue = (value: unknown): string => {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
};

export const buildPdfBuffer = async (input: PdfReportInput): Promise<Buffer> => {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 36,
      size: 'A4'
    });

    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });

    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    doc.on('error', reject);

    doc.fontSize(16).text(input.title, { align: 'left' });
    doc.moveDown();
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text(input.columns.map((column) => column.header).join(' | '));
    doc.moveDown(0.5);
    doc.font('Helvetica');

    for (const row of input.rows) {
      if (doc.y > 730) {
        doc.addPage();
        doc.fontSize(9).font('Helvetica-Bold');
        doc.text(input.columns.map((column) => column.header).join(' | '));
        doc.moveDown(0.5);
        doc.font('Helvetica');
      }

      const values = input.columns.map((column) => normalizeCellValue(row[column.key]));
      doc.text(values.join(' | '), {
        width: 520
      });
      doc.moveDown(0.25);
    }

    doc.end();
  });
};

export const sendPdfResponse = (
  res: Response,
  fileName: string,
  buffer: Buffer
): Response => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}.pdf"`);

  return res.status(200).send(buffer);
};
