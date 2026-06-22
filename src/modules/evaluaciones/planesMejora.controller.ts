import { Request, Response } from 'express';

import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createPlanMejoraSchema,
  createSeguimientoSchema,
  dashboardPlanesMejoraQuerySchema,
  listPlanesMejoraQuerySchema,
  planMejoraParamSchema,
  updatePlanMejoraSchema,
  updateSeguimientoSchema
} from './planesMejora.schemas';
import {
  createPlanMejora,
  createSeguimiento,
  deactivatePlanMejora,
  deactivateSeguimiento,
  getPlanesMejoraAlertas,
  getPlanesMejoraDashboard,
  listPlanesMejora,
  listSeguimientos,
  updatePlanMejora,
  updateSeguimiento
} from './planesMejora.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getPlanesMejoraHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listPlanesMejoraQuerySchema.parse(req.query);
  const result = await listPlanesMejora(query, req.tenant);

  return successResponse(res, { message: 'Planes de mejora retrieved successfully', data: result });
});

export const createPlanMejoraHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createPlanMejoraSchema.parse(req.body);
  const result = await createPlanMejora(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Plan de mejora created successfully',
    statusCode: 201,
    data: result
  });
});

export const updatePlanMejoraHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = planMejoraParamSchema.parse(req.params);
  const input = updatePlanMejoraSchema.parse(req.body);
  const result = await updatePlanMejora(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, { message: 'Plan de mejora updated successfully', data: result });
});

export const deactivatePlanMejoraHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = planMejoraParamSchema.parse(req.params);
  const result = await deactivatePlanMejora(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, { message: 'Plan de mejora deactivated successfully', data: result });
});

export const getSeguimientosHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = planMejoraParamSchema.parse(req.params);
  const result = await listSeguimientos(id, req.tenant);

  return successResponse(res, { message: 'Plan de mejora seguimientos retrieved successfully', data: result });
});

export const createSeguimientoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSeguimientoSchema.parse(req.body);
  const result = await createSeguimiento(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Plan de mejora seguimiento created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSeguimientoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = planMejoraParamSchema.parse(req.params);
  const input = updateSeguimientoSchema.parse(req.body);
  const result = await updateSeguimiento(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, { message: 'Plan de mejora seguimiento updated successfully', data: result });
});

export const deactivateSeguimientoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = planMejoraParamSchema.parse(req.params);
  const result = await deactivateSeguimiento(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, { message: 'Plan de mejora seguimiento deactivated successfully', data: result });
});

export const getPlanesMejoraDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = dashboardPlanesMejoraQuerySchema.parse(req.query);
  const result = await getPlanesMejoraDashboard(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, { message: 'Planes de mejora dashboard retrieved successfully', data: result });
});

export const getPlanesMejoraAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = dashboardPlanesMejoraQuerySchema.parse(req.query);
  const result = await getPlanesMejoraAlertas(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, { message: 'Planes de mejora alerts retrieved successfully', data: result });
});
