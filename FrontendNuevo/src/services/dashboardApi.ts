import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type {
  DashboardPersonasApi,
  DashboardCoberturaApi,
  DashboardResumenApi,
  DashboardAlertasApi,
  DashboardNominaApi,
  DashboardSSTApi,
  DashboardFilters,
  CargoItem,
  ModalidadSegment,
  DashboardAlertaTipoItem,
  DashboardNominaNormalizada,
  DashboardSSTNormalizado,
} from '../types/dashboard.types';

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getDashboardPersonas(filters?: DashboardFilters): Promise<DashboardPersonasApi> {
  const res = await apiClient.get<ApiResponse<DashboardPersonasApi>>('/dashboard/personas', { params: { ...filters } });
  return res.data;
}

export async function getDashboardCobertura(filters?: DashboardFilters): Promise<DashboardCoberturaApi> {
  const res = await apiClient.get<ApiResponse<DashboardCoberturaApi>>('/dashboard/cobertura', { params: { ...filters } });
  return res.data;
}

export async function getDashboardResumen(filters?: DashboardFilters): Promise<DashboardResumenApi> {
  const res = await apiClient.get<ApiResponse<DashboardResumenApi>>('/dashboard/resumen', { params: { ...filters } });
  return res.data;
}

export async function getDashboardAlertas(filters?: DashboardFilters): Promise<DashboardAlertasApi> {
  const res = await apiClient.get<ApiResponse<DashboardAlertasApi>>('/dashboard/alertas', { params: { ...filters } });
  return res.data;
}

export async function getDashboardNomina(filters?: DashboardFilters): Promise<DashboardNominaApi> {
  const res = await apiClient.get<ApiResponse<DashboardNominaApi>>('/dashboard/nomina', { params: { ...filters } });
  return res.data;
}

export async function getDashboardSST(filters?: DashboardFilters): Promise<DashboardSSTApi> {
  const res = await apiClient.get<ApiResponse<DashboardSSTApi>>('/dashboard/sst', { params: { ...filters } });
  return res.data;
}

// ── Normalizers ───────────────────────────────────────────────────────────────

export function normalizeCargos(data: DashboardPersonasApi): CargoItem[] {
  return data.personas_por_cargo.map((item) => ({
    id: item.cargo_id,
    label: item.cargo_nombre ?? 'Sin cargo',
    value: item.total,
  }));
}

const MODALIDAD_COLORS = [
  'dot-primary',
  'dot-info',
  'dot-warning',
  'dot-success',
  'dot-purple',
  'dot-neutral',
] as const;

export function normalizeModalidadCobertura(data: DashboardCoberturaApi): ModalidadSegment[] {
  return data.cobertura_por_modalidad_base.map((item, i) => ({
    label: item.modalidad_base,
    count: item.asignada_total,
    colorClass: MODALIDAD_COLORS[i % MODALIDAD_COLORS.length] ?? 'dot-neutral',
  }));
}

export function normalizeAlertasTipo(data: DashboardAlertasApi): DashboardAlertaTipoItem[] {
  return data.alertas_por_tipo.map((item) => ({
    tipo: item.tipo_alerta,
    total: item.total,
  }));
}

export function normalizeNomina(data: DashboardNominaApi): DashboardNominaNormalizada {
  return {
    periodosAbiertos: data.periodos_abiertos,
    periodosCerrados: data.periodos_cerrados,
    novedadesPendientes: data.novedades_pendientes,
    totalDevengado: data.total_devengado,
    totalDeducciones: data.total_deducciones,
    totalLiquidado: data.total_liquidado,
    netoPagado: data.neto_pagado,
    ultimoPeriodoNombre: data.ultimo_periodo?.nombre ?? null,
    ultimoPeriodoEstado: data.ultimo_periodo?.estado ?? null,
    ultimoPeriodoEstadoLiquidacion: data.ultimo_periodo?.estado_liquidacion ?? null,
    ultimoPeriodoFechaInicio: data.ultimo_periodo?.fecha_inicio ?? null,
    ultimoPeriodoFechaFin: data.ultimo_periodo?.fecha_fin ?? null,
    novedadesPorTipo: data.novedades_por_tipo,
  };
}

export function normalizeSST(data: DashboardSSTApi): DashboardSSTNormalizado {
  return {
    totalEventos: data.total_eventos,
    accidentesTrabajo: data.accidentes_trabajo,
    incidentes: data.incidentes,
    enfermedadesLaborales: data.enfermedades_laborales,
    capacitaciones: data.capacitaciones,
    entregasEpp: data.entregas_epp,
    planesAbiertos: data.planes_abiertos,
    planesCerrados: data.planes_cerrados,
    planesVencidos: data.planes_vencidos,
    porcentajeCierrePlanes: data.porcentaje_cierre_planes,
  };
}
