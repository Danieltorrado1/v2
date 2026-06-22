import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  auditoriaEntidadParamSchema,
  auditoriaExportQuerySchema,
  auditoriaIdParamSchema,
  auditoriaUsuarioParamSchema,
  listAuditoriaQuerySchema,
  listHistorialCambiosQuerySchema
} from './auditoria.schemas';
import {
  exportAuditoria,
  getAuditoriaByEntidad,
  getAuditoriaByUsuario,
  getHistorialCambiosByEntidad,
  listAuditoria,
  registerAuditEvent,
  requireAuditoriaItem
} from './auditoria.service';

const getCurrentUserId = (req: Request): string | null => {
  return req.user?.userId ?? null;
};

export const getAuditoriaHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = listAuditoriaQuerySchema.parse(req.query);
  const auditoria = await listAuditoria(filters, req.tenant);

  return successResponse(res, {
    message: 'Audit entries retrieved successfully',
    data: auditoria
  });
});

export const getAuditoriaByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = auditoriaIdParamSchema.parse(req.params);
  const auditoria = await requireAuditoriaItem(id, req.tenant);

  return successResponse(res, {
    message: 'Audit entry retrieved successfully',
    data: auditoria
  });
});

export const getAuditoriaByEntidadHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tabla, registro_id } = auditoriaEntidadParamSchema.parse(req.params);
  const pagination = listHistorialCambiosQuerySchema.parse(req.query);
  const auditoria = await getAuditoriaByEntidad(tabla, registro_id, pagination, req.tenant);

  return successResponse(res, {
    message: 'Audit entries retrieved successfully',
    data: auditoria
  });
});

export const getAuditoriaByUsuarioHandler = asyncHandler(async (req: Request, res: Response) => {
  const { usuario_id } = auditoriaUsuarioParamSchema.parse(req.params);

  const currentUserId = getCurrentUserId(req);
  if (currentUserId && req.tenant && !req.tenant.isGlobalAdmin && usuario_id !== currentUserId) {
    throw new AppError('Tenant access denied', 403, 'TENANT_FORBIDDEN');
  }

  const pagination = listHistorialCambiosQuerySchema.parse(req.query);
  const auditoria = await getAuditoriaByUsuario(usuario_id, pagination, req.tenant);

  return successResponse(res, {
    message: 'Audit entries retrieved successfully',
    data: auditoria
  });
});

export const getHistorialCambiosByEntidadHandler = asyncHandler(async (req: Request, res: Response) => {
  const { tabla, registro_id } = auditoriaEntidadParamSchema.parse(req.params);
  const pagination = listHistorialCambiosQuerySchema.parse(req.query);
  const historial = await getHistorialCambiosByEntidad(tabla, registro_id, pagination, req.tenant);

  return successResponse(res, {
    message: 'Change history retrieved successfully',
    data: historial
  });
});

export const exportAuditoriaHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = auditoriaExportQuerySchema.parse(req.query);
  const result = await exportAuditoria(filters, req.tenant);

  if (filters.format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="auditoria.csv"');
    res.status(200).send(result.csv ?? '');
    return;
  }

  return successResponse(res, {
    message: 'Audit export generated successfully',
    data: result.items
  });
});

export const testAuditEventHandler = asyncHandler(async (req: Request, res: Response) => {
  const currentUserId = getCurrentUserId(req);

  await registerAuditEvent({
    accion: 'TEST_EVENT',
    descripcion: 'Evento de prueba de auditoría',
    entidad: 'auditoria_eventos',
    entidad_id: '0',
    modulo: 'AUDITORIA',
    usuario_id: currentUserId
  });

  return successResponse(res, {
    message: 'Audit test event created successfully',
    data: {
      created: true
    }
  });
});
