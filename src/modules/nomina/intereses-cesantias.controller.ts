import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  createInteresesCesantiaSchema,
  interesesCesantiaIdParamSchema,
  interesesCesantiasAlertasQuerySchema,
  interesesCesantiasDashboardQuerySchema,
  listInteresesCesantiasQuerySchema,
  updateInteresesCesantiaSchema
} from './intereses-cesantias.schemas';
import {
  createInteresesCesantia,
  deactivateInteresesCesantia,
  getInteresesCesantiasAlertas,
  getInteresesCesantiasDashboard,
  listInteresesCesantias,
  payInteresesCesantia,
  updateInteresesCesantia
} from './intereses-cesantias.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getInteresesCesantiasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listInteresesCesantiasQuerySchema.parse(req.query);
  const result = await listInteresesCesantias(query, req.tenant);

  return successResponse(res, {
    message: 'Intereses cesantias records retrieved successfully',
    data: result
  });
});

export const createInteresesCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createInteresesCesantiaSchema.parse(req.body);
  const result = await createInteresesCesantia(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Intereses cesantias record created successfully',
    data: result
  });
});

export const updateInteresesCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = interesesCesantiaIdParamSchema.parse(req.params);
  const input = updateInteresesCesantiaSchema.parse(req.body);
  const result = await updateInteresesCesantia(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Intereses cesantias record updated successfully',
    data: result
  });
});

export const payInteresesCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = interesesCesantiaIdParamSchema.parse(req.params);
  const result = await payInteresesCesantia(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Intereses cesantias record paid successfully',
    data: result
  });
});

export const deactivateInteresesCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = interesesCesantiaIdParamSchema.parse(req.params);
  const result = await deactivateInteresesCesantia(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Intereses cesantias record deactivated successfully',
    data: result
  });
});

export const getInteresesCesantiasDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = interesesCesantiasDashboardQuerySchema.parse(req.query);
  const result = await getInteresesCesantiasDashboard(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Intereses cesantias dashboard retrieved successfully',
    data: result
  });
});

export const getInteresesCesantiasAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = interesesCesantiasAlertasQuerySchema.parse(req.query);
  const result = await getInteresesCesantiasAlertas(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Intereses cesantias alerts retrieved successfully',
    data: result
  });
});
