import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  createPrimaSchema,
  listPrimasQuerySchema,
  primaAlertasQuerySchema,
  primaDashboardQuerySchema,
  primaIdParamSchema,
  updatePrimaSchema
} from './prima.schemas';
import {
  createPrima,
  deactivatePrima,
  getPrimaAlertas,
  getPrimaDashboard,
  listPrimas,
  payPrima,
  updatePrima
} from './prima.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getPrimasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listPrimasQuerySchema.parse(req.query);
  const result = await listPrimas(query, req.tenant);

  return successResponse(res, {
    message: 'Prima records retrieved successfully',
    data: result
  });
});

export const createPrimaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createPrimaSchema.parse(req.body);
  const result = await createPrima(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Prima record created successfully',
    data: result
  });
});

export const updatePrimaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = primaIdParamSchema.parse(req.params);
  const input = updatePrimaSchema.parse(req.body);
  const result = await updatePrima(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Prima record updated successfully',
    data: result
  });
});

export const payPrimaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = primaIdParamSchema.parse(req.params);
  const result = await payPrima(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Prima record paid successfully',
    data: result
  });
});

export const deactivatePrimaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = primaIdParamSchema.parse(req.params);
  const result = await deactivatePrima(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Prima record deactivated successfully',
    data: result
  });
});

export const getPrimaDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = primaDashboardQuerySchema.parse(req.query);
  const result = await getPrimaDashboard(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Prima dashboard retrieved successfully',
    data: result
  });
});

export const getPrimaAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = primaAlertasQuerySchema.parse(req.query);
  const result = await getPrimaAlertas(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Prima alerts retrieved successfully',
    data: result
  });
});
