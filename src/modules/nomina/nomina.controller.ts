import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  createNominaRecargoSchema,
  createNominaMovimientoSchema,
  createNominaNovedadSchema,
  createNominaPeriodoSchema,
  exportNominaPeriodoQuerySchema,
  listNominaAsistenciaQuerySchema,
  listNominaEmpleadosQuerySchema,
  listNominaLiquidacionesQuerySchema,
  listNominaMovimientosQuerySchema,
  listNominaNovedadesQuerySchema,
  listNominaPeriodosQuerySchema,
  nominaAsistenciaIdParamSchema,
  nominaEmpleadoIdParamSchema,
  nominaMovimientoIdParamSchema,
  nominaNovedadIdParamSchema,
  nominaPeriodoActionSchema,
  periodoIdParamSchema,
  periodoLiquidacionParamSchema,
  periodoVinculacionParamSchema,
  updateNominaAsistenciaSchema,
  updateNominaEmpleadoSchema,
  updateNominaMovimientoSchema,
  updateNominaNovedadSchema,
  updateNominaPeriodoSchema
} from './nomina.schemas';
import {
  cancelNominaPeriodo,
  closeNominaPeriodo,
  createNominaRecargo,
  createNominaMovimiento,
  createNominaNovedad,
  createNominaPeriodo,
  deactivateNominaAsistencia,
  deactivateNominaMovimiento,
  deactivateNominaNovedad,
  exportNominaPeriodo,
  finalizeNominaDesprendibles,
  finalizeNominaLiquidaciones,
  generateNominaAsistencia,
  generateNominaDesprendibles,
  generateNominaPlanillaPdf,
  generarNominaLiquidaciones,
  getNominaDashboard,
  getNominaAsistenciaByPeriodo,
  getNominaPlanoBancarioExport,
  getNominaDesprendibleByPeriodoAndVinculacion,
  getNominaLiquidacionByPeriodoAndVinculacion,
  getNominaMovimientos,
  getNominaPeriodoById,
  importNominaEmpleados,
  listNominaDesprendibles,
  listNominaEmpleados,
  listNominaLiquidaciones,
  listNominaNovedades,
  listNominaPeriodos,
  payNominaPeriodo,
  recalculateNominaPeriodo,
  reopenNominaPeriodo,
  reviewNominaPeriodo,
  updateNominaAsistencia,
  updateNominaEmpleado,
  updateNominaMovimiento,
  updateNominaNovedad,
  updateNominaPeriodo
} from './nomina.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

const resolveForceFlag = (req: Request): boolean => {
  const queryValue = typeof req.query.force === 'string' ? req.query.force : undefined;
  const bodyValue =
    req.body && typeof req.body === 'object' && 'force' in req.body
      ? (req.body as { force?: unknown }).force
      : undefined;

  return nominaPeriodoActionSchema.parse({
    force: bodyValue ?? queryValue
  }).force;
};

export const getNominaPeriodosHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listNominaPeriodosQuerySchema.parse(req.query);
  const result = await listNominaPeriodos(query, req.tenant);

  return successResponse(res, {
    message: 'Payroll periods retrieved successfully',
    data: result
  });
});

export const getNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await getNominaPeriodoById(id, req.tenant);

  if (!result) {
    throw Object.assign(new Error('Payroll period not found'), {
      code: 'NOMINA_PERIODO_NOT_FOUND',
      statusCode: 404
    });
  }

  return successResponse(res, {
    message: 'Payroll period retrieved successfully',
    data: result
  });
});

export const createNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createNominaPeriodoSchema.parse(req.body);
  const result = await createNominaPeriodo(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Payroll period created successfully',
    data: result
  });
});

export const updateNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const input = updateNominaPeriodoSchema.parse(req.body);
  const result = await updateNominaPeriodo(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll period updated successfully',
    data: result
  });
});

export const closeNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await closeNominaPeriodo(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Payroll period closed successfully',
    data: result
  });
});

