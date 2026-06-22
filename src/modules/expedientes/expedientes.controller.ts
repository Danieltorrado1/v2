import { Request, Response } from 'express';

import { AppError } from '../../utils/AppError';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import {
  expedienteAlertasQuerySchema,
  expedientePersonaParamSchema,
  expedienteTimelineQuerySchema
} from './expedientes.schemas';
import {
  generateExpedienteLaboralPdf,
  getExpedienteLaboralConsolidado,
  getExpedientePersonaAlertas,
  getExpedientePersonaTimeline
} from './expedientes.service';

const getActorUserId = (req: Request): string => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new AppError('Authentication required', 401, 'UNAUTHORIZED');
  }

  return userId;
};

export const getExpedienteLaboralConsolidadoHandler = asyncHandler(
  async (req: Request, res: Response) => {
    const { persona_id } = expedientePersonaParamSchema.parse(req.params);
    const expediente = await getExpedienteLaboralConsolidado(
      persona_id,
      getActorUserId(req),
      req.tenant,
      getAuditRequestMeta(req)
    );

    return successResponse(res, {
      message: 'Expediente laboral consolidado retrieved successfully',
      data: expediente
    });
  }
);

export const getExpedientePersonaAlertasHandler = asyncHandler(async (req: Request, res: Response) => {
  const { persona_id } = expedientePersonaParamSchema.parse(req.params);
  const query = expedienteAlertasQuerySchema.parse(req.query);
  const result = await getExpedientePersonaAlertas(
    persona_id,
    query,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Expediente alerts retrieved successfully',
    data: result
  });
});

export const getExpedientePersonaTimelineHandler = asyncHandler(async (req: Request, res: Response) => {
  const { persona_id } = expedientePersonaParamSchema.parse(req.params);
  const query = expedienteTimelineQuerySchema.parse(req.query);
  const result = await getExpedientePersonaTimeline(
    persona_id,
    query,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Expediente timeline retrieved successfully',
    data: result
  });
});

export const generateExpedienteLaboralPdfHandler = asyncHandler(async (req: Request, res: Response) => {
  const { persona_id } = expedientePersonaParamSchema.parse(req.params);
  const result = await generateExpedienteLaboralPdf(
    persona_id,
    getActorUserId(req),
    req.tenant,
    getAuditRequestMeta(req)
  );

  return successResponse(res, {
    message: 'Expediente PDF generated successfully',
    data: result
  });
});
