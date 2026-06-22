import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  documentoIdParamSchema,
  personaIdNumericParamSchema,
  personaIdParamSchema,
  testDocumentoPersonaSchema,
  updateDocumentoSchema,
  uploadDocumentoSchema,
  vinculacionIdParamSchema
} from './documentos.schemas';
import {
  createTestPersonaDocumento,
  deactivatePersonaDocumento,
  deactivateVinculacionDocumento,
  getDocumentoDownloadUrl,
  getVinculacionChecklist,
  listPersonaDocumentosForValidation,
  listPersonaDocumentos,
  listVinculacionDocumentos,
  updatePersonaDocumento,
  updateVinculacionDocumento,
  uploadPersonaDocumento,
  uploadVinculacionDocumento
} from './documentos.service';
import { ensureFileProvided } from './documentos.validator';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const uploadPersonaDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { persona_id } = personaIdParamSchema.parse(req.params);
  const input = uploadDocumentoSchema.parse(req.body);
  const file = ensureFileProvided(req.file);
  const document = await uploadPersonaDocumento(persona_id, file, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    statusCode: 201,
    message: 'Documento de persona uploaded successfully',
    data: document
  });
});

export const uploadVinculacionDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { vinculacion_id } = vinculacionIdParamSchema.parse(req.params);
  const input = uploadDocumentoSchema.parse(req.body);
  const file = ensureFileProvided(req.file);
  const document = await uploadVinculacionDocumento(
    vinculacion_id,
    file,
    input,
    getActorUserId(req),
    req.tenant
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Documento de vinculacion uploaded successfully',
    data: document
  });
});

export const getPersonaDocumentosHandler = asyncHandler(async (req: Request, res: Response) => {
  const { personaId } = personaIdNumericParamSchema.parse(req.params);
  const documents = await listPersonaDocumentosForValidation(personaId, req.tenant);

  return successResponse(res, {
    message: 'Documentos de persona retrieved successfully',
    data: documents
  });
});

export const createTestDocumentoPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = testDocumentoPersonaSchema.parse(req.body);
  const document = await createTestPersonaDocumento(input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    statusCode: 201,
    message: 'Documento de prueba created successfully',
    data: document
  });
});

export const getVinculacionDocumentosHandler = asyncHandler(async (req: Request, res: Response) => {
  const { vinculacion_id } = vinculacionIdParamSchema.parse(req.params);
  const documents = await listVinculacionDocumentos(vinculacion_id, req.tenant);

  return successResponse(res, {
    message: 'Documentos de vinculacion retrieved successfully',
    data: documents
  });
});

export const getVinculacionChecklistHandler = asyncHandler(async (req: Request, res: Response) => {
  const { vinculacion_id } = vinculacionIdParamSchema.parse(req.params);
  const checklist = await getVinculacionChecklist(vinculacion_id, req.tenant);

  return successResponse(res, {
    message: 'Checklist documental retrieved successfully',
    data: checklist
  });
});

export const getDocumentoDownloadUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = documentoIdParamSchema.parse(req.params);
  const downloadInfo = await getDocumentoDownloadUrl(id, req.tenant);

  return successResponse(res, {
    message: 'Signed download URL generated successfully',
    data: downloadInfo
  });
});

export const updatePersonaDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = documentoIdParamSchema.parse(req.params);
  const input = updateDocumentoSchema.parse(req.body);
  const document = await updatePersonaDocumento(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Documento de persona updated successfully',
    data: document
  });
});

export const updateVinculacionDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = documentoIdParamSchema.parse(req.params);
  const input = updateDocumentoSchema.parse(req.body);
  const document = await updateVinculacionDocumento(id, input, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Documento de vinculacion updated successfully',
    data: document
  });
});

export const deactivatePersonaDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = documentoIdParamSchema.parse(req.params);
  const document = await deactivatePersonaDocumento(id, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Documento de persona deactivated successfully',
    data: document
  });
});

export const deactivateVinculacionDocumentoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = documentoIdParamSchema.parse(req.params);
  const document = await deactivateVinculacionDocumento(id, getActorUserId(req), req.tenant);

  return successResponse(res, {
    message: 'Documento de vinculacion deactivated successfully',
    data: document
  });
});
