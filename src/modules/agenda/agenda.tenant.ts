import type { RequestHandler } from 'express';
import { assertTenantAccessForEmpresaId } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';

// Resolve the active company before both capability checks and Agenda services.
export const agendaTenant: RequestHandler = (req, _res, next) => {
  try {
    const selected = req.query.empresa_id;
    const empresaId = selected === undefined && req.tenant?.empresaIds.length === 1
      ? req.tenant.empresaIds[0]! : typeof selected === 'string' && /^\d+$/.test(selected) ? Number(selected) : NaN;
    if (!Number.isSafeInteger(empresaId) || empresaId < 1) throw new AppError('Selecciona una empresa activa',400,'AGENDA_EMPRESA_REQUERIDA');
    assertTenantAccessForEmpresaId(req.tenant, empresaId);
    req.tenant = { ...req.tenant!, empresaIds: [empresaId] };
    next();
  } catch (error) { next(error); }
};
