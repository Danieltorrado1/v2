import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import { env } from '../config/env'; import { getAuthToken } from './tokenStorage';
export type Institution = { id: string; institucion_id: string; institucion: string; dane: string | null; sede_id: string | null; sede: string | null; codigo_dane_sede: string | null; municipio_id: string | null; municipio: string | null; modalidad_id: string | null; modalidad: string | null; cupos: number | null; jornada: string | null; zona: string | null; estado: boolean; sedes?: number; matricula?: number; focalizados?: number };
export type InstitutionOption = { id: string; nombre: string; municipio_id?: string | null; institucion_id?: string | null };
export type InstitutionResult = { items: Institution[]; total: number; page: number; page_size: number; total_pages: number; summary: { instituciones: number; sedes: number; cupos: number }; options: { municipios: InstitutionOption[]; instituciones: InstitutionOption[]; sedes: InstitutionOption[]; modalidades: InstitutionOption[] } };
export type SimatResult = { items: Record<string, unknown>[]; total: number; page: number; limit: number };
export const operacionApi = {
  institutions: (params: Record<string, string | number | undefined>) => apiClient.get<ApiResponse<InstitutionResult>>('/operacion/instituciones', { params }),
  institution: (id: string) => apiClient.get<ApiResponse<Institution & { sedes?: Array<{ id:string; nombre:string; codigo_dane_sede:string|null; consecutivo:string|null; zona_sede:string|null; activo:boolean }> }>>(`/operacion/instituciones/${id}`),
  createSede: (institutionId:string, body:unknown) => apiClient.post<ApiResponse<unknown>>(`/operacion/instituciones/${institutionId}/sedes`, body),
  updateSede: (id:string, body:unknown) => apiClient.patch<ApiResponse<unknown>>(`/operacion/sedes/${id}`, body),
  simat: (params: Record<string, string | number | undefined>) => apiClient.get<ApiResponse<SimatResult>>('/operacion/simat', { params }),
  validateImport: (file: File, contratoId?: number) => { const body = new FormData(); body.append('file', file); if (contratoId) body.append('contrato_id', String(contratoId)); return apiClient.post<ApiResponse<{ importacion_id: string|null; resumen: Record<string, number> }>>('/operacion/simat/import/validate', body); },
  confirmImport: (file: File, contratoId?: number) => { const body = new FormData(); body.append('file', file); if (contratoId) body.append('contrato_id', String(contratoId)); return apiClient.post<ApiResponse<{ importacion_id: string; resumen: Record<string, number> }>>('/operacion/simat/import', body); },
  exportSimat: async (params: Record<string,string|number|undefined>={}) => { const url=new URL(`${env.apiUrl}/operacion/simat/export`); Object.entries(params).forEach(([k,v])=>v!==undefined&&url.searchParams.set(k,String(v))); const response=await fetch(url,{headers:{Authorization:`Bearer ${getAuthToken()??''}`}}); if(!response.ok)throw new Error('No fue posible exportar SIMAT.'); const blob=await response.blob(); const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='simat-filtrado.xlsx';link.click();URL.revokeObjectURL(link.href); },
};
