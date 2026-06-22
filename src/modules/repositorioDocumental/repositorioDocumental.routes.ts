import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  exportRepositorioDocumentosCsvHandler,
  generateRepositorioDocumentoDownloadUrlHandler,
  getRepositorioDocumentoDetalleHandler,
  getRepositorioDocumentoVersionesHandler,
  getRepositorioDocumentosIndicadoresHandler,
  listRepositorioDocumentosHandler
} from './repositorioDocumental.controller';

const repositorioDocumentalRoutes = Router();

repositorioDocumentalRoutes.use(authMiddleware);
repositorioDocumentalRoutes.use(tenantMiddleware);

repositorioDocumentalRoutes.get(
  '/documentos/export',
  requirePermissions('documentos.read'),
  exportRepositorioDocumentosCsvHandler
);
repositorioDocumentalRoutes.get(
  '/documentos/indicadores',
  requirePermissions('documentos.read'),
  getRepositorioDocumentosIndicadoresHandler
);
repositorioDocumentalRoutes.get(
  '/documentos',
  requirePermissions('documentos.read'),
  listRepositorioDocumentosHandler
);
repositorioDocumentalRoutes.get(
  '/documentos/:origen/:id/versiones',
  requirePermissions('documentos.read'),
  getRepositorioDocumentoVersionesHandler
);
repositorioDocumentalRoutes.post(
  '/documentos/:origen/:id/download-url',
  requirePermissions('documentos.download'),
  generateRepositorioDocumentoDownloadUrlHandler
);
repositorioDocumentalRoutes.get(
  '/documentos/:origen/:id',
  requirePermissions('documentos.read'),
  getRepositorioDocumentoDetalleHandler
);

export { repositorioDocumentalRoutes };
