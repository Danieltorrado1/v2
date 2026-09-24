export type IntegracionImpactAction = 'REQUIERE_SINCRONIZACION' | 'REQUIERE_AJUSTE_AUTORIZADO' | 'SIN_IMPACTO' | 'TRAZABILIDAD_PERSONAL' | 'BLOQUEADO_PERIODIZACION';

export const classifyIntegracionImpact = (periodo: { fecha_inicio: string; fecha_fin: string; estado: string } | null, fecha: string): IntegracionImpactAction => {
  if (!periodo || fecha < periodo.fecha_inicio || fecha > periodo.fecha_fin) return 'SIN_IMPACTO';
  return periodo.estado === 'ABIERTO' ? 'REQUIERE_SINCRONIZACION' : 'REQUIERE_AJUSTE_AUTORIZADO';
};

export const aggregateEventOrderKey = (aggregateType: string, aggregateId: string | number): string => `${aggregateType}:${String(aggregateId)}`;
