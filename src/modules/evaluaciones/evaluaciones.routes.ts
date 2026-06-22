import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  createCompetenciaHandler,
  createEvaluacionHandler,
  createEvaluacionPersonaHandler,
  createRespuestaHandler,
  deactivateCompetenciaHandler,
  deactivateEvaluacionHandler,
  getCompetenciasHandler,
  getEvaluacionesDashboardHandler,
  getEvaluacionesDashboardGeneralAlertasHandler,
  getEvaluacionesDashboardGeneralHandler,
  getEvaluacionesDashboardGeneralRankingHandler,
  getEvaluacionesHandler,
  getEvaluacionesPersonaHandler,
  updateCompetenciaHandler,
  updateEvaluacionHandler,
  updateEvaluacionPersonaHandler
} from './evaluaciones.controller';
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

const evaluacionesRoutes = Router();

evaluacionesRoutes.use(authMiddleware);
evaluacionesRoutes.use(tenantMiddleware);

evaluacionesRoutes.get('/', requirePermissions('evaluaciones.read'), getEvaluacionesHandler);
evaluacionesRoutes.post('/', requirePermissions('evaluaciones.write'), createEvaluacionHandler);
evaluacionesRoutes.patch('/:id', requirePermissions('evaluaciones.write'), updateEvaluacionHandler);
evaluacionesRoutes.patch('/:id/deactivate', requirePermissions('evaluaciones.write'), deactivateEvaluacionHandler);
evaluacionesRoutes.get('/:id/competencias', requirePermissions('evaluaciones.read'), getCompetenciasHandler);
evaluacionesRoutes.post('/competencias', requirePermissions('evaluaciones.write'), createCompetenciaHandler);
evaluacionesRoutes.patch('/competencias/:id', requirePermissions('evaluaciones.write'), updateCompetenciaHandler);
evaluacionesRoutes.patch('/competencias/:id/deactivate', requirePermissions('evaluaciones.write'), deactivateCompetenciaHandler);
evaluacionesRoutes.get('/persona', requirePermissions('evaluaciones.read'), getEvaluacionesPersonaHandler);
evaluacionesRoutes.post('/persona', requirePermissions('evaluaciones.write'), createEvaluacionPersonaHandler);
evaluacionesRoutes.patch('/persona/:id', requirePermissions('evaluaciones.write'), updateEvaluacionPersonaHandler);
evaluacionesRoutes.post('/respuestas', requirePermissions('evaluaciones.write'), createRespuestaHandler);
evaluacionesRoutes.get('/dashboard', requirePermissions('evaluaciones.dashboard'), getEvaluacionesDashboardHandler);
evaluacionesRoutes.get(
  '/dashboard-general',
  requirePermissions('evaluaciones.dashboard_general'),
  getEvaluacionesDashboardGeneralHandler
);
evaluacionesRoutes.get(
  '/dashboard-general/alertas',
  requirePermissions('evaluaciones.dashboard_general'),
  getEvaluacionesDashboardGeneralAlertasHandler
);
evaluacionesRoutes.get(
  '/dashboard-general/ranking',
  requirePermissions('evaluaciones.dashboard_general'),
  getEvaluacionesDashboardGeneralRankingHandler
);
evaluacionesRoutes.get(
  '/planes-mejora',
  requirePermissions('evaluaciones.planes_mejora.read'),
  getPlanesMejoraHandler
);
evaluacionesRoutes.post(
  '/planes-mejora',
  requirePermissions('evaluaciones.planes_mejora.write'),
  createPlanMejoraHandler
);
evaluacionesRoutes.patch(
  '/planes-mejora/:id',
  requirePermissions('evaluaciones.planes_mejora.write'),
  updatePlanMejoraHandler
);
evaluacionesRoutes.patch(
  '/planes-mejora/:id/deactivate',
  requirePermissions('evaluaciones.planes_mejora.write'),
  deactivatePlanMejoraHandler
);
evaluacionesRoutes.get(
  '/planes-mejora/:id/seguimientos',
  requirePermissions('evaluaciones.planes_mejora.read'),
  getSeguimientosHandler
);
evaluacionesRoutes.post(
  '/planes-mejora/seguimientos',
  requirePermissions('evaluaciones.planes_mejora.write'),
  createSeguimientoHandler
);
evaluacionesRoutes.patch(
  '/planes-mejora/seguimientos/:id',
  requirePermissions('evaluaciones.planes_mejora.write'),
  updateSeguimientoHandler
);
evaluacionesRoutes.patch(
  '/planes-mejora/seguimientos/:id/deactivate',
  requirePermissions('evaluaciones.planes_mejora.write'),
  deactivateSeguimientoHandler
);
evaluacionesRoutes.get(
  '/planes-mejora/dashboard',
  requirePermissions('evaluaciones.planes_mejora.dashboard'),
  getPlanesMejoraDashboardHandler
);
evaluacionesRoutes.get(
  '/planes-mejora/alertas',
  requirePermissions('evaluaciones.planes_mejora.alertas'),
  getPlanesMejoraAlertasHandler
);

export { evaluacionesRoutes };
