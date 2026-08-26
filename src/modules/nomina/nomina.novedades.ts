import { AppError } from '../../utils/AppError';

export const OFFICIAL_NOMINA_NOVEDAD_CODES = [
  { code: 'DNC', label: 'Dia no clase' },
  { code: 'L50', label: 'Dia no clase (historico)' },
  { code: 'PR1', label: 'Permiso remunerado 1' },
  { code: 'PR2', label: 'Permiso remunerado 2' },
  { code: 'PR3', label: 'Permiso remunerado 3' },
  { code: 'PR4', label: 'Permiso remunerado 4' },
  { code: 'PNR', label: 'Permiso no remunerado' },
  { code: 'FNJ', label: 'Falla no justificada' },
  { code: 'S', label: 'Suspension' },
  { code: 'INC_GENERAL', label: 'Incapacidad general' },
  { code: 'INC_ARL', label: 'Incapacidad ARL' }
] as const;

export type OfficialNominaNovedadCode = (typeof OFFICIAL_NOMINA_NOVEDAD_CODES)[number]['code'];

export interface NominaNovedadTypeSelectionRow {
  activo: boolean | null;
  codigo_operativo?: string | null;
  id: string;
  nombre: string | null;
}

export interface NominaNovedadTypeSelectionInput {
  id?: string | null;
  codigo_operativo?: string | null;
  nombre?: string | null;
}

const CODE_ALIASES: Record<string, string[]> = {
  DNC: ['DNC', 'L50'],
  L50: ['L50', 'DNC'],
  INC_ARL: ['INC_ARL', 'INCAP_ACL'],
  INCAP_ACL: ['INC_ARL', 'INCAP_ACL'],
};

const NAME_ALIASES: string[][] = [
  ['DIA NO CLASE', 'DIA DE NO CLASE'],
  ['INCAPACIDAD GENERAL', 'INCAPACIDAD MEDICA'],
  ['INCAPACIDAD ARL', 'INCAPACIDAD POR ACCIDENTE LABORAL'],
];

export const normalizeNominaNovedadLabel = (value: string | null | undefined): string => {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
};

export const normalizeNominaNovedadCode = (value: string | null | undefined): string => {
  return (value ?? '').trim().toUpperCase();
};

const matchesOperationalCode = (rowCode: string | null | undefined, inputCode: string): boolean => {
  const normalizedRow = normalizeNominaNovedadCode(rowCode);
  if (normalizedRow === inputCode) {
    return true;
  }

  const aliases = CODE_ALIASES[inputCode] ?? [inputCode];
  return aliases.includes(normalizedRow);
};

const matchesName = (rowName: string | null | undefined, inputName: string): boolean => {
  const normalizedRow = normalizeNominaNovedadLabel(rowName);
  if (normalizedRow === inputName) {
    return true;
  }

  return NAME_ALIASES.some((aliases) => aliases.includes(inputName) && aliases.includes(normalizedRow));
};

export const resolveNominaNovedadTypeSelection = <T extends NominaNovedadTypeSelectionRow>(
  rows: T[],
  input: NominaNovedadTypeSelectionInput
): T => {
  const byId = (input.id ?? '').trim();
  if (byId.length > 0) {
    const match = rows.find((row) => row.id === byId);
    if (!match) {
      throw new AppError('Payroll novelty type not found', 404, 'NOMINA_TIPO_NOVEDAD_NOT_FOUND');
    }
    if (match.activo === false) {
      throw new AppError(
        'Payroll novelty type is inactive',
        409,
        'NOMINA_TIPO_NOVEDAD_INACTIVO'
      );
    }
    return match;
  }

  const normalizedCode = normalizeNominaNovedadCode(input.codigo_operativo);
  if (normalizedCode.length > 0) {
    const matches = rows.filter((row) => matchesOperationalCode(row.codigo_operativo, normalizedCode));

    if (matches.length === 0) {
      throw new AppError(
        'Payroll novelty operational code not found',
        404,
        'NOMINA_TIPO_NOVEDAD_CODIGO_NOT_FOUND'
      );
    }

    const match = matches.find((row) => row.activo !== false) ?? matches[0];
    if (!match || match.activo === false) {
      throw new AppError(
        'Payroll novelty type is inactive',
        409,
        'NOMINA_TIPO_NOVEDAD_INACTIVO'
      );
    }
    return match;
  }

  const normalizedName = normalizeNominaNovedadLabel(input.nombre);
  if (normalizedName.length > 0) {
    const matches = rows.filter((row) => matchesName(row.nombre, normalizedName));

    if (matches.length === 0) {
      throw new AppError(
        'Payroll novelty type name not found',
        404,
        'NOMINA_TIPO_NOVEDAD_NOMBRE_NOT_FOUND'
      );
    }

    const activeMatches = matches.filter((row) => row.activo !== false);
    if (activeMatches.length === 0) {
      throw new AppError(
        'Payroll novelty type is inactive',
        409,
        'NOMINA_TIPO_NOVEDAD_INACTIVO'
      );
    }

    if (activeMatches.length > 1) {
      throw new AppError(
        'Payroll novelty type name is ambiguous',
        409,
        'NOMINA_TIPO_NOVEDAD_NOMBRE_AMBIGUO'
      );
    }

    return activeMatches[0]!;
  }

  throw new AppError(
    'tipo_novedad_id, tipo_novedad_codigo or tipo_novedad_nombre is required',
    400,
    'NOMINA_TIPO_NOVEDAD_SELECTION_REQUIRED'
  );
};
