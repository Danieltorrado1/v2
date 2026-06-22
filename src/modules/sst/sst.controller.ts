import { Request, Response } from 'express';

import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createSstAccidenteSchema,
  createSstAccionInspeccionSchema,
  createSstAccionAccidenteSchema,
  createSstDotacionEppEntregaSchema,
  createSstDotacionEppSchema,
  createSstExamenOcupacionalSchema,
  createSstExamenPersonaSchema,
  createSstInspeccionHallazgoSchema,
  createSstInspeccionSchema,
  createSstMatrizRiesgoSchema,
  createSstCapacitacionPersonaSchema,
  createSstCapacitacionSchema,
  calculateSstIndicadoresSchema,
  closeSstAccionInspeccionSchema,
  closeSstPlanAccionSchema,
  createSstEventoSchema,
  createSstPlanAccionSchema,
  listSstAccidentesAlertasQuerySchema,
  listSstAccidentesDashboardQuerySchema,
  listSstAccidentesQuerySchema,
  listSstAccionesInspeccionQuerySchema,
  listSstAccionesAccidenteQuerySchema,
  listSstDotacionEppAlertasQuerySchema,
  listSstDotacionEppDashboardQuerySchema,
  listSstDotacionEppEntregasQuerySchema,
  listSstDotacionEppQuerySchema,
  listSstExamenesAlertasQuerySchema,
  listSstExamenesDashboardQuerySchema,
  listSstExamenesOcupacionalesQuerySchema,
  listSstExamenesPersonaQuerySchema,
  listSstAlertasQuerySchema,
  listSstCapacitacionesPersonaQuerySchema,
  listSstCapacitacionesQuerySchema,
  listSstDashboardQuerySchema,
  listSstDashboardGeneralAlertasQuerySchema,
  listSstDashboardGeneralQuerySchema,
  listSstInspeccionHallazgosQuerySchema,
  listSstInspeccionesAlertasQuerySchema,
  listSstInspeccionesDashboardQuerySchema,
  listSstInspeccionesQuerySchema,
  listSstMatrizRiesgosAlertasQuerySchema,
  listSstMatrizRiesgosDashboardQuerySchema,
  listSstMatrizRiesgosQuerySchema,
  listSstPlanAnualActividadesQuerySchema,
  listSstPlanAnualAlertasQuerySchema,
  listSstPlanAnualDashboardQuerySchema,
  listSstPlanAnualQuerySchema,
  listSstEventosQuerySchema,
  listSstIndicadoresQuerySchema,
  listSstPlanesQuerySchema,
  sstAccidenteIdParamSchema,
  sstIdParamSchema,
  sstNumericIdParamSchema,
  updateSstAccidenteSchema,
  updateSstAccionInspeccionSchema,
  updateSstAccionAccidenteSchema,
  updateSstDotacionEppEntregaSchema,
  updateSstDotacionEppSchema,
  updateSstExamenOcupacionalSchema,
  updateSstExamenPersonaSchema,
  updateSstInspeccionHallazgoSchema,
  updateSstInspeccionSchema,
  updateSstMatrizRiesgoSchema,
  updateSstCapacitacionPersonaSchema,
  updateSstCapacitacionSchema,
  updateSstPlanAnualActividadSchema,
  updateSstPlanAnualSchema,
  updateSstEventoSchema,
  updateSstPlanAccionSchema,
  createSstPlanAnualActividadSchema,
  createSstPlanAnualSchema
} from './sst.schemas';
import {
  createSstAccidente,
  createSstAccionAccidente,
  createSstDotacionEpp,
  createSstDotacionEppEntrega,
  createSstExamenOcupacional,
  createSstExamenPersona,
  createSstCapacitacion,
  createSstCapacitacionPersona,
  calculateSstIndicadores,
  closeSstPlanAccion,
  createSstEvento,
  createSstPlanAccion,
  deactivateSstAccidente,
  deactivateSstAccionAccidente,
  deactivateSstDotacionEpp,
  deactivateSstDotacionEppEntrega,
  deactivateSstExamenOcupacional,
  deactivateSstExamenPersona,
  deactivateSstCapacitacion,
  deactivateSstCapacitacionPersona,
  deactivateSstEvento,
  getSstAccidentesAlertas,
  getSstAccidentesDashboard,
  getSstDotacionEppAlertas,
  getSstDotacionEppDashboard,
  getSstExamenesAlertas,
  getSstExamenesDashboard,
  getSstAlertas,
  getSstCapacitacionesDashboard,
  listSstAccidentes,
  listSstAccionesAccidente,
  listSstDotacionEpp,
  listSstDotacionEppEntregas,
  listSstExamenesOcupacionales,
  listSstExamenesPersona,
  listSstCapacitaciones,
  listSstCapacitacionesPersona,
  getSstEventoById,
  getSstPlanAccionById,
  listSstEventos,
  listSstIndicadores,
  listSstPlanesAccion,
  updateSstAccidente,
  updateSstAccionAccidente,
  updateSstDotacionEpp,
  updateSstDotacionEppEntrega,
  updateSstExamenOcupacional,
  updateSstExamenPersona,
  updateSstCapacitacion,
  updateSstCapacitacionPersona,
  updateSstEvento,
  updateSstPlanAccion
} from './sst.service';
import {
  createSstPlanAnual,
  createSstPlanAnualActividad,
  deactivateSstPlanAnual,
  deactivateSstPlanAnualActividad,
  getSstPlanAnualAlertas,
  getSstPlanAnualDashboard,
  listSstPlanAnual,
  listSstPlanAnualActividades,
  updateSstPlanAnual,
  updateSstPlanAnualActividad
} from './sst.plan-anual.service';
import {
  closeSstAccionInspeccion,
  createSstAccionInspeccion,
  createSstInspeccion,
  createSstInspeccionHallazgo,
  deactivateSstAccionInspeccion,
  deactivateSstInspeccion,
  deactivateSstInspeccionHallazgo,
  getSstInspeccionesAlertas,
  getSstInspeccionesDashboard,
  listSstAccionesInspeccion,
  listSstInspeccionHallazgos,
  listSstInspecciones,
  updateSstAccionInspeccion,
  updateSstInspeccion,
  updateSstInspeccionHallazgo
} from './sst.inspecciones.service';
import {
  createSstMatrizRiesgo,
  deactivateSstMatrizRiesgo,
  getSstMatrizRiesgosAlertas,
  getSstMatrizRiesgosDashboard,
  listSstMatrizRiesgos,
  updateSstMatrizRiesgo
} from './sst.riesgos.service';
import {
  getSstDashboardGeneral,
  getSstDashboardGeneralAlertas
} from './sst.dashboard-general.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getSstCapacitacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstCapacitacionesQuerySchema.parse(req.query);
  const result = await listSstCapacitaciones(filters, req.tenant);

  return successResponse(res, {
    message: 'SST trainings retrieved successfully',
    data: result
  });
});

