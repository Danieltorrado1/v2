import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type {
  DashboardPersonasApi,
  DashboardCoberturaApi,
  CargoItem,
  ModalidadSegment,
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
