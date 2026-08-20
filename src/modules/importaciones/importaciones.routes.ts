import multer from 'multer';
import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
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

importacionesRoutes.get('/personas-vinculaciones/template', requirePermissions('importaciones.upload'), downloadImportacionTemplate);
importacionesRoutes.post('/personas-vinculaciones/upload', requirePermissions('importaciones.upload'), upload.single('file'), uploadPersonasVinculaciones);
importacionesRoutes.get('/lotes', requirePermissions('importaciones.read'), getImportacionLotes);
importacionesRoutes.get('/lotes/:id', requirePermissions('importaciones.read'), getImportacionLote);
importacionesRoutes.get('/lotes/:id/preview', requirePermissions('importaciones.read'), getImportacionPreviewHandler);
importacionesRoutes.get('/lotes/:id/errores', requirePermissions('importaciones.read'), getImportacionErrores);
importacionesRoutes.get('/lotes/:id/reporte', requirePermissions('importaciones.read'), downloadImportacionReportHandler);
importacionesRoutes.post('/lotes/:id/confirmar', requirePermissions('importaciones.confirm'), confirmarImportacion);
importacionesRoutes.post('/lotes/:id/cancelar', requirePermissions('importaciones.cancel'), cancelarImportacion);

export { importacionesRoutes };
