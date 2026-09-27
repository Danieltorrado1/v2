export const CONTROLLED_RECALC_PROJECT_REF = 'scuvsocqibbubqnesvuf';
export const CONTROLLED_RECALC_SCOPE = {
  empresaId: '15',
  contratoId: '24',
  periodoId: '3'
} as const;

export type ControlledPreflight = {
  empresaId: string;
  contratoId: string;
  periodoId: string;
  periodoEstado: string;
  candidateEmployeeIds: readonly string[];
  protectedLiquidations: number;
  protectedPayslips: number;
  protectedManualAdjustments: number;
};

export const isPostgres17 = (version: string): boolean => /^17(?:\.|$)/.test(version.trim());

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
  if (new Set(input.candidateEmployeeIds).size !== input.candidateEmployeeIds.length) {
    throw new Error('El conjunto de candidatos contiene duplicados.');
  }
}

export const assertExactConfirmation = (candidateCount: number, confirmation: string): void => {
  if (confirmation !== expectedConfirmation(candidateCount)) {
    throw new Error('La confirmación exacta no coincide con el preflight inmediato.');
  }
};

