import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  createIndicadoresPeriodoHandler,
  getIndicadoresAlertasHandler,
  getIndicadoresDashboardHandler,
  getIndicadoresHistoricoHandler,
  getIndicadoresPeriodosHandler
} from './sstIndicadores.controller';

const sstIndicadoresRoutes = Router();

sstIndicadoresRoutes.use(authMiddleware);
sstIndicadoresRoutes.use(tenantMiddleware);

sstIndicadoresRoutes.get('/', requirePermissions('sst.indicadores.read'), getIndicadoresPeriodosHandler);
sstIndicadoresRoutes.post(
  '/periodos',
  requirePermissions('sst.indicadores.write'),
  createIndicadoresPeriodoHandler
);
sstIndicadoresRoutes.get(
  '/dashboard',
  requirePermissions('sst.indicadores.read'),
  getIndicadoresDashboardHandler
);
sstIndicadoresRoutes.get(
  '/historico',
  requirePermissions('sst.indicadores.read'),
  getIndicadoresHistoricoHandler
);
sstIndicadoresRoutes.get(
  '/alertas',
  requirePermissions('sst.indicadores.read'),
  getIndicadoresAlertasHandler
);

export { sstIndicadoresRoutes };
