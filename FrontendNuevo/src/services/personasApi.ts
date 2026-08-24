import { env } from '../config/env';
import { apiClient } from './apiClient';
import { ApiClientError } from './apiClient';
import {
  getVinculacionExpediente as getVinculacionExpedienteById,
  getVinculaciones,
} from './vinculacionesApi';
import { getAuthToken } from './tokenStorage';
import type { ApiResponse } from '../types/api.types';
import type {
  PersonalOPSFilters,
  PersonaApi,
  PersonaCuentaBancariaApi,
  PersonalExportFieldDefinitionApi,
  PersonalExportTemplateApi,
  PersonaHistorialCambioApi,
  PersonaIdentificacionApi,
  PersonaNombreInput,
  PaginatedPersonasApi,
  SstPerfilSociodemograficoApi,
  SstPerfilSociodemograficoVersionApi,
  SstPerfilOrigenApi,
  VinculacionOPS,
  VinculacionApi,
  VinculacionExpedienteApi,
  PersonaListItem,
  PersonaFilters,
} from '../types/personas.types';
import type { VinculacionFilters } from '../types/vinculaciones.types';

export interface CreatePersonaPayload {
  tipo_documento_id: number;
  numero_documento: string;
  primer_nombre: string;
  segundo_nombre?: string | null;
  primer_apellido: string;
  segundo_apellido?: string | null;
  fecha_nacimiento?: string | null;
  fecha_expedicion_documento?: string | null;
  municipio_expedicion_id?: number | null;
  telefono?: string | null;
  correo?: string | null;
  direccion?: string | null;
  barrio?: string | null;
  motivo_cambio_identificacion?: string | null;
}

export interface UpdatePersonaContactoEmergenciaPayload {
  nombre_contacto?: string | null;
  parentesco?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  activo?: boolean;
}

export interface UpdatePersonaPerfilDemograficoPayload {
  nacionalidad?: string | null;
  nivel_escolaridad?: string | null;
}

export interface UpdatePersonaSstPerfilPayload {
  vinculacion_id?: number | null;
  fecha_caracterizacion?: string | null;
  origen?: SstPerfilOrigenApi;
  nacionalidad?: string | null;
  estrato_socioeconomico?: string | null;
  tipo_vivienda?: string | null;
  grupo_etnico?: string | null;
  nivel_escolaridad?: string | null;
  profesion_ocupacion?: string | null;
  personas_dependen_economicamente?: number | null;
  cabeza_familia?: boolean | null;
  total_hijos?: number | null;
  hijos_viven_con_usted?: number | null;
  hijos_menores_edad?: number | null;
  hijos_mayores_edad?: number | null;
  tipo_sangre_rh?: string | null;
  tiene_discapacidad?: boolean | null;
  tipo_discapacidad?: string | null;
  redes_apoyo_social?: string | null;
  presenta_alergias?: string | null;
  medicamentos_permanentes?: string | null;
  enfermedad?: string | null;
  autorizacion_tratamiento_datos?: boolean | null;
  observaciones?: string | null;
  motivo_cambio: string;
}

export interface CreatePersonaIdentificacionPayload {
  tipo_documento_id: number;
  numero_documento: string;
  fecha_expedicion_documento?: string | null;
  municipio_expedicion_id?: number | null;
  motivo_cambio: string;
}

export type UpdatePersonaPayload = Partial<CreatePersonaPayload> & {
  municipio_nacimiento_id?: number | null;
  municipio_residencia_id?: number | null;
  sexo_id?: number | null;
  estado_civil_id?: number | null;
  tipo_sangre_id?: number | null;
  estatura?: number | null;
  zona_id?: number | null;
  pais_nacimiento?: string | null;
  nacimiento_extranjero?: boolean;
  ciudad_nacimiento_extranjero?: string | null;
  motivo_cambio?: string | null;
  contacto_emergencia?: UpdatePersonaContactoEmergenciaPayload | null;
  perfil_demografico?: UpdatePersonaPerfilDemograficoPayload | null;
};

export interface CreatePersonaCuentaBancariaPayload {
  entidad_bancaria: string;
  tipo_cuenta: 'AHORROS' | 'CORRIENTE' | 'OTRA';
  numero_cuenta: string;
  titular: string;
  nombre_titular?: string | null;
  documento_titular?: string | null;
  estado?: 'PENDIENTE' | 'VERIFICADA' | 'RECHAZADA' | 'INACTIVA';
  fecha_verificacion?: string | null;
  observaciones?: string | null;
  soporte_documento_persona_id?: number | null;
  vigencia_desde?: string | null;
  marcar_como_vigente?: boolean;
  motivo_cambio: string;
}

