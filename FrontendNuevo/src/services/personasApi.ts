import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type {
  PersonaApi,
  PaginatedPersonasApi,
  VinculacionApi,
  VinculacionExpedienteApi,
  PersonaListItem,
  PersonaFilters,
} from '../types/personas.types';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function buildNombreCompleto(
  p: Pick<PersonaApi, 'primer_nombre' | 'segundo_nombre' | 'primer_apellido' | 'segundo_apellido'>
): string {
  return [p.primer_nombre, p.segundo_nombre, p.primer_apellido, p.segundo_apellido]
    .filter(Boolean)
    .join(' ');
}

export function normalizePersonaListItem(p: PersonaApi): PersonaListItem {
  return {
    id: p.id,
    nombreCompleto: buildNombreCompleto(p),
    numeroDocumento: p.numero_documento,
    correo: p.correo,
    telefono: p.telefono,
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function getPersonas(filters: PersonaFilters = {}): Promise<PaginatedPersonasApi> {
  const params: Record<string, string | number | boolean | undefined> = {};
  if (filters.search) params['search'] = filters.search;
  if (filters.page !== undefined) params['page'] = filters.page;
  if (filters.limit !== undefined) params['limit'] = filters.limit;

  const res = await apiClient.get<ApiResponse<PaginatedPersonasApi>>('/personas', { params });
  return res.data;
}

export async function getPersonaById(id: number): Promise<PersonaApi> {
  const res = await apiClient.get<ApiResponse<PersonaApi>>(`/personas/${id}`);
  return res.data;
}

export async function getVinculacionesByPersonaId(personaId: number): Promise<VinculacionApi[]> {
  const res = await apiClient.get<ApiResponse<VinculacionApi[]>>(
    `/vinculaciones/persona/${personaId}`
  );
  return res.data;
}

export async function getVinculacionExpediente(vinculacionId: number): Promise<VinculacionExpedienteApi> {
  const res = await apiClient.get<ApiResponse<VinculacionExpedienteApi>>(
    `/vinculaciones/${vinculacionId}/expediente`
  );
  return res.data;
}
