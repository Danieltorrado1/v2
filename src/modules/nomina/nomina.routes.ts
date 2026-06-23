import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import {
  aprobarVacacionesSolicitudHandler,
  createVacacionesSolicitudHandler,
  createVacacionHandler,
  deactivateVacacionesSolicitudHandler,
  deactivateVacacionHandler,
  getVacacionesAlertasHandler,
  getVacacionesDashboardHandler,
  getVacacionesHandler,
  getVacacionesSolicitudesHandler,
  marcarDisfrutadaVacacionesSolicitudHandler,
  marcarPagadaVacacionesSolicitudHandler,
  rechazarVacacionesSolicitudHandler,
  updateVacacionesSolicitudHandler,
  updateVacacionHandler
} from './vacaciones.controller';
import {
  consignCesantiaHandler,
  createCesantiaHandler,
  deactivateCesantiaHandler,
  getCesantiasAlertasHandler,
  getCesantiasDashboardHandler,
  getCesantiasHandler,
  payCesantiaHandler,
  updateCesantiaHandler
} from './cesantias.controller';
import {
  createPrimaHandler,
  deactivatePrimaHandler,
  getPrimaAlertasHandler,
  getPrimaDashboardHandler,
  getPrimasHandler,
  payPrimaHandler,
  updatePrimaHandler
} from './prima.controller';
import {
  createInteresesCesantiaHandler,
  deactivateInteresesCesantiaHandler,
  getInteresesCesantiasAlertasHandler,
  getInteresesCesantiasDashboardHandler,
  getInteresesCesantiasHandler,
  payInteresesCesantiaHandler,
  updateInteresesCesantiaHandler
} from './intereses-cesantias.controller';
import {
  createLiquidacionFinalHandler,
  deactivateLiquidacionFinalHandler,
  getLiquidacionesFinalesAlertasHandler,
  getLiquidacionesFinalesDashboardHandler,
  getLiquidacionesFinalesHandler,
  liquidarLiquidacionFinalHandler,
  payLiquidacionFinalHandler,
  updateLiquidacionFinalHandler
} from './liquidaciones-finales.controller';
import {
  cancelNominaPeriodoHandler,
  closeNominaPeriodoHandler,
  createNominaRecargoHandler,
  createNominaMovimientoHandler,
  createNominaNovedadHandler,
  createNominaPeriodoHandler,
  deactivateNominaAsistenciaHandler,
  deactivateNominaMovimientoHandler,
  deactivateNominaNovedadHandler,
  exportNominaPeriodoHandler,
  finalizeNominaDesprendiblesHandler,
  finalizeNominaLiquidacionesHandler,
  generateNominaAsistenciaHandler,
  generateNominaDesprendiblesHandler,
  generateNominaPlanillaPdfHandler,
  generarNominaLiquidacionesHandler,
  getNominaAsistenciaHandler,
  getNominaDashboardHandler,
  getNominaPlanoBancarioHandler,
  getNominaDesprendibleHandler,
  getNominaDesprendiblesHandler,
  getNominaLiquidacionHandler,
  getNominaLiquidacionesHandler,
  getNominaMovimientosHandler,
  getNominaNovedadesHandler,
  getNominaPeriodoEmpleadosHandler,
  getNominaPeriodoHandler,
  getNominaPeriodosHandler,
  importNominaPeriodoEmpleadosHandler,
  payNominaPeriodoHandler,
  recalculateNominaPeriodoHandler,
  reopenNominaPeriodoHandler,
  reviewNominaPeriodoHandler,
  updateNominaAsistenciaHandler,
  updateNominaEmpleadoHandler,
  updateNominaMovimientoHandler,
  updateNominaNovedadHandler,
  updateNominaPeriodoHandler
} from './nomina.controller';

const nominaRoutes = Router();

nominaRoutes.use(authMiddleware);
nominaRoutes.use(tenantMiddleware);

