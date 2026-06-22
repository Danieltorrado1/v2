import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createPlantillaSchema,
  generarPlantillaDocumentoSchema,
  plantillaIdParamSchema,
  previewPlantillaDocumentoSchema,
  updatePlantillaSchema,
  vinculacionIdParamSchema
} from './plantillas.schemas';
import {
  createPlantilla,
  generatePlantillaDocumentoForVinculacion,
  generatePlantillaPdfForVinculacion,
  generatePlantillaForVinculacion,
  getPlantillaById,
  listDocumentosGeneradosByVinculacion,
  listPlantillas,
  previewPlantillaForVinculacion,
  updatePlantilla
} from './plantillas.service';

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

const ensurePermission = (req: Request, permission: string): void => {
  if (!req.user?.permissions.includes(permission)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
};

export const getPlantillasHandler = asyncHandler(async (_req: Request, res: Response) => {
  const plantillas = await listPlantillas();

  return successResponse(res, {
    message: 'Plantillas retrieved successfully',
    data: plantillas
  });
});

export const getPlantillaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = plantillaIdParamSchema.parse(req.params);
  const plantilla = await getPlantillaById(id);

  if (!plantilla) {
    throw new AppError('Plantilla not found', 404, 'PLANTILLA_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'Plantilla retrieved successfully',
    data: plantilla
  });
});

export const createPlantillaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createPlantillaSchema.parse(req.body);
  const plantilla = await createPlantilla(input, getActorUserId(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Plantilla created successfully',
    data: plantilla
  });
});

export const updatePlantillaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = plantillaIdParamSchema.parse(req.params);
  const input = updatePlantillaSchema.parse(req.body);
  const plantilla = await updatePlantilla(id, input, getActorUserId(req));

  return successResponse(res, {
    message: 'Plantilla updated successfully',
    data: plantilla
  });
});

export const generarPlantillaVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = plantillaIdParamSchema.parse(req.params);
  const { vinculacion_id } = vinculacionIdParamSchema.parse(req.params);
  const result = await generatePlantillaForVinculacion(id, vinculacion_id, getActorUserId(req), req.tenant);

  return successResponse(res, {
    statusCode: 201,
    message: 'Plantilla generated successfully',
    data: result
  });
});

export const previewPlantillaVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = plantillaIdParamSchema.parse(req.params);
  const { vinculacion_id } = vinculacionIdParamSchema.parse(req.params);
  previewPlantillaDocumentoSchema.parse(req.body ?? {});
  const result = await previewPlantillaForVinculacion(id, vinculacion_id, req.tenant);

  return successResponse(res, {
    message: 'Plantilla preview generated successfully',
    data: result
  });
});

export const generarPlantillaDocumentoVinculacionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = plantillaIdParamSchema.parse(req.params);
    const { vinculacion_id } = vinculacionIdParamSchema.parse(req.params);
    const input = generarPlantillaDocumentoSchema.parse(req.body);

    if (input.registrar_documento_vinculacion) {
      ensurePermission(req, 'documentos.upload');
    }

    const result = await generatePlantillaDocumentoForVinculacion(
      id,
      vinculacion_id,
      input,
      getActorUserId(req),
      req.tenant
    );

    return successResponse(res, {
      statusCode: 201,
      message: 'Plantilla generated and document registered successfully',
      data: result
    });
  }
);

export const generarPlantillaPdfVinculacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = plantillaIdParamSchema.parse(req.params);
  const { vinculacion_id } = vinculacionIdParamSchema.parse(req.params);
  const input = generarPlantillaDocumentoSchema.parse(req.body);

  ensurePermission(req, 'documentos.upload');

  const result = await generatePlantillaPdfForVinculacion(
    id,
    vinculacion_id,
    input,
    getActorUserId(req),
    req.tenant
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Plantilla generated and PDF document registered successfully',
    data: result
  });
});

export const getPlantillasGeneradasByVinculacionHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { vinculacion_id } = vinculacionIdParamSchema.parse(req.params);
    const generated = await listDocumentosGeneradosByVinculacion(vinculacion_id, req.tenant);

    return successResponse(res, {
      message: 'Generated documents retrieved successfully',
      data: generated
    });
  }
);
