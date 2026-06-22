import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  commonReportQuerySchema,
  reportesContratoParamSchema,
  reportesPeriodoParamSchema,
  reportesVinculacionParamSchema,
  ReportFormat
} from './reportes.schemas';
import { sendExcelResponse, buildExcelBuffer } from './reportes.excel';
import { buildPdfBuffer, sendPdfResponse } from './reportes.pdf';
import {
  getAuditoriaReport,
  getChecklistDocumentalReport,
  getCoberturaContratoReport,
  getCoberturaFaltantesReport,
  getCoberturaSobrecoberturaReport,
  getDocumentosPorVencerReport,
  getDocumentosVencidosReport,
  getNominaDesprendiblesReport,
  getNominaNovedadesReport,
  getNominaPeriodoReport,
  getPersonalActivoReport,
  getPersonalPorContratoReport,
  getSstEventosReport,
  getSstPlanesAccionReport,
  getVinculacionesHistoricasReport,
  recordReportExportAudit,
  ReportPayload
} from './reportes.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

const ensureExportPermission = (req: Request, format: ReportFormat): void => {
  if (format === 'json') {
    return;
  }

  const permissions = req.user?.permissions ?? [];
  const requiredPermission =
    format === 'excel' ? 'reportes.export.excel' : 'reportes.export.pdf';

  if (!permissions.includes(requiredPermission)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
};

const respondWithReport = async (
  req: Request,
  res: Response,
  reportName: string,
  format: ReportFormat,
  payload: ReportPayload<unknown>
): Promise<Response> => {
  if (format === 'json') {
    return successResponse(res, {
      message: `${reportName} retrieved successfully`,
      data: payload.data
    });
  }

  ensureExportPermission(req, format);
  await recordReportExportAudit({
    actorUserId: getActorUserId(req),
    auditMeta: getAuditRequestMeta(req),
    fileName: payload.fileName,
    format,
    reportName,
    filters: req.query as Record<string, unknown>
  });

  if (format === 'excel') {
    const buffer = buildExcelBuffer({
      columns: payload.columns,
      rows: payload.rows,
      sheetName: payload.sheetName
    });

    return sendExcelResponse(res, payload.fileName, buffer);
  }

  const buffer = await buildPdfBuffer({
    title: payload.title,
    columns: payload.columns,
    rows: payload.rows
  });

  return sendPdfResponse(res, payload.fileName, buffer);
};

export const getPersonalActivoReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = commonReportQuerySchema.parse(req.query);
  const report = await getPersonalActivoReport(query);

  return respondWithReport(req, res, 'personal-activo', query.format, report);
});

export const getPersonalPorContratoReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const { contrato_id } = reportesContratoParamSchema.parse(req.params);
    const report = await getPersonalPorContratoReport(contrato_id, query);

    return respondWithReport(req, res, 'personal-contrato', query.format, report);
  }
);

export const getVinculacionesHistoricasReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const report = await getVinculacionesHistoricasReport(query);

    return respondWithReport(req, res, 'vinculaciones-historicas', query.format, report);
  }
);

export const getChecklistDocumentalReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const { vinculacion_id } = reportesVinculacionParamSchema.parse(req.params);
    const report = await getChecklistDocumentalReport(vinculacion_id);

    return respondWithReport(req, res, 'documentos-checklist', query.format, report);
  }
);

export const getDocumentosVencidosReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const report = await getDocumentosVencidosReport(query);

    return respondWithReport(req, res, 'documentos-vencidos', query.format, report);
  }
);

export const getDocumentosPorVencerReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const report = await getDocumentosPorVencerReport(query);

    return respondWithReport(req, res, 'documentos-por-vencer', query.format, report);
  }
);

export const getCoberturaContratoReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const { contrato_id } = reportesContratoParamSchema.parse(req.params);
    const report = await getCoberturaContratoReport(contrato_id);

    return respondWithReport(req, res, 'cobertura-contrato', query.format, report);
  }
);

export const getCoberturaFaltantesReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const report = await getCoberturaFaltantesReport(query);

    return respondWithReport(req, res, 'cobertura-faltantes', query.format, report);
  }
);

export const getCoberturaSobrecoberturaReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const report = await getCoberturaSobrecoberturaReport(query);

    return respondWithReport(req, res, 'cobertura-sobrecobertura', query.format, report);
  }
);

export const getNominaPeriodoReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = commonReportQuerySchema.parse(req.query);
  const { periodo_id } = reportesPeriodoParamSchema.parse(req.params);
  const report = await getNominaPeriodoReport(periodo_id, query);

  return respondWithReport(req, res, 'nomina-periodo', query.format, report);
});

export const getNominaNovedadesReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const { periodo_id } = reportesPeriodoParamSchema.parse(req.params);
    const report = await getNominaNovedadesReport(periodo_id, query);

    return respondWithReport(req, res, 'nomina-novedades', query.format, report);
  }
);

export const getNominaDesprendiblesReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const { periodo_id } = reportesPeriodoParamSchema.parse(req.params);
    const report = await getNominaDesprendiblesReport(periodo_id);

    return respondWithReport(req, res, 'nomina-desprendibles', query.format, report);
  }
);

export const getSstEventosReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = commonReportQuerySchema.parse(req.query);
  const report = await getSstEventosReport(query);

  return respondWithReport(req, res, 'sst-eventos', query.format, report);
});

export const getSstPlanesAccionReportHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const query = commonReportQuerySchema.parse(req.query);
    const report = await getSstPlanesAccionReport(query);

    return respondWithReport(req, res, 'sst-planes-accion', query.format, report);
  }
);

export const getAuditoriaReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = commonReportQuerySchema.parse(req.query);
  const report = await getAuditoriaReport(query);

  return respondWithReport(req, res, 'auditoria', query.format, report);
});
