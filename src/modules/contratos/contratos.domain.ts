export const CONTRATO_ESTADOS = [
  'BORRADOR',
  'PENDIENTE_INICIO',
  'ACTIVO',
  'PRORROGADO',
  'SUSPENDIDO',
  'FINALIZADO',
  'LIQUIDADO',
  'ANULADO'
] as const;

export const CONTRATO_EVENTOS = [
  'CREACION',
  'ACTA_INICIO',
  'PRORROGA',
  'ADICION',
  'OTROSI',
  'MODIFICACION',
  'SUSPENSION',
  'REINICIO',
  'TERMINACION',
  'LIQUIDACION',
  'CAMBIO_REPRESENTANTE',
  'CAMBIO_SUPERVISOR',
  'CAMBIO_COBERTURA',
  'OTRO'
] as const;

export const CONTRATO_DOCUMENTO_REVISION_ESTADOS = [
  'PENDIENTE',
  'EN_REVISION',
  'APROBADO',
  'DEVUELTO',
  'ANULADO'
] as const;

export const CONTRATO_DOCUMENTO_ESTADOS = [
  'PENDIENTE',
  'CARGADO',
  'EN_REVISION',
  'APROBADO',
  'DEVUELTO',
  'VIGENTE',
  'PROXIMO_A_VENCER',
  'VENCIDO',
  'REEMPLAZADO',
  'HISTORICO',
  'ANULADO'
] as const;

export const CONTRATO_CHECKLIST_ESTADOS = [
  'CUMPLIDO',
  'PENDIENTE',
  'VENCIDO',
  'EN_REVISION',
  'DEVUELTO',
  'APROBADO_PROVISIONAL',
  'NO_APLICA'
] as const;

export const CONTRATO_EXCEPCION_ESTADOS = [
  'ABIERTA',
  'REGULARIZADA',
  'VENCIDA',
  'REVOCADA'
] as const;

export type ContratoEstado = (typeof CONTRATO_ESTADOS)[number];
export type ContratoEventoTipo = (typeof CONTRATO_EVENTOS)[number];
export type ContratoDocumentoRevisionEstado = (typeof CONTRATO_DOCUMENTO_REVISION_ESTADOS)[number];
export type ContratoDocumentoEstado = (typeof CONTRATO_DOCUMENTO_ESTADOS)[number];
export type ContratoChecklistEstado = (typeof CONTRATO_CHECKLIST_ESTADOS)[number];
export type ContratoExcepcionEstado = (typeof CONTRATO_EXCEPCION_ESTADOS)[number];

export interface ContratoTransitionResult {
  allowed: boolean;
  nextState: ContratoEstado;
  reason: string | null;
}

export interface ContratoDocumentoStatusInput {
  activo: boolean;
  es_vigente: boolean;
  estado_revision: ContratoDocumentoRevisionEstado;
  fecha_vencimiento: string | null;
  dias_alerta: number;
}

export interface ContratoChecklistResolutionInput {
  obligatorio: boolean;
  no_aplica: boolean;
  documento_estado: ContratoDocumentoEstado | null;
  excepcion_estado: ContratoExcepcionEstado | null;
}

const TERMINAL_CONTRACT_STATES = new Set<ContratoEstado>(['LIQUIDADO', 'ANULADO']);

export const isContractStateTerminal = (state: ContratoEstado): boolean => {
  return TERMINAL_CONTRACT_STATES.has(state);
};

export const resolveContratoEstadoPosterior = (
  currentState: ContratoEstado,
  eventType: ContratoEventoTipo
): ContratoTransitionResult => {
  switch (eventType) {
    case 'CREACION':
      return {
        allowed: currentState === 'BORRADOR',
        nextState: 'BORRADOR',
        reason: currentState === 'BORRADOR' ? null : 'La creacion solo aplica sobre un contrato nuevo en borrador.'
      };
    case 'ACTA_INICIO':
      return {
        allowed: currentState === 'BORRADOR' || currentState === 'PENDIENTE_INICIO',
        nextState: 'ACTIVO',
        reason:
          currentState === 'BORRADOR' || currentState === 'PENDIENTE_INICIO'
            ? null
            : 'El acta de inicio solo puede registrarse desde BORRADOR o PENDIENTE_INICIO.'
      };
    case 'PRORROGA':
      return {
        allowed:
          currentState === 'ACTIVO' ||
          currentState === 'PRORROGADO' ||
          currentState === 'PENDIENTE_INICIO',
        nextState: 'PRORROGADO',
        reason:
          currentState === 'ACTIVO' ||
          currentState === 'PRORROGADO' ||
          currentState === 'PENDIENTE_INICIO'
            ? null
            : 'La prorroga solo puede aplicarse a contratos pendientes o en ejecucion.'
      };
    case 'ADICION':
    case 'OTROSI':
    case 'MODIFICACION':
    case 'CAMBIO_REPRESENTANTE':
    case 'CAMBIO_SUPERVISOR':
    case 'CAMBIO_COBERTURA':
    case 'OTRO':
      return {
        allowed: !isContractStateTerminal(currentState),
        nextState: currentState,
        reason: isContractStateTerminal(currentState)
          ? 'No se pueden registrar cambios operativos sobre contratos liquidados o anulados.'
          : null
      };
    case 'SUSPENSION':
      return {
        allowed: currentState === 'ACTIVO' || currentState === 'PRORROGADO',
        nextState: 'SUSPENDIDO',
        reason:
          currentState === 'ACTIVO' || currentState === 'PRORROGADO'
            ? null
            : 'Solo se puede suspender un contrato activo o prorrogado.'
      };
    case 'REINICIO':
      return {
        allowed: currentState === 'SUSPENDIDO',
        nextState: 'ACTIVO',
        reason: currentState === 'SUSPENDIDO'
          ? null
          : 'El reinicio requiere un contrato previamente suspendido.'
      };
    case 'TERMINACION':
      return {
        allowed:
          currentState === 'ACTIVO' ||
          currentState === 'PRORROGADO' ||
          currentState === 'SUSPENDIDO' ||
          currentState === 'PENDIENTE_INICIO',
        nextState: 'FINALIZADO',
        reason:
          currentState === 'ACTIVO' ||
          currentState === 'PRORROGADO' ||
          currentState === 'SUSPENDIDO' ||
          currentState === 'PENDIENTE_INICIO'
            ? null
            : 'Solo se puede terminar un contrato vigente o pendiente.'
      };
    case 'LIQUIDACION':
      return {
        allowed: currentState === 'FINALIZADO',
        nextState: 'LIQUIDADO',
        reason: currentState === 'FINALIZADO'
          ? null
          : 'La liquidacion requiere un contrato finalizado.'
      };
    default:
      return {
        allowed: false,
        nextState: currentState,
        reason: 'Tipo de evento no soportado.'
      };
  }
};

