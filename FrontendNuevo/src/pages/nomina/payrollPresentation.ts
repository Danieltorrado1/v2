export type PayrollPresentationInput = {
  salario: number;
  transporte: number;
  recargos: number;
  turnosInternos: number;
  otrosPagos: number;
  deducciones: number;
};

export function buildPayrollPresentation(input: PayrollPresentationInput) {
  const totalDevengado = input.salario + input.transporte + input.recargos + input.turnosInternos + input.otrosPagos;
  return {
    ...input,
    totalDevengado,
    neto: totalDevengado - input.deducciones,
    turnosEnIbc: false,
  };
}
