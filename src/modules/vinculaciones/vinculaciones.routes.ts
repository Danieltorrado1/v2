import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  createVinculacionHandler,
  getVinculacionExpedienteHandler,
  getVinculacion,
  getVinculaciones,
  getVinculacionesByPersona,
  reactivarVinculacionHandler,
  retirarVinculacionHandler,
  suspenderVinculacionHandler,
  updateVinculacionHandler
} from './vinculaciones.controller';

const vinculacionesRoutes = Router();

vinculacionesRoutes.use(authMiddleware);
vinculacionesRoutes.use(tenantMiddleware);

vinculacionesRoutes.get('/', requirePermissions('vinculaciones.read'), getVinculaciones);
vinculacionesRoutes.get(
  '/persona/:persona_id',
  requirePermissions('vinculaciones.read'),
  getVinculacionesByPersona
);
vinculacionesRoutes.get(
  '/:id/expediente',
  requirePermissions('vinculaciones.read'),
  getVinculacionExpedienteHandler
);
vinculacionesRoutes.get('/:id', requirePermissions('vinculaciones.read'), getVinculacion);
vinculacionesRoutes.post(
  '/',
  requirePermissions('vinculaciones.create'),
  createVinculacionHandler
);
vinculacionesRoutes.patch(
  '/:id',
  requirePermissions('vinculaciones.update'),
  updateVinculacionHandler
);
vinculacionesRoutes.patch(
  '/:id/retirar',
  requirePermissions('vinculaciones.retirar'),
  retirarVinculacionHandler
);
vinculacionesRoutes.patch(
  '/:id/suspender',
  requirePermissions('vinculaciones.suspender'),
  suspenderVinculacionHandler
);
vinculacionesRoutes.patch(
  '/:id/reactivar',
  requirePermissions('vinculaciones.reactivar'),
  reactivarVinculacionHandler
);

export { vinculacionesRoutes };
