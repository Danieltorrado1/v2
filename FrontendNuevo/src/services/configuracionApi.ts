import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type {
  AccesoUsuario,
  AnularContratoDocumentoPayload,
  AnularContratoEventoPayload,
  CargoFilters,
  CatalogoItem,
  CatalogoFilters,
  Contrato,
  ContratoCargo,
  ContratoDetail,
  ContratoDocumentoDownloadUrl,
  ContratoDocumentoRecord,
  ContratoEventoMutationResult,
  ContratoEventoRecord,
  ContratoExcepcionRecord,
  ContratoFilters,
  CreateCargoPayload,
  CreateContratoEventoPayload,
  CreateContratoExcepcionPayload,
  CreateContratoPayload,
  CreateEmpresaPayload,
  CreateUsuarioAdminPayload,
  Departamento,
  DevolverContratoDocumentoPayload,
  Empresa,
  EmpresaFilters,
  MetodoPagoPermitido,
  Municipio,
  MunicipioFilters,
  PaginatedItems,
  Permiso,
  RegularizarContratoExcepcionPayload,
  ReviewContratoDocumentoPayload,
  RevocarContratoExcepcionPayload,
  Rol,
  UpdateCargoPayload,
  UpdateContratoPayload,
  UpdateEmpresaPayload,
  UpdateUsuarioAdminPayload,
  UpdateUsuarioEstadoPayload,
  UpdateUsuarioPasswordPayload,
  UploadContratoDocumentoPayload,
  UsuarioAdminRecord,
} from '../types/configuracion.types';

type EstadoPayload = {
  activo: boolean;
  observacion?: string | null;
};

async function getPaginated<T>(path: string, params?: object): Promise<PaginatedItems<T>> {
  const response = await apiClient.get<ApiResponse<PaginatedItems<T>>>(path, {
    params: params as Record<string, string | number | boolean | undefined> | undefined,
  });
  return response.data;
}

async function getData<T>(path: string, params?: object): Promise<T> {
  const response = await apiClient.get<ApiResponse<T>>(path, {
    params: params as Record<string, string | number | boolean | undefined> | undefined,
  });
  return response.data;
}

async function postData<T>(path: string, body: unknown): Promise<T> {
  const response = await apiClient.post<ApiResponse<T>>(path, body);
  return response.data;
}

async function patchData<T>(path: string, body?: unknown): Promise<T> {
  const response = await apiClient.patch<ApiResponse<T>>(path, body);
  return response.data;
}

