import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { TenantAccessContext } from '../../middlewares/tenantMiddleware';
import {
  createVinculacionSchema,
  listVinculacionesQuerySchema,
  reactivarVinculacionSchema,
  retirarVinculacionSchema,
  suspenderVinculacionSchema,
  updateVinculacionSchema,
  vinculacionIdParamSchema,
  vinculacionPersonaParamSchema
} from './vinculaciones.schemas';
import {
  createVinculacion,
  getVinculacionExpediente,
  getVinculacionById,
  getVinculacionesByPersonaId,
  listVinculaciones,
  reactivarVinculacion,
  retirarVinculacion,
  suspenderVinculacion,
  updateVinculacion
} from './vinculaciones.service';

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

export const getVinculaciones = asyncHandler(async (req: Request, res: Response) => {
  const filters = listVinculacionesQuerySchema.parse(req.query);
  const result = await listVinculaciones(filters, req.tenant);

  return successResponse(res, {
    message: 'Vinculaciones retrieved successfully',
    data: result
  });
});

export const getVinculacion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const vinculacion = await getVinculacionById(id, req.tenant);

  if (!vinculacion) {
    throw new AppError('Vinculacion not found', 404, 'VINCULACION_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'Vinculacion retrieved successfully',
    data: vinculacion
  });
});

export const getVinculacionExpedienteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const expediente = await getVinculacionExpediente(id, req.tenant);

  return successResponse(res, {
    message: 'Vinculacion expediente retrieved successfully',
    data: expediente
  });
});

export const getVinculacionesByPersona = asyncHandler(async (req: Request, res: Response) => {
  const { persona_id } = vinculacionPersonaParamSchema.parse(req.params) as { persona_id: number };
  const vinculaciones = await getVinculacionesByPersonaId(persona_id, req.tenant);

  return successResponse(res, {
    message: 'Vinculaciones retrieved successfully',
    data: vinculaciones
  });
});

export const createVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createVinculacionSchema.parse(req.body);
  const vinculacion = await createVinculacion(input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion created successfully',
    statusCode: 201,
    data: vinculacion
  });
});

export const updateVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const input = updateVinculacionSchema.parse(req.body);
  const vinculacion = await updateVinculacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion updated successfully',
    data: vinculacion
  });
});

export const retirarVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const input = retirarVinculacionSchema.parse(req.body);
  const vinculacion = await retirarVinculacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion retired successfully',
    data: vinculacion
  });
});

export const suspenderVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const input = suspenderVinculacionSchema.parse(req.body);
  const vinculacion = await suspenderVinculacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion suspended successfully',
    data: vinculacion
  });
});

export const reactivarVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vinculacionIdParamSchema.parse(req.params) as { id: number };
  const input = reactivarVinculacionSchema.parse(req.body);
  const vinculacion = await reactivarVinculacion(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Vinculacion reactivated successfully',
    data: vinculacion
  });
});
