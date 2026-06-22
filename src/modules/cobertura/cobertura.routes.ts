import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  createCoberturaAsignacionHandler,
  createCoberturaNovedadHandler,
  deactivateCoberturaAsignacionHandler,
  getCoberturaContratoHandler,
  getCoberturaFaltantesHandler,
  getCoberturaResumenHandler,
  getCoberturaSedeModalidadHandler,
  getCoberturaSobrecoberturaHandler,
  recalculateCoberturaHandler,
  updateCoberturaAsignacionHandler
} from './cobertura.controller';

const coberturaRoutes = Router();

coberturaRoutes.use(authMiddleware);

coberturaRoutes.get('/resumen', requirePermissions('cobertura.read'), getCoberturaResumenHandler);
coberturaRoutes.get(
  '/contrato/:contrato_id',
  requirePermissions('cobertura.read'),
  getCoberturaContratoHandler
);
coberturaRoutes.get(
  '/sede-modalidad/:id',
  requirePermissions('cobertura.read'),
  getCoberturaSedeModalidadHandler
);
coberturaRoutes.get(
  '/faltantes',
  requirePermissions('cobertura.read'),
  getCoberturaFaltantesHandler
);
coberturaRoutes.get(
  '/sobrecobertura',
  requirePermissions('cobertura.read'),
  getCoberturaSobrecoberturaHandler
);
coberturaRoutes.post(
  '/recalcular/:contrato_id',
  requirePermissions('cobertura.recalculate'),
  recalculateCoberturaHandler
);
coberturaRoutes.post(
  '/asignaciones',
  requirePermissions('cobertura.assign'),
  createCoberturaAsignacionHandler
);
coberturaRoutes.patch(
  '/asignaciones/:id',
  requirePermissions('cobertura.update'),
  updateCoberturaAsignacionHandler
);
coberturaRoutes.patch(
  '/asignaciones/:id/deactivate',
  requirePermissions('cobertura.deactivate'),
  deactivateCoberturaAsignacionHandler
);
coberturaRoutes.post(
  '/novedades',
  requirePermissions('cobertura.novedades'),
  createCoberturaNovedadHandler
);

export { coberturaRoutes };
