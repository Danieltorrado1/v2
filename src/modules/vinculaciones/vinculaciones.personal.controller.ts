import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  contratoPersonalIdQuerySchema,
  createAsignacionLaboralSchema,
  createPresentacionLicitacionSchema,
  updateAsignacionLaboralSchema,
  updatePresentacionLicitacionSchema,
  vinculacionAsignacionLaboralParamSchema,
  vinculacionPersonalIdParamSchema,
  vinculacionPresentacionLicitacionParamSchema
} from './vinculaciones.personal.schemas';
import {
  createAsignacionLaboral,
  createPresentacionLicitacion,
  getContratoLicitacionResumen,
  getVinculacionPersonalContext,
  listAsignacionesLaboralesByVinculacion,
  listAsignacionesOperativasByVinculacion,
  listPresentacionesLicitacionByVinculacion,
  updateAsignacionLaboral,
  updatePresentacionLicitacion
} from './vinculaciones.personal.service';

const getActorUserId = (req: Request): number => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const numericUserId = Number(userId);

  if (!Number.isFinite(numericUserId)) {
    throw new AppError('Authenticated user id is invalid', 400, 'INVALID_USER_ID');
  }

  return numericUserId;
};

export const getVinculacionPersonalContextHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionPersonalIdParamSchema.parse(req.params);
  const data = await getVinculacionPersonalContext(id, req.tenant);

  return successResponse(res, {
    message: 'Vinculacion personal context retrieved successfully',
    data
  });
});

export const getAsignacionesOperativasByVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionPersonalIdParamSchema.parse(req.params);
  const data = await listAsignacionesOperativasByVinculacion(id, req.tenant);

  return successResponse(res, {
    message: 'Asignaciones operativas retrieved successfully',
    data
  });
});

export const getAsignacionesLaboralesByVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionPersonalIdParamSchema.parse(req.params);
  const data = await listAsignacionesLaboralesByVinculacion(id, req.tenant);

  return successResponse(res, {
    message: 'Asignaciones laborales retrieved successfully',
    data
  });
});

export const createAsignacionLaboralHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionPersonalIdParamSchema.parse(req.params);
  const input = createAsignacionLaboralSchema.parse(req.body);
  const data = await createAsignacionLaboral(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    statusCode: 201,
    message: 'Asignacion laboral created successfully',
    data
  });
});

export const updateAsignacionLaboralHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, asignacionId } = vinculacionAsignacionLaboralParamSchema.parse(req.params);
  const input = updateAsignacionLaboralSchema.parse(req.body);
  const data = await updateAsignacionLaboral(id, asignacionId, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Asignacion laboral updated successfully',
    data
  });
});

export const getPresentacionesLicitacionByVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionPersonalIdParamSchema.parse(req.params);
  const data = await listPresentacionesLicitacionByVinculacion(id, req.tenant);

  return successResponse(res, {
    message: 'Presentaciones de licitacion retrieved successfully',
    data
  });
});

export const createPresentacionLicitacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionPersonalIdParamSchema.parse(req.params);
  const input = createPresentacionLicitacionSchema.parse(req.body);
  const data = await createPresentacionLicitacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    statusCode: 201,
    message: 'Presentacion de licitacion created successfully',
    data
  });
});

export const updatePresentacionLicitacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, presentacionId } = vinculacionPresentacionLicitacionParamSchema.parse(req.params);
  const input = updatePresentacionLicitacionSchema.parse(req.body);
  const data = await updatePresentacionLicitacion(id, presentacionId, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Presentacion de licitacion updated successfully',
    data
  });
});

export const getContratoLicitacionResumenHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contrato_id } = contratoPersonalIdQuerySchema.parse(req.query);
  const data = await getContratoLicitacionResumen(contrato_id, req.tenant);

  return successResponse(res, {
    message: 'Contrato licitacion resumen retrieved successfully',
    data
  });
});
