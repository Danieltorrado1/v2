import type { PoolClient } from 'pg';

import { nominaPeriodoRepository, type NominaPeriodoRepositoryRow } from '../infrastructure/repositories/nomina-periodo.repository';
import type { TenantAccessContext } from '../../../middlewares/tenantMiddleware';
import { AppError } from '../../../utils/AppError';

const hasTenantContractAccess = (
  tenant: TenantAccessContext | undefined,
  contratoId: number,
  empresaId: number | null
): boolean => {
  if (!tenant || tenant.isGlobalAdmin) return true;
  if (tenant.contratoIds.includes(contratoId)) return true;
  return empresaId !== null && tenant.empresaIds.includes(empresaId);
};

export const assertNominaTenantContractAccess = async (
  contratoId: string,
  tenant: TenantAccessContext | undefined,
  client?: PoolClient
): Promise<void> => {
  const contrato = await nominaPeriodoRepository.findContratoScope(contratoId, client);
  if (!contrato) throw new AppError('Contrato not found', 404, 'CONTRATO_NOT_FOUND');
  const contratoNumericId = Number(contrato.id);
  const empresaId = contrato.empresa_id === null ? null : Number(contrato.empresa_id);
  if (!hasTenantContractAccess(tenant, contratoNumericId, empresaId)) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }
};

export const loadNominaPeriodoOrThrow = async (
  periodoId: string,
  tenant?: TenantAccessContext,
  client?: PoolClient
): Promise<NominaPeriodoRepositoryRow> => {
  const periodo = await nominaPeriodoRepository.findById(periodoId, client);
  if (!periodo) throw new AppError('Payroll period not found', 404, 'NOMINA_PERIODO_NOT_FOUND');
  await assertNominaTenantContractAccess(periodo.contrato_id, tenant, client);
  return periodo;
};
