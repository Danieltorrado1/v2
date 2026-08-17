import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  anularContratoEventoSchema,
  contratoDocumentoAnularSchema,
  contratoDocumentoDevolverSchema,
  contratoDocumentoParamSchema,
  contratoDocumentoRevisionSchema,
  contratoDocumentoUploadSchema,
  contratoEventoListQuerySchema,
  contratoEventoParamSchema,
  contratoExcepcionParamSchema,
  contratoIdParamSchema,
  createContratoEventoSchema,
  createContratoExcepcionSchema,
  regularizarContratoExcepcionSchema,
  revocarContratoExcepcionSchema
} from './contratos.schemas';
import {
  anularContratoDocumento,
  anularContratoEvento,
  createContratoEvento,
  createContratoExcepcion,
  devolverContratoDocumento,
  getContratoAlertas,
  getContratoChecklist,
  getContratoContractualDetail,
  getContratoDocumentoDownloadUrl,
  getContratoEventos,
  getContratoExcepciones,
  getContratoExpediente,
  regularizarContratoExcepcion,
  reviewContratoDocumento,
  revocarContratoExcepcion,
  uploadContratoDocumento
} from './contratos.service';

const getActor = (req: Request) => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  const auditMeta = getAuditRequestMeta(req);
  return {
    userId: String(userId),
    ip: auditMeta.ip ?? null,
    userAgent: auditMeta.user_agent ?? null
  };
};

export const getContratoDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  const data = await getContratoContractualDetail(id, req.tenant);
  return successResponse(res, { message: 'Contrato detail retrieved successfully', data });
});

export const getContratoExpedienteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  const data = await getContratoExpediente(id, req.tenant);
  return successResponse(res, { message: 'Contrato expediente retrieved successfully', data });
});

export const getContratoChecklistHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  const data = await getContratoChecklist(id, req.tenant);
  return successResponse(res, { message: 'Contrato checklist retrieved successfully', data });
});

export const getContratoEventosHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  const query = contratoEventoListQuerySchema.parse(req.query);
  const data = await getContratoEventos(id, query, req.tenant);
  return successResponse(res, { message: 'Contrato events retrieved successfully', data });
});

export const createContratoEventoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  const input = createContratoEventoSchema.parse(req.body);
  const data = await createContratoEvento(id, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato event created successfully', statusCode: 201, data });
});

export const anularContratoEventoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, eventoId } = contratoEventoParamSchema.parse(req.params);
  const input = anularContratoEventoSchema.parse(req.body);
  const data = await anularContratoEvento(id, eventoId, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato event cancelled successfully', data });
});

export const uploadContratoDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  if (!req.file) {
    throw new AppError('Document file is required', 400, 'DOCUMENT_FILE_REQUIRED');
  }
  const input = contratoDocumentoUploadSchema.parse(req.body);
  const data = await uploadContratoDocumento(id, input, req.file, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato document uploaded successfully', statusCode: 201, data });
});

export const reviewContratoDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, documentoId } = contratoDocumentoParamSchema.parse(req.params);
  const input = contratoDocumentoRevisionSchema.parse(req.body);
  const data = await reviewContratoDocumento(id, documentoId, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato document reviewed successfully', data });
});

export const devolverContratoDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, documentoId } = contratoDocumentoParamSchema.parse(req.params);
  const input = contratoDocumentoDevolverSchema.parse(req.body);
  const data = await devolverContratoDocumento(id, documentoId, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato document returned successfully', data });
});

export const anularContratoDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, documentoId } = contratoDocumentoParamSchema.parse(req.params);
  const input = contratoDocumentoAnularSchema.parse(req.body);
  const data = await anularContratoDocumento(id, documentoId, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato document cancelled successfully', data });
});

export const getContratoDocumentoDownloadUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, documentoId } = contratoDocumentoParamSchema.parse(req.params);
  const data = await getContratoDocumentoDownloadUrl(id, documentoId, req.tenant);
  return successResponse(res, { message: 'Contrato document download URL created successfully', data });
});

export const getContratoExcepcionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  const data = await getContratoExcepciones(id, req.tenant);
  return successResponse(res, { message: 'Contrato exceptions retrieved successfully', data });
});

export const createContratoExcepcionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  const input = createContratoExcepcionSchema.parse(req.body);
  const data = await createContratoExcepcion(id, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato exception created successfully', statusCode: 201, data });
});

export const regularizarContratoExcepcionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, excepcionId } = contratoExcepcionParamSchema.parse(req.params);
  const input = regularizarContratoExcepcionSchema.parse(req.body);
  const data = await regularizarContratoExcepcion(id, excepcionId, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato exception regularized successfully', data });
});

export const revocarContratoExcepcionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id, excepcionId } = contratoExcepcionParamSchema.parse(req.params);
  const input = revocarContratoExcepcionSchema.parse(req.body);
  const data = await revocarContratoExcepcion(id, excepcionId, input, getActor(req), req.tenant);
  return successResponse(res, { message: 'Contrato exception revoked successfully', data });
});

export const getContratoAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = contratoIdParamSchema.parse(req.params);
  const data = await getContratoAlertas(id, req.tenant);
  return successResponse(res, { message: 'Contrato alerts retrieved successfully', data });
});
