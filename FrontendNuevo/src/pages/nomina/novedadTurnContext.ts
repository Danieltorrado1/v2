export function requiresNovedadTurnContext(codigo: string | null | undefined) {
  return codigo === 'TURNO_ADICIONAL';
}

export function novedadTurnContext<T>(codigo: string | null | undefined, context: T | null): T | null {
  return requiresNovedadTurnContext(codigo) ? context : null;
}

export function isNovedadTurnContextMissing(codigo: string | null | undefined, context: {
  institucion_id?: string; sede_id?: string; modalidad_id?: string;
} | null) {
  return requiresNovedadTurnContext(codigo) &&
    (!context?.institucion_id || !context.sede_id || !context.modalidad_id);
}
