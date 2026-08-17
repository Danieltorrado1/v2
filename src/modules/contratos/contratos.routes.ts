import multer from 'multer';
import { Router } from 'express';

import { requireAnyPermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  anularContratoDocumentoHandler,
  anularContratoEventoHandler,
  createContratoEventoHandler,
  createContratoExcepcionHandler,
  devolverContratoDocumentoHandler,
  getContratoAlertasHandler,
  getContratoChecklistHandler,
  getContratoDetailHandler,
  getContratoDocumentoDownloadUrlHandler,
  getContratoEventosHandler,
  getContratoExcepcionesHandler,
  getContratoExpedienteHandler,
  regularizarContratoExcepcionHandler,
  reviewContratoDocumentoHandler,
  revocarContratoExcepcionHandler,
  uploadContratoDocumentoHandler
} from './contratos.controller';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024
  }
});

const contratosLifecycleRoutes = Router({ mergeParams: true });

contratosLifecycleRoutes.use(tenantMiddleware);

contratosLifecycleRoutes.get('/:id/detalle', requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read'), getContratoDetailHandler);
contratosLifecycleRoutes.get('/:id/expediente', requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read', 'contracts.documents.read'), getContratoExpedienteHandler);
contratosLifecycleRoutes.get('/:id/checklist', requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read', 'contracts.documents.read'), getContratoChecklistHandler);
contratosLifecycleRoutes.get('/:id/alertas', requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read', 'alertas.read'), getContratoAlertasHandler);

contratosLifecycleRoutes.get('/:id/eventos', requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read', 'contracts.events.read'), getContratoEventosHandler);
contratosLifecycleRoutes.post('/:id/eventos', requireAnyPermissions('contratos.update', 'contracts.events.create'), createContratoEventoHandler);
contratosLifecycleRoutes.patch('/:id/eventos/:eventoId/anular', requireAnyPermissions('contratos.update', 'contracts.events.create'), anularContratoEventoHandler);

contratosLifecycleRoutes.post('/:id/documentos', requireAnyPermissions('documentos.upload', 'contracts.documents.upload'), upload.single('file'), uploadContratoDocumentoHandler);
contratosLifecycleRoutes.patch('/:id/documentos/:documentoId/revisar', requireAnyPermissions('documentos.update', 'contracts.documents.review'), reviewContratoDocumentoHandler);
contratosLifecycleRoutes.patch('/:id/documentos/:documentoId/devolver', requireAnyPermissions('documentos.update', 'contracts.documents.review'), devolverContratoDocumentoHandler);
contratosLifecycleRoutes.patch('/:id/documentos/:documentoId/anular', requireAnyPermissions('documentos.update', 'contracts.documents.review'), anularContratoDocumentoHandler);
contratosLifecycleRoutes.get('/:id/documentos/:documentoId/download-url', requireAnyPermissions('documentos.download', 'contracts.documents.download', 'contracts.documents.read'), getContratoDocumentoDownloadUrlHandler);

contratosLifecycleRoutes.get('/:id/excepciones', requireAnyPermissions('configuracion.read', 'contratos.read', 'contracts.read', 'contracts.exceptions.read'), getContratoExcepcionesHandler);
contratosLifecycleRoutes.post('/:id/excepciones', requireAnyPermissions('contratos.update', 'contracts.exceptions.create'), createContratoExcepcionHandler);
contratosLifecycleRoutes.patch('/:id/excepciones/:excepcionId/regularizar', requireAnyPermissions('contratos.update', 'contracts.exceptions.resolve'), regularizarContratoExcepcionHandler);
contratosLifecycleRoutes.patch('/:id/excepciones/:excepcionId/revocar', requireAnyPermissions('contratos.update', 'contracts.exceptions.resolve'), revocarContratoExcepcionHandler);

export { contratosLifecycleRoutes };
