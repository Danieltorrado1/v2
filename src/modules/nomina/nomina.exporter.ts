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