export const reviewNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await reviewNominaPeriodo(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Payroll period reviewed successfully',
    data: result
  });
});

export const payNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await payNominaPeriodo(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Payroll period paid successfully',
    data: result
  });
});

export const cancelNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await cancelNominaPeriodo(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Payroll period canceled successfully',
    data: result
  });
});

export const reopenNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await reopenNominaPeriodo(
    id,
    {
      force: resolveForceFlag(req)
    },
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll period reopened successfully',
    data: result
  });
});

export const getNominaPeriodoEmpleadosHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const query = listNominaEmpleadosQuerySchema.parse(req.query);
  const result = await listNominaEmpleados(id, query, req.tenant);

  return successResponse(res, {
    message: 'Payroll employees retrieved successfully',
    data: result
  });
});

export const importNominaPeriodoEmpleadosHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await importNominaEmpleados(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll employees imported successfully',
    data: result
  });
});

export const updateNominaEmpleadoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaEmpleadoIdParamSchema.parse(req.params);
  const input = updateNominaEmpleadoSchema.parse(req.body);
  const result = await updateNominaEmpleado(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll employee updated successfully',
    data: result
  });
});

export const recalculateNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await recalculateNominaPeriodo(
    id,
    {
      force: resolveForceFlag(req)
    },
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll period recalculated successfully',
    data: result
  });
});

export const getNominaAsistenciaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const query = listNominaAsistenciaQuerySchema.parse(req.query);
  const result = await getNominaAsistenciaByPeriodo(periodo_id, query, req.tenant);

  return successResponse(res, {
    message: 'Payroll attendance retrieved successfully',
    data: result
  });
});

export const generateNominaAsistenciaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const result = await generateNominaAsistencia(
    periodo_id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll attendance generated successfully',
    data: result
  });
});

export const updateNominaAsistenciaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaAsistenciaIdParamSchema.parse(req.params);
  const input = updateNominaAsistenciaSchema.parse(req.body);
  const result = await updateNominaAsistencia(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll attendance updated successfully',
    data: result
  });
});

export const deactivateNominaAsistenciaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaAsistenciaIdParamSchema.parse(req.params);
  const result = await deactivateNominaAsistencia(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll attendance deactivated successfully',
    data: result
  });
});

export const getNominaMovimientosHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listNominaMovimientosQuerySchema.parse(req.query);
  const result = await getNominaMovimientos(query, req.tenant);

  return successResponse(res, {
    message: 'Payroll movements retrieved successfully',
    data: result
  });
});

export const createNominaMovimientoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createNominaMovimientoSchema.parse(req.body);
  const result = await createNominaMovimiento(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Payroll movement created successfully',
    data: result
  });
});

export const createNominaRecargoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createNominaRecargoSchema.parse(req.body);
  const result = await createNominaRecargo(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Payroll surcharge created successfully',
    data: result
  });
});

export const updateNominaMovimientoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaMovimientoIdParamSchema.parse(req.params);
  const input = updateNominaMovimientoSchema.parse(req.body);
  const result = await updateNominaMovimiento(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll movement updated successfully',
    data: result
  });
});

export const deactivateNominaMovimientoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaMovimientoIdParamSchema.parse(req.params);
  const result = await deactivateNominaMovimiento(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll movement deactivated successfully',
    data: result
  });
});

export const getNominaLiquidacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const query = listNominaLiquidacionesQuerySchema.parse(req.query);
  const result = await listNominaLiquidaciones(periodo_id, query, req.tenant);

  return successResponse(res, {
    message: 'Payroll liquidations retrieved successfully',
    data: result
  });
});

