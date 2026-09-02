import { Router } from 'express';
import multer from 'multer';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { rejectRoles, requireAnyPermissions, requirePermissions, requireRoles } from '../../middlewares/roleMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { requireModule } from '../saas/saas.middleware';
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
  changeCuentaCobroOpsEstadoHandler,
  createCuentaCobroOpsHandler,
  deactivateCuentaCobroOpsHandler,
  getCuentaCobroOpsByIdHandler,
  getCuentasCobroOpsHandler,
  updateCuentaCobroOpsHandler
} from './cuentas-cobro-ops.controller';
import {
  anularNominaCorreccionHandler,
  aprobarNominaCorreccionHandler,
  createNominaCorreccionHandler,
  deactivateNominaCorreccionHandler,
  getNominaCorreccionHandler,
  getNominaCorreccionesHandler,
  rechazarNominaCorreccionHandler,
  revisarNominaCorreccionHandler,
  solicitarNominaCorreccionHandler,
  updateNominaCorreccionHandler
} from './correcciones.controller';
import {
  approveNominaMovimientoHandler,
  cancelNominaPeriodoHandler,
  closeNominaPeriodoHandler,
  createNominaRecargoHandler,
  createNominaMovimientoHandler,
  createNominaNovedadHandler,
  createNominaNovedadConTurnoHandler,
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
  getNominaMovimientoHandler,
  getNominaPlanoBancarioHandler,
  getNominaDesprendibleHandler,
  getNominaDesprendiblesHandler,
  getNominaLiquidacionHandler,
  getNominaLiquidacionesHandler,
  getNominaMovimientosHandler,
  getNominaMovimientosOperativosHandler,
  getNominaNovedadTurnosOperativosHandler,
  getNominaNovedadesHandler,
  getNominaPeriodoEmpleadosHandler,
  getNominaPeriodoEmpleadosOperativosHandler,
  getNominaPeriodoHandler,
  getNominaPeriodosHandler,
  getNominaTipoNovedadHandler,
  getNominaTiposNovedadHandler,
  importNominaPeriodoEmpleadosHandler,
  payNominaPeriodoHandler,
  recalculateNominaPeriodoHandler,
  rejectNominaMovimientoHandler,
  reopenNominaPeriodoHandler,
  reviewNominaMovimientoHandler,
  reviewNominaPeriodoHandler,
  updateNominaAsistenciaHandler,
  markNominaAsistenciaHandler,
  markNominaAsistenciaRangoHandler,
  markNominaAsistenciaMasivaHandler,
  updateNominaEmpleadoHandler,
  updateNominaMovimientoHandler,
  updateNominaNovedadHandler,
  updateNominaPeriodoHandler
} from './nomina.controller';
import {
  createCambioOperativoHandler,
  deactivateCambioOperativoHandler,
  getCambioOperativoHandler,
  listCambiosOperativosHandler,
  resolverContextoFechaHandler,
  resolverTramosHandler,
  updateCambioOperativoHandler
} from './cambios-operativos.controller';
import { closeNominaEmpleadoOperativoHandler, listRevisionOperativaHandler, reopenNominaEmpleadoOperativoHandler, updateRevisionOperativaHandler } from './revision-operativa.controller';
import { getNominaProcessAccessHandler, listNominaAsistenciaPersonalHandler } from './nomina.procesos.controller';
import { createNominaAreaHandler, listNominaAreasHandler, listNominaAssignableUsersHandler, listNominaResponsibilitiesHandler, replaceNominaResponsibilityHandler, updateNominaAreaHandler } from './nomina.procesos.admin.controller';
import { downloadCoberturaCuentaFirmadaHandler, downloadCoberturaCuentaHandler, downloadCoberturaExternoDocumentoHandler, generateCoberturaCuentaHandler, listCoberturaExternoDocumentosHandler, listCoberturaExternosHandler, listCoberturaExternosOperativosHandler, uploadCoberturaCuentaFirmadaHandler, upsertCoberturaExternoHandler, uploadCoberturaExternoDocumentoHandler } from './cobertura.externos.controller';
import {
  getNovedadDocumentHandler,
  getNovedadDocumentsHandler,
  getNovedadSupportHandler,
  uploadNovedadDocumentHandler,
  uploadNovedadSupportHandler,
} from './cobertura.novedad-documentos.controller';

