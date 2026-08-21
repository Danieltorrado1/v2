import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  configuracionContratoParamSchema,
  configuracionPersonalEntityIdParamSchema,
  configuracionPersonalListQuerySchema,
  createContratoPerfilLicitacionSchema,
  createContratoUbicacionLaboralSchema,
  updateContratoPerfilLicitacionSchema,
  updateContratoUbicacionLaboralSchema
} from './configuracion.personal.schemas';
import {
  createContratoPerfilLicitacion,
  createContratoUbicacionLaboral,
  listContratoPerfilesLicitacion,
  listContratoUbicacionesLaborales,
  updateContratoPerfilLicitacion,
  updateContratoUbicacionLaboral
} from './configuracion.personal.service';

const getActor = (req: Request) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return {
    userId: String(userId),
    ip: req.ip ?? null,
    userAgent: req.get('user-agent') ?? null
  };
};

export const listContratoUbicacionesLaboralesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contratoId } = configuracionContratoParamSchema.parse(req.params);
  const query = configuracionPersonalListQuerySchema.parse(req.query);
  const data = await listContratoUbicacionesLaborales(contratoId, query, req.tenant);

  return successResponse(res, {
    message: 'Ubicaciones laborales retrieved successfully',
    data
  });
});

export const createContratoUbicacionLaboralHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contratoId } = configuracionContratoParamSchema.parse(req.params);
  const input = createContratoUbicacionLaboralSchema.parse(req.body);
  const data = await createContratoUbicacionLaboral(contratoId, input, getActor(req), req.tenant);

  return successResponse(res, {
    statusCode: 201,
    message: 'Ubicacion laboral created successfully',
    data
  });
});

export const updateContratoUbicacionLaboralHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contratoId } = configuracionContratoParamSchema.parse(req.params);
  const { id } = configuracionPersonalEntityIdParamSchema.parse(req.params);
  const input = updateContratoUbicacionLaboralSchema.parse(req.body);
  const data = await updateContratoUbicacionLaboral(contratoId, id, input, getActor(req), req.tenant);

  return successResponse(res, {
    message: 'Ubicacion laboral updated successfully',
    data
  });
});

export const listContratoPerfilesLicitacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contratoId } = configuracionContratoParamSchema.parse(req.params);
  const query = configuracionPersonalListQuerySchema.parse(req.query);
  const data = await listContratoPerfilesLicitacion(contratoId, query, req.tenant);

  return successResponse(res, {
    message: 'Perfiles de licitacion retrieved successfully',
    data
  });
});

export const createContratoPerfilLicitacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contratoId } = configuracionContratoParamSchema.parse(req.params);
  const input = createContratoPerfilLicitacionSchema.parse(req.body);
  const data = await createContratoPerfilLicitacion(contratoId, input, getActor(req), req.tenant);

  return successResponse(res, {
    statusCode: 201,
    message: 'Perfil de licitacion created successfully',
    data
  });
});

export const updateContratoPerfilLicitacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contratoId } = configuracionContratoParamSchema.parse(req.params);
  const { id } = configuracionPersonalEntityIdParamSchema.parse(req.params);
  const input = updateContratoPerfilLicitacionSchema.parse(req.body);
  const data = await updateContratoPerfilLicitacion(contratoId, id, input, getActor(req), req.tenant);

  return successResponse(res, {
    message: 'Perfil de licitacion updated successfully',
    data
  });
});