export const createSstCapacitacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstCapacitacionSchema.parse(req.body);
  const result = await createSstCapacitacion(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST training created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstCapacitacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstCapacitacionSchema.parse(req.body);
  const result = await updateSstCapacitacion(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST training updated successfully',
    data: result
  });
});

export const deactivateSstCapacitacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstCapacitacion(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST training deactivated successfully',
    data: result
  });
});

export const getSstCapacitacionesPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstCapacitacionesPersonaQuerySchema.parse(req.query);
  const result = await listSstCapacitacionesPersona(filters, req.tenant);

  return successResponse(res, {
    message: 'SST person trainings retrieved successfully',
    data: result
  });
});

export const createSstCapacitacionPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstCapacitacionPersonaSchema.parse(req.body);
  const result = await createSstCapacitacionPersona(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST person training created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstCapacitacionPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstCapacitacionPersonaSchema.parse(req.body);
  const result = await updateSstCapacitacionPersona(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST person training updated successfully',
    data: result
  });
});

export const deactivateSstCapacitacionPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstCapacitacionPersona(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST person training deactivated successfully',
    data: result
  });
});

export const getSstDotacionEppHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstDotacionEppQuerySchema.parse(req.query);
  const result = await listSstDotacionEpp(filters, req.tenant);

  return successResponse(res, {
    message: 'SST EPP items retrieved successfully',
    data: result
  });
});

