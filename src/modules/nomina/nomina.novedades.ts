import { AppError } from '../../utils/AppError';

export const OFFICIAL_NOMINA_NOVEDAD_CODES = [
  {
    code: 'L50',
    label: 'Dia de no clase'
  },
  {
    code: 'PR1',
    label: 'Cita medica'
  },
  {
    code: 'PR2',
    label: 'Incapacidad medica'
  },
  {
    code: 'PR3',
    label: 'Calamidad familiar'
  },
  {
    code: 'PR4',
    label: 'Citacion oficial'
  },
  {
    code: 'PNR',
    label: 'Permiso no remunerado'
  },
  {
    code: 'S',
    label: 'Suspension'
  }
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
    const matches = rows.filter(
      (row) => normalizeNominaNovedadCode(row.codigo_operativo) === normalizedCode
    );

    if (matches.length === 0) {
      throw new AppError(
        'Payroll novelty operational code not found',
        404,
        'NOMINA_TIPO_NOVEDAD_CODIGO_NOT_FOUND'
      );
    }

    const match = matches[0];
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
    const matches = rows.filter(
      (row) => normalizeNominaNovedadLabel(row.nombre) === normalizedName
    );

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
