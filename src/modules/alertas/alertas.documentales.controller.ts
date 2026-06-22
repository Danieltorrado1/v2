import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  alertaDocumentalIdParamSchema,
  generateAlertasDocumentalesSchema,
  listAlertasDocumentalesQuerySchema
} from './alertas.documentales.schemas';
import {
  generateAlertasDocumentales,
  getAlertaDocumentalById,
  ignoreAlertaDocumental,
  listAlertasDocumentales,
  resolveAlertaDocumental
} from './alertas.documentales.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

const getTenantContext = (req: Request) => {
  if (!req.tenant) {
    throw new AppError('Tenant context is required', 500, 'TENANT_CONTEXT_MISSING');
  }

  return req.tenant;
};

export const getAlertasDocumentalesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listAlertasDocumentalesQuerySchema.parse(req.query);
  const result = await listAlertasDocumentales(filters, getTenantContext(req));

  return successResponse(res, {
    message: 'Document alerts retrieved successfully',
    data: result
  });
});

export const generateAlertasDocumentalesHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = generateAlertasDocumentalesSchema.parse(req.body ?? {});
  const result = await generateAlertasDocumentales(
    input,
    getActorUserId(req),
    getTenantContext(req),
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Document alerts generated successfully',
    statusCode: 201,
    data: result
  });
});

export const resolveAlertaDocumentalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = alertaDocumentalIdParamSchema.parse(req.params);
  const alerta = await resolveAlertaDocumental(
    id,
    getActorUserId(req),
    getTenantContext(req),
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Document alert resolved successfully',
    data: alerta
  });
});

export const ignoreAlertaDocumentalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = alertaDocumentalIdParamSchema.parse(req.params);
  const alerta = await ignoreAlertaDocumental(
    id,
    getActorUserId(req),
    getTenantContext(req),
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Document alert ignored successfully',
    data: alerta
  });
});
