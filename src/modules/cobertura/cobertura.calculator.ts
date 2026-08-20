export const getEstadoCobertura = (
  requeridos: number,
  asignados: number
): 'NO_REQUIERE' | 'FALTANTE' | 'COMPLETA' | 'SOBRECOBERTURA' => {
  const delta = Number((asignados - requeridos).toFixed(6));

  if (requeridos <= 0) {
    return asignados > 0 ? 'SOBRECOBERTURA' : 'NO_REQUIERE';
  }

  if (delta < 0) {
    return 'FALTANTE';
  }

  if (delta === 0) {
    return 'COMPLETA';
  }

  return 'SOBRECOBERTURA';
};
