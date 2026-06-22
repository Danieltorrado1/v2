import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { alertasDocumentalesRoutes } from './alertas.documentales.routes';
import {
  deactivateAlertaHandler,
  generateAlertasHandler,
  getAlertaHandler,
  getAlertasHandler,
  getMisNotificacionesHandler,
  getNotificacionesHandler,
  markAlertaAsLeidaHandler,
  markAlertaAsResueltaHandler,
  markAllNotificacionesAsLeidasHandler,
  markNotificacionAsLeidaHandler
} from './alertas.controller';

const alertasRoutes = Router();
const notificacionesRoutes = Router();

alertasRoutes.use(authMiddleware);
notificacionesRoutes.use(authMiddleware);
alertasRoutes.use('/documentales', alertasDocumentalesRoutes);

alertasRoutes.get('/', requirePermissions('alertas.read'), getAlertasHandler);
alertasRoutes.get('/:id', requirePermissions('alertas.read'), getAlertaHandler);
alertasRoutes.post('/generar', requirePermissions('alertas.generate'), generateAlertasHandler);
alertasRoutes.patch('/:id/leer', requirePermissions('alertas.update'), markAlertaAsLeidaHandler);
alertasRoutes.patch(
  '/:id/resolver',
  requirePermissions('alertas.update'),
  markAlertaAsResueltaHandler
);
alertasRoutes.patch(
  '/:id/deactivate',
  requirePermissions('alertas.deactivate'),
  deactivateAlertaHandler
);

notificacionesRoutes.get('/', requirePermissions('notificaciones.read'), getNotificacionesHandler);
notificacionesRoutes.get(
  '/mis',
  requirePermissions('notificaciones.read'),
  getMisNotificacionesHandler
);
notificacionesRoutes.patch(
  '/:id/leer',
  requirePermissions('notificaciones.update'),
  markNotificacionAsLeidaHandler
);
notificacionesRoutes.patch(
  '/leer-todas',
  requirePermissions('notificaciones.update'),
  markAllNotificacionesAsLeidasHandler
);

export { alertasRoutes, notificacionesRoutes };
