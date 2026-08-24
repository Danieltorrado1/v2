import { AppError } from '../../utils/AppError';

export const NOMINA_NOVEDAD_REGISTRO_TYPES = ['ORDINARIA', 'CANONICA_PROYECTADA'] as const;

export type NominaNovedadRegistroTipo = (typeof NOMINA_NOVEDAD_REGISTRO_TYPES)[number];

export interface ParsedNominaNovedadRecordId {
  entidad_id: string;
  periodo_id: string | null;
  registro_tipo: NominaNovedadRegistroTipo;
}

const NOMINA_CANONICA_PREFIX = 'canonica:';

export const buildNominaCanonicalProjectedRecordId = (
  eventoCanonicoId: string,
  periodoId: string
): string => {
  return `${NOMINA_CANONICA_PREFIX}${eventoCanonicoId}:${periodoId}`;
};

export const parseNominaNovedadRecordId = (recordId: string): ParsedNominaNovedadRecordId => {
  const trimmed = recordId.trim();

  if (!trimmed) {
    throw new AppError('Payroll novelty id is required', 400, 'NOMINA_NOVEDAD_ID_INVALIDO');
  }

  if (!trimmed.startsWith(NOMINA_CANONICA_PREFIX)) {
    return {
      entidad_id: trimmed,
      periodo_id: null,
      registro_tipo: 'ORDINARIA'
    };
  }

  const [, entidadId = '', periodoId = ''] = trimmed.split(':');

  if (!entidadId || !periodoId) {
    throw new AppError(
      'Canonical payroll novelty id is invalid',
      400,
      'NOMINA_NOVEDAD_CANONICA_ID_INVALIDO'
    );
  }

  return {
    entidad_id: entidadId,
    periodo_id: periodoId,
    registro_tipo: 'CANONICA_PROYECTADA'
  };
};
