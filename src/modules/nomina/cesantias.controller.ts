import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  cesantiaIdParamSchema,
  cesantiasAlertasQuerySchema,
  cesantiasDashboardQuerySchema,
  consignCesantiaSchema,
  createCesantiaSchema,
  listCesantiasQuerySchema,
  updateCesantiaSchema
} from './cesantias.schemas';
import {
  consignCesantia,
  createCesantia,
  deactivateCesantia,
  getCesantiasAlertas,
  getCesantiasDashboard,
  listCesantias,
  payCesantia,
  updateCesantia
} from './cesantias.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getCesantiasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listCesantiasQuerySchema.parse(req.query);
  const result = await listCesantias(query, req.tenant);

  return successResponse(res, {
    message: 'Cesantia records retrieved successfully',
    data: result
  });
});

export const createCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createCesantiaSchema.parse(req.body);
  const result = await createCesantia(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Cesantia record created successfully',
    data: result
  });
});

export const updateCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = cesantiaIdParamSchema.parse(req.params);
  const input = updateCesantiaSchema.parse(req.body);
  const result = await updateCesantia(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Cesantia record updated successfully',
    data: result
  });
});

export const consignCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = cesantiaIdParamSchema.parse(req.params);
  const input = consignCesantiaSchema.parse(req.body ?? {});
  const result = await consignCesantia(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Cesantia record consigned successfully',
    data: result
  });
});

export const payCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = cesantiaIdParamSchema.parse(req.params);
  const result = await payCesantia(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Cesantia record paid successfully',
    data: result
  });
});

export const deactivateCesantiaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = cesantiaIdParamSchema.parse(req.params);
  const result = await deactivateCesantia(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Cesantia record deactivated successfully',
    data: result
  });
});

export const getCesantiasDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = cesantiasDashboardQuerySchema.parse(req.query);
  const result = await getCesantiasDashboard(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Cesantias dashboard retrieved successfully',
    data: result
  });
});

export const getCesantiasAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = cesantiasAlertasQuerySchema.parse(req.query);
  const result = await getCesantiasAlertas(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Cesantias alerts retrieved successfully',
    data: result
  });
});
