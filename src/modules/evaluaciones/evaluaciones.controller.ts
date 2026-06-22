import { Request, Response } from 'express';

import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createCompetenciaSchema,
  createEvaluacionPersonaSchema,
  createEvaluacionSchema,
  createRespuestaSchema,
  dashboardQuerySchema,
  dashboardGeneralAlertasQuerySchema,
  dashboardGeneralQuerySchema,
  dashboardGeneralRankingQuerySchema,
  evaluacionParamSchema,
  listEvaluacionesPersonaQuerySchema,
  listEvaluacionesQuerySchema,
  updateCompetenciaSchema,
  updateEvaluacionPersonaSchema,
  updateEvaluacionSchema
} from './evaluaciones.schemas';
import {
  createCompetencia,
  createEvaluacion,
  createEvaluacionPersona,
  createRespuesta,
  deactivateCompetencia,
  deactivateEvaluacion,
  getEvaluacionesDashboardGeneral,
  getEvaluacionesDashboardGeneralAlertas,
  getEvaluacionesDashboardGeneralRanking,
  getEvaluacionesDashboard,
  listCompetencias,
  listEvaluaciones,
  listEvaluacionesPersona,
  updateCompetencia,
  updateEvaluacion,
  updateEvaluacionPersona
} from './evaluaciones.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getEvaluacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listEvaluacionesQuerySchema.parse(req.query);
  const result = await listEvaluaciones(query, req.tenant);

  return successResponse(res, {
    message: 'Evaluaciones retrieved successfully',
    data: result
  });
});

export const createEvaluacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createEvaluacionSchema.parse(req.body);
  const result = await createEvaluacion(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluacion created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateEvaluacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = evaluacionParamSchema.parse(req.params);
  const input = updateEvaluacionSchema.parse(req.body);
  const result = await updateEvaluacion(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluacion updated successfully',
    data: result
  });
});

export const deactivateEvaluacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = evaluacionParamSchema.parse(req.params);
  const result = await deactivateEvaluacion(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluacion deactivated successfully',
    data: result
  });
});

export const getCompetenciasHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = evaluacionParamSchema.parse(req.params);
  const result = await listCompetencias(id, req.tenant);

  return successResponse(res, {
    message: 'Evaluacion competencies retrieved successfully',
    data: result
  });
});

export const createCompetenciaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createCompetenciaSchema.parse(req.body);
  const result = await createCompetencia(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Competencia created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateCompetenciaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = evaluacionParamSchema.parse(req.params);
  const input = updateCompetenciaSchema.parse(req.body);
  const result = await updateCompetencia(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Competencia updated successfully',
    data: result
  });
});

export const deactivateCompetenciaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = evaluacionParamSchema.parse(req.params);
  const result = await deactivateCompetencia(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Competencia deactivated successfully',
    data: result
  });
});

export const getEvaluacionesPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listEvaluacionesPersonaQuerySchema.parse(req.query);
  const result = await listEvaluacionesPersona(query, req.tenant);

  return successResponse(res, {
    message: 'Evaluaciones por persona retrieved successfully',
    data: result
  });
});

export const createEvaluacionPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createEvaluacionPersonaSchema.parse(req.body);
  const result = await createEvaluacionPersona(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluacion por persona created successfully',
    statusCode: 201,
    data: result
  });
});

export const updateEvaluacionPersonaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = evaluacionParamSchema.parse(req.params);
  const input = updateEvaluacionPersonaSchema.parse(req.body);
  const result = await updateEvaluacionPersona(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluacion por persona updated successfully',
    data: result
  });
});

export const createRespuestaHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createRespuestaSchema.parse(req.body);
  const result = await createRespuesta(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluacion response registered successfully',
    data: result
  });
});

export const getEvaluacionesDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = dashboardQuerySchema.parse(req.query);
  const result = await getEvaluacionesDashboard(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluaciones dashboard retrieved successfully',
    data: result
  });
});

export const getEvaluacionesDashboardGeneralHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = dashboardGeneralQuerySchema.parse(req.query);
  const result = await getEvaluacionesDashboardGeneral(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluaciones general dashboard retrieved successfully',
    data: result
  });
});

export const getEvaluacionesDashboardGeneralAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = dashboardGeneralAlertasQuerySchema.parse(req.query);
  const result = await getEvaluacionesDashboardGeneralAlertas(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluaciones general alerts retrieved successfully',
    data: result
  });
});

export const getEvaluacionesDashboardGeneralRankingHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = dashboardGeneralRankingQuerySchema.parse(req.query);
  const result = await getEvaluacionesDashboardGeneralRanking(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Evaluaciones general ranking retrieved successfully',
    data: result
  });
});
