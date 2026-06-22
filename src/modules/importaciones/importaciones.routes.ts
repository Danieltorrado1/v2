import multer from 'multer';
import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  cancelarImportacion,
  confirmarImportacion,
  getImportacionErrores,
  getImportacionLote,
  getImportacionLotes,
  uploadPersonasVinculaciones
} from './importaciones.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024
  }
});

const importacionesRoutes = Router();

importacionesRoutes.use(authMiddleware);

importacionesRoutes.post(
  '/personas-vinculaciones/upload',
  requirePermissions('importaciones.upload'),
  upload.single('file'),
  uploadPersonasVinculaciones
);
importacionesRoutes.get('/lotes', requirePermissions('importaciones.read'), getImportacionLotes);
importacionesRoutes.get('/lotes/:id', requirePermissions('importaciones.read'), getImportacionLote);
importacionesRoutes.get(
  '/lotes/:id/errores',
  requirePermissions('importaciones.read'),
  getImportacionErrores
);
importacionesRoutes.post(
  '/lotes/:id/confirmar',
  requirePermissions('importaciones.confirm'),
  confirmarImportacion
);
importacionesRoutes.post(
  '/lotes/:id/cancelar',
  requirePermissions('importaciones.cancel'),
  cancelarImportacion
);

export { importacionesRoutes };