export const createSstDotacionEppHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstDotacionEppSchema.parse(req.body);
  const result = await createSstDotacionEpp(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST EPP item created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstDotacionEppHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstDotacionEppSchema.parse(req.body);
  const result = await updateSstDotacionEpp(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST EPP item updated successfully',
    data: result
  });
});

export const deactivateSstDotacionEppHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstDotacionEpp(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST EPP item deactivated successfully',
    data: result
  });
});

export const getSstDotacionEppEntregasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstDotacionEppEntregasQuerySchema.parse(req.query);
  const result = await listSstDotacionEppEntregas(filters, req.tenant);

  return successResponse(res, {
    message: 'SST EPP deliveries retrieved successfully',
    data: result
  });
});

export const createSstDotacionEppEntregaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstDotacionEppEntregaSchema.parse(req.body);
  const result = await createSstDotacionEppEntrega(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST EPP delivery created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstDotacionEppEntregaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstDotacionEppEntregaSchema.parse(req.body);
  const result = await updateSstDotacionEppEntrega(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST EPP delivery updated successfully',
    data: result
  });
});

export const deactivateSstDotacionEppEntregaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstDotacionEppEntrega(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST EPP delivery deactivated successfully',
    data: result
  });
});

export const getSstDotacionEppDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstDotacionEppDashboardQuerySchema.parse(req.query);
  const result = await getSstDotacionEppDashboard(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST EPP dashboard retrieved successfully',
    data: result
  });
});

export const getSstDotacionEppAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstDotacionEppAlertasQuerySchema.parse(req.query);
  const result = await getSstDotacionEppAlertas(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST EPP alerts retrieved successfully',
    data: result
  });
});

export const getSstExamenesOcupacionalesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstExamenesOcupacionalesQuerySchema.parse(req.query);
  const result = await listSstExamenesOcupacionales(filters, req.tenant);

  return successResponse(res, {
    message: 'SST occupational exams retrieved successfully',
    data: result
  });
});

export const createSstExamenOcupacionalHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstExamenOcupacionalSchema.parse(req.body);
  const result = await createSstExamenOcupacional(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST occupational exam created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstExamenOcupacionalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstExamenOcupacionalSchema.parse(req.body);
  const result = await updateSstExamenOcupacional(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST occupational exam updated successfully',
    data: result
  });
});

export const deactivateSstExamenOcupacionalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstExamenOcupacional(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST occupational exam deactivated successfully',
    data: result
  });
});

export const getSstExamenesPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstExamenesPersonaQuerySchema.parse(req.query);
  const result = await listSstExamenesPersona(filters, req.tenant);

  return successResponse(res, {
    message: 'SST person exams retrieved successfully',
    data: result
  });
});

export const createSstExamenPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstExamenPersonaSchema.parse(req.body);
  const result = await createSstExamenPersona(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST person exam created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstExamenPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstExamenPersonaSchema.parse(req.body);
  const result = await updateSstExamenPersona(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST person exam updated successfully',
    data: result
  });
});

export const deactivateSstExamenPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstExamenPersona(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST person exam deactivated successfully',
    data: result
  });
});

export const getSstExamenesDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstExamenesDashboardQuerySchema.parse(req.query);
  const result = await getSstExamenesDashboard(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST occupational exams dashboard retrieved successfully',
    data: result
  });
});

export const getSstExamenesAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstExamenesAlertasQuerySchema.parse(req.query);
  const result = await getSstExamenesAlertas(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST occupational exam alerts retrieved successfully',
    data: result
  });
});

