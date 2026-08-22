import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  createVinculacionHandler,
  getContractPersonalHandler,
  getContractPersonalFilterOptionsHandler,
  getOpsCatalogosHandler,
  getOpsVinculacionesHandler,
  getVinculacionExpedienteHandler,
  getVinculacion,
  getVinculaciones,
  getVinculacionesByPersona,
  reactivarVinculacionHandler,
  retirarVinculacionHandler,
  suspenderVinculacionHandler,
  updateVinculacionHandler
} from './vinculaciones.controller';
import {
  createAsignacionLaboralHandler,
  createPresentacionLicitacionHandler,
  getAsignacionesLaboralesByVinculacionHandler,
  getAsignacionesOperativasByVinculacionHandler,
  getContratoLicitacionResumenHandler,
  getPresentacionesLicitacionByVinculacionHandler,
  getVinculacionPersonalContextHandler,
  updateAsignacionLaboralHandler,
  updatePresentacionLicitacionHandler
} from './vinculaciones.personal.controller';

const vinculacionesRoutes = Router();

vinculacionesRoutes.use(authMiddleware);
vinculacionesRoutes.use(tenantMiddleware);

vinculacionesRoutes.get('/ops/catalogos', requirePermissions('vinculaciones.read'), getOpsCatalogosHandler);
vinculacionesRoutes.get('/ops', requirePermissions('vinculaciones.read'), getOpsVinculacionesHandler);
vinculacionesRoutes.get('/personal/opciones', requirePermissions('vinculaciones.read'), getContractPersonalFilterOptionsHandler);
vinculacionesRoutes.get('/personal', requirePermissions('vinculaciones.read'), getContractPersonalHandler);
vinculacionesRoutes.get('/personal/licitacion/resumen', requirePermissions('vinculaciones.read'), getContratoLicitacionResumenHandler);
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
vinculacionesRoutes.get(
  '/:id/contexto-personal',
  requirePermissions('vinculaciones.read'),
  getVinculacionPersonalContextHandler
);
vinculacionesRoutes.get(
  '/:id/asignaciones-operativas',
  requirePermissions('vinculaciones.read'),
  getAsignacionesOperativasByVinculacionHandler
);
vinculacionesRoutes.get(
  '/:id/asignaciones-laborales',
  requirePermissions('vinculaciones.read'),
  getAsignacionesLaboralesByVinculacionHandler
);
vinculacionesRoutes.post(
  '/:id/asignaciones-laborales',
  requirePermissions('vinculaciones.update'),
  createAsignacionLaboralHandler
);
vinculacionesRoutes.patch(
  '/:id/asignaciones-laborales/:asignacionId',
  requirePermissions('vinculaciones.update'),
  updateAsignacionLaboralHandler
);
vinculacionesRoutes.get(
  '/:id/presentaciones-licitacion',
  requirePermissions('vinculaciones.read'),
  getPresentacionesLicitacionByVinculacionHandler
);
vinculacionesRoutes.post(
  '/:id/presentaciones-licitacion',
  requirePermissions('vinculaciones.update'),
  createPresentacionLicitacionHandler
);
vinculacionesRoutes.patch(
  '/:id/presentaciones-licitacion/:presentacionId',
  requirePermissions('vinculaciones.update'),
  updatePresentacionLicitacionHandler
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
