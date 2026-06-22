import multer from 'multer';
import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  createTestDocumentoPersonaHandler,
  deactivatePersonaDocumentoHandler,
  deactivateVinculacionDocumentoHandler,
  getDocumentoDownloadUrlHandler,
  getPersonaDocumentosHandler,
  getVinculacionChecklistHandler,
  getVinculacionDocumentosHandler,
  updatePersonaDocumentoHandler,
  updateVinculacionDocumentoHandler,
  uploadPersonaDocumentoHandler,
  uploadVinculacionDocumentoHandler
} from './documentos.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

const documentosRoutes = Router();

documentosRoutes.use(authMiddleware);
documentosRoutes.use(tenantMiddleware);

documentosRoutes.post(
  '/test',
  requirePermissions('documentos.upload'),
  createTestDocumentoPersonaHandler
);
documentosRoutes.post(
  '/persona/:persona_id/upload',
  requirePermissions('documentos.upload'),
  upload.single('file'),
  uploadPersonaDocumentoHandler
);
documentosRoutes.post(
  '/vinculacion/:vinculacion_id/upload',
  requirePermissions('documentos.upload'),
  upload.single('file'),
  uploadVinculacionDocumentoHandler
);
documentosRoutes.get(
  '/persona/:personaId',
  requirePermissions('documentos.read'),
  getPersonaDocumentosHandler
);
documentosRoutes.get(
  '/vinculacion/:vinculacion_id/checklist',
  requirePermissions('documentos.read'),
  getVinculacionChecklistHandler
);
documentosRoutes.get(
  '/vinculacion/:vinculacion_id',
  requirePermissions('documentos.read'),
  getVinculacionDocumentosHandler
);
documentosRoutes.get(
  '/:id/download-url',
  requirePermissions('documentos.download'),
  getDocumentoDownloadUrlHandler
);
documentosRoutes.patch(
  '/persona/:id',
  requirePermissions('documentos.update'),
  updatePersonaDocumentoHandler
);
documentosRoutes.patch(
  '/vinculacion/:id',
  requirePermissions('documentos.update'),
  updateVinculacionDocumentoHandler
);
documentosRoutes.patch(
  '/persona/:id/deactivate',
  requirePermissions('documentos.deactivate'),
  deactivatePersonaDocumentoHandler
);
documentosRoutes.patch(
  '/vinculacion/:id/deactivate',
  requirePermissions('documentos.deactivate'),
  deactivateVinculacionDocumentoHandler
);

export { documentosRoutes };
