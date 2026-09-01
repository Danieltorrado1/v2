import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type { VinculacionApi, VinculacionExpedienteApi } from '../types/personas.types';
import type {
  ContractPersonalFilters,
  ContractPersonalListResponse,
  ContractPersonalFilterOptions,
  GestorAssignmentUser,
  GestorAssignmentWorkspace,
  GestorMunicipioAssignment,
  GestorPersonalAssignment,
  PersonalResumen,
  SaveGestorAssignmentsPayload,
  SaveGestorAssignmentsResult,
  VinculacionFilters,
  VinculacionListResponse,
  CreateVinculacionPayload,
  UpdateVinculacionPayload,
  RetirarVinculacionPayload,
  SuspenderVinculacionPayload,
  ReactivarVinculacionPayload,
} from '../types/vinculaciones.types';

function toParams(f: VinculacionFilters): Record<string, string | number | boolean | undefined> {
  const p: Record<string, string | number | boolean | undefined> = {};
  if (f.persona_id          != null) p['persona_id']          = f.persona_id;
  if (f.empresa_id          != null) p['empresa_id']          = f.empresa_id;
  if (f.contrato_id         != null) p['contrato_id']         = f.contrato_id;
  if (f.tipo_vinculacion_id != null) p['tipo_vinculacion_id'] = f.tipo_vinculacion_id;
  if (f.contrato_cargo_id   != null) p['contrato_cargo_id']   = f.contrato_cargo_id;
  if (f.estado_vinculacion)          p['estado_vinculacion']  = f.estado_vinculacion;
  if (f.fecha_inicio_desde)          p['fecha_inicio_desde']  = f.fecha_inicio_desde;
  if (f.fecha_inicio_hasta)          p['fecha_inicio_hasta']  = f.fecha_inicio_hasta;
  if (f.page  != null)               p['page']                = f.page;
  if (f.limit != null)               p['limit']               = f.limit;
  return p;
}

export async function getVinculaciones(filters: VinculacionFilters = {}): Promise<VinculacionListResponse> {
  const res = await apiClient.get<ApiResponse<VinculacionListResponse>>('/vinculaciones', {
    params: toParams(filters),
  });
  return res.data;
}

export async function getContractPersonal(
  filters: ContractPersonalFilters
): Promise<ContractPersonalListResponse> {
  const params: Record<string, string | number | boolean | undefined> = {
    contrato_id: filters.contrato_id,
    contrato_cargo_id: filters.contrato_cargo_id,
    estado_vinculacion: filters.estado_vinculacion,
    search: filters.search,
    page: filters.page,
    limit: filters.limit,
    fecha: filters.fecha,
    municipio_id: filters.municipio_id,
    institucion_id: filters.institucion_id,
    sede_id: filters.sede_id,
    modalidad_id: filters.modalidad_id,
    modalidad_codigo: filters.modalidad_codigo,
    ubicacion_laboral_id: filters.ubicacion_laboral_id,
    cobertura: filters.cobertura,
    licitacion: filters.licitacion,
    gestor_usuario_id: filters.gestor_usuario_id,
    sin_gestor: filters.sin_gestor,
  };
  const res = await apiClient.get<ApiResponse<ContractPersonalListResponse>>('/vinculaciones/personal', {
    params,
  });
  return res.data;
}

export async function getPersonalResumen(filters: { contrato_id: number; fecha?: string }): Promise<PersonalResumen> {
  const res = await apiClient.get<ApiResponse<PersonalResumen>>('/vinculaciones/personal/resumen', { params: filters });
  return res.data;
}
export async function getContractPersonalFilterOptions(filters: { contrato_id: number; municipio_id?: number; institucion_id?: number; sede_id?: number; fecha?: string }): Promise<ContractPersonalFilterOptions> {
  const res = await apiClient.get<ApiResponse<ContractPersonalFilterOptions>>('/vinculaciones/personal/opciones', { params: filters });
  return res.data;
}

export async function listGestores(filters: {
  contrato_id: number;
  gestor_usuario_id?: number;
  fecha?: string;
}): Promise<GestorAssignmentUser[]> {
  const res = await apiClient.get<ApiResponse<GestorAssignmentUser[]>>('/vinculaciones/gestores', {
    params: filters,
  });
  return res.data;
}

export async function getGestorMunicipios(filters: {
  contrato_id: number;
  gestor_usuario_id?: number;
  fecha?: string;
}): Promise<{
  fecha_consulta: string;
  gestor_usuario_id: number | null;
  gestores: GestorAssignmentUser[];
  items: GestorMunicipioAssignment[];
}> {
  const res = await apiClient.get<
    ApiResponse<{
      fecha_consulta: string;
      gestor_usuario_id: number | null;
      gestores: GestorAssignmentUser[];
      items: GestorMunicipioAssignment[];
    }>
  >('/vinculaciones/gestores/municipios', {
    params: filters,
  });
  return res.data;
}

