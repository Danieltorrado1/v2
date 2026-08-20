import multer from 'multer';
import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  createManualFocalizacionAdjustmentHandler,
  downloadFocalizacionImportReportHandler,
  downloadFocalizacionImportTemplateHandler,
  getFocalizacionImportDetailHandler,
  listFocalizacionImportacionesHandler,
  reprocessFocalizacionImportHandler,
  uploadHistoricalFocalizacionHandler,
} from './cobertura.focalizacion.controller';
import {
  createCoberturaAsignacionHandler,
  createCoberturaNovedadHandler,
  deactivateCoberturaAsignacionHandler,
  getCoberturaContratoHandler,
  getCoberturaFaltantesHandler,
  getCoberturaResumenHandler,
  getCoberturaSedeModalidadHandler,
  getCoberturaSobrecoberturaHandler,
  recalculateCoberturaHandler,
  updateCoberturaAsignacionHandler,
} from './cobertura.controller';

const coberturaRoutes = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

coberturaRoutes.use(authMiddleware);
coberturaRoutes.use(tenantMiddleware);

coberturaRoutes.get('/resumen', requirePermissions('cobertura.read'), getCoberturaResumenHandler);
coberturaRoutes.get('/contrato/:contrato_id', requirePermissions('cobertura.read'), getCoberturaContratoHandler);
coberturaRoutes.get('/sede-modalidad/:id', requirePermissions('cobertura.read'), getCoberturaSedeModalidadHandler);
coberturaRoutes.get('/faltantes', requirePermissions('cobertura.read'), getCoberturaFaltantesHandler);
coberturaRoutes.get('/sobrecobertura', requirePermissions('cobertura.read'), getCoberturaSobrecoberturaHandler);

coberturaRoutes.get('/focalizacion/template', requirePermissions('cobertura.read'), downloadFocalizacionImportTemplateHandler);
coberturaRoutes.get('/focalizacion/importaciones', requirePermissions('cobertura.read'), listFocalizacionImportacionesHandler);
coberturaRoutes.get('/focalizacion/importaciones/:id', requirePermissions('cobertura.read'), getFocalizacionImportDetailHandler);
coberturaRoutes.get('/focalizacion/importaciones/:id/reporte', requirePermissions('cobertura.read'), downloadFocalizacionImportReportHandler);
coberturaRoutes.post('/focalizacion/importaciones', requirePermissions('cobertura.update'), upload.single('file'), uploadHistoricalFocalizacionHandler);
coberturaRoutes.post('/focalizacion/importaciones/:id/reprocesar', requirePermissions('cobertura.update'), reprocessFocalizacionImportHandler);
coberturaRoutes.post('/focalizacion/ajustes-manuales', requirePermissions('administracion.configuracion_calculadoras.update'), upload.single('soporte'), createManualFocalizacionAdjustmentHandler);

coberturaRoutes.post('/recalcular/:contrato_id', requirePermissions('cobertura.recalculate'), recalculateCoberturaHandler);
coberturaRoutes.post('/asignaciones', requirePermissions('cobertura.assign'), createCoberturaAsignacionHandler);
coberturaRoutes.patch('/asignaciones/:id', requirePermissions('cobertura.update'), updateCoberturaAsignacionHandler);
coberturaRoutes.patch('/asignaciones/:id/deactivate', requirePermissions('cobertura.deactivate'), deactivateCoberturaAsignacionHandler);
coberturaRoutes.post('/novedades', requirePermissions('cobertura.novedades'), createCoberturaNovedadHandler);

export { coberturaRoutes };
