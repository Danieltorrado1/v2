export const CONTROLLED_RECALC_PROJECT_REF = 'scuvsocqibbubqnesvuf';
export const CONTROLLED_RECALC_SCOPE = {
  empresaId: '15',
  contratoId: '24',
  periodoId: '3'
} as const;

export const CONTROLLED_RECOVERY_VALIDATED_IDS = [
  '1020', '1021', '1022', '1023', '1097', '1098', '1099', '1101',
  '1102', '1104', '1105', '1106', '1107', '1108', '1109'
] as const;

export const expectedRecoveryConfirmation = (): string =>
  `RECUPERAR AUDITORIA 15 Y RECALCULAR 172 EMPRESA 15 CONTRATO 24 PERIODO 3 ACTOR 12 PROJECT ${CONTROLLED_RECALC_PROJECT_REF} AUTORIZO ESCRITURA`;

export const assertExactRecoveryConfirmation = (confirmation: string): void => {
  if (confirmation !== expectedRecoveryConfirmation()) {
    throw new Error('La confirmación exacta de recuperación no coincide.');
  }
};

export type ControlledPreflight = {
  empresaId: string;
  contratoId: string;
  periodoId: string;
  periodoEstado: string;
  employeesMaterialized: number;
  candidateEmployeeIds: readonly string[];
  excludedEmployees: number;
  activeNoveltyRows: number;
  activeNoveltyDays: number;
  protectedLiquidations: number;
  protectedPayslips: number;
  protectedManualAdjustments: number;
  waitingLocks: number;
  period5Employees: number;
  period5ActiveNovelties: number;
};

export const isPostgres17 = (version: string): boolean => /^17(?:\.|$)/.test(version.trim());

export const calculateExcludedEmployees = (employeesMaterialized: number, candidateEmployees: number): number => {
  if (!Number.isInteger(employeesMaterialized) || !Number.isInteger(candidateEmployees)) throw new Error('La población de nómina debe usar conteos enteros.');
  const excluded = employeesMaterialized - candidateEmployees;
  if (excluded < 0) throw new Error('Los candidatos no pueden exceder la población materializada.');
  return excluded;
};

export const expectedConfirmation = (candidateCount: number): string =>
  `RECALCULO CONTROLADO EMPRESA 15 CONTRATO 24 PERIODO 3 CANDIDATOS ${candidateCount} PROJECT ${CONTROLLED_RECALC_PROJECT_REF} AUTORIZO ESCRITURA`;

export const assertControlledPreflight = (input: ControlledPreflight): void => {
  if (
    input.empresaId !== CONTROLLED_RECALC_SCOPE.empresaId ||
    input.contratoId !== CONTROLLED_RECALC_SCOPE.contratoId ||
    input.periodoId !== CONTROLLED_RECALC_SCOPE.periodoId
  ) {
    throw new Error('El preflight no coincide con empresa, contrato y periodo autorizados.');
  }
  if (input.periodoEstado !== 'ABIERTO') {
    throw new Error('El periodo controlado no está ABIERTO.');
  }
  if (input.protectedLiquidations || input.protectedPayslips || input.protectedManualAdjustments) {
    throw new Error('Existen liquidaciones, desprendibles o ajustes manuales protegidos.');
  }
  if (input.waitingLocks !== 0) throw new Error('Existen locks esperando.');
  if (input.period5Employees !== 788 || input.period5ActiveNovelties !== 1) {
    throw new Error('El periodo 5 no coincide con el baseline protegido.');
  }
  const calculatedExcluded = calculateExcludedEmployees(input.employeesMaterialized, input.candidateEmployeeIds.length);
  if (input.excludedEmployees !== calculatedExcluded) {
    throw new Error('La exclusión esperada de empleados sin novedades cambió.');
  }
  if (new Set(input.candidateEmployeeIds).size !== input.candidateEmployeeIds.length) {
    throw new Error('El conjunto de candidatos contiene duplicados.');
  }
}

export const assertExactConfirmation = (candidateCount: number, confirmation: string): void => {
  if (confirmation !== expectedConfirmation(candidateCount)) {
    throw new Error('La confirmación exacta no coincide con el preflight inmediato.');
  }
};