export const getSstAccidentesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstAccidentesQuerySchema.parse(req.query);
  const result = await listSstAccidentes(filters, req.tenant);

  return successResponse(res, {
    message: 'SST accidents and incidents retrieved successfully',
    data: result
  });
});

export const createSstAccidenteHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstAccidenteSchema.parse(req.body);
  const result = await createSstAccidente(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST accident or incident created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstAccidenteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstAccidenteSchema.parse(req.body);
  const result = await updateSstAccidente(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST accident or incident updated successfully',
    data: result
  });
});

export const deactivateSstAccidenteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstAccidente(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST accident or incident deactivated successfully',
    data: result
  });
});

export const getSstAccionesAccidenteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstAccidenteIdParamSchema.parse(req.params);
  const filters = listSstAccionesAccidenteQuerySchema.parse(req.query);
  const result = await listSstAccionesAccidente(id, filters, req.tenant);

  return successResponse(res, {
    message: 'SST corrective actions retrieved successfully',
    data: result
  });
});

export const createSstAccionAccidenteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstAccidenteIdParamSchema.parse(req.params);
  const input = createSstAccionAccidenteSchema.parse(req.body);
  const result = await createSstAccionAccidente(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST corrective action created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstAccionAccidenteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstAccionAccidenteSchema.parse(req.body);
  const result = await updateSstAccionAccidente(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST corrective action updated successfully',
    data: result
  });
});

export const deactivateSstAccionAccidenteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstAccionAccidente(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST corrective action deactivated successfully',
    data: result
  });
});

export const getSstAccidentesDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstAccidentesDashboardQuerySchema.parse(req.query);
  const result = await getSstAccidentesDashboard(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST accidents dashboard retrieved successfully',
    data: result
  });
});

export const getSstAccidentesAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstAccidentesAlertasQuerySchema.parse(req.query);
  const result = await getSstAccidentesAlertas(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST accident alerts retrieved successfully',
    data: result
  });
});

export const getSstInspeccionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstInspeccionesQuerySchema.parse(req.query);
  const result = await listSstInspecciones(filters, req.tenant);

  return successResponse(res, {
    message: 'SST inspections retrieved successfully',
    data: result
  });
});

export const createSstInspeccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstInspeccionSchema.parse(req.body);
  const result = await createSstInspeccion(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST inspection created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstInspeccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstInspeccionSchema.parse(req.body);
  const result = await updateSstInspeccion(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST inspection updated successfully',
    data: result
  });
});

export const deactivateSstInspeccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstInspeccion(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST inspection deactivated successfully',
    data: result
  });
});

export const getSstInspeccionHallazgosHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const filters = listSstInspeccionHallazgosQuerySchema.parse(req.query);
  const result = await listSstInspeccionHallazgos(id, filters, req.tenant);

  return successResponse(res, {
    message: 'SST inspection findings retrieved successfully',
    data: result
  });
});

export const createSstInspeccionHallazgoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstInspeccionHallazgoSchema.parse(req.body);
  const result = await createSstInspeccionHallazgo(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspection finding created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstInspeccionHallazgoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstInspeccionHallazgoSchema.parse(req.body);
  const result = await updateSstInspeccionHallazgo(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspection finding updated successfully',
    data: result
  });
});

export const deactivateSstInspeccionHallazgoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstInspeccionHallazgo(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspection finding deactivated successfully',
    data: result
  });
});

export const getSstAccionesInspeccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstAccionesInspeccionQuerySchema.parse(req.query);
  const result = await listSstAccionesInspeccion(filters, req.tenant);

  return successResponse(res, {
    message: 'SST inspection actions retrieved successfully',
    data: result
  });
});

export const createSstAccionInspeccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstAccionInspeccionSchema.parse(req.body);
  const result = await createSstAccionInspeccion(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspection action created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstAccionInspeccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstAccionInspeccionSchema.parse(req.body);
  const result = await updateSstAccionInspeccion(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspection action updated successfully',
    data: result
  });
});

