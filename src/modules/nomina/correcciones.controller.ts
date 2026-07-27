import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  anularNominaCorreccionSchema,
  aprobarNominaCorreccionSchema,
  createNominaCorreccionSchema,
  deactivateNominaCorreccionSchema,
  listNominaCorreccionesQuerySchema,
  nominaCorreccionIdParamSchema,
  rechazarNominaCorreccionSchema,
  revisarNominaCorreccionSchema,
  solicitarNominaCorreccionSchema,
  updateNominaCorreccionSchema
} from './correcciones.schemas';
import {
  anularNominaCorreccion,
  aprobarNominaCorreccion,
  createNominaCorreccion,
  deactivateNominaCorreccion,
  getNominaCorreccionById,
  listNominaCorrecciones,
  rechazarNominaCorreccion,
  revisarNominaCorreccion,
  solicitarNominaCorreccion,
  updateNominaCorreccion
} from './correcciones.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getNominaCorreccionesHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = listNominaCorreccionesQuerySchema.parse(req.query);
  const result = await listNominaCorrecciones(query, req.tenant);

  return successResponse(res, {
    message: 'Payroll corrections retrieved successfully',
    data: result
  });
});

export const getNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaCorreccionIdParamSchema.parse(req.params);
  const result = await getNominaCorreccionById(id, req.tenant);

  return successResponse(res, {
    message: 'Payroll correction retrieved successfully',
    data: result
  });
});

export const createNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = createNominaCorreccionSchema.parse(req.body);
  const result = await createNominaCorreccion(
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    statusCode: 201,
    message: 'Payroll correction created successfully',
    data: result
  });
});

export const updateNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaCorreccionIdParamSchema.parse(req.params);
  const input = updateNominaCorreccionSchema.parse(req.body);
  const result = await updateNominaCorreccion(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll correction updated successfully',
    data: result
  });
});

export const solicitarNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaCorreccionIdParamSchema.parse(req.params);
  const input = solicitarNominaCorreccionSchema.parse(req.body);
  const result = await solicitarNominaCorreccion(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll correction requested successfully',
    data: result
  });
});

export const revisarNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaCorreccionIdParamSchema.parse(req.params);
  const input = revisarNominaCorreccionSchema.parse(req.body);
  const result = await revisarNominaCorreccion(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll correction moved to review successfully',
    data: result
  });
});

export const aprobarNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaCorreccionIdParamSchema.parse(req.params);
  const input = aprobarNominaCorreccionSchema.parse(req.body);
  const result = await aprobarNominaCorreccion(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll correction approved successfully',
    data: result
  });
});

export const rechazarNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaCorreccionIdParamSchema.parse(req.params);
  const input = rechazarNominaCorreccionSchema.parse(req.body);
  const result = await rechazarNominaCorreccion(
    id,
    input,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll correction rejected successfully',
    data: result
  });
});

export const anularNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaCorreccionIdParamSchema.parse(req.params);
  const input = anularNominaCorreccionSchema.parse(req.body);
  const result = await anularNominaCorreccion(
    id,
    input.observacion_revision,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll correction canceled successfully',
    data: result
  });
});

export const deactivateNominaCorreccionHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = nominaCorreccionIdParamSchema.parse(req.params);
  deactivateNominaCorreccionSchema.parse(req.body ?? {});
  const result = await deactivateNominaCorreccion(
    id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Payroll correction deactivated successfully',
    data: result
  });
});
