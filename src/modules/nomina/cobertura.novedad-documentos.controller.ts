import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { successResponse } from '../../utils/apiResponse';
import { AppError } from '../../utils/AppError';
import {
  getNovedadDocument,
  getNovedadDocuments,
  getNovedadSupport,
  NOMINA_NOVEDAD_DOCUMENT_SLOTS,
  type NominaNovedadDocumentSlot,
  uploadNovedadDocument,
  uploadNovedadSupport,
} from './cobertura.novedad-documentos';

const noveltyId = (req: Request) => {
  const value = Number(req.params.id);
  if (!Number.isInteger(value) || value <= 0) throw new AppError('Novedad inválida', 400, 'NOMINA_NOVEDAD_ID_INVALID');
  return value;
};
const actor = (req: Request) => {
  if (!req.user?.userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  return String(req.user.userId);
};

const parseSlot = (req: Request): NominaNovedadDocumentSlot => {
  const rawValue =
    typeof req.params.tipo === 'string'
      ? req.params.tipo
      : typeof req.query.tipo === 'string'
        ? req.query.tipo
        : '';
  const normalized = rawValue.trim().toUpperCase();

  if ((NOMINA_NOVEDAD_DOCUMENT_SLOTS as readonly string[]).includes(normalized)) {
    return normalized as NominaNovedadDocumentSlot;
  }

  throw new AppError('Tipo documental inválido', 400, 'NOMINA_NOVEDAD_DOCUMENT_SLOT_INVALIDO');
};

export const getNovedadDocumentsHandler = asyncHandler(async (req: Request, res: Response) =>
  successResponse(res, {
    data: await getNovedadDocuments(noveltyId(req), req.tenant),
    message: 'Novedad documents retrieved successfully',
  })
);

export const getNovedadDocumentHandler = asyncHandler(async (req: Request, res: Response) =>
  successResponse(res, {
    data: await getNovedadDocument(noveltyId(req), parseSlot(req), req.tenant),
    message: 'Novedad document retrieved successfully',
  })
);

export const uploadNovedadDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('Archivo requerido', 400, 'FILE_REQUIRED');
  return successResponse(res, {
    statusCode: 201,
    data: await uploadNovedadDocument(
      noveltyId(req),
      parseSlot(req),
      req.file,
      actor(req),
      req.tenant,
      { ip: req.ip, user_agent: req.get('user-agent') }
    ),
    message: 'Novedad document uploaded successfully',
  });
});

export const getNovedadSupportHandler = asyncHandler(async (req: Request, res: Response) => successResponse(res, { data: await getNovedadSupport(noveltyId(req), req.tenant), message: 'Novedad support retrieved successfully' }));
export const uploadNovedadSupportHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('Archivo requerido', 400, 'FILE_REQUIRED');
  return successResponse(res, { statusCode: 201, data: await uploadNovedadSupport(noveltyId(req), req.file, actor(req), req.tenant, { ip: req.ip, user_agent: req.get('user-agent') }), message: 'Novedad support uploaded successfully' });
});
