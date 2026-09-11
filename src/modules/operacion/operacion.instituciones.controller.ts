import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { successResponse } from '../../utils/apiResponse';
import { listInstituciones } from './operacion.instituciones.service';

const positive = (value: unknown, fallback: number) => { const n = Number(value); return Number.isInteger(n) && n > 0 ? n : fallback; };
export const getInstitucionesHandler = asyncHandler(async (req: Request, res: Response) => successResponse(res, {
  message: 'Instituciones operativas retrieved successfully',
  data: await listInstituciones({ q: typeof req.query.q === 'string' ? req.query.q : '', municipio_id: req.query.municipio_id ? positive(req.query.municipio_id, 0) : null, institucion_id: req.query.institucion_id ? positive(req.query.institucion_id, 0) : null, sede_id: req.query.sede_id ? positive(req.query.sede_id, 0) : null, modalidad_id: req.query.modalidad_id ? positive(req.query.modalidad_id, 0) : null, page: positive(req.query.page, 1), page_size: Math.min(100, Math.max(1, positive(req.query.page_size, 50))), contrato_id: req.query.contrato_id ? positive(req.query.contrato_id, 0) : null }, req.tenant!)
}));
