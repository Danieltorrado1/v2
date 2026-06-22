import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  coberturaAsignacionIdParamSchema,
  coberturaResumenQuerySchema,
  contratoIdParamSchema,
  createCoberturaAsignacionSchema,
  createCoberturaNovedadSchema,
  sedeModalidadIdParamSchema,
  updateCoberturaAsignacionSchema
} from './cobertura.schemas';
import {
  createCoberturaAsignacion,
  createCoberturaNovedad,
  deactivateCoberturaAsignacion,
  getCoberturaContratoDetalle,
  getCoberturaFaltantes,
  getCoberturaResumen,
  getCoberturaSedeModalidadDetalle,
  getCoberturaSobrecobertura,
  recalculateCobertura,
  updateCoberturaAsignacion
} from './cobertura.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getCoberturaResumenHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = coberturaResumenQuerySchema.parse(req.query);
  const result = await getCoberturaResumen(query);

  return successResponse(res, {
    message: 'Cobertura summary retrieved successfully',
    data: result
  });
});

export const getCoberturaContratoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contrato_id } = contratoIdParamSchema.parse(req.params);
  const result = await getCoberturaContratoDetalle(contrato_id);

  return successResponse(res, {
    message: 'Cobertura contract detail retrieved successfully',
    data: result
  });
});

export const getCoberturaSedeModalidadHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sedeModalidadIdParamSchema.parse(req.params);
  const result = await getCoberturaSedeModalidadDetalle(id);

  return successResponse(res, {
    message: 'Cobertura sede-modalidad detail retrieved successfully',
    data: result
  });
});

export const getCoberturaFaltantesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = coberturaResumenQuerySchema.parse(req.query);
  const result = await getCoberturaFaltantes(query);

  return successResponse(res, {
    message: 'Cobertura faltantes retrieved successfully',
    data: result
  });
});

export const getCoberturaSobrecoberturaHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = coberturaResumenQuerySchema.parse(req.query);
  const result = await getCoberturaSobrecobertura(query);

  return successResponse(res, {
    message: 'Cobertura sobrecobertura retrieved successfully',
    data: result
  });
});

export const recalculateCoberturaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { contrato_id } = contratoIdParamSchema.parse(req.params);
  const result = await recalculateCobertura(contrato_id, getActorUserId(req));

  return successResponse(res, {
    message: 'Cobertura recalculated successfully',
    data: result
  });
});

export const createCoberturaAsignacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createCoberturaAsignacionSchema.parse(req.body);
  const result = await createCoberturaAsignacion(input, getActorUserId(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Cobertura assignment created successfully',
    data: result
  });
});

export const updateCoberturaAsignacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = coberturaAsignacionIdParamSchema.parse(req.params);
  const input = updateCoberturaAsignacionSchema.parse(req.body);
  const result = await updateCoberturaAsignacion(id, input, getActorUserId(req));

  return successResponse(res, {
    message: 'Cobertura assignment updated successfully',
    data: result
  });
});

export const deactivateCoberturaAsignacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = coberturaAsignacionIdParamSchema.parse(req.params);
  const result = await deactivateCoberturaAsignacion(id, getActorUserId(req));

  return successResponse(res, {
    message: 'Cobertura assignment deactivated successfully',
    data: result
  });
});

export const createCoberturaNovedadHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createCoberturaNovedadSchema.parse(req.body);
  const result = await createCoberturaNovedad(input, getActorUserId(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Cobertura novedad created successfully',
    data: result
  });
});
