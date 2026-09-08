import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getDashboardSaas, getGlobalAdminDashboard } from './dashboard.saas.service';

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

export const getGlobalAdminDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  ensureAuthenticated(req);
  if (!req.tenant?.isGlobalAdmin) throw new AppError('Global administrator required', 403, 'FORBIDDEN');
  return successResponse(res, { message: 'Global administrator dashboard retrieved successfully', data: await getGlobalAdminDashboard(req.tenant) });
});