export const validateManualContratoStateChange = (
  currentState: ContratoEstado,
  requestedState: ContratoEstado
): ContratoTransitionResult => {
  if (currentState === requestedState) {
    return { allowed: true, nextState: requestedState, reason: null };
  }

  if (currentState === 'ANULADO' && requestedState !== 'ANULADO') {
    return {
      allowed: false,
      nextState: currentState,
      reason: 'Un contrato anulado no puede reactivarse directamente.'
    };
  }

  if (currentState === 'LIQUIDADO' && requestedState !== 'LIQUIDADO') {
    return {
      allowed: false,
      nextState: currentState,
      reason: 'Un contrato liquidado no puede reactivarse directamente.'
    };
  }

  if (currentState === 'SUSPENDIDO' && requestedState === 'ACTIVO') {
    return {
      allowed: false,
      nextState: currentState,
      reason: 'El paso de SUSPENDIDO a ACTIVO debe registrarse mediante evento de REINICIO.'
    };
  }

  return {
    allowed: true,
    nextState: requestedState,
    reason: null
  };
};

const daysBetweenUtc = (fromIsoDate: string, toIsoDate: string): number => {
  const from = Date.parse(`${fromIsoDate}T00:00:00.000Z`);
  const to = Date.parse(`${toIsoDate}T00:00:00.000Z`);
  return Math.round((to - from) / 86400000);
};

export const resolveContratoDocumentoEstado = (
  input: ContratoDocumentoStatusInput,
  todayIsoDate: string
): ContratoDocumentoEstado => {
  if (!input.activo || input.estado_revision === 'ANULADO') {
    return 'ANULADO';
  }

  if (!input.es_vigente) {
    return 'REEMPLAZADO';
  }

  if (input.estado_revision === 'DEVUELTO') {
    return 'DEVUELTO';
  }

  if (input.estado_revision === 'EN_REVISION') {
    return 'EN_REVISION';
  }

  if (input.fecha_vencimiento) {
    const days = daysBetweenUtc(todayIsoDate, input.fecha_vencimiento);

    if (days < 0) {
      return 'VENCIDO';
    }

    if (days <= input.dias_alerta) {
      return input.estado_revision === 'APROBADO' ? 'PROXIMO_A_VENCER' : 'CARGADO';
    }
  }

  if (input.estado_revision === 'APROBADO') {
    return 'VIGENTE';
  }

  return 'CARGADO';
};

export const resolveContratoChecklistEstado = (
  input: ContratoChecklistResolutionInput
): ContratoChecklistEstado => {
  if (input.no_aplica) {
    return 'NO_APLICA';
  }

  if (input.excepcion_estado === 'ABIERTA') {
    return 'APROBADO_PROVISIONAL';
  }

  if (!input.documento_estado) {
    return 'PENDIENTE';
  }

  switch (input.documento_estado) {
    case 'VIGENTE':
    case 'APROBADO':
    case 'PROXIMO_A_VENCER':
      return 'CUMPLIDO';
    case 'EN_REVISION':
    case 'CARGADO':
      return 'EN_REVISION';
    case 'DEVUELTO':
      return 'DEVUELTO';
    case 'VENCIDO':
      return 'VENCIDO';
    case 'PENDIENTE':
      return 'PENDIENTE';
    case 'REEMPLAZADO':
    case 'HISTORICO':
    case 'ANULADO':
      return input.obligatorio ? 'PENDIENTE' : 'NO_APLICA';
    default:
      return 'PENDIENTE';
  }
};

export const calculateContratoChecklistCompletion = (
  states: ContratoChecklistEstado[]
): number => {
  const relevantStates = states.filter((state) => state !== 'NO_APLICA');

  if (relevantStates.length === 0) {
    return 0;
  }

  const completed = relevantStates.filter((state) =>
    state === 'CUMPLIDO' || state === 'APROBADO_PROVISIONAL'
  ).length;

  return Number(((completed / relevantStates.length) * 100).toFixed(2));
};
