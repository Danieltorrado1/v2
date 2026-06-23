import { apiGet } from "../lib/api";
import { sstApi } from "./sstApi";
import { evaluacionesApi } from "./evaluacionesApi";
import { nominaApi } from "./nominaApi";

export interface TenantParams {
  empresa_id?: number | string;
  contrato_id?: number | string;
}

function toQuery(params: TenantParams = {}): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString()}`;
}

export interface DashboardResumen {
  total_personas: number;
}

export interface DashboardDocumentos {
  cumplimiento_documental_promedio: number;
}

export interface SstDashboardGeneral {
  resumen: {
    alertas_total: number;
    cumplimiento_general_sst: number;
  };
}

export interface EvaluacionesDashboardGeneral {
  promedio_general: number;
}

export interface VacacionesDashboard {
  solicitudes_pendientes: number;
}

export interface PrimaDashboard {
  valor_total_pagado: number;
}

export interface CesantiasDashboard {
  valor_total_consignado: number;
}

export interface InteresesCesantiasDashboard {
  valor_total_pagado: number;
}

export interface LiquidacionesFinalesDashboard {
  valor_total_pagado: number;
}

export const dashboardApi = {
  // GET /dashboard/resumen — closest real equivalent to the generic
  // "GET /api/dashboard" requested; the literal route does not exist.
  getResumen: (params?: TenantParams) =>
    apiGet<DashboardResumen>(`/dashboard/resumen${toQuery(params)}`),

  // GET /dashboard/documentos — holds the document-compliance KPI.
  getDocumentos: (params?: TenantParams) =>
    apiGet<DashboardDocumentos>(`/dashboard/documentos${toQuery(params)}`),

  getSstDashboardGeneral: (params?: TenantParams) =>
    sstApi.get<SstDashboardGeneral>(`/dashboard-general${toQuery(params)}`),

  getEvaluacionesDashboardGeneral: (params?: TenantParams) =>
    evaluacionesApi.get<EvaluacionesDashboardGeneral>(`/dashboard-general${toQuery(params)}`),

  getVacacionesDashboard: (params?: TenantParams) =>
    nominaApi.get<VacacionesDashboard>(`/vacaciones/dashboard${toQuery(params)}`),

  getPrimaDashboard: (params?: TenantParams) =>
    nominaApi.get<PrimaDashboard>(`/prima/dashboard${toQuery(params)}`),

  getCesantiasDashboard: (params?: TenantParams) =>
    nominaApi.get<CesantiasDashboard>(`/cesantias/dashboard${toQuery(params)}`),

  getInteresesCesantiasDashboard: (params?: TenantParams) =>
    nominaApi.get<InteresesCesantiasDashboard>(`/intereses-cesantias/dashboard${toQuery(params)}`),

  getLiquidacionesFinalesDashboard: (params?: TenantParams) =>
    nominaApi.get<LiquidacionesFinalesDashboard>(`/liquidaciones-finales/dashboard${toQuery(params)}`),
};