export const getNominaLiquidacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id, vinculacion_id } = periodoVinculacionParamSchema.parse(req.params);
  const result = await getNominaLiquidacionByPeriodoAndVinculacion(periodo_id, vinculacion_id, req.tenant);

  if (!result) {
    throw Object.assign(new Error('Payroll liquidation not found'), {
      code: 'NOMINA_LIQUIDACION_NOT_FOUND',
      statusCode: 404
    });
  }

  return successResponse(res, {
    message: 'Payroll liquidation retrieved successfully',
    data: result
  });
});

export const generarNominaLiquidacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const result = await generarNominaLiquidaciones(
    periodo_id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message:
      result.liquidaciones_generadas === 0
        ? 'No hay vinculaciones retiradas dentro del periodo'
        : 'Payroll liquidations generated successfully',
    data: result
  });
});

export const finalizeNominaLiquidacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const result = await finalizeNominaLiquidaciones(
    periodo_id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll liquidations finalized successfully',
    data: result
  });
});

export const getNominaNovedadesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listNominaNovedadesQuerySchema.parse(req.query);
  const result = await listNominaNovedades(query, req.tenant);

  return successResponse(res, {
    message: 'Payroll novelties retrieved successfully',
    data: result
  });
});

export const createNominaNovedadHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createNominaNovedadSchema.parse(req.body);
  const result = await createNominaNovedad(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Payroll novelty created successfully',
    data: result
  });
});

export const updateNominaNovedadHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaNovedadIdParamSchema.parse(req.params);
  const input = updateNominaNovedadSchema.parse(req.body);
  const result = await updateNominaNovedad(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll novelty updated successfully',
    data: result
  });
});

export const deactivateNominaNovedadHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaNovedadIdParamSchema.parse(req.params);
  const result = await deactivateNominaNovedad(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll novelty deactivated successfully',
    data: result
  });
});

export const getNominaDesprendiblesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const includeVersionsRaw = Array.isArray(req.query.include_versiones)
    ? req.query.include_versiones[0]
    : req.query.include_versiones;
  const includeVersions =
    typeof includeVersionsRaw === 'string' &&
    ['true', '1'].includes(includeVersionsRaw.trim().toLowerCase());
  const result = await listNominaDesprendibles(periodo_id, req.tenant, {
    includeVersions
  });

  return successResponse(res, {
    message: 'Payroll slips retrieved successfully',
    data: result
  });
});

export const getNominaDesprendibleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id, vinculacion_id } = periodoVinculacionParamSchema.parse(req.params);
  const result = await getNominaDesprendibleByPeriodoAndVinculacion(
    periodo_id,
    vinculacion_id,
    req.tenant,
    getActorUserId(req),
    getAuditRequestMeta(req)
  );

  if (!result) {
    throw Object.assign(new Error('Payroll slip not found'), {
      code: 'NOMINA_DESPRENDIBLE_NOT_FOUND',
      statusCode: 404
    });
  }

  return successResponse(res, {
    message: 'Payroll slip retrieved successfully',
    data: result
  });
});

export const generateNominaDesprendiblesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const result = await generateNominaDesprendibles(
    periodo_id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll slips generated successfully',
    data: result
  });
});

export const finalizeNominaDesprendiblesHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const result = await finalizeNominaDesprendibles(
    periodo_id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll slips finalized successfully',
    data: result
  });
});

export const exportNominaPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { periodo_id } = periodoLiquidacionParamSchema.parse(req.params);
  const query = exportNominaPeriodoQuerySchema.parse(req.query);
  const result = await exportNominaPeriodo(
    periodo_id,
    query.tipo,
    query.include_versiones,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.file_name}"`);
  res.status(200).send(result.csv);
});

export const getNominaPlanoBancarioHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await getNominaPlanoBancarioExport(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${result.file_name}"`);
  res.status(200).send(result.csv);
});

export const getNominaDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await getNominaDashboard(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll dashboard retrieved successfully',
    data: result
  });
});

export const generateNominaPlanillaPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = periodoIdParamSchema.parse(req.params);
  const result = await generateNominaPlanillaPdf(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll consolidated PDF generated successfully',
    data: result
  });
});
