export const operationTabs = [
  { code: 'OPERACION_INSTITUCIONES', label: 'Instituciones', route: '/operacion/instituciones' },
  { code: 'OPERACION_SIMAT', label: 'Verificación SIMAT', route: '/operacion/simat' },
  { code: 'OPERACION_REPORTE_DIARIO', label: 'Reporte diario', route: '/operacion/reporte-diario' },
  { code: 'OPERACION_DESCUENTOS_SEMANALES', label: 'Descuentos semanales', route: '/operacion/descuentos-semanales' },
  { code: 'OPERACION_PLANILLA_FINAL', label: 'Planilla final', route: '/operacion/planilla-final' },
] as const;

export function operationTabForPath(pathname: string) {
  return operationTabs.find((tab) => pathname === tab.route) ?? null;
}
