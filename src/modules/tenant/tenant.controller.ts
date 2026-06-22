import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
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
  getUserAccess,
  grantUserContratoAccess,
  grantUserEmpresaAccess,
  revokeUserContratoAccess,
  revokeUserEmpresaAccess
} from './tenant.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getTenantMeHandler = asyncHandler(async (req: Request, res: Response) => {
  return successResponse(res, {
    message: 'Tenant context retrieved successfully',
    data: req.tenant ?? {
      contratoIds: [],
      empresaIds: [],
      isGlobalAdmin: false
    }
  });
});

export const getUserAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const access = await getUserAccess(String(userId));

  return successResponse(res, {
    message: 'User tenant access retrieved successfully',
    data: access
  });
});

export const grantUserEmpresaAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const input = tenantEmpresaAccessSchema.parse(req.body);
  const access = await grantUserEmpresaAccess(String(userId), input.empresa_id, getActorUserId(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Company access granted successfully',
    data: access
  });
});

export const revokeUserEmpresaAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const { empresaId } = tenantEmpresaAccessParamSchema.parse(req.params);
  const access = await revokeUserEmpresaAccess(String(userId), empresaId, getActorUserId(req));

  return successResponse(res, {
    message: 'Company access revoked successfully',
    data: access
  });
});

export const grantUserContratoAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const input = tenantContratoAccessSchema.parse(req.body);
  const access = await grantUserContratoAccess(String(userId), input.contrato_id, getActorUserId(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Contract access granted successfully',
    data: access
  });
});

export const revokeUserContratoAccessHandler = asyncHandler(async (req: Request, res: Response) => {
  const { userId } = tenantUserIdParamSchema.parse(req.params);
  const { contratoId } = tenantContratoAccessParamSchema.parse(req.params);

  const access = await revokeUserContratoAccess(String(userId), contratoId, getActorUserId(req));

  return successResponse(res, {
    message: 'Contract access revoked successfully',
    data: access
  });
});
