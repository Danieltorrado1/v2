import { AppError } from '../../utils/AppError';

export const NOMINA_MOVIMIENTO_ESTADOS = [
  'PENDIENTE',
  'REVISADO',
  'APROBADO',
  'RECHAZADO'
] as const;

export type NominaMovimientoEstado = (typeof NOMINA_MOVIMIENTO_ESTADOS)[number];

export const NOMINA_MOVIMIENTO_FAMILIAS = [
  'GENERAL',
  'ADICION_DEVENGO',
  'CAMBIO_OPERATIVO'
] as const;

export type NominaMovimientoFamilia = (typeof NOMINA_MOVIMIENTO_FAMILIAS)[number];

export const NOMINA_MOVIMIENTO_ALERTA_TIPOS = [
  'POSIBLE_DUPLICADO',
  'CONFLICTO_NOVEDAD',
  'CONFIGURACION_TARIFA_FALTANTE'
] as const;

export type NominaMovimientoAlertaTipo = (typeof NOMINA_MOVIMIENTO_ALERTA_TIPOS)[number];

export interface NominaMovimientoAlerta {
  tipo: NominaMovimientoAlertaTipo;
  severidad: 'INFO' | 'WARNING' | 'ERROR';
  mensaje: string;
  codigo?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ResolveNominaMovimientoValueInput {
  cantidad?: number | null;
  valor_aplicado?: number | null;
  valor_calculado?: number | null;
  valor_unitario?: number | null;
  motivo_ajuste_valor?: string | null;
}

export interface ResolvedNominaMovimientoValue {
  ajuste_manual: boolean;
  cantidad: number;
  motivo_ajuste_valor: string | null;
  valor_aplicado: number;
  valor_calculado: number;
  valor_unitario: number | null;
}

const roundMoney = (value: number): number => Number(value.toFixed(2));

export const resolveNominaMovimientoFamilia = (
  tipoMovimiento: string
): NominaMovimientoFamilia => {
  if (tipoMovimiento === 'TURNO_EXTERNO' || tipoMovimiento === 'TURNO_INTERNO') {
    return 'ADICION_DEVENGO';
  }

  return 'GENERAL';
};

export const normalizeNominaMovimientoEstado = (
  value: string | null | undefined
): NominaMovimientoEstado => {
  const candidate = (value ?? 'PENDIENTE').trim().toUpperCase();

  if ((NOMINA_MOVIMIENTO_ESTADOS as readonly string[]).includes(candidate)) {
    return candidate as NominaMovimientoEstado;
  }

  throw new AppError(
    'Invalid payroll movement state',
    400,
    'NOMINA_MOVIMIENTO_ESTADO_INVALIDO'
  );
};

export const resolveNominaMovimientoValue = (
  input: ResolveNominaMovimientoValueInput
): ResolvedNominaMovimientoValue => {
  const cantidad = input.cantidad ?? 1;

  if (!Number.isFinite(cantidad) || cantidad <= 0) {
    throw new AppError(
      'cantidad must be greater than zero',
      400,
      'NOMINA_MOVIMIENTO_CANTIDAD_INVALIDA'
    );
  }

  const hasUnitValue =
    input.valor_unitario !== null &&
    input.valor_unitario !== undefined &&
    Number.isFinite(input.valor_unitario);
  const hasCalculatedValue =
    input.valor_calculado !== null &&
    input.valor_calculado !== undefined &&
    Number.isFinite(input.valor_calculado);
  const hasAppliedValue =
    input.valor_aplicado !== null &&
    input.valor_aplicado !== undefined &&
    Number.isFinite(input.valor_aplicado);

  let valorCalculado: number;

  if (hasCalculatedValue) {
    valorCalculado = roundMoney(Number(input.valor_calculado));
  } else if (hasUnitValue) {
    valorCalculado = roundMoney(cantidad * Number(input.valor_unitario));
  } else if (hasAppliedValue) {
    valorCalculado = roundMoney(Number(input.valor_aplicado));
  } else {
    throw new AppError(
      'valor_aplicado, valor_calculado or valor_unitario is required',
      400,
      'NOMINA_MOVIMIENTO_VALOR_REQUERIDO'
    );
  }

  const valorAplicado = hasAppliedValue
    ? roundMoney(Number(input.valor_aplicado))
    : valorCalculado;

  if (valorCalculado < 0 || valorAplicado < 0) {
    throw new AppError(
      'Movement values must be greater than or equal to zero',
      400,
      'NOMINA_MOVIMIENTO_VALOR_INVALIDO'
    );
  }

  const ajusteManual = Math.abs(valorAplicado - valorCalculado) >= 0.01;
  const motivoAjuste = input.motivo_ajuste_valor?.trim() || null;

  if (ajusteManual && !motivoAjuste) {
    throw new AppError(
      'motivo_ajuste_valor is required when valor_aplicado differs from valor_calculado',
      400,
      'NOMINA_MOVIMIENTO_MOTIVO_AJUSTE_REQUERIDO'
    );
  }

  return {
    ajuste_manual: ajusteManual,
    cantidad,
    motivo_ajuste_valor: motivoAjuste,
    valor_aplicado: valorAplicado,
    valor_calculado: valorCalculado,
    valor_unitario: hasUnitValue ? roundMoney(Number(input.valor_unitario)) : null
  };
};

export const appendNominaMovimientoAlert = (
  alerts: NominaMovimientoAlerta[],
  alert: NominaMovimientoAlerta
): NominaMovimientoAlerta[] => {
  if (
    alerts.some(
      (item) =>
        item.tipo === alert.tipo &&
        (item.codigo ?? null) === (alert.codigo ?? null) &&
        item.mensaje === alert.mensaje
    )
  ) {
    return alerts;
  }

  return [...alerts, alert];
};
