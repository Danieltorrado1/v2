import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  importacionLoteIdParamSchema,
  importacionPreviewQuerySchema,
  listImportacionLotesQuerySchema,
  uploadPersonasVinculacionesSchema
} from './importaciones.schemas';
import {
  buildOperationalImportTemplateCsv,
  cancelImportacionLote,
  confirmImportacionLote,
  downloadImportacionReport,
  getImportacionLoteById,
  getImportacionLoteErrores,
  getImportacionPreview,
  listImportacionLotes,
  uploadPersonasVinculacionesExcel
} from './importaciones.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;
  if (!userId) throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  return userId;
};

export const downloadImportacionTemplate = asyncHandler(async (_req: Request, res: Response) => {
  const csv = buildOperationalImportTemplateCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="plantilla-importacion-personal.csv"');
  res.status(200).send(csv);
});

export const uploadPersonasVinculaciones = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) throw new AppError('Excel file is required', 400, 'FILE_REQUIRED');
  const input = uploadPersonasVinculacionesSchema.parse(req.body);
  const result = await uploadPersonasVinculacionesExcel(req.file.buffer, req.file.originalname, req.file.mimetype ?? null, getActorUserId(req), input.contrato_id, req.tenant);
  return successResponse(res, { statusCode: 201, message: 'Import lote created successfully', data: result });
});

export const getImportacionLotes = asyncHandler(async (req: Request, res: Response) => {
  const query = listImportacionLotesQuerySchema.parse(req.query);
  return successResponse(res, { message: 'Import lotes retrieved successfully', data: await listImportacionLotes(query, req.tenant) });
});

export const getImportacionLote = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  const lote = await getImportacionLoteById(id, req.tenant);
  if (!lote) throw new AppError('Import lote not found', 404, 'IMPORT_LOTE_NOT_FOUND');
  return successResponse(res, { message: 'Import lote retrieved successfully', data: lote });
});

export const getImportacionErrores = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  return successResponse(res, { message: 'Import lote errors retrieved successfully', data: await getImportacionLoteErrores(id, req.tenant) });
});

export const getImportacionPreviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  const query = importacionPreviewQuerySchema.parse(req.query);
  return successResponse(res, { message: 'Import lote preview retrieved successfully', data: await getImportacionPreview(id, query, req.tenant) });
});

export const downloadImportacionReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  const report = await downloadImportacionReport(id, req.tenant);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
  res.status(200).send(report.content);
});

export const confirmarImportacion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  return successResponse(res, { message: 'Import lote confirmed successfully', data: await confirmImportacionLote(id, getActorUserId(req), req.tenant) });
});

export const cancelarImportacion = asyncHandler(async (req: Request, res: Response) => {
  const { id } = importacionLoteIdParamSchema.parse(req.params);
  return successResponse(res, { message: 'Import lote cancelled successfully', data: await cancelImportacionLote(id, getActorUserId(req), req.tenant) });
});
