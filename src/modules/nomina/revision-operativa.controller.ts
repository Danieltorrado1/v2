import { Request, Response } from 'express';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import { listRevisionOperativa, updateRevisionOperativa, type RevisionOperativaEstado } from './revision-operativa.service';

const actor = (req: Request) => { if (!req.user?.userId) throw new AppError('Authentication required',401,'UNAUTHORIZED'); return req.user.userId; };
export const listRevisionOperativaHandler = asyncHandler(async (req: Request,res: Response) => { const data=await listRevisionOperativa(String(req.params.periodo_id),req.tenant); return successResponse(res,{data,message:'Revision operativa retrieved successfully'}); });
export const updateRevisionOperativaHandler = asyncHandler(async (req: Request,res: Response) => { const estado=req.body?.estado_revision as RevisionOperativaEstado; if(!['PENDIENTE','REVISADO','REQUIERE_REVISION'].includes(estado)) throw new AppError('Estado de revision invalido',400,'NOMINA_REVISION_ESTADO_INVALIDO'); const data=await updateRevisionOperativa(String(req.params.periodo_id),String(req.params.nomina_empleado_id),estado,actor(req),req.tenant,getAuditRequestMeta(req)); return successResponse(res,{data,message:'Revision operativa updated successfully'}); });
