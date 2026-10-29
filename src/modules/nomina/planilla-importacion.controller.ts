import type { Request, Response } from 'express';
import { z } from 'zod';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { executePlanillaImport } from './planilla-importacion.service';

const base=z.object({empresa_id:z.string().regex(/^[1-9]\d*$/).optional()}).strict();
const confirm=base.extend({token:z.string().min(1).max(4096),confirmar:z.literal('CONFIRMAR'),motivo:z.string().trim().min(10).max(1000)}).strict();
const handler=(confirmation:boolean,execute=executePlanillaImport)=>asyncHandler(async(req:Request,res:Response)=>{
  if (!req.user?.userId || !req.tenant || String(req.tenant.userId)!==req.user.userId) throw new AppError('Authenticated tenant required',403,'TENANT_REQUIRED');
  const id=z.string().regex(/^[1-9]\d*$/).parse(req.params.id);
  z.object({}).strict().parse(req.query);
  const body=(confirmation ? confirm : base).parse(req.body ?? {});
  if (!req.file || !/\.xlsx$/i.test(req.file.originalname)) throw new AppError('Seleccione un archivo .xlsx',422,'PLANILLA_ARCHIVO_REQUERIDO');
  res.setHeader('Cache-Control','private, no-store');
  try {
    const result=await execute({archivo:req.file.buffer,periodoId:id,tenant:req.tenant,empresaId:body.empresa_id,
      ...(confirmation ? {confirmacion:confirm.parse(body)} : {}),auditMeta:{ip:req.ip,user_agent:req.get('user-agent')}});
    res.status(200).json({success:true,data:result});
  } catch(error) {
    // This is the importer-generated, sanitized operation report, never raw SQL
    // details/stack traces. Preserve it also when NODE_ENV=production.
    if (error instanceof AppError && error.details && typeof error.details==='object' && 'reporte' in error.details) {
      res.status(error.statusCode).json({success:false,error:{code:error.code,message:error.message,details:{reporte:error.details.reporte}}});
    } else throw error;
  }
});
export const previewPlanillaImportHandler=handler(false);
export const confirmPlanillaImportHandler=handler(true);
export const createPlanillaImportHandlers=(execute:typeof executePlanillaImport)=>({preview:handler(false,execute),confirm:handler(true,execute)});