const nominaRoutes = Router();
const coberturaUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

nominaRoutes.use(authMiddleware);
nominaRoutes.use(tenantMiddleware);
nominaRoutes.use(requireModule('NOMINA'));

nominaRoutes.get('/procesos/acceso', requirePermissions('nomina.read'), getNominaProcessAccessHandler);
nominaRoutes.get('/procesos/areas', requirePermissions('nomina.read'), listNominaAreasHandler);
nominaRoutes.get('/procesos/responsabilidades', requirePermissions('nomina.read'), listNominaResponsibilitiesHandler);
nominaRoutes.get('/procesos/usuarios-asignables', requirePermissions('nomina.periodos.update'), listNominaAssignableUsersHandler);
nominaRoutes.post('/procesos/areas', requirePermissions('nomina.periodos.update'), createNominaAreaHandler);
nominaRoutes.patch('/procesos/areas/:area_id', requirePermissions('nomina.periodos.update'), updateNominaAreaHandler);
nominaRoutes.get('/procesos/asistencia/areas/:area_id/personal', requirePermissions('nomina.read'), listNominaAsistenciaPersonalHandler);
nominaRoutes.put('/procesos/responsabilidades', requirePermissions('nomina.periodos.update'), replaceNominaResponsibilityHandler);

// External coverage accounts remain separate from the OPS domain.
nominaRoutes.get('/cobertura/externos', requirePermissions('nomina.movimientos.read'), listCoberturaExternosHandler);
nominaRoutes.get('/cobertura/externos-operativos', requirePermissions('nomina.operativa.read'), listCoberturaExternosOperativosHandler);
nominaRoutes.post('/cobertura/externos', requirePermissions('nomina.movimientos.create'), upsertCoberturaExternoHandler);
nominaRoutes.get('/cobertura/externos/:id/documentos', requirePermissions('nomina.movimientos.read'), listCoberturaExternoDocumentosHandler);
nominaRoutes.get('/cobertura/externos/documentos/:id/download', requirePermissions('nomina.movimientos.read'), downloadCoberturaExternoDocumentoHandler);
nominaRoutes.post('/cobertura/externos/:id/documentos', requirePermissions('nomina.movimientos.create'), coberturaUpload.single('file'), uploadCoberturaExternoDocumentoHandler);
nominaRoutes.post('/cobertura/cuentas-cobro/generar', requirePermissions('nomina.movimientos.create'), generateCoberturaCuentaHandler);
nominaRoutes.get('/cobertura/cuentas-cobro/:id/download', requirePermissions('nomina.movimientos.read'), downloadCoberturaCuentaHandler);
nominaRoutes.get('/cobertura/cuentas-cobro/:id/firmada/download', requirePermissions('nomina.movimientos.read'), downloadCoberturaCuentaFirmadaHandler);
nominaRoutes.post('/cobertura/cuentas-cobro/:id/firmada', requirePermissions('nomina.movimientos.create'), coberturaUpload.single('file'), uploadCoberturaCuentaFirmadaHandler);
nominaRoutes.get('/novedades/:id/documentos', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), getNovedadDocumentsHandler);
nominaRoutes.get('/novedades/:id/documentos/:tipo', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), getNovedadDocumentHandler);
nominaRoutes.post('/novedades/:id/documentos/:tipo', requirePermissions('nomina.novedades.update'), coberturaUpload.single('file'), uploadNovedadDocumentHandler);
nominaRoutes.get('/novedades/:id/soporte', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), getNovedadSupportHandler);
nominaRoutes.post('/novedades/:id/soporte', requirePermissions('nomina.novedades.update'), coberturaUpload.single('file'), uploadNovedadSupportHandler);

