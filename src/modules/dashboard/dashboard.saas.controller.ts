import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getDashboardSaas } from './dashboard.saas.service';

const ensureAuthenticated = (req: Request): void => {
  if (!req.user?.userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
};

export const getDashboardSaasHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);

  if (!req.tenant) {
    throw new AppError('Tenant context is required', 500, 'TENANT_CONTEXT_MISSING');
  }

  const data = await getDashboardSaas(req.tenant);

  return successResponse(res, {
    message: 'SaaS dashboard retrieved successfully',
    data
  });
});
