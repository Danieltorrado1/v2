import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';

export interface SaasModule { id:number;codigo:string;nombre:string;descripcion:string|null;activo:boolean;orden:number }
export interface SaasPlan { id:number;codigo:string;nombre:string;descripcion:string|null;precio_base:string|null;moneda:string|null;periodicidad:string|null;activo:boolean;orden:number;modulos:Array<{id:number;codigo:string;nombre:string;habilitado:boolean}> }
export interface EmpresaCapabilities { empresa:{id:number;nombre:string};organizacion:{id:number;nombre:string}|null;legacy:boolean;suscripcion:null|{id:number;estado:string;fecha_inicio:string;fecha_fin:string|null;plan:{id:number;codigo:string;nombre:string}};modulos:Record<string,boolean>;modulos_habilitados:string[];modulos_deshabilitados:string[];modulos_plan:string[];overrides:Array<{id:number;codigo:string;habilitado:boolean;motivo:string;fecha_inicio:string;fecha_fin:string|null}> }
export interface CompanySaasSummary {empresa_id:string;nombre_empresa:string;nit:string;organizacion_nombre:string;plan_nombre:string;estado_suscripcion:string;modulos_activos:number}
export interface CompanySaasHistory {suscripciones:Array<{id:string;plan_codigo:string;plan_nombre:string;estado:string;fecha_inicio:string;fecha_fin:string|null;created_at:string}>;overrides:Array<{id:string;modulo_codigo:string;modulo_nombre:string;habilitado:boolean;motivo:string;fecha_inicio:string;fecha_fin:string|null;created_at:string}>}
export const saasApi={
  modules:async()=> (await apiClient.get<ApiResponse<SaasModule[]>>('/saas/modules')).data,
  plans:async()=> (await apiClient.get<ApiResponse<SaasPlan[]>>('/saas/plans')).data,
  companySummaries:async()=> (await apiClient.get<ApiResponse<CompanySaasSummary[]>>('/saas/companies-summary')).data,
  history:async(empresaId:number)=> (await apiClient.get<ApiResponse<CompanySaasHistory>>(`/saas/companies/${empresaId}/history`)).data,
  capabilities:async(empresaId:number)=> (await apiClient.get<ApiResponse<EmpresaCapabilities>>(`/saas/companies/${empresaId}/capabilities`)).data,
  createPlan:async(input:unknown)=> (await apiClient.post<ApiResponse<SaasPlan>>('/saas/plans',input)).data,
  updatePlan:async(id:number,input:unknown)=> (await apiClient.put<ApiResponse<SaasPlan>>(`/saas/plans/${id}`,input)).data,
  changePlan:async(empresaId:number,input:unknown)=> (await apiClient.post<ApiResponse<EmpresaCapabilities>>(`/saas/companies/${empresaId}/subscriptions`,input)).data,
  override:async(empresaId:number,input:unknown)=> (await apiClient.post<ApiResponse<EmpresaCapabilities>>(`/saas/companies/${empresaId}/module-overrides`,input)).data,
  clearOverride:async(empresaId:number,moduleId:number)=> (await apiClient.delete<ApiResponse<EmpresaCapabilities>>(`/saas/companies/${empresaId}/module-overrides/${moduleId}`)).data,
};
