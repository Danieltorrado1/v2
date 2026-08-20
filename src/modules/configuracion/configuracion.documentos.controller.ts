import type { Request, Response } from 'express';

import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { AppError } from '../../utils/AppError';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  contratoRequisitoIdParamsSchema,
  contratoRequisitoListQuerySchema,
  createContratoRequisitoDocumentalSchema,
  toggleContratoRequisitoDocumentalSchema,
  updateContratoRequisitoDocumentalSchema
} from './configuracion.documentos.schemas';
import {
  createContratoRequisitoDocumental,
  listContratoRequisitosDocumentales,
  setContratoRequisitoDocumentalEstado,
  updateContratoRequisitoDocumental
} from './configuracion.documentos.service';

const getActor = (req: Request) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  const auditMeta = getAuditRequestMeta(req);

  return {
    userId: String(userId),
    ip: auditMeta.ip ?? null,
    userAgent: auditMeta.user_agent ?? null
  };
};

export const getContratoRequisitosDocumentalesHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = contratoRequisitoIdParamsSchema
      .pick({ id: true })
      .parse(req.params);
    const query = contratoRequisitoListQuerySchema.parse(req.query);
    const data = await listContratoRequisitosDocumentales(id, query, req.tenant);

    return successResponse(res, {
      message: 'Contract document requirements retrieved successfully',
      data
    });
  }
);

export const createContratoRequisitoDocumentalHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id } = contratoRequisitoIdParamsSchema
      .pick({ id: true })
      .parse(req.params);
    const input = createContratoRequisitoDocumentalSchema.parse(req.body);
    const data = await createContratoRequisitoDocumental(id, input, getActor(req), req.tenant);

    return successResponse(res, {
      statusCode: 201,
      message: 'Contract document requirement created successfully',
      data
    });
  }
);

export const updateContratoRequisitoDocumentalHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id, requisitoId } = contratoRequisitoIdParamsSchema.parse(req.params);
    const input = updateContratoRequisitoDocumentalSchema.parse(req.body);
    const data = await updateContratoRequisitoDocumental(
      id,
      requisitoId,
      input,
      getActor(req),
      req.tenant
    );

    return successResponse(res, {
      message: 'Contract document requirement updated successfully',
      data
    });
  }
);

export const setContratoRequisitoDocumentalEstadoHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { id, requisitoId } = contratoRequisitoIdParamsSchema.parse(req.params);
    const { activo } = toggleContratoRequisitoDocumentalSchema.parse(req.body);
    const data = await setContratoRequisitoDocumentalEstado(
      id,
      requisitoId,
      activo,
      getActor(req),
      req.tenant
    );

    return successResponse(res, {
      message: `Contract document requirement ${activo ? 'activated' : 'deactivated'} successfully`,
      data
    });
  }
);