nominaRoutes.get('/periodos', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), getNominaPeriodosHandler);
nominaRoutes.get('/periodos/:id', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), getNominaPeriodoHandler);
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
  '/periodos/:id/empleados-operativos',
  requirePermissions('nomina.operativa.read'),
  getNominaPeriodoEmpleadosOperativosHandler
);
nominaRoutes.get(
  '/periodos/:id/empleados',
  rejectRoles('GESTOR'),
  requirePermissions('nomina.economico.read'),
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
  requireAnyPermissions('nomina.operativa.read', 'nomina.read'),
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
  rejectRoles('GESTOR'),
  requirePermissions('nomina.movimientos.read'),
  getNominaMovimientosHandler
);
nominaRoutes.get('/movimientos-operativos', requirePermissions('nomina.operativa.read'), getNominaMovimientosOperativosHandler);
nominaRoutes.get('/novedad-turnos-operativos', requirePermissions('nomina.operativa.read'), getNominaNovedadTurnosOperativosHandler);
nominaRoutes.get(
  '/movimientos/:id',
  rejectRoles('GESTOR'),
  requirePermissions('nomina.movimientos.read'),
  getNominaMovimientoHandler
);
nominaRoutes.post(
  '/movimientos',
  requirePermissions('nomina.movimientos.create'),
  createNominaMovimientoHandler
);
nominaRoutes.post(
  '/movimientos/recargo',
  requirePermissions('nomina.recargos.create'),
  createNominaRecargoHandler
);
nominaRoutes.patch(
  '/movimientos/:id',
  requirePermissions('nomina.movimientos.update'),
  updateNominaMovimientoHandler
);
nominaRoutes.patch(
  '/movimientos/:id/revisar',
  requirePermissions('nomina.movimientos.review'),
  reviewNominaMovimientoHandler
);
nominaRoutes.patch(
  '/movimientos/:id/aprobar',
  requirePermissions('nomina.movimientos.approve'),
  approveNominaMovimientoHandler
);
nominaRoutes.patch(
  '/movimientos/:id/rechazar',
  requirePermissions('nomina.movimientos.review'),
  rejectNominaMovimientoHandler
);
nominaRoutes.patch(
  '/movimientos/:id/deactivate',
  requirePermissions('nomina.movimientos.deactivate'),
  deactivateNominaMovimientoHandler
);
nominaRoutes.post('/periodos/:periodo_id/asistencia/marcar', requirePermissions('nomina.periodos.update'), markNominaAsistenciaHandler);
nominaRoutes.post('/periodos/:periodo_id/asistencia/rango', requirePermissions('nomina.periodos.update'), markNominaAsistenciaRangoHandler);
nominaRoutes.post('/periodos/:periodo_id/asistencia/masiva', requirePermissions('nomina.periodos.update'), markNominaAsistenciaMasivaHandler);
nominaRoutes.get('/periodos/:periodo_id/revision-operativa', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), listRevisionOperativaHandler);
nominaRoutes.patch('/periodos/:periodo_id/revision-operativa/:nomina_empleado_id', requirePermissions('nomina.periodos.update'), updateRevisionOperativaHandler);
nominaRoutes.post('/periodos/:periodo_id/cierre-operativo/:nomina_empleado_id', requireRoles('TALENTO_HUMANO', 'ADMINISTRADOR'), requirePermissions('nomina.periodos.close'), closeNominaEmpleadoOperativoHandler);
nominaRoutes.post('/periodos/:periodo_id/reapertura-operativa/:nomina_empleado_id', requireRoles('TALENTO_HUMANO', 'ADMINISTRADOR'), requirePermissions('nomina.periodos.reopen'), reopenNominaEmpleadoOperativoHandler);

nominaRoutes.get('/cambios-operativos', requireAnyPermissions('nomina.operativa.read', 'nomina.movimientos.read'), listCambiosOperativosHandler);
nominaRoutes.get('/cambios-operativos/:id', requireAnyPermissions('nomina.operativa.read', 'nomina.movimientos.read'), getCambioOperativoHandler);
nominaRoutes.post('/cambios-operativos', requirePermissions('nomina.movimientos.create'), createCambioOperativoHandler);
nominaRoutes.patch('/cambios-operativos/:id', requirePermissions('nomina.movimientos.update'), updateCambioOperativoHandler);
nominaRoutes.patch('/cambios-operativos/:id/deactivate', requirePermissions('nomina.movimientos.deactivate'), deactivateCambioOperativoHandler);
nominaRoutes.get('/periodos/:periodo_id/vinculaciones/:vinculacion_id/tramos-operativos', requireAnyPermissions('nomina.operativa.read', 'nomina.movimientos.read'), resolverTramosHandler);
nominaRoutes.get('/periodos/:periodo_id/vinculaciones/:vinculacion_id/contexto-operativo/:fecha', requireAnyPermissions('nomina.operativa.read', 'nomina.movimientos.read'), resolverContextoFechaHandler);

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