export const configuracionApi = {
  listarEmpresas: (filters: EmpresaFilters = {}) => getPaginated<Empresa>('/configuracion/empresas', filters),
  obtenerEmpresa: (id: number | string) => getData<Empresa>(`/configuracion/empresas/${id}`),
  crearEmpresa: (payload: CreateEmpresaPayload) => postData<Empresa>('/configuracion/empresas', payload),
  actualizarEmpresa: (id: number | string, payload: UpdateEmpresaPayload) => patchData<Empresa>(`/configuracion/empresas/${id}`, payload),
  cambiarEstadoEmpresa: (id: number | string, payload: EstadoPayload) => patchData<Empresa>(`/configuracion/empresas/${id}/estado`, payload),

  listarContratos: (filters: ContratoFilters = {}) => getPaginated<Contrato>('/configuracion/contratos', filters),
  obtenerContrato: (id: number | string) => getData<Contrato>(`/configuracion/contratos/${id}`),
  obtenerContratoDetalle: (id: number | string) => getData<ContratoDetail>(`/configuracion/contratos/${id}/detalle`),
  crearContrato: (payload: CreateContratoPayload) => postData<Contrato>('/configuracion/contratos', payload),
  actualizarContrato: (id: number | string, payload: UpdateContratoPayload) => patchData<Contrato>(`/configuracion/contratos/${id}`, payload),
  cambiarEstadoContrato: (id: number | string, payload: EstadoPayload) => patchData<Contrato>(`/configuracion/contratos/${id}/estado`, payload),

  listarContratoEventos: (id: number | string) => getData<PaginatedItems<ContratoEventoRecord>>(`/configuracion/contratos/${id}/eventos`),
  crearContratoEvento: (id: number | string, payload: CreateContratoEventoPayload) => postData<ContratoEventoMutationResult>(`/configuracion/contratos/${id}/eventos`, payload),
  anularContratoEvento: (id: number | string, eventoId: number | string, payload: AnularContratoEventoPayload) => patchData<ContratoEventoRecord | null>(`/configuracion/contratos/${id}/eventos/${eventoId}/anular`, payload),

  subirContratoDocumento: async (id: number | string, file: File, payload: UploadContratoDocumentoPayload) => {
    const form = new FormData();
    form.append('file', file);
    form.append('tipo_documento_id', String(payload.tipo_documento_id));
    if (payload.requisito_id !== undefined) form.append('requisito_id', String(payload.requisito_id));
    if (payload.categoria) form.append('categoria', payload.categoria);
    if (payload.fecha_expedicion) form.append('fecha_expedicion', payload.fecha_expedicion);
    if (payload.fecha_vencimiento) form.append('fecha_vencimiento', payload.fecha_vencimiento);
    if (payload.vigencia_dias_configurada !== undefined && payload.vigencia_dias_configurada !== null) form.append('vigencia_dias_configurada', String(payload.vigencia_dias_configurada));
    if (payload.observaciones) form.append('observaciones', payload.observaciones);
    const response = await apiClient.post<ApiResponse<ContratoDocumentoRecord>>(`/configuracion/contratos/${id}/documentos`, form);
    return response.data;
  },

  revisarContratoDocumento: (id: number | string, documentoId: number | string, payload: ReviewContratoDocumentoPayload) => patchData<ContratoDocumentoRecord | null>(`/configuracion/contratos/${id}/documentos/${documentoId}/revisar`, payload),
  devolverContratoDocumento: (id: number | string, documentoId: number | string, payload: DevolverContratoDocumentoPayload) => patchData<ContratoDocumentoRecord | null>(`/configuracion/contratos/${id}/documentos/${documentoId}/devolver`, payload),
  anularContratoDocumento: (id: number | string, documentoId: number | string, payload: AnularContratoDocumentoPayload) => patchData<ContratoDocumentoRecord | null>(`/configuracion/contratos/${id}/documentos/${documentoId}/anular`, payload),
  obtenerContratoDocumentoDownloadUrl: (id: number | string, documentoId: number | string) => getData<ContratoDocumentoDownloadUrl>(`/configuracion/contratos/${id}/documentos/${documentoId}/download-url`),

  listarContratoExcepciones: (id: number | string) => getData<ContratoExcepcionRecord[]>(`/configuracion/contratos/${id}/excepciones`),
  crearContratoExcepcion: (id: number | string, payload: CreateContratoExcepcionPayload) => postData<ContratoExcepcionRecord | null>(`/configuracion/contratos/${id}/excepciones`, payload),
  regularizarContratoExcepcion: (id: number | string, excepcionId: number | string, payload: RegularizarContratoExcepcionPayload) => patchData<ContratoExcepcionRecord | null>(`/configuracion/contratos/${id}/excepciones/${excepcionId}/regularizar`, payload),
  revocarContratoExcepcion: (id: number | string, excepcionId: number | string, payload: RevocarContratoExcepcionPayload) => patchData<ContratoExcepcionRecord | null>(`/configuracion/contratos/${id}/excepciones/${excepcionId}/revocar`, payload),

  listarCargos: (filters: CargoFilters = {}) => getPaginated<ContratoCargo>('/configuracion/cargos', filters),
  obtenerCargo: (id: number | string) => getData<ContratoCargo>(`/configuracion/cargos/${id}`),
  crearCargo: (payload: CreateCargoPayload) => postData<ContratoCargo>('/configuracion/cargos', payload),
  actualizarCargo: (id: number | string, payload: UpdateCargoPayload) => patchData<ContratoCargo>(`/configuracion/cargos/${id}`, payload),
  cambiarEstadoCargo: (id: number | string, payload: EstadoPayload) => patchData<ContratoCargo>(`/configuracion/cargos/${id}/estado`, payload),

  listarTiposVinculacion: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/tipos-vinculacion', filters),
  listarTiposJornada: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/tipos-jornada', filters),
  listarMetodosPago: () => getData<MetodoPagoPermitido[]>('/configuracion/catalogos/metodos-pago'),
  listarDepartamentos: (filters: CatalogoFilters = {}) => getPaginated<Departamento>('/configuracion/catalogos/departamentos', filters),
  listarMunicipios: (filters: MunicipioFilters = {}) => getPaginated<Municipio>('/configuracion/catalogos/municipios', filters),
  listarZonas: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/zonas', filters),
  listarEps: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/eps', filters),
  listarArl: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/arl', filters),
  listarFondosPension: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/fondos-pension', filters),
  listarCajasCompensacion: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/cajas-compensacion', filters),
  listarNivelesEstudio: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/niveles-estudio', filters),
  listarEstadosCiviles: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/estados-civiles', filters),
  listarSexos: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/sexos', filters),
  listarTiposDocumento: (filters: CatalogoFilters = {}) => getPaginated<CatalogoItem>('/configuracion/catalogos/tipos-documentos', filters),

  listarRoles: () => getData<Rol[]>('/configuracion/roles'),
  listarPermisos: () => getData<Permiso[]>('/configuracion/permisos'),

  listarUsuariosAdmin: () => getData<UsuarioAdminRecord[]>('/admin/usuarios'),
  obtenerUsuarioAdmin: (id: string) => getData<UsuarioAdminRecord>(`/admin/usuarios/${id}`),
  crearUsuarioAdmin: (payload: CreateUsuarioAdminPayload) => postData<UsuarioAdminRecord>('/admin/usuarios', payload),
  actualizarUsuarioAdmin: (id: string, payload: UpdateUsuarioAdminPayload) => patchData<UsuarioAdminRecord>(`/admin/usuarios/${id}`, payload),
  actualizarPasswordUsuarioAdmin: (id: string, payload: UpdateUsuarioPasswordPayload) => patchData<UsuarioAdminRecord>(`/admin/usuarios/${id}/password`, payload),
  actualizarEstadoUsuarioAdmin: (id: string, payload: UpdateUsuarioEstadoPayload) => patchData<UsuarioAdminRecord>(`/admin/usuarios/${id}/estado`, payload),
  eliminarUsuarioAdmin: (id: string) => apiClient.delete<ApiResponse<UsuarioAdminRecord>>(`/admin/usuarios/${id}`).then((response) => response.data),

  obtenerAccesoUsuario: (userId: string) => getData<AccesoUsuario>(`/tenant/users/${userId}/access`),
};
