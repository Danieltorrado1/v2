import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  exportAuditoriaHandler,
  getAuditoriaByEntidadHandler,
  getAuditoriaByIdHandler,
  getAuditoriaByUsuarioHandler,
  getAuditoriaHandler,
  getHistorialCambiosByEntidadHandler,
  testAuditEventHandler
} from './auditoria.controller';

const auditoriaRoutes = Router();

auditoriaRoutes.use(authMiddleware);
auditoriaRoutes.use(tenantMiddleware);

auditoriaRoutes.get('/', requirePermissions('auditoria.read'), getAuditoriaHandler);
auditoriaRoutes.get(
  '/export',
  requirePermissions('auditoria.export'),
  exportAuditoriaHandler
);
auditoriaRoutes.post('/test', requirePermissions('auditoria.read'), testAuditEventHandler);
auditoriaRoutes.get(
  '/entidad/:tabla/:registro_id',
  requirePermissions('auditoria.read'),
  getAuditoriaByEntidadHandler
);
auditoriaRoutes.get(
  '/usuario/:usuario_id',
  requirePermissions('auditoria.read'),
  getAuditoriaByUsuarioHandler
);
auditoriaRoutes.get(
  '/historial/:tabla/:registro_id',
  requirePermissions('auditoria.read'),
  getHistorialCambiosByEntidadHandler
);
auditoriaRoutes.get('/:id', requirePermissions('auditoria.read'), getAuditoriaByIdHandler);

export { auditoriaRoutes };
