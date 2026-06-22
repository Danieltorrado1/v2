import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  createPlanMejoraHandler,
  createSeguimientoHandler,
  deactivatePlanMejoraHandler,
  deactivateSeguimientoHandler,
  getPlanesMejoraAlertasHandler,
  getPlanesMejoraDashboardHandler,
  getPlanesMejoraHandler,
  getSeguimientosHandler,
  updatePlanMejoraHandler,
  updateSeguimientoHandler
} from './planesMejora.controller';

const planesMejoraRoutes = Router();

planesMejoraRoutes.use(authMiddleware);
planesMejoraRoutes.use(tenantMiddleware);

planesMejoraRoutes.get('/', requirePermissions('evaluaciones.planes_mejora.read'), getPlanesMejoraHandler);
planesMejoraRoutes.post('/', requirePermissions('evaluaciones.planes_mejora.write'), createPlanMejoraHandler);
planesMejoraRoutes.patch('/:id', requirePermissions('evaluaciones.planes_mejora.write'), updatePlanMejoraHandler);
planesMejoraRoutes.patch('/:id/deactivate', requirePermissions('evaluaciones.planes_mejora.write'), deactivatePlanMejoraHandler);
planesMejoraRoutes.get('/:id/seguimientos', requirePermissions('evaluaciones.planes_mejora.read'), getSeguimientosHandler);
planesMejoraRoutes.post('/seguimientos', requirePermissions('evaluaciones.planes_mejora.write'), createSeguimientoHandler);
planesMejoraRoutes.patch('/seguimientos/:id', requirePermissions('evaluaciones.planes_mejora.write'), updateSeguimientoHandler);
planesMejoraRoutes.patch('/seguimientos/:id/deactivate', requirePermissions('evaluaciones.planes_mejora.write'), deactivateSeguimientoHandler);
planesMejoraRoutes.get('/dashboard', requirePermissions('evaluaciones.planes_mejora.dashboard'), getPlanesMejoraDashboardHandler);
planesMejoraRoutes.get('/alertas', requirePermissions('evaluaciones.planes_mejora.alertas'), getPlanesMejoraAlertasHandler);

export { planesMejoraRoutes };
