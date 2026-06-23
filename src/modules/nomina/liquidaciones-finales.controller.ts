import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  createLiquidacionFinalSchema,
  liquidacionesFinalesAlertasQuerySchema,
  liquidacionesFinalesDashboardQuerySchema,
  liquidacionFinalIdParamSchema,
  listLiquidacionesFinalesQuerySchema,
  pagarLiquidacionFinalSchema,
  updateLiquidacionFinalSchema
} from './liquidaciones-finales.schemas';
import {
  createLiquidacionFinal,
  deactivateLiquidacionFinal,
  getLiquidacionesFinalesAlertas,
  getLiquidacionesFinalesDashboard,
  liquidarLiquidacionFinal,
  listLiquidacionesFinales,
  payLiquidacionFinal,
  updateLiquidacionFinal
} from './liquidaciones-finales.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getLiquidacionesFinalesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listLiquidacionesFinalesQuerySchema.parse(req.query);
  const result = await listLiquidacionesFinales(query, req.tenant);

  return successResponse(res, {
    message: 'Liquidacion final records retrieved successfully',
    data: result
  });
});

export const createLiquidacionFinalHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createLiquidacionFinalSchema.parse(req.body);
  const result = await createLiquidacionFinal(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Liquidacion final record created successfully',
    data: result
  });
});

export const updateLiquidacionFinalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = liquidacionFinalIdParamSchema.parse(req.params);
  const input = updateLiquidacionFinalSchema.parse(req.body);
  const result = await updateLiquidacionFinal(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Liquidacion final record updated successfully',
    data: result
  });
});

export const liquidarLiquidacionFinalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = liquidacionFinalIdParamSchema.parse(req.params);
  const result = await liquidarLiquidacionFinal(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Liquidacion final record liquidated successfully',
    data: result
  });
});

export const payLiquidacionFinalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = liquidacionFinalIdParamSchema.parse(req.params);
  const input = pagarLiquidacionFinalSchema.parse(req.body ?? {});
  const result = await payLiquidacionFinal(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Liquidacion final record paid successfully',
    data: result
  });
});

export const deactivateLiquidacionFinalHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = liquidacionFinalIdParamSchema.parse(req.params);
  const result = await deactivateLiquidacionFinal(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Liquidacion final record deactivated successfully',
    data: result
  });
});

export const getLiquidacionesFinalesDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = liquidacionesFinalesDashboardQuerySchema.parse(req.query);
  const result = await getLiquidacionesFinalesDashboard(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Liquidaciones finales dashboard retrieved successfully',
    data: result
  });
});

export const getLiquidacionesFinalesAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = liquidacionesFinalesAlertasQuerySchema.parse(req.query);
  const result = await getLiquidacionesFinalesAlertas(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Liquidaciones finales alerts retrieved successfully',
    data: result
  });
});