nominaRoutes.get('/periodos', requirePermissions('nomina.read'), getNominaPeriodosHandler);
nominaRoutes.get('/periodos/:id', requirePermissions('nomina.read'), getNominaPeriodoHandler);
nominaRoutes.post(
  '/periodos',
  requirePermissions('nomina.periodos.create'),
  createNominaPeriodoHandler
);
nominaRoutes.patch(
  '/periodos/:id',
  requirePermissions('nomina.periodos.update'),
  updateNominaPeriodoHandler
);
nominaRoutes.post(
  '/periodos/:id/revisar',
  requirePermissions('nomina.periodos.update'),
  reviewNominaPeriodoHandler
);
nominaRoutes.post(
  '/periodos/:id/cerrar',
  requirePermissions('nomina.periodos.close'),
  closeNominaPeriodoHandler
);
nominaRoutes.post(
  '/periodos/:id/pagar',
  requirePermissions('nomina.periodos.pay'),
  payNominaPeriodoHandler
);
nominaRoutes.post(
  '/periodos/:id/anular',
  requirePermissions('nomina.periodos.cancel'),
  cancelNominaPeriodoHandler
);
nominaRoutes.post(
  '/periodos/:id/reabrir',
  requirePermissions('nomina.periodos.reopen'),
  reopenNominaPeriodoHandler
);

nominaRoutes.get(
  '/periodos/:id/empleados',
  requirePermissions('nomina.read'),
  getNominaPeriodoEmpleadosHandler
);
nominaRoutes.post(
  '/periodos/:id/importar-empleados',
  requirePermissions('nomina.empleados.import'),
  importNominaPeriodoEmpleadosHandler
);
nominaRoutes.patch(
  '/empleados/:id',
  requirePermissions('nomina.periodos.update'),
  updateNominaEmpleadoHandler
);
nominaRoutes.post(
  '/periodos/:id/recalcular',
  requirePermissions('nomina.recalculate'),
  recalculateNominaPeriodoHandler
);
nominaRoutes.get(
  '/periodos/:id/plano-bancario',
  requirePermissions('nomina.plano_bancario.export'),
  getNominaPlanoBancarioHandler
);
nominaRoutes.get(
  '/periodos/:id/dashboard',
  requirePermissions('nomina.dashboard.read'),
  getNominaDashboardHandler
);
nominaRoutes.post(
  '/periodos/:id/planilla-pdf',
  requirePermissions('nomina.planilla_pdf.generate'),
  generateNominaPlanillaPdfHandler
);
nominaRoutes.get(
  '/periodos/:periodo_id/asistencia',
  requirePermissions('nomina.read'),
  getNominaAsistenciaHandler
);
nominaRoutes.post(
  '/periodos/:periodo_id/asistencia/generar',
  requirePermissions('nomina.periodos.update'),
  generateNominaAsistenciaHandler
);
nominaRoutes.patch(
  '/asistencia/:id',
  requirePermissions('nomina.periodos.update'),
  updateNominaAsistenciaHandler
);
nominaRoutes.patch(
  '/asistencia/:id/deactivate',
  requirePermissions('nomina.periodos.update'),
  deactivateNominaAsistenciaHandler
);
nominaRoutes.get(
  '/movimientos',
  requirePermissions('nomina.read'),
  getNominaMovimientosHandler
);
nominaRoutes.post(
  '/movimientos',
  requirePermissions('nomina.periodos.update'),
  createNominaMovimientoHandler
);
nominaRoutes.post(
  '/movimientos/recargo',
  requirePermissions('nomina.recargos.create'),
  createNominaRecargoHandler
);
nominaRoutes.patch(
  '/movimientos/:id',
  requirePermissions('nomina.periodos.update'),
  updateNominaMovimientoHandler
);
nominaRoutes.patch(
  '/movimientos/:id/deactivate',
  requirePermissions('nomina.periodos.update'),
  deactivateNominaMovimientoHandler
);

nominaRoutes.get(
  '/liquidaciones/:periodo_id/:vinculacion_id',
  requirePermissions('nomina.read'),
  getNominaLiquidacionHandler
);
nominaRoutes.get(
  '/liquidaciones/:periodo_id',
  requirePermissions('nomina.read'),
  getNominaLiquidacionesHandler
);
nominaRoutes.post(
  '/liquidaciones/:periodo_id/generar',
  requirePermissions('nomina.liquidaciones.generate'),
  generarNominaLiquidacionesHandler
);
nominaRoutes.post(
  '/liquidaciones/:periodo_id/finalizar',
  requirePermissions('nomina.liquidaciones.finalize'),
  finalizeNominaLiquidacionesHandler
);