export interface UpdatePersonaCuentaBancariaPayload {
  entidad_bancaria?: string;
  tipo_cuenta?: 'AHORROS' | 'CORRIENTE' | 'OTRA';
  numero_cuenta?: string;
  titular?: string;
  nombre_titular?: string | null;
  documento_titular?: string | null;
  estado?: 'PENDIENTE' | 'VERIFICADA' | 'RECHAZADA' | 'INACTIVA';
  fecha_verificacion?: string | null;
  observaciones?: string | null;
  soporte_documento_persona_id?: number | null;
  vigencia_desde?: string | null;
  vigencia_hasta?: string | null;
  es_vigente?: boolean;
  motivo_cambio: string;
}

export interface PersonalExportGeneratePayload {
  scope: 'TODOS' | 'FILTRADOS' | 'SELECCIONADOS';
  formato: 'csv';
  contrato_id: number;
  fecha?: string;
  contrato_cargo_id?: number | null;
  municipio_id?: number | null;
  institucion_id?: number | null;
  sede_id?: number | null;
  modalidad_id?: number | null;
  ubicacion_laboral_id?: number | null;
  cobertura?: 'SI' | 'NO' | 'RETIRADA';
  licitacion?: 'PRESENTADA' | 'NO_PRESENTADA';
  estado_vinculacion?: 'ACTIVA' | 'RETIRADA' | 'SUSPENDIDA';
  search?: string | null;
  fields: string[];
  selected_vinculacion_ids?: number[];
}

export interface PersonalExportTemplatePayload {
  nombre: string;
  campos: string[];
  orden: string[];
  formato: 'csv';
}

const MAX_BATCH_LIMIT = 100;
const OPS_METODOS_PAGO = new Set([
  'OPS_CUENTA_COBRO',
  'OPS_VALOR_FIJO',
  'OPS_POR_PRODUCTO',
]);

