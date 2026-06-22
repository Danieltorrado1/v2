import { Router } from 'express';

import { authMiddleware } from '../../middlewares/authMiddleware';
import { requirePermissions } from '../../middlewares/roleMiddleware';
import {
  getAuditoriaReportHandler,
  getChecklistDocumentalReportHandler,
  getCoberturaContratoReportHandler,
  getCoberturaFaltantesReportHandler,
  getCoberturaSobrecoberturaReportHandler,
  getDocumentosPorVencerReportHandler,
  getDocumentosVencidosReportHandler,
  getNominaDesprendiblesReportHandler,
  getNominaNovedadesReportHandler,
  getNominaPeriodoReportHandler,
  getPersonalActivoReportHandler,
  getPersonalPorContratoReportHandler,
  getSstEventosReportHandler,
  getSstPlanesAccionReportHandler,
  getVinculacionesHistoricasReportHandler
} from './reportes.controller';

const reportesRoutes = Router();

reportesRoutes.use(authMiddleware);

reportesRoutes.get(
  '/personal-activo',
  requirePermissions('reportes.read'),
  getPersonalActivoReportHandler
);
reportesRoutes.get(
  '/personal-contrato/:contrato_id',
  requirePermissions('reportes.read'),
  getPersonalPorContratoReportHandler
);
reportesRoutes.get(
  '/vinculaciones-historicas',
  requirePermissions('reportes.read'),
  getVinculacionesHistoricasReportHandler
);
reportesRoutes.get(
  '/documentos/checklist/:vinculacion_id',
  requirePermissions('reportes.read'),
  getChecklistDocumentalReportHandler
);
reportesRoutes.get(
  '/documentos/vencidos',
  requirePermissions('reportes.read'),
  getDocumentosVencidosReportHandler
);
reportesRoutes.get(
  '/documentos/por-vencer',
  requirePermissions('reportes.read'),
  getDocumentosPorVencerReportHandler
);
reportesRoutes.get(
  '/cobertura/contrato/:contrato_id',
  requirePermissions('reportes.read'),
  getCoberturaContratoReportHandler
);
reportesRoutes.get(
  '/cobertura/faltantes',
  requirePermissions('reportes.read'),
  getCoberturaFaltantesReportHandler
);
reportesRoutes.get(
  '/cobertura/sobrecobertura',
  requirePermissions('reportes.read'),
  getCoberturaSobrecoberturaReportHandler
);
reportesRoutes.get(
  '/nomina/periodo/:periodo_id',
  requirePermissions('reportes.read'),
  getNominaPeriodoReportHandler
);
reportesRoutes.get(
  '/nomina/novedades/:periodo_id',
  requirePermissions('reportes.read'),
  getNominaNovedadesReportHandler
);
reportesRoutes.get(
  '/nomina/desprendibles/:periodo_id',
  requirePermissions('reportes.read'),
  getNominaDesprendiblesReportHandler
);
reportesRoutes.get('/sst/eventos', requirePermissions('reportes.read'), getSstEventosReportHandler);
reportesRoutes.get(
  '/sst/planes-accion',
  requirePermissions('reportes.read'),
  getSstPlanesAccionReportHandler
);
reportesRoutes.get(
  '/auditoria',
  requirePermissions('reportes.read'),
  getAuditoriaReportHandler
);

export { reportesRoutes };
