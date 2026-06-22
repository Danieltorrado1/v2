import { Router } from 'express';

import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  generateAlertasDocumentalesHandler,
  getAlertasDocumentalesHandler,
  ignoreAlertaDocumentalHandler,
  resolveAlertaDocumentalHandler
} from './alertas.documentales.controller';

const alertasDocumentalesRoutes = Router();

alertasDocumentalesRoutes.use(tenantMiddleware);

alertasDocumentalesRoutes.get('/', requirePermissions('alertas.documentales.read'), getAlertasDocumentalesHandler);
alertasDocumentalesRoutes.post(
  '/generar',
  requirePermissions('alertas.documentales.generate'),
  generateAlertasDocumentalesHandler
);
alertasDocumentalesRoutes.patch(
  '/:id/resolver',
  requirePermissions('alertas.documentales.update'),
  resolveAlertaDocumentalHandler
);
alertasDocumentalesRoutes.patch(
  '/:id/ignorar',
  requirePermissions('alertas.documentales.update'),
  ignoreAlertaDocumentalHandler
);

export { alertasDocumentalesRoutes };
