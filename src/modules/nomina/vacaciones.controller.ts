import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  createSolicitudSchema,
  createVacacionSchema,
  listSolicitudesQuerySchema,
  listVacacionesQuerySchema,
  solicitudActionSchema,
  solicitudIdParamSchema,
  updateSolicitudSchema,
  updateVacacionSchema,
  vacacionIdParamSchema,
  vacacionesAlertasQuerySchema,
  vacacionesDashboardQuerySchema
} from './vacaciones.schemas';
import {
  approveSolicitud,
  createSolicitud,
  createVacacion,
  deactivateSolicitud,
  deactivateVacacion,
  getVacacionesAlertas,
  getVacacionesDashboard,
  listSolicitudes,
  listVacaciones,
  markSolicitudDisfrutada,
  markSolicitudPagada,
  rejectSolicitud,
  updateSolicitud,
  updateVacacion
} from './vacaciones.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getVacacionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listVacacionesQuerySchema.parse(req.query);
  const result = await listVacaciones(query, req.tenant);

  return successResponse(res, {
    message: 'Vacation records retrieved successfully',
    data: result
  });
});

export const createVacacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createVacacionSchema.parse(req.body);
  const result = await createVacacion(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Vacation record created successfully',
    data: result
  });
});

export const updateVacacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vacacionIdParamSchema.parse(req.params);
  const input = updateVacacionSchema.parse(req.body);
  const result = await updateVacacion(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Vacation record updated successfully',
    data: result
  });
});

export const deactivateVacacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = vacacionIdParamSchema.parse(req.params);
  const result = await deactivateVacacion(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Vacation record deactivated successfully',
    data: result
  });
});

export const getVacacionesSolicitudesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listSolicitudesQuerySchema.parse(req.query);
  const result = await listSolicitudes(query, req.tenant);

  return successResponse(res, {
    message: 'Vacation requests retrieved successfully',
    data: result
  });
});

export const createVacacionesSolicitudHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createSolicitudSchema.parse(req.body);
  const result = await createSolicitud(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'Vacation request created successfully',
    data: result
  });
});

export const updateVacacionesSolicitudHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = solicitudIdParamSchema.parse(req.params);
  const input = updateSolicitudSchema.parse(req.body);
  const result = await updateSolicitud(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Vacation request updated successfully',
    data: result
  });
});

export const aprobarVacacionesSolicitudHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = solicitudIdParamSchema.parse(req.params);
  const input = solicitudActionSchema.parse(req.body);
  const result = await approveSolicitud(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req), input);

  return successResponse(res, {
    message: 'Vacation request approved successfully',
    data: result
  });
});

export const rechazarVacacionesSolicitudHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = solicitudIdParamSchema.parse(req.params);
  const input = solicitudActionSchema.parse(req.body);
  const result = await rejectSolicitud(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req), input);

  return successResponse(res, {
    message: 'Vacation request rejected successfully',
    data: result
  });
});

export const marcarDisfrutadaVacacionesSolicitudHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = solicitudIdParamSchema.parse(req.params);
  const input = solicitudActionSchema.parse(req.body);
  const result = await markSolicitudDisfrutada(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req), input);

  return successResponse(res, {
    message: 'Vacation request marked as enjoyed successfully',
    data: result
  });
});

export const marcarPagadaVacacionesSolicitudHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = solicitudIdParamSchema.parse(req.params);
  const input = solicitudActionSchema.parse(req.body);
  const result = await markSolicitudPagada(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req), input);

  return successResponse(res, {
    message: 'Vacation request marked as paid successfully',
    data: result
  });
});

export const deactivateVacacionesSolicitudHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = solicitudIdParamSchema.parse(req.params);
  const result = await deactivateSolicitud(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Vacation request deactivated successfully',
    data: result
  });
});

export const getVacacionesDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = vacacionesDashboardQuerySchema.parse(req.query);
  const result = await getVacacionesDashboard(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Vacation dashboard retrieved successfully',
    data: result
  });
});

export const getVacacionesAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = vacacionesAlertasQuerySchema.parse(req.query);
  const result = await getVacacionesAlertas(query, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'Vacation alerts retrieved successfully',
    data: result
  });
});
