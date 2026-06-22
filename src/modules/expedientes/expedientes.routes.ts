import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  generateExpedienteLaboralPdfHandler,
  getExpedienteLaboralConsolidadoHandler,
  getExpedientePersonaAlertasHandler,
  getExpedientePersonaTimelineHandler
} from './expedientes.controller';

const expedientesRoutes = Router();

expedientesRoutes.use(authMiddleware);
expedientesRoutes.use(tenantMiddleware);

expedientesRoutes.get(
  '/personas/:persona_id/alertas',
  requirePermissions('personas.read'),
  getExpedientePersonaAlertasHandler
);
expedientesRoutes.get(
  '/personas/:persona_id/timeline',
  requirePermissions('personas.read'),
  getExpedientePersonaTimelineHandler
);
expedientesRoutes.post(
  '/personas/:persona_id/pdf',
  requirePermissions('personas.read'),
  generateExpedienteLaboralPdfHandler
);
expedientesRoutes.get(
  '/personas/:persona_id',
  requirePermissions('personas.read'),
  getExpedienteLaboralConsolidadoHandler
);

export { expedientesRoutes };
