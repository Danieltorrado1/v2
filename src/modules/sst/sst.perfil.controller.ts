import type { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { personaIdParamSchema } from '../personas/personas.schemas';
import { personaSstPerfilUpdateSchema } from './sst.perfil.schemas';
import {
  getSstPerfilSociodemograficoByPersonaId,
  listSstPerfilSociodemograficoHistorialByPersonaId,
  upsertSstPerfilSociodemografico
} from './sst.perfil.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
};

const hasAnyPermission = (current: string[], expected: string[]): boolean =>
  expected.some((permission) => current.includes(permission));

const canViewSensitiveSstFields = (req: Request): boolean => {
  const roles = req.user?.roles ?? [];
  if (roles.includes('ADMINISTRADOR') || roles.includes('SST')) {
    return true;
  }

  const permissions = req.user?.permissions ?? [];
  return hasAnyPermission(permissions, ['sst.perfil.editar', 'sst.perfil.crear', 'sst.restringido.ver']);
};

export const getPersonaSstPerfilHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const data = await getSstPerfilSociodemograficoByPersonaId(
    Number(id),
    {
      canViewSensitiveFields: canViewSensitiveSstFields(req)
    },
    req.tenant
  );

  return successResponse(res, {
    message: 'SST socio-demographic profile retrieved successfully',
    data
  });
});

export const getPersonaSstPerfilHistorialHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const data = await listSstPerfilSociodemograficoHistorialByPersonaId(
    Number(id),
    {
      canViewSensitiveFields: canViewSensitiveSstFields(req)
    },
    req.tenant
  );

  return successResponse(res, {
    message: 'SST socio-demographic profile history retrieved successfully',
    data
  });
});

export const updatePersonaSstPerfilHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = personaIdParamSchema.parse(req.params);
  const input = personaSstPerfilUpdateSchema.parse(req.body);
  const updated = await upsertSstPerfilSociodemografico(
    Number(id),
    input,
    {
      actorUserId: getActorUserId(req),
      auditMeta: getAuditRequestMeta(req),
      origin: input.origen ?? 'EDICION_MANUAL',
      reason: input.motivo_cambio
    },
    req.tenant
  );

  return successResponse(res, {
    message: 'SST socio-demographic profile updated successfully',
    data: canViewSensitiveSstFields(req)
      ? updated
      : {
          ...updated,
          sensitive_fields_hidden: true
        }
  });
});
