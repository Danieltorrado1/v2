import { Request, Response } from 'express';
import { successResponse } from '../../utils/apiResponse';
import { asyncHandler } from '../../utils/asyncHandler';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { AppError } from '../../utils/AppError';
import { nominaEmpleadoReaperturaSchema } from './nomina.schemas';
import {
  closeNominaEmpleadoOperativo,
  listRevisionOperativa,
  reopenNominaEmpleadoOperativo,
  updateRevisionOperativa,
  type RevisionOperativaEstado
} from './revision-operativa.service';

const actor = (req: Request) => { if (!req.user?.userId) throw new AppError('Authentication required',401,'UNAUTHORIZED'); return req.user.userId; };
export const listRevisionOperativaHandler = asyncHandler(async (req: Request,res: Response) => { const data=await listRevisionOperativa(String(req.params.periodo_id),req.tenant); return successResponse(res,{data,message:'Revision operativa retrieved successfully'}); });
export const updateRevisionOperativaHandler = asyncHandler(async (req: Request,res: Response) => { const estado=req.body?.estado_revision as RevisionOperativaEstado; if(!['PENDIENTE','REVISADO','REQUIERE_REVISION'].includes(estado)) throw new AppError('Estado de revision invalido',400,'NOMINA_REVISION_ESTADO_INVALIDO'); if(estado === 'REVISADO' && !req.user?.roles.some((role) => role === 'TALENTO_HUMANO' || role === 'ADMINISTRADOR')) throw new AppError('Solo Talento Humano autorizado puede verificar la operación',403,'NOMINA_REVISION_ROLE_FORBIDDEN'); const data=await updateRevisionOperativa(String(req.params.periodo_id),String(req.params.nomina_empleado_id),estado,actor(req),req.tenant,getAuditRequestMeta(req)); return successResponse(res,{data,message:'Revision operativa updated successfully'}); });
export const closeNominaEmpleadoOperativoHandler = asyncHandler(async (req: Request,res: Response) => { const data=await closeNominaEmpleadoOperativo(String(req.params.periodo_id),String(req.params.nomina_empleado_id),actor(req),req.tenant,getAuditRequestMeta(req)); return successResponse(res,{data,message:'Payroll employee closed successfully'}); });
export const reopenNominaEmpleadoOperativoHandler = asyncHandler(async (req: Request,res: Response) => { const input=nominaEmpleadoReaperturaSchema.parse(req.body ?? {}); const data=await reopenNominaEmpleadoOperativo(String(req.params.periodo_id),String(req.params.nomina_empleado_id),input.motivo,actor(req),req.tenant,getAuditRequestMeta(req)); return successResponse(res,{data,message:'Payroll employee reopened successfully'}); });
