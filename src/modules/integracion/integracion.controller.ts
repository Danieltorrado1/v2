import type { Request, Response } from 'express';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { resolveContextoLaboralReadOnly } from './contexto-laboral.service';
import { assertIntegracionOutboxSchema, getIntegracionEvent, listIntegracionEvents, listIntegracionImpacts } from './integracion.service';
import { contextoLaboralQuerySchema, integracionIdParamSchema, integracionListQuerySchema } from './integracion.schemas';

export const getContextoLaboralHandler = asyncHandler(async (req: Request, res: Response) => successResponse(res, { message: 'Contexto laboral resuelto', data: await resolveContextoLaboralReadOnly(contextoLaboralQuerySchema.parse(req.query), req.tenant) }));
export const listIntegracionEventsHandler = asyncHandler(async (req: Request, res: Response) => { await assertIntegracionOutboxSchema(); return successResponse(res, { message: 'Eventos de integración consultados', data: await listIntegracionEvents(integracionListQuerySchema.parse(req.query), req.tenant) }); });
export const getIntegracionEventHandler = asyncHandler(async (req: Request, res: Response) => { await assertIntegracionOutboxSchema(); return successResponse(res, { message: 'Evento de integración consultado', data: await getIntegracionEvent(integracionIdParamSchema.parse(req.params).id.toString(), req.tenant) }); });
export const listIntegracionImpactsHandler = asyncHandler(async (req: Request, res: Response) => { await assertIntegracionOutboxSchema(); return successResponse(res, { message: 'Impactos de integración consultados', data: await listIntegracionImpacts(integracionListQuerySchema.parse(req.query), req.tenant) }); });
