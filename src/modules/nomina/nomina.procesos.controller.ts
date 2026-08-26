import type { Request, Response } from 'express';
import { getNominaProcessAccess, listNominaAsistenciaPersonal } from './nomina.procesos';
import { successResponse } from '../../utils/apiResponse';

export async function getNominaProcessAccessHandler(req: Request, res: Response) {
  const empresaId = String(req.query.empresa_id ?? '');
  if (!empresaId || !req.user) return res.status(400).json({ success: false, message: 'empresa_id es requerido' });
  const data = await getNominaProcessAccess(req.user.userId, empresaId, req.tenant);
  return successResponse(res, { data });
}

export async function listNominaAsistenciaPersonalHandler(req: Request, res: Response) {
  const areaId = String(req.params.area_id ?? '');
  const fecha = String(req.query.fecha ?? '');
  if (!areaId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return res.status(400).json({ success: false, message: 'area_id y fecha válidos son requeridos' });
  return successResponse(res, { data: await listNominaAsistenciaPersonal(areaId, fecha, req.tenant) });
}