export function buildNombreCompleto(
  p: PersonaNombreInput
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

function buildNombreCompletoExpediente(persona: VinculacionExpedienteApi['persona']): string {
  return buildNombreCompleto({
    primer_nombre: persona.primer_nombre,
    segundo_nombre: persona.segundo_nombre,
    primer_apellido: persona.primer_apellido,
    segundo_apellido: persona.segundo_apellido,
  });
}

function isOpsMetodoPago(metodoPago: string | null): boolean {
  return metodoPago !== null && OPS_METODOS_PAGO.has(metodoPago);
}

function readChecklistResumen(value: unknown): VinculacionOPS['checklist'] {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const candidate = value as Record<string, unknown>;
  const cargados = Number(candidate.cargados);
  const cumplimiento = Number(candidate.cumplimiento_porcentaje);
  const faltantes = Number(candidate.faltantes);
  const total = Number(candidate.total_requisitos);
  const vencidos = Number(candidate.vencidos);

  if (
    !Number.isFinite(cargados) ||
    !Number.isFinite(cumplimiento) ||
    !Number.isFinite(faltantes) ||
    !Number.isFinite(total) ||
    !Number.isFinite(vencidos)
  ) {
    return null;
  }

  return {
    cargados,
    cumplimiento_porcentaje: cumplimiento,
    faltantes,
    total_requisitos: total,
    vencidos,
  };
}

function mapExpedienteToPersonalOps(expediente: VinculacionExpedienteApi): VinculacionOPS {
  return {
    vinculacion_id: expediente.vinculacion.id,
    persona_id: expediente.persona.id,
    empresa_id: expediente.vinculacion.empresa_id,
    contrato_id: expediente.vinculacion.contrato_id,
    contrato_empresa_id: expediente.vinculacion.contrato_empresa_id,
    contrato_cargo_id: expediente.vinculacion.contrato_cargo_id,
    nombre_completo: buildNombreCompletoExpediente(expediente.persona),
    numero_documento: expediente.persona.numero_documento,
    fecha_inicio: expediente.vinculacion.fecha_inicio,
    fecha_fin: expediente.vinculacion.fecha_fin,
    estado_vinculacion: expediente.vinculacion.estado_vinculacion,
    metodo_pago: expediente.vinculacion.metodo_pago,
    tipo_vinculacion_id: expediente.tipo_vinculacion.id,
    tipo_vinculacion_codigo: expediente.tipo_vinculacion.codigo,
    tipo_vinculacion_nombre: expediente.tipo_vinculacion.nombre_vinculacion,
    contrato_numero: expediente.contrato.numero_contrato,
    entidad_contratante: expediente.contrato.entidad_contratante,
    objeto_contractual: expediente.contrato.objeto_contractual,
    cargo_nombre: expediente.cargo.nombre_cargo,
    empresa_nombre: expediente.empresa.nombre_empresa,
    municipio_residencia_id: expediente.persona.municipio_residencia_id,
    documentos_persona_total: expediente.documentos_persona.length,
    documentos_vinculacion_total: expediente.documentos_vinculacion.length,
    checklist: readChecklistResumen(expediente.checklist),
  };
}

function applyLocalOpsFilters(items: VinculacionOPS[], filters: PersonalOPSFilters): VinculacionOPS[] {
  const normalizedSearch = filters.search?.trim().toLocaleLowerCase('es-CO') ?? '';

  return items.filter((item) => {
    if (filters.metodo_pago && item.metodo_pago !== filters.metodo_pago) {
      return false;
    }

    if (!normalizedSearch) {
      return true;
    }

    const haystack = [
      item.nombre_completo,
      item.numero_documento,
      item.contrato_numero ?? '',
      item.entidad_contratante ?? '',
      item.objeto_contractual ?? '',
      item.cargo_nombre ?? '',
      item.tipo_vinculacion_nombre ?? '',
      item.tipo_vinculacion_codigo ?? '',
      item.metodo_pago ?? '',
    ]
      .join(' ')
      .toLocaleLowerCase('es-CO');

    return haystack.includes(normalizedSearch);
  });
}

async function getAllVinculacionesPaginated(
  filters: Omit<VinculacionFilters, 'page' | 'limit'> = {}
): Promise<VinculacionApi[]> {
  const firstPage = await getVinculaciones({
    ...filters,
    page: 1,
    limit: MAX_BATCH_LIMIT,
  });

  const totalPages = firstPage.pagination.total_pages;

  if (totalPages <= 1) {
    return firstPage.items;
  }

  const pageRequests: Array<Promise<Awaited<ReturnType<typeof getVinculaciones>>>> = [];

  for (let page = 2; page <= totalPages; page += 1) {
    pageRequests.push(
      getVinculaciones({
        ...filters,
        page,
        limit: MAX_BATCH_LIMIT,
      })
    );
  }

  const remainingPages = await Promise.all(pageRequests);
  return [
    ...firstPage.items,
    ...remainingPages.flatMap((pageData) => pageData.items),
  ];
}

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

export async function getPersonaByDocumento(numeroDocumento: string): Promise<PersonaApi> {
  const res = await apiClient.get<ApiResponse<PersonaApi>>(
    `/personas/documento/${encodeURIComponent(numeroDocumento)}`
  );
  return res.data;
}

export async function getPersonaIdentificaciones(personaId: number): Promise<PersonaIdentificacionApi[]> {
  const res = await apiClient.get<ApiResponse<PersonaIdentificacionApi[]>>(
    `/personas/${personaId}/identificaciones`
  );
  return res.data;
}

export async function getPersonaSstPerfil(personaId: number): Promise<SstPerfilSociodemograficoApi> {
  const response = await apiClient.get<ApiResponse<SstPerfilSociodemograficoApi>>(
    `/personas/${personaId}/sst/perfil`
  );
  return response.data;
}

export async function getPersonaSstPerfilHistorial(
  personaId: number
): Promise<SstPerfilSociodemograficoVersionApi[]> {
  const response = await apiClient.get<ApiResponse<SstPerfilSociodemograficoVersionApi[]>>(
    `/personas/${personaId}/sst/perfil/historial`
  );
  return response.data;
}

export async function updatePersonaSstPerfil(
  personaId: number,
  payload: UpdatePersonaSstPerfilPayload
): Promise<SstPerfilSociodemograficoApi> {
  const response = await apiClient.patch<ApiResponse<SstPerfilSociodemograficoApi>>(
    `/personas/${personaId}/sst/perfil`,
    payload
  );
  return response.data;
}

export async function getPersonaHistorialCambios(
  personaId: number,
  limit = 50
): Promise<PersonaHistorialCambioApi[]> {
  const res = await apiClient.get<ApiResponse<PersonaHistorialCambioApi[]>>(
    `/personas/${personaId}/historial-cambios`,
    { params: { limit } }
  );
  return res.data;
}

export async function getPersonaCuentasBancarias(
  personaId: number
): Promise<PersonaCuentaBancariaApi[]> {
  const res = await apiClient.get<ApiResponse<PersonaCuentaBancariaApi[]>>(
    `/personas/${personaId}/cuentas-bancarias`
  );
  return res.data;
}

export async function getVinculacionesByPersonaId(personaId: number): Promise<VinculacionApi[]> {
  const res = await apiClient.get<ApiResponse<VinculacionApi[]>>(
    `/vinculaciones/persona/${personaId}`
  );
  return res.data;
}

export async function getVinculacionExpediente(vinculacionId: number): Promise<VinculacionExpedienteApi> {
  return getVinculacionExpedienteById(vinculacionId);
}

export async function getPersonalOPS(
  filters: PersonalOPSFilters = {}
): Promise<VinculacionOPS[]> {
  const vinculaciones = await getAllVinculacionesPaginated({
    contrato_id: filters.contrato_id ?? undefined,
    estado_vinculacion: filters.estado_vinculacion || undefined,
    tipo_vinculacion_id: filters.tipo_vinculacion_id ?? undefined,
  });

  const vinculacionesOps = vinculaciones.filter((vinculacion) => isOpsMetodoPago(vinculacion.metodo_pago));
  const expedientes = await Promise.all(
    vinculacionesOps.map((vinculacion) => getVinculacionExpedienteById(vinculacion.id))
  );

  return applyLocalOpsFilters(
    expedientes
      .map(mapExpedienteToPersonalOps)
      .filter((item) => isOpsMetodoPago(item.metodo_pago)),
    filters
  );
}

export async function getPersonaActiveExpediente(personaId: number): Promise<VinculacionExpedienteApi> {
  const vinculaciones = await getVinculacionesByPersonaId(personaId);
  const active = vinculaciones.find((vinculacion) => vinculacion.estado_vinculacion === 'ACTIVA')
    ?? vinculaciones[0];

  if (!active) {
    throw new Error('Este colaborador no tiene vinculaciones registradas.');
  }

  return getVinculacionExpedienteById(active.id);
}

export async function createPersona(payload: CreatePersonaPayload): Promise<PersonaApi> {
  const res = await apiClient.post<ApiResponse<PersonaApi>>('/personas', payload);
  return res.data;
}

export async function updatePersona(id: number, payload: UpdatePersonaPayload): Promise<PersonaApi> {
  const res = await apiClient.patch<ApiResponse<PersonaApi>>(`/personas/${id}`, payload);
  return res.data;
}

export async function createPersonaCuentaBancaria(
  personaId: number,
  payload: CreatePersonaCuentaBancariaPayload
): Promise<PersonaCuentaBancariaApi> {
  const res = await apiClient.post<ApiResponse<PersonaCuentaBancariaApi>>(
    `/personas/${personaId}/cuentas-bancarias`,
    payload
  );
  return res.data;
}

export async function updatePersonaCuentaBancaria(
  personaId: number,
  cuentaBancariaId: number,
  payload: UpdatePersonaCuentaBancariaPayload
): Promise<PersonaCuentaBancariaApi> {
  const res = await apiClient.patch<ApiResponse<PersonaCuentaBancariaApi>>(
    `/personas/${personaId}/cuentas-bancarias/${cuentaBancariaId}`,
    payload
  );
  return res.data;
}

export async function createPersonaIdentificacion(
  personaId: number,
  payload: CreatePersonaIdentificacionPayload
): Promise<PersonaIdentificacionApi> {
  const res = await apiClient.post<ApiResponse<PersonaIdentificacionApi>>(
    `/personas/${personaId}/identificaciones`,
    payload
  );
  return res.data;
}

export function isPersonaDuplicateDocumentError(error: unknown): boolean {
  return error instanceof ApiClientError && error.code === 'PERSONA_DUPLICATE_DOCUMENT';
}

export async function getPersonalExportFieldCatalog(): Promise<PersonalExportFieldDefinitionApi[]> {
  const res = await apiClient.get<ApiResponse<PersonalExportFieldDefinitionApi[]>>(
    '/personas/exportaciones/campos'
  );
  return res.data;
}

export async function listPersonalExportTemplates(): Promise<PersonalExportTemplateApi[]> {
  const res = await apiClient.get<ApiResponse<PersonalExportTemplateApi[]>>(
    '/personas/exportaciones/plantillas'
  );
  return res.data;
}

export async function createPersonalExportTemplate(
  payload: PersonalExportTemplatePayload
): Promise<PersonalExportTemplateApi> {
  const res = await apiClient.post<ApiResponse<PersonalExportTemplateApi>>(
    '/personas/exportaciones/plantillas',
    payload
  );
  return res.data;
}

export async function downloadPersonalExport(
  payload: PersonalExportGeneratePayload
): Promise<void> {
  const token = getAuthToken();
  const response = await fetch(`${env.apiUrl}/personas/exportaciones/generar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new ApiClientError('No fue posible generar la exportacion.', response.status);
  }

  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const fileName = match?.[1] ?? `personal-${payload.contrato_id}.csv`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
