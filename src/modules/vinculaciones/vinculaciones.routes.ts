import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requireAnyPermissions, requirePermissions } from '../../middlewares/roleMiddleware';
import {
  closeGestorMunicipioAssignmentHandler,
  closeGestorPersonalAssignmentHandler,
  createGestorMunicipioAssignmentHandler,
  createVinculacionHandler,
  getGestorAssignmentWorkspaceHandler,
  getGestorPersonalHistoryHandler,
  listGestoresHandler,
  listGestorMunicipiosHandler,
  getContractPersonalHandler,
  getPersonalResumenHandler,
  getContractPersonalFilterOptionsHandler,
  getOpsCatalogosHandler,
  getOpsVinculacionesHandler,
  getVinculacionExpedienteHandler,
  getVinculacion,
  getVinculaciones,
  getVinculacionesByPersona,
  reactivarVinculacionHandler,
  retirarVinculacionHandler,
  saveGestorAssignmentsHandler,
  suspenderVinculacionHandler,
  updateVinculacionHandler
} from './vinculaciones.controller';
import {
  createAsignacionLaboralHandler,
  createPresentacionLicitacionHandler,
  getAsignacionesLaboralesByVinculacionHandler,
  getAsignacionesOperativasByVinculacionHandler,
  getOpcionesAsignacionOperativaHandler,
  getContratoLicitacionResumenHandler,
  getPresentacionesLicitacionByVinculacionHandler,
  getVinculacionPersonalContextHandler,
  updateAsignacionLaboralHandler,
  replaceAsignacionOperativaPersonalHandler,
  updatePresentacionLicitacionHandler
} from './vinculaciones.personal.controller';

const vinculacionesRoutes = Router();

vinculacionesRoutes.use(authMiddleware);
vinculacionesRoutes.use(tenantMiddleware);

vinculacionesRoutes.get('/ops/catalogos', requirePermissions('vinculaciones.read'), getOpsCatalogosHandler);
vinculacionesRoutes.get('/ops', requirePermissions('vinculaciones.read'), getOpsVinculacionesHandler);
vinculacionesRoutes.get('/personal/resumen', requirePermissions('vinculaciones.read'), getPersonalResumenHandler);

vinculacionesRoutes.get('/gestores', requirePermissions('vinculaciones.read'), listGestoresHandler);
vinculacionesRoutes.get('/gestores/municipios', requirePermissions('vinculaciones.read'), listGestorMunicipiosHandler);
vinculacionesRoutes.get('/gestores/workspace', requirePermissions('vinculaciones.read'), getGestorAssignmentWorkspaceHandler);
vinculacionesRoutes.get('/gestores/personal/historial', requirePermissions('vinculaciones.read'), getGestorPersonalHistoryHandler);
vinculacionesRoutes.post('/gestores/municipios', requirePermissions('vinculaciones.update'), createGestorMunicipioAssignmentHandler);
vinculacionesRoutes.patch('/gestores/municipios/:id/cerrar', requirePermissions('vinculaciones.update'), closeGestorMunicipioAssignmentHandler);
vinculacionesRoutes.post('/gestores/personal', requirePermissions('vinculaciones.update'), saveGestorAssignmentsHandler);
vinculacionesRoutes.patch('/gestores/personal/:id/cerrar', requirePermissions('vinculaciones.update'), closeGestorPersonalAssignmentHandler);

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
vinculacionesRoutes.get('/:id/asignacion-operativa/opciones', requirePermissions('vinculaciones.read'), getOpcionesAsignacionOperativaHandler);
vinculacionesRoutes.patch('/:id/asignacion-operativa', requirePermissions('vinculaciones.update'), replaceAsignacionOperativaPersonalHandler);
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
  requireAnyPermissions(
    'vinculaciones.update',
    'vinculacion.editar',
    'vinculacion.editar_cargo',
    'vinculacion.editar_fechas',
    'vinculacion.editar_estado'
  ),
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
