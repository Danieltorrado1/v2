export const NOMINA_CORRECCION_TIPOS = [
  'DEVENGADO',
  'DEDUCCION',
  'NOVEDAD',
  'MOVIMIENTO',
  'LIQUIDACION',
  'DESPRENDIBLE',
  'OTRO'
] as const;

export const NOMINA_CORRECCION_ESTADOS = [
  'BORRADOR',
  'SOLICITADA',
  'EN_REVISION',
  'APROBADA',
  'RECHAZADA',
  'APLICADA',
  'ANULADA'
] as const;

export type NominaCorreccionTipo = (typeof NOMINA_CORRECCION_TIPOS)[number];
export type NominaCorreccionEstado = (typeof NOMINA_CORRECCION_ESTADOS)[number];

export const NOMINA_CORRECCION_REFERENCE_FIELD_BY_TIPO: Partial<
  Record<NominaCorreccionTipo, 'movimiento_id' | 'novedad_id' | 'liquidacion_id' | 'desprendible_origen_id'>
> = {
  MOVIMIENTO: 'movimiento_id',
  NOVEDAD: 'novedad_id',
  LIQUIDACION: 'liquidacion_id',
  DESPRENDIBLE: 'desprendible_origen_id'
};

export const NOMINA_CORRECCION_TRANSITIONS: Record<
  NominaCorreccionEstado,
  readonly NominaCorreccionEstado[]
> = {
  BORRADOR: ['SOLICITADA', 'ANULADA'],
  SOLICITADA: ['EN_REVISION', 'ANULADA'],
  EN_REVISION: ['APROBADA', 'RECHAZADA'],
  APROBADA: ['APLICADA'],
  RECHAZADA: [],
  APLICADA: [],
  ANULADA: []
};

export const NOMINA_CORRECCION_EDITABLE_STATES = ['BORRADOR', 'SOLICITADA'] as const;

export const NOMINA_CORRECCION_APPLY_UNAVAILABLE_REASON =
  'La fase actual no aplica correcciones automaticamente porque no existe un flujo backend seguro para compensar, recalcular y versionar desprendibles sin riesgo sobre historicos.';

export const NOMINA_CORRECCION_PERMISSION_DEFINITIONS = [
  {
    modulo: 'nomina.correcciones',
    accion: 'read',
    descripcion: 'Permiso base para nomina.correcciones.read'
  },
  {
    modulo: 'nomina.correcciones',
    accion: 'create',
    descripcion: 'Permiso base para nomina.correcciones.create'
  },
  {
    modulo: 'nomina.correcciones',
    accion: 'update',
    descripcion: 'Permiso base para nomina.correcciones.update'
  },
  {
    modulo: 'nomina.correcciones',
    accion: 'review',
    descripcion: 'Permiso base para nomina.correcciones.review'
  },
  {
    modulo: 'nomina.correcciones',
    accion: 'approve',
    descripcion: 'Permiso base para nomina.correcciones.approve'
  },
  {
    modulo: 'nomina.correcciones',
    accion: 'apply',
    descripcion: 'Permiso base para nomina.correcciones.apply'
  },
  {
    modulo: 'nomina.correcciones',
    accion: 'cancel',
    descripcion: 'Permiso base para nomina.correcciones.cancel'
  }
] as const;

export const NOMINA_CORRECCION_AUDIT_ACTIONS = [
  'NOMINA_CORRECCION_CREATE',
  'NOMINA_CORRECCION_UPDATE',
  'NOMINA_CORRECCION_REQUEST',
  'NOMINA_CORRECCION_REVIEW',
  'NOMINA_CORRECCION_APPROVE',
  'NOMINA_CORRECCION_REJECT',
  'NOMINA_CORRECCION_CANCEL',
  'NOMINA_CORRECCION_DEACTIVATE'
] as const;

const roundMoney = (value: number): number => Number(value.toFixed(2));

export const calculateNominaCorreccionDifference = (
  valorAnterior: number,
  valorNuevo: number
): number => roundMoney(valorNuevo - valorAnterior);

export const isNominaCorreccionDifferenceConsistent = (
  valorAnterior: number,
  valorNuevo: number,
  diferencia: number
): boolean => calculateNominaCorreccionDifference(valorAnterior, valorNuevo) === roundMoney(diferencia);

export const canTransitionNominaCorreccion = (
  current: NominaCorreccionEstado,
  next: NominaCorreccionEstado
): boolean => {
  if (current === next) {
    return true;
  }

  return NOMINA_CORRECCION_TRANSITIONS[current].includes(next);
};
