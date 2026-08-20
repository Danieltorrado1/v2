export interface ImportRowValidationIssue {
  field: string;
  code: string;
  message: string;
  severity: 'ERROR' | 'WARNING';
}

export const createImportIssue = (
  field: string,
  code: string,
  message: string,
  severity: 'ERROR' | 'WARNING' = 'ERROR'
): ImportRowValidationIssue => ({
  field,
  code,
  message,
  severity
});