nominaRoutes.get('/novedades', requirePermissions('nomina.read'), getNominaNovedadesHandler);
nominaRoutes.post(
  '/novedades',
  requirePermissions('nomina.novedades.create'),
  createNominaNovedadHandler
);
nominaRoutes.patch(
  '/novedades/:id',
  requirePermissions('nomina.novedades.update'),
  updateNominaNovedadHandler
);
nominaRoutes.patch(
  '/novedades/:id/deactivate',
  requirePermissions('nomina.novedades.deactivate'),
  deactivateNominaNovedadHandler
);

nominaRoutes.get(
  '/desprendibles/:periodo_id/:vinculacion_id',
  requirePermissions('nomina.desprendibles.read'),
  getNominaDesprendibleHandler
);
nominaRoutes.post(
  '/desprendibles/:periodo_id/generar',
  requirePermissions('nomina.liquidaciones.generate'),
  generateNominaDesprendiblesHandler
);
nominaRoutes.post(
  '/desprendibles/:periodo_id/finalizar',
  requirePermissions('nomina.liquidaciones.finalize'),
  finalizeNominaDesprendiblesHandler
);
nominaRoutes.get(
  '/desprendibles/:periodo_id',
  requirePermissions('nomina.desprendibles.read'),
  getNominaDesprendiblesHandler
);

nominaRoutes.get(
  '/export/:periodo_id',
  requirePermissions('nomina.export'),
  exportNominaPeriodoHandler
);

nominaRoutes.get('/vacaciones', requirePermissions('nomina.vacaciones.read'), getVacacionesHandler);
nominaRoutes.post('/vacaciones', requirePermissions('nomina.vacaciones.write'), createVacacionHandler);
nominaRoutes.patch('/vacaciones/:id', requirePermissions('nomina.vacaciones.write'), updateVacacionHandler);
nominaRoutes.patch(
  '/vacaciones/:id/deactivate',
  requirePermissions('nomina.vacaciones.write'),
  deactivateVacacionHandler
);
nominaRoutes.get(
  '/vacaciones/solicitudes',
  requirePermissions('nomina.vacaciones.read'),
  getVacacionesSolicitudesHandler
);
nominaRoutes.post(
  '/vacaciones/solicitudes',
  requirePermissions('nomina.vacaciones.write'),
  createVacacionesSolicitudHandler
);
nominaRoutes.patch(
  '/vacaciones/solicitudes/:id',
  requirePermissions('nomina.vacaciones.write'),
  updateVacacionesSolicitudHandler
);
nominaRoutes.patch(
  '/vacaciones/solicitudes/:id/aprobar',
  requirePermissions('nomina.vacaciones.write'),
  aprobarVacacionesSolicitudHandler
);
nominaRoutes.patch(
  '/vacaciones/solicitudes/:id/rechazar',
  requirePermissions('nomina.vacaciones.write'),
  rechazarVacacionesSolicitudHandler
);
nominaRoutes.patch(
  '/vacaciones/solicitudes/:id/marcar-disfrutada',
  requirePermissions('nomina.vacaciones.write'),
  marcarDisfrutadaVacacionesSolicitudHandler
);
nominaRoutes.patch(
  '/vacaciones/solicitudes/:id/marcar-pagada',
  requirePermissions('nomina.vacaciones.write'),
  marcarPagadaVacacionesSolicitudHandler
);
nominaRoutes.patch(
  '/vacaciones/solicitudes/:id/deactivate',
  requirePermissions('nomina.vacaciones.write'),
  deactivateVacacionesSolicitudHandler
);
nominaRoutes.get(
  '/vacaciones/dashboard',
  requirePermissions('nomina.vacaciones.dashboard'),
  getVacacionesDashboardHandler
);
nominaRoutes.get(
  '/vacaciones/alertas',
  requirePermissions('nomina.vacaciones.alertas'),
  getVacacionesAlertasHandler
);

nominaRoutes.get('/prima', requirePermissions('nomina.prima.read'), getPrimasHandler);
nominaRoutes.post('/prima', requirePermissions('nomina.prima.write'), createPrimaHandler);
nominaRoutes.patch('/prima/:id', requirePermissions('nomina.prima.write'), updatePrimaHandler);
nominaRoutes.patch('/prima/:id/pagar', requirePermissions('nomina.prima.write'), payPrimaHandler);
nominaRoutes.patch('/prima/:id/deactivate', requirePermissions('nomina.prima.write'), deactivatePrimaHandler);
nominaRoutes.get('/prima/dashboard', requirePermissions('nomina.prima.dashboard'), getPrimaDashboardHandler);
nominaRoutes.get('/prima/alertas', requirePermissions('nomina.prima.alertas'), getPrimaAlertasHandler);

