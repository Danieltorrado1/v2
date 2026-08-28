import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import type { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  tenantContratoAccessParamSchema,
  tenantContratoAccessSchema,
  tenantEmpresaAccessParamSchema,
  tenantEmpresaAccessSchema,
  tenantUserIdParamSchema
} from './tenant.schemas';
import {
  getTenantMeContext,
  getUserAccess,
  grantUserContratoAccess,
  grantUserEmpresaAccess,
  revokeUserContratoAccess,
  revokeUserEmpresaAccess
} from './tenant.service';

const getActor = (req: Request): { tenant: TenantAccessContext; userId: string } => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  if (!req.tenant) {
    throw new AppError('Tenant context is required', 500, 'TENANT_CONTEXT_MISSING');
  }

  return { userId, tenant: req.tenant };
};

export const getTenantMeHandler = asyncHandler(async (req: Request, res: Response) => {
  const tenant = req.tenant ?? { contratoIds: [], empresaIds: [], isGlobalAdmin: false, roleNames: [] };
  const context = await getTenantMeContext(tenant);

  return successResponse(res, {
    message: 'Tenant context retrieved successfully',
    data: context
  });
});

export const getUserAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const access = await getUserAccess(String(userId), getActor(req));

  return successResponse(res, {
    message: 'User tenant access retrieved successfully',
    data: access
  });
});

export const grantUserEmpresaAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const input = tenantEmpresaAccessSchema.parse(req.body);
  const access = await grantUserEmpresaAccess(String(userId), input.empresa_id, getActor(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Company access granted successfully',
    data: access
  });
});

export const revokeUserEmpresaAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const { empresaId } = tenantEmpresaAccessParamSchema.parse(req.params);
  const access = await revokeUserEmpresaAccess(String(userId), empresaId, getActor(req));

  return successResponse(res, {
    message: 'Company access revoked successfully',
    data: access
  });
});

export const grantUserContratoAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const input = tenantContratoAccessSchema.parse(req.body);
  const access = await grantUserContratoAccess(String(userId), input.contrato_id, getActor(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Contract access granted successfully',
    data: access
  });
});

export const revokeUserContratoAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const { contratoId } = tenantContratoAccessParamSchema.parse(req.params);

  const access = await revokeUserContratoAccess(String(userId), contratoId, getActor(req));

  return successResponse(res, {
    message: 'Contract access revoked successfully',
    data: access
  });
});