export async function getGestorAssignmentWorkspace(filters: {
  contrato_id: number;
  gestor_usuario_id?: number;
  municipio_id?: number;
  search?: string;
  fecha?: string;
}): Promise<GestorAssignmentWorkspace> {
  const res = await apiClient.get<ApiResponse<GestorAssignmentWorkspace>>('/vinculaciones/gestores/workspace', {
    params: filters,
  });
  return res.data;
}

export async function createGestorMunicipioAssignment(payload: {
  contrato_id: number;
  gestor_usuario_id: number;
  municipio_id: number;
  departamento_id?: number | null;
  vigencia_desde?: string;
  alcance_personal?: "PERSONAL_SELECCIONADO" | "TODO_MUNICIPIO";
  observacion?: string | null;
}): Promise<GestorMunicipioAssignment> {
  const res = await apiClient.post<ApiResponse<GestorMunicipioAssignment>>('/vinculaciones/gestores/municipios', payload);
  return res.data;
}

export async function closeGestorMunicipioAssignment(
  id: number,
  payload: { vigencia_hasta: string; observacion?: string | null }
): Promise<GestorMunicipioAssignment> {
  const res = await apiClient.patch<ApiResponse<GestorMunicipioAssignment>>(
    `/vinculaciones/gestores/municipios/${id}/cerrar`,
    payload
  );
  return res.data;
}

export async function saveGestorAssignments(
  payload: SaveGestorAssignmentsPayload
): Promise<SaveGestorAssignmentsResult> {
  const res = await apiClient.post<ApiResponse<SaveGestorAssignmentsResult>>(
    '/vinculaciones/gestores/personal',
    payload
  );
  return res.data;
}

export async function closeGestorPersonalAssignment(
  id: number,
  payload: { vigencia_hasta: string; observacion?: string | null }
): Promise<GestorPersonalAssignment> {
  const res = await apiClient.patch<ApiResponse<GestorPersonalAssignment>>(
    `/vinculaciones/gestores/personal/${id}/cerrar`,
    payload
  );
  return res.data;
}

export async function getGestorPersonalHistory(filters: {
  contrato_id: number;
  vinculacion_id: number;
  fecha?: string;
}): Promise<{
  fecha_consulta: string;
  historial: GestorPersonalAssignment[];
  vinculacion_id: number;
}> {
  const res = await apiClient.get<
    ApiResponse<{
      fecha_consulta: string;
      historial: GestorPersonalAssignment[];
      vinculacion_id: number;
    }>
  >('/vinculaciones/gestores/personal/historial', {
    params: filters,
  });
  return res.data;
}

export async function getVinculacionById(id: number): Promise<VinculacionApi> {
  const res = await apiClient.get<ApiResponse<VinculacionApi>>(`/vinculaciones/${id}`);
  return res.data;
}

export async function getVinculacionExpediente(id: number): Promise<VinculacionExpedienteApi> {
  const res = await apiClient.get<ApiResponse<VinculacionExpedienteApi>>(
    `/vinculaciones/${id}/expediente`
  );
  return res.data;
}

export type OperativeAssignmentOption={id:string;municipio_id:string;municipio:string;institucion_id:string;institucion:string;sede_id:string;sede:string;modalidad_id:string;modalidad:string};
export async function getOperativeAssignmentOptions(id:number):Promise<OperativeAssignmentOption[]>{const res=await apiClient.get<ApiResponse<OperativeAssignmentOption[]>>(`/vinculaciones/${id}/asignacion-operativa/opciones`);return res.data;}
export async function updateOperativeAssignment(id:number,focalizacionFinalId:number):Promise<unknown>{const res=await apiClient.patch<ApiResponse<unknown>>(`/vinculaciones/${id}/asignacion-operativa`,{focalizacion_final_id:focalizacionFinalId});return res.data;}

export async function createVinculacion(payload: CreateVinculacionPayload): Promise<VinculacionApi> {
  const res = await apiClient.post<ApiResponse<VinculacionApi>>('/vinculaciones', payload);
  return res.data;
}

export async function updateVinculacion(
  id: number,
  payload: UpdateVinculacionPayload
): Promise<VinculacionApi> {
  const res = await apiClient.patch<ApiResponse<VinculacionApi>>(`/vinculaciones/${id}`, payload);
  return res.data;
}

export async function retirarVinculacion(
  id: number,
  payload: RetirarVinculacionPayload
): Promise<VinculacionApi> {
  const res = await apiClient.patch<ApiResponse<VinculacionApi>>(
    `/vinculaciones/${id}/retirar`,
    payload
  );
  return res.data;
}

export async function suspenderVinculacion(
  id: number,
  payload: SuspenderVinculacionPayload
): Promise<VinculacionApi> {
  const res = await apiClient.patch<ApiResponse<VinculacionApi>>(
    `/vinculaciones/${id}/suspender`,
    payload
  );
  return res.data;
}

export async function reactivarVinculacion(
  id: number,
  payload: ReactivarVinculacionPayload
): Promise<VinculacionApi> {
  const res = await apiClient.patch<ApiResponse<VinculacionApi>>(
    `/vinculaciones/${id}/reactivar`,
    payload
  );
  return res.data;
}
