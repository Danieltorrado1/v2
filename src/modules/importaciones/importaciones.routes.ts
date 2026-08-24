import multer from 'multer';
import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requireAnyPermissions, requirePermissions } from '../../middlewares/roleMiddleware';
import {
  analyzeMasterImportHandler,
  applyMasterImportHandler,
  downloadCaracterizacionSstTemplateHandler,
  downloadDatosPersonalesTemplateHandler,
  downloadInformacionBancariaTemplateHandler,
  downloadMasterImportReportHandler,
  getMasterImportLoteHandler,
  getMasterImportPreviewHandler,
  listMasterImportLotesHandler,
  validateMasterImportHandler
} from './importaciones.master.controller';
import {
  getSstPreparationSummaryHandler,
  listSstPendingCaptureHandler,
  listSstPreparationPlanHandler,
  listSstReviewCasesHandler,
  resolveSstReviewCaseHandler
} from '../sst/sst.preparacion.controller';
import {
  cancelarImportacion,
  confirmarImportacion,
  downloadImportacionReportHandler,
  downloadImportacionTemplate,
  getImportacionErrores,
  getImportacionLote,
  getImportacionLotes,
  getImportacionPreviewHandler,
  uploadPersonasVinculaciones
} from './importaciones.controller';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const importacionesRoutes = Router();

importacionesRoutes.use(authMiddleware);
importacionesRoutes.use(tenantMiddleware);

importacionesRoutes.get(
  '/personas-vinculaciones/template',
  requireAnyPermissions('importaciones.upload', 'importaciones.preparar'),
  downloadImportacionTemplate
);
importacionesRoutes.get(
  '/informacion-bancaria/template',
  requirePermissions('importaciones.preparar'),
  downloadInformacionBancariaTemplateHandler
);
importacionesRoutes.get(
  '/datos-personales/template',
  requirePermissions('importaciones.preparar'),
  downloadDatosPersonalesTemplateHandler
);
importacionesRoutes.get(
  '/caracterizacion-sst/template',
  requirePermissions('importaciones.preparar'),
  downloadCaracterizacionSstTemplateHandler
);
importacionesRoutes.post(
  '/personas-vinculaciones/upload',
  requireAnyPermissions('importaciones.upload', 'importaciones.preparar'),
  upload.single('file'),
  uploadPersonasVinculaciones
);
importacionesRoutes.post(
  '/maestro/analizar',
  requirePermissions('importaciones.preparar'),
  upload.single('file'),
  analyzeMasterImportHandler
);
importacionesRoutes.post(
  '/maestro/lotes/:id/validar',
  requirePermissions('importaciones.preparar'),
  validateMasterImportHandler
);
importacionesRoutes.get(
  '/maestro/lotes',
  requireAnyPermissions('importaciones.preparar', 'importaciones.aplicar', 'importaciones.read'),
  listMasterImportLotesHandler
);
importacionesRoutes.get(
  '/maestro/lotes/:id',
  requireAnyPermissions('importaciones.preparar', 'importaciones.aplicar', 'importaciones.read'),
  getMasterImportLoteHandler
);
importacionesRoutes.get(
  '/maestro/lotes/:id/preview',
  requireAnyPermissions('importaciones.preparar', 'importaciones.aplicar', 'importaciones.read'),
  getMasterImportPreviewHandler
);
importacionesRoutes.get(
  '/maestro/lotes/:id/reporte',
  requireAnyPermissions('importaciones.preparar', 'importaciones.aplicar', 'importaciones.read'),
  downloadMasterImportReportHandler
);
importacionesRoutes.post(
  '/maestro/lotes/:id/aplicar',
  requirePermissions('importaciones.aplicar'),
  applyMasterImportHandler
);
importacionesRoutes.get(
  '/maestro/sst/preparacion/resumen',
  requireAnyPermissions('importaciones.preparar', 'sst.perfil.importar', 'sst.revision.ver'),
  getSstPreparationSummaryHandler
);
importacionesRoutes.get(
  '/maestro/sst/revision-casos',
  requireAnyPermissions('importaciones.preparar', 'sst.perfil.importar', 'sst.revision.ver'),
  listSstReviewCasesHandler
);
importacionesRoutes.patch(
  '/maestro/sst/revision-casos/:id',
  requirePermissions('sst.revision.resolver'),
  resolveSstReviewCaseHandler
);
importacionesRoutes.get(
  '/maestro/sst/pendientes',
  requireAnyPermissions('importaciones.preparar', 'sst.perfil.importar', 'sst.revision.ver'),
  listSstPendingCaptureHandler
);
importacionesRoutes.get(
  '/maestro/sst/apply-plan',
  requireAnyPermissions('importaciones.preparar', 'sst.perfil.importar', 'sst.revision.ver'),
  listSstPreparationPlanHandler
);
importacionesRoutes.get('/lotes', requirePermissions('importaciones.read'), getImportacionLotes);
importacionesRoutes.get('/lotes/:id', requirePermissions('importaciones.read'), getImportacionLote);
importacionesRoutes.get('/lotes/:id/preview', requirePermissions('importaciones.read'), getImportacionPreviewHandler);
importacionesRoutes.get('/lotes/:id/errores', requirePermissions('importaciones.read'), getImportacionErrores);
importacionesRoutes.get('/lotes/:id/reporte', requirePermissions('importaciones.read'), downloadImportacionReportHandler);
importacionesRoutes.post(
  '/lotes/:id/confirmar',
  requireAnyPermissions('importaciones.confirm', 'importaciones.aplicar'),
  confirmarImportacion
);
importacionesRoutes.post('/lotes/:id/cancelar', requirePermissions('importaciones.cancel'), cancelarImportacion);

export { importacionesRoutes };
