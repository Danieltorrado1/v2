import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import {
  getTenantMeHandler,
  getUserAccessHandler,
  grantUserContratoAccessHandler,
  grantUserEmpresaAccessHandler,
  revokeUserContratoAccessHandler,
  revokeUserEmpresaAccessHandler
} from './tenant.controller';

const tenantRoutes = Router();

tenantRoutes.use(authMiddleware);
tenantRoutes.use(tenantMiddleware);

tenantRoutes.get('/me', getTenantMeHandler);
tenantRoutes.get('/users/:userId/access', requireTenantAccessRead, getUserAccessHandler);
tenantRoutes.post('/users/:userId/empresas', requireTenantAccessUpdate, grantUserEmpresaAccessHandler);
tenantRoutes.delete(
  '/users/:userId/empresas/:empresaId',
  requireTenantAccessUpdate,
  revokeUserEmpresaAccessHandler
);
tenantRoutes.post('/users/:userId/contratos', requireTenantAccessUpdate, grantUserContratoAccessHandler);
tenantRoutes.delete(
  '/users/:userId/contratos/:contratoId',
  requireTenantAccessUpdate,
  revokeUserContratoAccessHandler
);

function hasTenantAccessPermission(req: import('express').Request, permission: 'tenant.access.read' | 'tenant.access.update'): boolean {
  return (
    req.user?.roles.includes('ADMINISTRADOR') === true ||
    req.user?.permissions.includes(permission) === true ||
    (permission === 'tenant.access.read' && req.user?.permissions.includes('tenant.access.update') === true)
  );
}

function requireTenantAccessRead(req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction): void {
  if (!req.user) {
    next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    return;
  }

  if (!hasTenantAccessPermission(req, 'tenant.access.read')) {
    next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    return;
  }

  next();
}

function requireTenantAccessUpdate(req: import('express').Request, _res: import('express').Response, next: import('express').NextFunction): void {
  if (!req.user) {
    next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    return;
  }

  if (!hasTenantAccessPermission(req, 'tenant.access.update')) {
    next(new AppError('Insufficient permissions', 403, 'FORBIDDEN'));
    return;
  }

  next();
}

export { tenantRoutes };
