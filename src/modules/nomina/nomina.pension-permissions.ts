import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';

export function assertPensionAdjustmentAccess(concepts: Array<string | undefined>, tenant?: TenantAccessContext) {
  if (!concepts.some(value => value?.trim().toUpperCase() === 'EXCLUIR_PENSION_FINAL')) return;
  if (!tenant || !tenant.roleNames.some(role => ['ADMINISTRADOR', 'TALENTO_HUMANO'].includes(role.toUpperCase()))) {
    throw new AppError('No tienes permisos para modificar la configuración de pensión', 403, 'NOMINA_PENSION_FORBIDDEN');
  }
}
