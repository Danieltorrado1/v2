import type { Request, Response } from 'express';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { successResponse } from '../../utils/apiResponse';
import { getAuditRequestMeta } from '../auditoria/auditoria.helper';
import { previewCambioModalidad,opcionesCambioModalidad } from './cambios-operativos.service';
import { cambioOperativoParamsSchema, contextoFechaParamsSchema, createCambioOperativoSchema, listCambiosOperativosSchema, resolverTramosParamsSchema, updateCambioOperativoSchema } from './cambios-operativos.schemas';
import { actualizarCambioOperativo, crearCambioOperativo, desactivarCambioOperativo, listarCambiosOperativos, obtenerCambioOperativo, resolverContextoFecha, resolverTramos } from './cambios-operativos.service';
const actor=(req:Request)=>{if(!req.user?.userId)throw new AppError('Authentication required',401,'UNAUTHORIZED');return req.user.userId;};
export const previewCambioModalidadHandler=asyncHandler(async(req:Request,res:Response)=>{
  const input=createCambioOperativoSchema.parse({...req.query,tipo:'CAMBIO_DE_MODALIDAD',motivo:'Vista previa',
    contexto_anterior:{},contexto_nuevo:{institucion_id:req.query.institucion_id,sede_id:req.query.sede_id,modalidad_id:req.query.modalidad_id}});
  return successResponse(res,{data:await previewCambioModalidad(input,req.tenant)});
});
export const opcionesCambioModalidadHandler=asyncHandler(async(req:Request,res:Response)=>{
  const p=resolverTramosParamsSchema.parse(req.params);
  return successResponse(res,{data:await opcionesCambioModalidad(p.periodo_id,p.vinculacion_id,req.tenant)});
});
export const listCambiosOperativosHandler=asyncHandler(async(req:Request,res:Response)=>successResponse(res,{message:'Cambios operativos obtenidos',data:await listarCambiosOperativos(listCambiosOperativosSchema.parse(req.query),req.tenant)}));
export const getCambioOperativoHandler=asyncHandler(async(req:Request,res:Response)=>successResponse(res,{message:'Cambio operativo obtenido',data:await obtenerCambioOperativo(cambioOperativoParamsSchema.parse(req.params).id,req.tenant)}));
export const createCambioOperativoHandler=asyncHandler(async(req:Request,res:Response)=>successResponse(res,{statusCode:201,message:'Cambio operativo creado',data:await crearCambioOperativo(createCambioOperativoSchema.parse(req.body),actor(req),req.tenant,getAuditRequestMeta(req))}));
export const updateCambioOperativoHandler=asyncHandler(async(req:Request,res:Response)=>successResponse(res,{message:'Cambio operativo actualizado',data:await actualizarCambioOperativo(cambioOperativoParamsSchema.parse(req.params).id,updateCambioOperativoSchema.parse(req.body),actor(req),req.tenant,getAuditRequestMeta(req))}));
export const deactivateCambioOperativoHandler=asyncHandler(async(req:Request,res:Response)=>{const motivo=String(req.body?.motivo??'').trim();if(motivo.length<3)throw new AppError('Motivo requerido',400,'NOMINA_CAMBIO_MOTIVO_REQUERIDO');return successResponse(res,{message:'Cambio operativo desactivado',data:await desactivarCambioOperativo(cambioOperativoParamsSchema.parse(req.params).id,motivo,actor(req),req.tenant,getAuditRequestMeta(req))});});
export const resolverTramosHandler=asyncHandler(async(req:Request,res:Response)=>{const p=resolverTramosParamsSchema.parse(req.params);return successResponse(res,{message:'Tramos operativos resueltos',data:await resolverTramos(p.periodo_id,p.vinculacion_id,req.tenant)});});
export const resolverContextoFechaHandler=asyncHandler(async(req:Request,res:Response)=>{const p=contextoFechaParamsSchema.parse(req.params);return successResponse(res,{message:'Contexto operativo resuelto',data:await resolverContextoFecha(p.periodo_id,p.vinculacion_id,p.fecha,req.tenant)});});