nominaRoutes.get('/tipos-novedad', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), getNominaTiposNovedadHandler);
nominaRoutes.get('/tipos-novedad/:id', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), getNominaTipoNovedadHandler);

nominaRoutes.get('/novedades', requireAnyPermissions('nomina.operativa.read', 'nomina.read'), getNominaNovedadesHandler);
nominaRoutes.post(
  '/novedades',
  requirePermissions('nomina.novedades.create'),
  createNominaNovedadHandler
);
nominaRoutes.post('/novedades/con-turno', requirePermissions('nomina.novedades.create'), createNominaNovedadConTurnoHandler);
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
  requirePermissions('nomina.desprendibles.generate'),
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

nominaRoutes.get(
  '/cuentas-cobro-ops',
  requirePermissions('nomina.cuentas_cobro_ops.read'),
  getCuentasCobroOpsHandler
);
nominaRoutes.get(
  '/cuentas-cobro-ops/:id',
  requirePermissions('nomina.cuentas_cobro_ops.read'),
  getCuentaCobroOpsByIdHandler
);
nominaRoutes.post(
  '/cuentas-cobro-ops',
  requirePermissions('nomina.cuentas_cobro_ops.create'),
  createCuentaCobroOpsHandler
);
nominaRoutes.patch(
  '/cuentas-cobro-ops/:id',
  requirePermissions('nomina.cuentas_cobro_ops.update'),
  updateCuentaCobroOpsHandler
);
nominaRoutes.patch(
  '/cuentas-cobro-ops/:id/estado',
  requirePermissions('nomina.cuentas_cobro_ops.update'),
  changeCuentaCobroOpsEstadoHandler
);
nominaRoutes.patch(
  '/cuentas-cobro-ops/:id/deactivate',
  requirePermissions('nomina.cuentas_cobro_ops.update'),
  deactivateCuentaCobroOpsHandler
);

nominaRoutes.get(
  '/correcciones',
  requirePermissions('nomina.correcciones.read'),
  getNominaCorreccionesHandler
);
nominaRoutes.get(
  '/correcciones/:id',
  requirePermissions('nomina.correcciones.read'),
  getNominaCorreccionHandler
);
nominaRoutes.post(
  '/correcciones',
  requirePermissions('nomina.correcciones.create'),
  createNominaCorreccionHandler
);
nominaRoutes.patch(
  '/correcciones/:id',
  requirePermissions('nomina.correcciones.update'),
  updateNominaCorreccionHandler
);
nominaRoutes.patch(
  '/correcciones/:id/solicitar',
  requirePermissions('nomina.correcciones.update'),
  solicitarNominaCorreccionHandler
);
nominaRoutes.patch(
  '/correcciones/:id/revisar',
  requirePermissions('nomina.correcciones.review'),
  revisarNominaCorreccionHandler
);
nominaRoutes.patch(
  '/correcciones/:id/aprobar',
  requirePermissions('nomina.correcciones.approve'),
  aprobarNominaCorreccionHandler
);
nominaRoutes.patch(
  '/correcciones/:id/rechazar',
  requirePermissions('nomina.correcciones.review'),
  rechazarNominaCorreccionHandler
);
nominaRoutes.patch(
  '/correcciones/:id/anular',
  requirePermissions('nomina.correcciones.cancel'),
  anularNominaCorreccionHandler
);
nominaRoutes.patch(
  '/correcciones/:id/deactivate',
  requirePermissions('nomina.correcciones.update'),
  deactivateNominaCorreccionHandler
);

export { nominaRoutes };