export const closeSstAccionInspeccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = closeSstAccionInspeccionSchema.parse(req.body ?? {});
  const result = await closeSstAccionInspeccion(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspection action closed successfully',
    data: result
  });
});

export const deactivateSstAccionInspeccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstAccionInspeccion(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspection action deactivated successfully',
    data: result
  });
});

export const getSstInspeccionesDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstInspeccionesDashboardQuerySchema.parse(req.query);
  const result = await getSstInspeccionesDashboard(
    filters,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspections dashboard retrieved successfully',
    data: result
  });
});

export const getSstInspeccionesAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstInspeccionesAlertasQuerySchema.parse(req.query);
  const result = await getSstInspeccionesAlertas(
    filters,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST inspections alerts retrieved successfully',
    data: result
  });
});

export const getSstMatrizRiesgosHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstMatrizRiesgosQuerySchema.parse(req.query);
  const result = await listSstMatrizRiesgos(filters, req.tenant);

  return successResponse(res, {
    message: 'SST risk matrix retrieved successfully',
    data: result
  });
});

export const createSstMatrizRiesgoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstMatrizRiesgoSchema.parse(req.body);
  const result = await createSstMatrizRiesgo(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST risk matrix entry created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstMatrizRiesgoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstMatrizRiesgoSchema.parse(req.body);
  const result = await updateSstMatrizRiesgo(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST risk matrix entry updated successfully',
    data: result
  });
});

export const deactivateSstMatrizRiesgoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstMatrizRiesgo(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST risk matrix entry deactivated successfully',
    data: result
  });
});

export const getSstMatrizRiesgosDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstMatrizRiesgosDashboardQuerySchema.parse(req.query);
  const result = await getSstMatrizRiesgosDashboard(
    filters,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST risk matrix dashboard retrieved successfully',
    data: result
  });
});

export const getSstMatrizRiesgosAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstMatrizRiesgosAlertasQuerySchema.parse(req.query);
  const result = await getSstMatrizRiesgosAlertas(
    filters,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST risk matrix alerts retrieved successfully',
    data: result
  });
});

export const getSstDashboardGeneralHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstDashboardGeneralQuerySchema.parse(req.query);
  const result = await getSstDashboardGeneral(
    filters,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST consolidated dashboard retrieved successfully',
    data: result
  });
});

export const getSstDashboardGeneralAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstDashboardGeneralAlertasQuerySchema.parse(req.query);
  const result = await getSstDashboardGeneralAlertas(
    filters,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST consolidated alerts retrieved successfully',
    data: result
  });
});

export const getSstDashboardCapacitacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstDashboardQuerySchema.parse(req.query);
  const result = await getSstCapacitacionesDashboard(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST trainings dashboard retrieved successfully',
    data: result
  });
});

export const getSstAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstAlertasQuerySchema.parse(req.query);
  const result = await getSstAlertas(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST alerts retrieved successfully',
    data: result
  });
});

export const getSstPlanAnualHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstPlanAnualQuerySchema.parse(req.query);
  const result = await listSstPlanAnual(filters, req.tenant);

  return successResponse(res, {
    message: 'SST annual plans retrieved successfully',
    data: result
  });
});

export const createSstPlanAnualHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstPlanAnualSchema.parse(req.body);
  const result = await createSstPlanAnual(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST annual plan created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstPlanAnualHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstPlanAnualSchema.parse(req.body);
  const result = await updateSstPlanAnual(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST annual plan updated successfully',
    data: result
  });
});

export const deactivateSstPlanAnualHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstPlanAnual(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST annual plan deactivated successfully',
    data: result
  });
});

export const getSstPlanAnualActividadesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const filters = listSstPlanAnualActividadesQuerySchema.parse(req.query);
  const result = await listSstPlanAnualActividades(id, filters, req.tenant);

  return successResponse(res, {
    message: 'SST annual plan activities retrieved successfully',
    data: result
  });
});

export const createSstPlanAnualActividadHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstPlanAnualActividadSchema.parse(req.body);
  const result = await createSstPlanAnualActividad(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST annual plan activity created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateSstPlanAnualActividadHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const input = updateSstPlanAnualActividadSchema.parse(req.body);
  const result = await updateSstPlanAnualActividad(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST annual plan activity updated successfully',
    data: result
  });
});

export const deactivateSstPlanAnualActividadHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstNumericIdParamSchema.parse(req.params);
  const result = await deactivateSstPlanAnualActividad(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST annual plan activity deactivated successfully',
    data: result
  });
});

export const getSstPlanAnualDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstPlanAnualDashboardQuerySchema.parse(req.query);
  const result = await getSstPlanAnualDashboard(
    filters,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST annual plan dashboard retrieved successfully',
    data: result
  });
});

export const getSstPlanAnualAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstPlanAnualAlertasQuerySchema.parse(req.query);
  const result = await getSstPlanAnualAlertas(
    filters,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST annual plan alerts retrieved successfully',
    data: result
  });
});

export const getSstEventosHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstEventosQuerySchema.parse(req.query);
  const result = await listSstEventos(filters);

  return successResponse(res, {
    message: 'SST events retrieved successfully',
    data: result
  });
});

export const getSstEventoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstIdParamSchema.parse(req.params);
  const evento = await getSstEventoById(id);

  if (!evento) {
    throw new AppError('SST event not found', 404, 'SST_EVENTO_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'SST event retrieved successfully',
    data: evento
  });
});

export const createSstEventoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstEventoSchema.parse(req.body);
  const evento = await createSstEvento(input, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST event created successfully',
    statusCode: 201,
    data: evento
  });
});

export const updateSstEventoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstIdParamSchema.parse(req.params);
  const input = updateSstEventoSchema.parse(req.body);
  const evento = await updateSstEvento(id, input, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST event updated successfully',
    data: evento
  });
});

export const deactivateSstEventoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstIdParamSchema.parse(req.params);
  const evento = await deactivateSstEvento(id, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST event deactivated successfully',
    data: evento
  });
});

export const getSstPlanesAccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstPlanesQuerySchema.parse(req.query);
  const result = await listSstPlanesAccion(filters);

  return successResponse(res, {
    message: 'SST action plans retrieved successfully',
    data: result
  });
});

export const getSstPlanAccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstIdParamSchema.parse(req.params);
  const plan = await getSstPlanAccionById(id);

  if (!plan) {
    throw new AppError('SST action plan not found', 404, 'SST_PLAN_ACCION_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'SST action plan retrieved successfully',
    data: plan
  });
});

export const createSstPlanAccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSstPlanAccionSchema.parse(req.body);
  const plan = await createSstPlanAccion(input, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST action plan created successfully',
    statusCode: 201,
    data: plan
  });
});

export const updateSstPlanAccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstIdParamSchema.parse(req.params);
  const input = updateSstPlanAccionSchema.parse(req.body);
  const plan = await updateSstPlanAccion(
    id,
    input,
    getActorUserId(req),
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'SST action plan updated successfully',
    data: plan
  });
});

export const closeSstPlanAccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = sstIdParamSchema.parse(req.params);
  const input = closeSstPlanAccionSchema.parse(req.body);
  const plan = await closeSstPlanAccion(id, input, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST action plan closed successfully',
    data: plan
  });
});

export const getSstIndicadoresHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listSstIndicadoresQuerySchema.parse(req.query);
  const indicadores = await listSstIndicadores(filters);

  return successResponse(res, {
    message: 'SST indicators retrieved successfully',
    data: indicadores
  });
});

export const calculateSstIndicadoresHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const input = calculateSstIndicadoresSchema.parse(req.body);
    const indicador = await calculateSstIndicadores(
      input,
      getActorUserId(req),
      getAuditRequestMeta(req)
    );

    return successResponse(res, {
      message: 'SST indicators calculated successfully',
      statusCode: 201,
      data: indicador
    });
  }
);
