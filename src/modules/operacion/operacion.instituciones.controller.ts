import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { successResponse } from '../../utils/apiResponse';
import { listInstituciones, updateInstitucionFocalizacion } from './operacion.instituciones.service';

const positive = (value: unknown, fallback: number) => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : fallback; };
export const getInstitucionesHandler = asyncHandler(async (req: Request, res: Response) => successResponse(res, {
  message: 'Instituciones operativas retrieved successfully',
  data: await listInstituciones({ q: typeof req.query.q === 'string' ? req.query.q : '', municipio_id: req.query.municipio_id ? positive(req.query.municipio_id, 0) : null, institucion_id: req.query.institucion_id ? positive(req.query.institucion_id, 0) : null, sede_id: req.query.sede_id ? positive(req.query.sede_id, 0) : null, modalidad_id: req.query.modalidad_id ? positive(req.query.modalidad_id, 0) : null, focalizacion_id: req.query.focalizacion_id && req.query.focalizacion_id !== 'all' ? positive(req.query.focalizacion_id, 0) : null, rector: typeof req.query.rector === 'string' ? req.query.rector : '', gestor_id: req.query.gestor_id ? positive(req.query.gestor_id, 0) : null, estado: typeof req.query.estado === 'string' ? req.query.estado : '', page: positive(req.query.page, 1), page_size: Math.min(100, Math.max(1, positive(req.query.page_size, 50))), contrato_id: req.query.contrato_id ? positive(req.query.contrato_id, 0) : null }, req.tenant!)
}));

const actor = (req: Request) => Number(req.user?.userId);
export const updateInstitucionFocalizacionHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = positive(req.params.id, 0);
  const body = req.body as Record<string, unknown>;
  const integer = (key: string) => body[key] === null ? null : body[key] === undefined ? undefined : Number.isInteger(Number(body[key])) ? Number(body[key]) : undefined;
  const data = await updateInstitucionFocalizacion(id, { matriculados_primaria: integer('matriculados_primaria'), matriculados_secundaria: integer('matriculados_secundaria'), cupos_primaria: integer('cupos_primaria'), cupos_secundaria: integer('cupos_secundaria'), estado: typeof body.estado === 'string' ? body.estado : undefined }, req.tenant!, actor(req));
  return successResponse(res, { data, message: 'Focalización mensual actualizada.' });
});
