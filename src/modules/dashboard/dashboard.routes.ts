import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { getDashboardSaasHandler } from './dashboard.saas.controller';
import {
  getDashboardAlertasHandler,
  getDashboardCoberturaHandler,
  getDashboardDocumentosHandler,
  getDashboardNominaHandler,
  getDashboardPersonasHandler,
  getDashboardResumenHandler,
  getDashboardSstHandler
} from './dashboard.controller';

const dashboardRoutes = Router();

dashboardRoutes.use(authMiddleware);
dashboardRoutes.use('/saas', tenantMiddleware);

dashboardRoutes.get('/resumen', requirePermissions('dashboard.read'), getDashboardResumenHandler);
dashboardRoutes.get(
  '/personas',
  requirePermissions('dashboard.read', 'dashboard.personas.read'),
  getDashboardPersonasHandler
);
dashboardRoutes.get(
  '/documentos',
  requirePermissions('dashboard.read', 'dashboard.documentos.read'),
  getDashboardDocumentosHandler
);
dashboardRoutes.get(
  '/cobertura',
  requirePermissions('dashboard.read', 'dashboard.cobertura.read'),
  getDashboardCoberturaHandler
);
dashboardRoutes.get(
  '/nomina',
  requirePermissions('dashboard.read', 'dashboard.nomina.read'),
  getDashboardNominaHandler
);
dashboardRoutes.get(
  '/sst',
  requirePermissions('dashboard.read', 'dashboard.sst.read'),
  getDashboardSstHandler
);
dashboardRoutes.get(
  '/alertas',
  requirePermissions('dashboard.read', 'dashboard.alertas.read'),
  getDashboardAlertasHandler
);
dashboardRoutes.get('/saas', requirePermissions('dashboard.saas.read'), getDashboardSaasHandler);

export { dashboardRoutes };
