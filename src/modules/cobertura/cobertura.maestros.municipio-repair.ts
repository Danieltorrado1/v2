import { PoolClient } from 'pg';

import { AppError } from '../../utils/AppError';

export const MUNICIPIO_REPAIR_CONFIRMATION = 'REPARAR_MUNICIPIOS_FOCALIZACION_META26';
export const MUNICIPIO_REPAIR_CONTRACT_ID = '24';
export const MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID = '4';
export const MUNICIPIO_REPAIR_EXPECTED_SHA = '6f55c28567d7dd2f9f92182f90f89398f3769b00dbcfbedac19c8ec604422719';

export interface MunicipioRepairProtectionInput {
  apply: boolean;
  confirm?: string | null;
  contractId?: string | null;
  officialLoadId?: string | null;
}

export interface MunicipioRepairPreflightSummary {
  institucionesAfectadas: number;
  relacionesIncorrectas: number;
  sedesAfectadas: number;
}

export const validateMunicipioRepairProtection = (input: MunicipioRepairProtectionInput): void => {
  if (!input.apply) {
    return;
  }

  if (input.contractId !== MUNICIPIO_REPAIR_CONTRACT_ID) {
    throw new AppError(
      `Municipio repair requires --contract-id=${MUNICIPIO_REPAIR_CONTRACT_ID}.`,
      400,
      'MUNICIPIO_REPAIR_CONTRACT_ID_REQUIRED',
    );
  }

  if (input.officialLoadId !== MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID) {
    throw new AppError(
      `Municipio repair requires --official-load-id=${MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID}.`,
      400,
      'MUNICIPIO_REPAIR_OFFICIAL_LOAD_ID_REQUIRED',
    );
  }

  if (input.confirm !== MUNICIPIO_REPAIR_CONFIRMATION) {
    throw new AppError(
      `Municipio repair requires --confirm=${MUNICIPIO_REPAIR_CONFIRMATION}.`,
      400,
      'MUNICIPIO_REPAIR_CONFIRMATION_REQUIRED',
    );
  }
};

export const assertMunicipioRepairPreflight = (
  input: MunicipioRepairPreflightSummary,
): void => {
  if (
    input.relacionesIncorrectas === 0 &&
    input.institucionesAfectadas === 0 &&
    input.sedesAfectadas === 0
  ) {
    return;
  }

  if (input.relacionesIncorrectas !== 57) {
    throw new AppError(
      'Municipio repair preflight expected exactly 57 relaciones incorrectas before APPLY.',
      409,
      'MUNICIPIO_REPAIR_PREFLIGHT_RELACIONES_MISMATCH',
      input,
    );
  }

  if (input.institucionesAfectadas !== 11) {
    throw new AppError(
      'Municipio repair preflight expected exactly 11 instituciones afectadas before APPLY.',
      409,
      'MUNICIPIO_REPAIR_PREFLIGHT_INSTITUCIONES_MISMATCH',
      input,
    );
  }

  if (input.sedesAfectadas !== 43) {
    throw new AppError(
      'Municipio repair preflight expected exactly 43 sedes afectadas before APPLY.',
      409,
      'MUNICIPIO_REPAIR_PREFLIGHT_SEDES_MISMATCH',
      input,
    );
  }
};

export const runMunicipioRepairTransaction = async <T>(
  client: Pick<PoolClient, 'query'>,
  callback: () => Promise<T>,
): Promise<T> => {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
  try {
    const result = await callback();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
};
