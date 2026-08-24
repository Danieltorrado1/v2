import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  analyzeMasterImportFile,
  applyMasterImportLote,
  downloadMasterImportReport,
  downloadMasterImportTemplate,
  getMasterImportLote,
  getMasterImportPreview,
  listMasterImportLotes,
  validateMasterImportLote
} from './importaciones.master.service';
import {
  masterImportAnalyzeSchema,
  masterImportListQuerySchema,
  masterImportLoteParamSchema,
  masterImportPreviewQuerySchema,
  masterImportTypeSchema,
  masterImportValidateSchema
} from './importaciones.master.schemas';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
};

const hasPermission = (req: Request, permission: string): boolean =>
  (req.user?.permissions ?? []).includes(permission) || (req.user?.roles ?? []).includes('ADMINISTRADOR');

const ensureSstProfileImportPermission = (
  req: Request,
  action: 'importar' | 'aplicar'
): void => {
  const permission = action === 'importar' ? 'sst.perfil.importar' : 'sst.perfil.aplicar';
  if (!hasPermission(req, permission)) {
    throw new AppError('Insufficient SST profile import permissions', 403, 'FORBIDDEN');
  }
};

export const downloadMasterImportTemplateHandler = asyncHandler(async (req: Request, res: Response) => {
  const type = masterImportTypeSchema.parse(req.params.type);
  const template = downloadMasterImportTemplate(type);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
  res.status(200).send(template.buffer);
});

export const downloadDatosPersonalesTemplateHandler = asyncHandler(async (_req: Request, res: Response) => {
  const template = downloadMasterImportTemplate('DATOS_PERSONALES');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
  res.status(200).send(template.buffer);
});

export const downloadInformacionBancariaTemplateHandler = asyncHandler(async (_req: Request, res: Response) => {
  const template = downloadMasterImportTemplate('INFORMACION_BANCARIA');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
  res.status(200).send(template.buffer);
});

export const downloadCaracterizacionSstTemplateHandler = asyncHandler(async (_req: Request, res: Response) => {
  const template = downloadMasterImportTemplate('CARACTERIZACION_SST');
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${template.fileName}"`);
  res.status(200).send(template.buffer);
});

export const analyzeMasterImportHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.file) {
    throw new AppError('Excel file is required', 400, 'FILE_REQUIRED');
  }

  const input = masterImportAnalyzeSchema.parse(req.body);
  if (input.tipo === 'CARACTERIZACION_SST') {
    ensureSstProfileImportPermission(req, 'importar');
  }
  const data = await analyzeMasterImportFile(
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype ?? null,
    getActorUserId(req),
    input,
    req.tenant
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Master import analysis created successfully',
    data
  });
});

export const validateMasterImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = masterImportLoteParamSchema.parse(req.params);
  const lote = await getMasterImportLote(id, req.tenant);
  if (!lote) {
    throw new AppError('Import lote not found', 404, 'MASTER_IMPORT_LOTE_NOT_FOUND');
  }
  if (lote.tipo === 'CARACTERIZACION_SST') {
    ensureSstProfileImportPermission(req, 'importar');
  }
  const input = masterImportValidateSchema.parse(req.body);
  const data = await validateMasterImportLote(id, getActorUserId(req), input, req.tenant);
  return successResponse(res, {
    message: 'Master import dry-run generated successfully',
    data
  });
});

export const listMasterImportLotesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = masterImportListQuerySchema.parse(req.query);
  return successResponse(res, {
    message: 'Master import history retrieved successfully',
    data: await listMasterImportLotes(query, req.tenant)
  });
});

export const getMasterImportLoteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = masterImportLoteParamSchema.parse(req.params);
  const lote = await getMasterImportLote(id, req.tenant);
  if (!lote) {
    throw new AppError('Import lote not found', 404, 'MASTER_IMPORT_LOTE_NOT_FOUND');
  }
  return successResponse(res, {
    message: 'Master import lote retrieved successfully',
    data: lote
  });
});

export const getMasterImportPreviewHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = masterImportLoteParamSchema.parse(req.params);
  const query = masterImportPreviewQuerySchema.parse(req.query);
  return successResponse(res, {
    message: 'Master import preview retrieved successfully',
    data: await getMasterImportPreview(id, query, req.tenant)
  });
});

export const applyMasterImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = masterImportLoteParamSchema.parse(req.params);
  const lote = await getMasterImportLote(id, req.tenant);
  if (!lote) {
    throw new AppError('Import lote not found', 404, 'MASTER_IMPORT_LOTE_NOT_FOUND');
  }
  if (lote.tipo === 'CARACTERIZACION_SST') {
    ensureSstProfileImportPermission(req, 'aplicar');
  }
  return successResponse(res, {
    message: 'Master import applied successfully',
    data: await applyMasterImportLote(id, getActorUserId(req), req.tenant)
  });
});

export const downloadMasterImportReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = masterImportLoteParamSchema.parse(req.params);
  const report = await downloadMasterImportReport(id, req.tenant);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${report.fileName}"`);
  res.status(200).send(report.content);
});
