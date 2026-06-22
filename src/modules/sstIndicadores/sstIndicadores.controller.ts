import { Request, Response } from 'express';

import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  createIndicadoresPeriodoSchema,
  getIndicadoresAlertasQuerySchema,
  getIndicadoresDashboardQuerySchema,
  getIndicadoresHistoricoQuerySchema,
  listIndicadoresPeriodosQuerySchema
} from './sstIndicadores.schemas';
import {
  createIndicadoresPeriodo,
  getIndicadoresAlertas,
  getIndicadoresDashboard,
  getIndicadoresHistorico,
  listIndicadoresPeriodos
} from './sstIndicadores.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getIndicadoresPeriodosHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listIndicadoresPeriodosQuerySchema.parse(req.query);
  const result = await listIndicadoresPeriodos(filters, req.tenant);

  return successResponse(res, {
    message: 'SST indicator periods retrieved successfully',
    data: result
  });
});

export const createIndicadoresPeriodoHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createIndicadoresPeriodoSchema.parse(req.body);
  const result = await createIndicadoresPeriodo(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST indicator period created successfully',
    statusCode: 201,
    data: result
  });
});

export const getIndicadoresDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = getIndicadoresDashboardQuerySchema.parse(req.query);
  const result = await getIndicadoresDashboard(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST indicators dashboard retrieved successfully',
    data: result
  });
});

export const getIndicadoresHistoricoHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = getIndicadoresHistoricoQuerySchema.parse(req.query);
  const result = await getIndicadoresHistorico(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST indicators historical series retrieved successfully',
    data: result
  });
});

export const getIndicadoresAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = getIndicadoresAlertasQuerySchema.parse(req.query);
  const result = await getIndicadoresAlertas(filters, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'SST indicators alerts retrieved successfully',
    data: result
  });
});