nominaRoutes.get('/cesantias', requirePermissions('nomina.cesantias.read'), getCesantiasHandler);
nominaRoutes.post('/cesantias', requirePermissions('nomina.cesantias.write'), createCesantiaHandler);
nominaRoutes.patch('/cesantias/:id', requirePermissions('nomina.cesantias.write'), updateCesantiaHandler);
nominaRoutes.patch(
  '/cesantias/:id/consignar',
  requirePermissions('nomina.cesantias.write'),
  consignCesantiaHandler
);
nominaRoutes.patch('/cesantias/:id/pagar', requirePermissions('nomina.cesantias.write'), payCesantiaHandler);
nominaRoutes.patch(
  '/cesantias/:id/deactivate',
  requirePermissions('nomina.cesantias.write'),
  deactivateCesantiaHandler
);
nominaRoutes.get(
  '/cesantias/dashboard',
  requirePermissions('nomina.cesantias.dashboard'),
  getCesantiasDashboardHandler
);
nominaRoutes.get(
  '/cesantias/alertas',
  requirePermissions('nomina.cesantias.alertas'),
  getCesantiasAlertasHandler
);

nominaRoutes.get(
  '/intereses-cesantias',
  requirePermissions('nomina.intereses_cesantias.read'),
  getInteresesCesantiasHandler
);
nominaRoutes.post(
  '/intereses-cesantias',
  requirePermissions('nomina.intereses_cesantias.write'),
  createInteresesCesantiaHandler
);
nominaRoutes.patch(
  '/intereses-cesantias/:id',
  requirePermissions('nomina.intereses_cesantias.write'),
  updateInteresesCesantiaHandler
);
nominaRoutes.patch(
  '/intereses-cesantias/:id/pagar',
  requirePermissions('nomina.intereses_cesantias.write'),
  payInteresesCesantiaHandler
);
nominaRoutes.patch(
  '/intereses-cesantias/:id/deactivate',
  requirePermissions('nomina.intereses_cesantias.write'),
  deactivateInteresesCesantiaHandler
);
nominaRoutes.get(
  '/intereses-cesantias/dashboard',
  requirePermissions('nomina.intereses_cesantias.dashboard'),
  getInteresesCesantiasDashboardHandler
);
nominaRoutes.get(
  '/intereses-cesantias/alertas',
  requirePermissions('nomina.intereses_cesantias.alertas'),
  getInteresesCesantiasAlertasHandler
);

nominaRoutes.get(
  '/liquidaciones-finales',
  requirePermissions('nomina.liquidaciones_finales.read'),
  getLiquidacionesFinalesHandler
);
nominaRoutes.post(
  '/liquidaciones-finales',
  requirePermissions('nomina.liquidaciones_finales.write'),
  createLiquidacionFinalHandler
);
nominaRoutes.patch(
  '/liquidaciones-finales/:id',
  requirePermissions('nomina.liquidaciones_finales.write'),
  updateLiquidacionFinalHandler
);
nominaRoutes.patch(
  '/liquidaciones-finales/:id/liquidar',
  requirePermissions('nomina.liquidaciones_finales.write'),
  liquidarLiquidacionFinalHandler
);
nominaRoutes.patch(
  '/liquidaciones-finales/:id/pagar',
  requirePermissions('nomina.liquidaciones_finales.write'),
  payLiquidacionFinalHandler
);
nominaRoutes.patch(
  '/liquidaciones-finales/:id/deactivate',
  requirePermissions('nomina.liquidaciones_finales.write'),
  deactivateLiquidacionFinalHandler
);
nominaRoutes.get(
  '/liquidaciones-finales/dashboard',
  requirePermissions('nomina.liquidaciones_finales.dashboard'),
  getLiquidacionesFinalesDashboardHandler
);
nominaRoutes.get(
  '/liquidaciones-finales/alertas',
  requirePermissions('nomina.liquidaciones_finales.alertas'),
  getLiquidacionesFinalesAlertasHandler
);

export { nominaRoutes };
