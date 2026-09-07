import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';

export interface SaasModule { id:number;codigo:string;nombre:string;descripcion:string|null;activo:boolean;orden:number }
export interface SaasPlan { id:number;codigo:string;nombre:string;descripcion:string|null;precio_base:string|null;moneda:string|null;periodicidad:string|null;activo:boolean;orden:number;modulos:Array<{id:number;codigo:string;nombre:string;habilitado:boolean}> }
export interface EmpresaCapabilities { empresa:{id:number;nombre:string};organizacion:{id:number;nombre:string}|null;legacy:boolean;suscripcion:null|{id:number;estado:string;fecha_inicio:string;fecha_fin:string|null;plan:{id:number;codigo:string;nombre:string}};modulos:Record<string,boolean>;modulos_habilitados:string[];modulos_deshabilitados:string[];modulos_plan:string[];overrides:Array<{id:number;codigo:string;habilitado:boolean;motivo:string;fecha_inicio:string;fecha_fin:string|null}> }
export interface CompanySaasSummary {empresa_id:string;nombre_empresa:string;nit:string;organizacion_nombre:string;plan_nombre:string;estado_suscripcion:string;modulos_activos:number}
export interface GlobalCompanyRow { empresa_id:number; empresa:string; nit:string|null; plan:string; estado:string; fecha_inicio:string|null; fecha_renovacion:string|null; contratos:number; usuarios:number; personal:number; modulos:number; ultima_actividad:string|null }
export interface GlobalCompanyList { items: GlobalCompanyRow[]; pagination:{page:number;limit:number;total:number;total_pages:number} }
export interface CompanyUsage { usuarios:number; personal:number; contratos:number; documentos:number; modulos_habilitados:number }
export interface CompanySaasHistory {suscripciones:Array<{id:string;plan_codigo:string;plan_nombre:string;estado:string;fecha_inicio:string;fecha_fin:string|null;created_at:string}>;overrides:Array<{id:string;modulo_codigo:string;modulo_nombre:string;habilitado:boolean;motivo:string;fecha_inicio:string;fecha_fin:string|null;created_at:string}>}
export const saasApi={
  modules:async()=> (await apiClient.get<ApiResponse<SaasModule[]>>('/saas/modules')).data,
  plans:async()=> (await apiClient.get<ApiResponse<SaasPlan[]>>('/saas/plans')).data,
  companySummaries:async()=> (await apiClient.get<ApiResponse<CompanySaasSummary[]>>('/saas/companies-summary')).data,
  globalCompanies:async(params:Record<string, string|number|boolean|undefined>={})=>(await apiClient.get<ApiResponse<GlobalCompanyList>>('/saas/companies-summary',{params})).data,
  history:async(empresaId:number)=> (await apiClient.get<ApiResponse<CompanySaasHistory>>(`/saas/companies/${empresaId}/history`)).data,
  capabilities:async(empresaId:number)=> (await apiClient.get<ApiResponse<EmpresaCapabilities>>(`/saas/companies/${empresaId}/capabilities`)).data,
  usage:async(empresaId:number)=> (await apiClient.get<ApiResponse<CompanyUsage>>(`/saas/companies/${empresaId}/usage`)).data,
  setStatus:async(empresaId:number,input:{activo:boolean;observacion?:string})=> (await apiClient.patch<ApiResponse<import('../types/configuracion.types').Empresa>>(`/saas/companies/${empresaId}/status`,input)).data,
  createPlan:async(input:unknown)=> (await apiClient.post<ApiResponse<SaasPlan>>('/saas/plans',input)).data,
  updatePlan:async(id:number,input:unknown)=> (await apiClient.put<ApiResponse<SaasPlan>>(`/saas/plans/${id}`,input)).data,
  changePlan:async(empresaId:number,input:unknown)=> (await apiClient.post<ApiResponse<EmpresaCapabilities>>(`/saas/companies/${empresaId}/subscriptions`,input)).data,
  override:async(empresaId:number,input:unknown)=> (await apiClient.post<ApiResponse<EmpresaCapabilities>>(`/saas/companies/${empresaId}/module-overrides`,input)).data,
  clearOverride:async(empresaId:number,moduleId:number)=> (await apiClient.delete<ApiResponse<EmpresaCapabilities>>(`/saas/companies/${empresaId}/module-overrides/${moduleId}`)).data,
};
