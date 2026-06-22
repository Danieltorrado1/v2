import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  importacionLoteIdParamSchema,
  listImportacionLotesQuerySchema
} from './importaciones.schemas';
import {
  cancelImportacionLote,
  confirmImportacionLote,
  getImportacionLoteById,
  getImportacionLoteErrores,
  listImportacionLotes,
  uploadPersonasVinculacionesExcel
} from './importaciones.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const uploadPersonasVinculaciones = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Excel file is required', 400, 'FILE_REQUIRED');
  }

  const result = await uploadPersonasVinculacionesExcel(
    req.file.buffer,
    req.file.originalname,
    getActorUserId(req)
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Import lote created successfully',
    data: result
  });
});

export const getImportacionLotes = asyncHandler(async (req: Request, res: Response) => {
  const query = listImportacionLotesQuerySchema.parse(req.query);
  const result = await listImportacionLotes(query);

  return successResponse(res, {
    message: 'Import lotes retrieved successfully',
    data: result
  });
});

export const getImportacionLote = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  const lote = await getImportacionLoteById(id);

  if (!lote) {
    throw new AppError('Import lote not found', 404, 'IMPORT_LOTE_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'Import lote retrieved successfully',
    data: lote
  });
});

export const getImportacionErrores = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  const errores = await getImportacionLoteErrores(id);

  return successResponse(res, {
    message: 'Import lote errors retrieved successfully',
    data: errores
  });
});

export const confirmarImportacion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  const result = await confirmImportacionLote(id, getActorUserId(req));

  return successResponse(res, {
    message: 'Import lote confirmed successfully',
    data: result
  });
});

export const cancelarImportacion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  const lote = await cancelImportacionLote(id, getActorUserId(req));

  return successResponse(res, {
    message: 'Import lote cancelled successfully',
    data: lote
  });
});
