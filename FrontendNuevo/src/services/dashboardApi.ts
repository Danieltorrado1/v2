import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type {
  DashboardPersonasApi,
  DashboardCoberturaApi,
  DashboardResumenApi,
  DashboardAlertasApi,
  DashboardNominaApi,
  DashboardSSTApi,
  CargoItem,
  ModalidadSegment,
  DashboardAlertaTipoItem,
  DashboardNominaNormalizada,
  DashboardSSTNormalizado,
} from '../types/dashboard.types';

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getDashboardPersonas(): Promise<DashboardPersonasApi> {
  const res = await apiClient.get<ApiResponse<DashboardPersonasApi>>('/dashboard/personas');
  return res.data;
}

export async function getDashboardCobertura(): Promise<DashboardCoberturaApi> {
  const res = await apiClient.get<ApiResponse<DashboardCoberturaApi>>('/dashboard/cobertura');
  return res.data;
}

export async function getDashboardResumen(): Promise<DashboardResumenApi> {
  const res = await apiClient.get<ApiResponse<DashboardResumenApi>>('/dashboard/resumen');
  return res.data;
}

export async function getDashboardAlertas(): Promise<DashboardAlertasApi> {
  const res = await apiClient.get<ApiResponse<DashboardAlertasApi>>('/dashboard/alertas');
  return res.data;
}

export async function getDashboardNomina(): Promise<DashboardNominaApi> {
  const res = await apiClient.get<ApiResponse<DashboardNominaApi>>('/dashboard/nomina');
  return res.data;
}

export async function getDashboardSST(): Promise<DashboardSSTApi> {
  const res = await apiClient.get<ApiResponse<DashboardSSTApi>>('/dashboard/sst');
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
    novedadesPendientes: data.novedades_pendientes,
    totalDevengado: data.total_devengado,
    netoPagado: data.neto_pagado,
    ultimoPeriodoNombre: data.ultimo_periodo?.nombre ?? null,
    ultimoPeriodoEstado: data.ultimo_periodo?.estado ?? null,
  };
}

export function normalizeSST(data: DashboardSSTApi): DashboardSSTNormalizado {
  return {
    totalEventos: data.total_eventos,
    accidentesTrabajo: data.accidentes_trabajo,
    capacitaciones: data.capacitaciones,
    porcentajeCierrePlanes: data.porcentaje_cierre_planes,
    planesVencidos: data.planes_vencidos,
    planesAbiertos: data.planes_abiertos,
  };
}
