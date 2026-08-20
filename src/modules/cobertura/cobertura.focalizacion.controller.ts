import { Request, Response } from 'express';

import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { sendExcelResponse } from '../reportes/reportes.excel';
import {
  buildFocalizacionImportReport,
  buildFocalizacionImportTemplate,
  createManualFocalizacionAdjustment,
  getFocalizacionImportDetail,
  listFocalizacionImportaciones,
  reprocessHistoricalFocalizacionImport,
  uploadHistoricalFocalizacionFile,
} from './cobertura.focalizacion.service';
import {
  focalizacionImportDetailQuerySchema,
  focalizacionImportIdParamSchema,
  focalizacionImportListQuerySchema,
  focalizacionImportReprocessSchema,
  focalizacionImportUploadSchema,
  focalizacionManualAdjustmentSchema,
} from './cobertura.focalizacion.schemas';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const downloadFocalizacionImportTemplateHandler = asyncHandler(
  async (_req: Request, res: Response) => {
    return sendExcelResponse(res, 'plantilla-focalizacion-empiria', buildFocalizacionImportTemplate());
  },
);

export const uploadHistoricalFocalizacionHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file?.buffer) {
    throw new AppError('Debes adjuntar un archivo XLSX/XLS para importar focalizacion.', 422, 'FILE_REQUIRED');
  }

  const input = focalizacionImportUploadSchema.parse(req.body);
  const result = await uploadHistoricalFocalizacionFile(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype ?? null,
    getActorUserId(req),
    input.contrato_id,
    req.tenant,
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Focalizacion historica procesada correctamente',
    data: result,
  });
});

export const listFocalizacionImportacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = focalizacionImportListQuerySchema.parse(req.query);
  const result = await listFocalizacionImportaciones(query.contrato_id, req.tenant);

  return successResponse(res, {
    message: 'Focalizacion imports retrieved successfully',
    data: result,
  });
});

export const getFocalizacionImportDetailHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = focalizacionImportIdParamSchema.parse(req.params);
  const query = focalizacionImportDetailQuerySchema.parse(req.query);
  const result = await getFocalizacionImportDetail(id, query.page, query.limit, query.filter, req.tenant);

  return successResponse(res, {
    message: 'Focalizacion import detail retrieved successfully',
    data: result,
  });
});

export const downloadFocalizacionImportReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = focalizacionImportIdParamSchema.parse(req.params);
  const buffer = await buildFocalizacionImportReport(id, req.tenant);

  return sendExcelResponse(res, `resultado-focalizacion-${id}`, buffer);
});


export const reprocessFocalizacionImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = focalizacionImportIdParamSchema.parse(req.params);
  const input = focalizacionImportReprocessSchema.parse(req.body ?? {});
  const result = await reprocessHistoricalFocalizacionImport(id, getActorUserId(req), input, req.tenant);

  return successResponse(res, {
    message: 'Focalizacion historica reprocesada correctamente',
    data: result,
  });
});

export const createManualFocalizacionAdjustmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = focalizacionManualAdjustmentSchema.parse(req.body);
  const result = await createManualFocalizacionAdjustment(
    getActorUserId(req),
    input,
    req.tenant,
    req.file?.buffer
      ? {
          buffer: req.file.buffer,
          mimeType: req.file.mimetype ?? null,
          originalName: req.file.originalname,
        }
      : null,
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Ajuste manual de focalizacion creado correctamente',
    data: result,
  });
});
