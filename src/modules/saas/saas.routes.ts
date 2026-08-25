import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../../middlewares/authMiddleware';
import { tenantMiddleware } from '../../middlewares/tenantMiddleware';
import { AppError } from '../../utils/AppError';
import { asyncHandler } from '../../utils/asyncHandler';
import { changeCompanyPlan, clearCompanyOverride, getCompanySaasHistory, getEmpresaCapabilities, listCompanySaasSummaries, listModules, listPlans, savePlan, setCompanyOverride } from './saas.service';

const router = Router();
router.use(authMiddleware, tenantMiddleware);
const id = z.coerce.number().int().positive();
const planSchema=z.object({codigo:z.string().trim().min(2).max(64),nombre:z.string().trim().min(2).max(120),descripcion:z.string().trim().nullable().optional(),precio_base:z.number().nonnegative().nullable().optional(),moneda:z.string().length(3).nullable().optional(),periodicidad:z.enum(['MENSUAL','TRIMESTRAL','SEMESTRAL','ANUAL','PERSONALIZADA']).nullable().optional(),activo:z.boolean().optional(),orden:z.number().int().optional(),modulo_ids:z.array(id).optional()});
const subscriptionSchema=z.object({plan_id:id,estado:z.enum(['ACTIVA','PRUEBA','SUSPENDIDA','VENCIDA','CANCELADA']),fecha_inicio:z.iso.date(),fecha_fin:z.iso.date().nullable().optional()});
const overrideSchema=z.object({modulo_id:id,habilitado:z.boolean(),motivo:z.string().trim().min(3).max(500),fecha_inicio:z.iso.date(),fecha_fin:z.iso.date().nullable().optional()});
function globalAdmin(req:import('express').Request){if(req.user?.roles.includes('ADMINISTRADOR')!==true)throw new AppError('Global administrator required',403,'FORBIDDEN');}

router.get('/modules',asyncHandler(async(_req,res)=>res.json({data:await listModules()})));
router.get('/plans',asyncHandler(async(_req,res)=>res.json({data:await listPlans()})));
router.get('/companies-summary',asyncHandler(async(req,res)=>{globalAdmin(req);res.json({data:await listCompanySaasSummaries(req.tenant!)});}));
router.post('/plans',asyncHandler(async(req,res)=>{globalAdmin(req);res.status(201).json({data:await savePlan(null,planSchema.parse(req.body),req.user!.userId)});}));
router.put('/plans/:planId',asyncHandler(async(req,res)=>{globalAdmin(req);res.json({data:await savePlan(id.parse(req.params.planId),planSchema.parse(req.body),req.user!.userId)});}));
router.get('/companies/:empresaId/capabilities',asyncHandler(async(req,res)=>res.json({data:await getEmpresaCapabilities(id.parse(req.params.empresaId),req.tenant)})));
router.get('/companies/:empresaId/history',asyncHandler(async(req,res)=>{globalAdmin(req);res.json({data:await getCompanySaasHistory(id.parse(req.params.empresaId),req.tenant)});}));
router.post('/companies/:empresaId/subscriptions',asyncHandler(async(req,res)=>{globalAdmin(req);const input=subscriptionSchema.parse(req.body);res.status(201).json({data:await changeCompanyPlan(id.parse(req.params.empresaId),input.plan_id,input,req.user!.userId,req.tenant)});}));
router.post('/companies/:empresaId/module-overrides',asyncHandler(async(req,res)=>{globalAdmin(req);const input=overrideSchema.parse(req.body);res.status(201).json({data:await setCompanyOverride(id.parse(req.params.empresaId),input.modulo_id,input,req.user!.userId,req.tenant)});}));
router.delete('/companies/:empresaId/module-overrides/:moduleId',asyncHandler(async(req,res)=>{globalAdmin(req);res.json({data:await clearCompanyOverride(id.parse(req.params.empresaId),id.parse(req.params.moduleId),req.user!.userId,req.tenant)});}));
export { router as saasRoutes };
