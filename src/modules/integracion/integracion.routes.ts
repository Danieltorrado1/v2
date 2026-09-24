import { Router } from 'express';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requireAnyPermissions } from '../../middlewares/roleMiddleware';
import { getContextoLaboralHandler, getIntegracionEventHandler, listIntegracionEventsHandler, listIntegracionImpactsHandler } from './integracion.controller';

const integracionRoutes = Router();
integracionRoutes.use(authMiddleware, tenantMiddleware, requireAnyPermissions('auditoria.read', 'personal.read', 'nomina.read'));
integracionRoutes.get('/contexto-laboral', getContextoLaboralHandler);
integracionRoutes.get('/eventos', listIntegracionEventsHandler);
integracionRoutes.get('/eventos/:id', getIntegracionEventHandler);
integracionRoutes.get('/impactos', listIntegracionImpactsHandler);
export { integracionRoutes };
