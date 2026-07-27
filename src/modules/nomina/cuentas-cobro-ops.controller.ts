import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  changeCuentaCobroOpsEstadoSchema,
  createCuentaCobroOpsSchema,
  cuentaCobroOpsIdParamSchema,
  listCuentasCobroOpsQuerySchema,
  updateCuentaCobroOpsSchema
} from './cuentas-cobro-ops.schemas';
import {
  changeCuentaCobroOpsEstado,
  createCuentaCobroOps,
  deactivateCuentaCobroOps,
  getCuentaCobroOpsById,
  listCuentasCobroOps,
  updateCuentaCobroOps
} from './cuentas-cobro-ops.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;
  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  return userId;
};

const ensurePermission = (req: Request, permission: string): void => {
  if (!req.user) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }
  if (!req.user.permissions.includes(permission)) {
    throw new AppError('Insufficient permissions', 403, 'FORBIDDEN');
  }
};

export const getCuentasCobroOpsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listCuentasCobroOpsQuerySchema.parse(req.query);
  const result = await listCuentasCobroOps(query, req.tenant);

  return successResponse(res, {
    message: 'OPS cuentas de cobro retrieved successfully',
    data: result
  });
});

export const getCuentaCobroOpsByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = cuentaCobroOpsIdParamSchema.parse(req.params);
  const result = await getCuentaCobroOpsById(id, req.tenant);

  return successResponse(res, {
    message: 'OPS cuenta de cobro retrieved successfully',
    data: result
  });
});

export const createCuentaCobroOpsHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createCuentaCobroOpsSchema.parse(req.body);
  const result = await createCuentaCobroOps(input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    statusCode: 201,
    message: 'OPS cuenta de cobro created successfully',
    data: result
  });
});

export const updateCuentaCobroOpsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = cuentaCobroOpsIdParamSchema.parse(req.params);
  const input = updateCuentaCobroOpsSchema.parse(req.body);
  const result = await updateCuentaCobroOps(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'OPS cuenta de cobro updated successfully',
    data: result
  });
});

export const changeCuentaCobroOpsEstadoHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = cuentaCobroOpsIdParamSchema.parse(req.params);
  const input = changeCuentaCobroOpsEstadoSchema.parse(req.body);

  if (input.estado === 'APROBADA') {
    ensurePermission(req, 'nomina.cuentas_cobro_ops.approve');
  } else if (input.estado === 'PAGADA') {
    ensurePermission(req, 'nomina.cuentas_cobro_ops.pay');
  } else {
    ensurePermission(req, 'nomina.cuentas_cobro_ops.update');
  }

  const result = await changeCuentaCobroOpsEstado(id, input, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'OPS cuenta de cobro state updated successfully',
    data: result
  });
});

export const deactivateCuentaCobroOpsHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = cuentaCobroOpsIdParamSchema.parse(req.params);
  const result = await deactivateCuentaCobroOps(id, getActorUserId(req), req.tenant, getAuditRequestMeta(req));

  return successResponse(res, {
    message: 'OPS cuenta de cobro deactivated successfully',
    data: result
  });
});
