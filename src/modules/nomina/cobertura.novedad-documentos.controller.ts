import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { successResponse } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import { getNovedadSupport, uploadNovedadSupport } from './cobertura.novedad-documentos';

const noveltyId = (req: Request) => {
  const value = Number(req.params.id);
  if (!Number.isInteger(value) || value <= 0) throw new AppError('Novedad inválida', 400, 'NOMINA_NOVEDAD_ID_INVALID');
  return value;
};
const actor = (req: Request) => {
  if (!req.user?.userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  return String(req.user.userId);
};

export const getNovedadSupportHandler = asyncHandler(async (req: Request, res: Response) => successResponse(res, { data: await getNovedadSupport(noveltyId(req), req.tenant), message: 'Novedad support retrieved successfully' }));
export const uploadNovedadSupportHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('Archivo requerido', 400, 'FILE_REQUIRED');
  return successResponse(res, { statusCode: 201, data: await uploadNovedadSupport(noveltyId(req), req.file, actor(req), req.tenant, { ip: req.ip, user_agent: req.get('user-agent') }), message: 'Novedad support uploaded successfully' });
});
