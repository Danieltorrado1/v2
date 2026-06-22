import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  alertaIdParamSchema,
  generateAlertasSchema,
  listAlertasQuerySchema,
  listNotificacionesQuerySchema
} from './alertas.schemas';
import {
  deactivateAlerta,
  generateAlertas,
  getAlertaById,
  listAlertas,
  listMisNotificaciones,
  listNotificaciones,
  markAlertaAsLeida,
  markAlertaAsResuelta,
  markAllNotificacionesAsLeidas,
  markNotificacionAsLeida
} from './alertas.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listAlertasQuerySchema.parse(req.query);
  const result = await listAlertas(filters);

  return successResponse(res, {
    message: 'Alerts retrieved successfully',
    data: result
  });
});

export const getAlertaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = alertaIdParamSchema.parse(req.params);
  const alerta = await getAlertaById(id);

  if (!alerta) {
    throw new AppError('Alert not found', 404, 'ALERTA_NOT_FOUND');
  }

  return successResponse(res, {
    message: 'Alert retrieved successfully',
    data: alerta
  });
});

export const generateAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = generateAlertasSchema.parse(req.body ?? {});
  const result = await generateAlertas(input, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Alerts generated successfully',
    statusCode: 201,
    data: result
  });
});

export const markAlertaAsLeidaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = alertaIdParamSchema.parse(req.params);
  const alerta = await markAlertaAsLeida(id, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Alert marked as read successfully',
    data: alerta
  });
});

export const markAlertaAsResueltaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = alertaIdParamSchema.parse(req.params);
  const alerta = await markAlertaAsResuelta(id, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Alert resolved successfully',
    data: alerta
  });
});

export const deactivateAlertaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = alertaIdParamSchema.parse(req.params);
  const alerta = await deactivateAlerta(id, getActorUserId(req), getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Alert deactivated successfully',
    data: alerta
  });
});

export const getNotificacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listNotificacionesQuerySchema.parse(req.query);
  const result = await listNotificaciones(filters);

  return successResponse(res, {
    message: 'Notifications retrieved successfully',
    data: result
  });
});

export const getMisNotificacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listNotificacionesQuerySchema.parse(req.query);
  const { usuario_id: _ignoredUsuarioId, ...ownFilters } = filters;
  const result = await listMisNotificaciones(getActorUserId(req), ownFilters);

  return successResponse(res, {
    message: 'User notifications retrieved successfully',
    data: result
  });
});

export const markNotificacionAsLeidaHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = alertaIdParamSchema.parse(req.params);
    const notificacion = await markNotificacionAsLeida(id, getActorUserId(req));

    return successResponse(res, {
      message: 'Notification marked as read successfully',
      data: notificacion
    });
  }
);

export const markAllNotificacionesAsLeidasHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const result = await markAllNotificacionesAsLeidas(getActorUserId(req));

    return successResponse(res, {
      message: 'Notifications marked as read successfully',
      data: result
    });
  }
);
