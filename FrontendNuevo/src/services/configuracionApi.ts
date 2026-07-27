import { apiClient } from './apiClient';
import type { ApiResponse } from '../types/api.types';
import type {
  AccesoUsuario,
  CargoFilters,
  CatalogoItem,
  CatalogoFilters,
  Contrato,
  ContratoCargo,
  ContratoFilters,
  CreateCargoPayload,
  CreateContratoPayload,
  CreateEmpresaPayload,
  Departamento,
  Empresa,
  EmpresaFilters,
  MetodoPagoPermitido,
  Municipio,
  MunicipioFilters,
  PaginatedItems,
  Permiso,
  Rol,
  UpdateCargoPayload,
  UpdateContratoPayload,
  UpdateEmpresaPayload,
  UpdateUsuarioPayload,
  UsuarioAdministracion,
} from '../types/configuracion.types';

type EstadoPayload = {
  activo: boolean;
  observacion?: string | null;
};

async function getPaginated<T>(
  path: string,
  params?: object,
): Promise<PaginatedItems<T>> {
  const response = await apiClient.get<ApiResponse<PaginatedItems<T>>>(path, {
    params: params as Record<string, string | number | boolean | undefined> | undefined,
  });
  return response.data;
}

async function getData<T>(
  path: string,
  params?: object,
): Promise<T> {
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
  listarEmpresas: (filters: EmpresaFilters = {}) =>
    getPaginated<Empresa>('/configuracion/empresas', filters),

  obtenerEmpresa: (id: number | string) =>
    getData<Empresa>(`/configuracion/empresas/${id}`),

  crearEmpresa: (payload: CreateEmpresaPayload) =>
    postData<Empresa>('/configuracion/empresas', payload),

  actualizarEmpresa: (id: number | string, payload: UpdateEmpresaPayload) =>
    patchData<Empresa>(`/configuracion/empresas/${id}`, payload),

  cambiarEstadoEmpresa: (id: number | string, payload: EstadoPayload) =>
    patchData<Empresa>(`/configuracion/empresas/${id}/estado`, payload),

  listarContratos: (filters: ContratoFilters = {}) =>
    getPaginated<Contrato>('/configuracion/contratos', filters),

  obtenerContrato: (id: number | string) =>
    getData<Contrato>(`/configuracion/contratos/${id}`),

  crearContrato: (payload: CreateContratoPayload) =>
    postData<Contrato>('/configuracion/contratos', payload),

  actualizarContrato: (id: number | string, payload: UpdateContratoPayload) =>
    patchData<Contrato>(`/configuracion/contratos/${id}`, payload),

  cambiarEstadoContrato: (id: number | string, payload: EstadoPayload) =>
    patchData<Contrato>(`/configuracion/contratos/${id}/estado`, payload),

  listarCargos: (filters: CargoFilters = {}) =>
    getPaginated<ContratoCargo>('/configuracion/cargos', filters),

  obtenerCargo: (id: number | string) =>
    getData<ContratoCargo>(`/configuracion/cargos/${id}`),

  crearCargo: (payload: CreateCargoPayload) =>
    postData<ContratoCargo>('/configuracion/cargos', payload),

  actualizarCargo: (id: number | string, payload: UpdateCargoPayload) =>
    patchData<ContratoCargo>(`/configuracion/cargos/${id}`, payload),

  cambiarEstadoCargo: (id: number | string, payload: EstadoPayload) =>
    patchData<ContratoCargo>(`/configuracion/cargos/${id}/estado`, payload),

  listarTiposVinculacion: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/tipos-vinculacion', filters),

  listarTiposJornada: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/tipos-jornada', filters),

  listarMetodosPago: () =>
    getData<MetodoPagoPermitido[]>('/configuracion/catalogos/metodos-pago'),

  listarDepartamentos: (filters: CatalogoFilters = {}) =>
    getPaginated<Departamento>('/configuracion/catalogos/departamentos', filters),

  listarMunicipios: (filters: MunicipioFilters = {}) =>
    getPaginated<Municipio>('/configuracion/catalogos/municipios', filters),

  listarZonas: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/zonas', filters),

  listarEps: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/eps', filters),

  listarArl: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/arl', filters),

  listarFondosPension: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/fondos-pension', filters),

  listarCajasCompensacion: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/cajas-compensacion', filters),

  listarNivelesEstudio: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/niveles-estudio', filters),

  listarEstadosCiviles: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/estados-civiles', filters),

  listarSexos: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/sexos', filters),

  listarTiposDocumento: (filters: CatalogoFilters = {}) =>
    getPaginated<CatalogoItem>('/configuracion/catalogos/tipos-documentos', filters),

  listarRoles: () =>
    getData<Rol[]>('/configuracion/roles'),

  listarPermisos: () =>
    getData<Permiso[]>('/configuracion/permisos'),

  listarUsuarios: () =>
    getData<UsuarioAdministracion[]>('/users'),

  obtenerUsuario: (id: string) =>
    getData<UsuarioAdministracion>(`/users/${id}`),

  actualizarUsuario: (id: string, payload: UpdateUsuarioPayload) =>
    patchData<UsuarioAdministracion>(`/users/${id}`, payload),

  activarUsuario: (id: string) =>
    patchData<UsuarioAdministracion>(`/users/${id}/activate`),

  desactivarUsuario: (id: string) =>
    patchData<UsuarioAdministracion>(`/users/${id}/deactivate`),

  obtenerAccesoUsuario: (userId: string) =>
    getData<AccesoUsuario>(`/tenant/users/${userId}/access`),
};
