import { apiClient } from './apiClient';
import type { ApiQueryParams, ApiResponse } from '../types/api.types';
import { NOMINA_TURNO_MOVIMIENTO_TIPO } from '../types/nomina.types';
import type {
  CreateNominaMovimientoApi,
  CreateNominaCorreccionPayload,
  CreateNominaNovedadApi,
  CreateNominaNovedadConTurnoApi, NominaEmpleadoOperativoStateApi, RevisionOperativaApi,
  CreateNominaPeriodoApi,
  CreateNominaTurnoPayload,
  GenerateNominaLiquidacionesResponse,
  NominaCorreccion,
  NominaCorreccionDetalle,
  NominaCorreccionFilters,
  NominaCorreccionesResponse,
  NominaDesprendibleApi,
  NominaDesprendiblesQuery,
  NominaLiquidacionFilters,
  NominaMovimientoApi,
  NominaMovimientosQuery,
  NominaNovedadApi,
  NominaNovedadesQuery,
  NominaTipoNovedad,
  NominaTipoNovedadFilters,
  NominaTipoNovedadResponse,
  NominaPeriodoActionApi,
  NominaPeriodoActionResultApi,
  NominaPeriodoApi,
  NominaPeriodoDashboardApi,
  NominaPeriodoEmpleadosQuery,
  NominaPeriodosQuery,
  NominaTurno,
  NominaTurnoFilters,
  PaginatedNominaEmpleadosApi,
  PaginatedNominaLiquidacionesApi,
  PaginatedNominaMovimientosApi,
  PaginatedNominaNovedadesApi,
  PaginatedNominaPeriodosApi,
  PaginatedNominaTurnosApi,
  UpdateNominaCorreccionPayload,
  UpdateNominaMovimientoApi,
  UpdateNominaNovedadApi,
  UpdateNominaTurnoPayload,
} from '../types/nomina.types';
import { ApiClientError } from './apiClient';
import { env } from '../config/env';
import { clearAuthSession, getAuthToken } from './tokenStorage';
import type { ApiErrorResponse } from '../types/api.types';
import type {
  GenerateNominaDesprendiblesResponse,
  NominaExportMetadata,
  NominaExportRequest,
  NominaExportTipo,
} from '../types/nomina.types';

const MAX_BATCH_LIMIT = 100;
const FILE_REQUEST_TIMEOUT_MS = 30_000;

function toParams<T extends object>(filters: T): ApiQueryParams {
  const params: ApiQueryParams = {};

  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = value;
    }
  }

  return params;
}

function resolveApiErrorMessage(status: number) {
  if (status === 401) return 'Sesión expirada. Inicia sesión nuevamente.';
  if (status === 403) return 'No tienes permisos para realizar esta acción.';
  if (status === 404) return 'Recurso no encontrado.';
  if (status === 500) return 'Error interno del servidor.';
  return `Error ${status}`;
}

function buildApiUrl(path: string, params?: ApiQueryParams) {
  const url = new URL(`${env.apiUrl}${path}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}

function parseFileNameFromContentDisposition(
  contentDisposition: string | null,
  fallback: string,
) {
  if (!contentDisposition) {
    return fallback;
  }

  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const basicMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
  return basicMatch?.[1] ?? fallback;
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function openSafeUrl(rawUrl: string) {
  const parsedUrl = new URL(rawUrl, window.location.origin);

  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    throw new Error('El backend devolvió una URL de descarga no válida.');
  }

  window.open(parsedUrl.toString(), '_blank', 'noopener,noreferrer');
}

function buildNominaDesprendibleFileName(desprendible: NominaDesprendibleApi) {
  const originalName = desprendible.documento.nombre_original?.trim();

  if (originalName) {
    return originalName;
  }

  const pathName = desprendible.documento.storage_path?.split('/').filter(Boolean).pop();
  if (pathName) {
    return pathName;
  }

  return `desprendible-periodo-${desprendible.periodo_id}-vinculacion-${desprendible.vinculacion_id}-v${desprendible.version}.pdf`;
}

async function fetchNominaFile(
  path: string,
  params?: ApiQueryParams,
): Promise<{ blob: Blob; metadata: NominaExportMetadata }> {
  const token = getAuthToken();
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), FILE_REQUEST_TIMEOUT_MS);

  let response: Response;

  try {
    response = await fetch(buildApiUrl(path, params).toString(), {
      method: 'GET',
      headers: token
        ? {
            Authorization: `Bearer ${token}`,
          }
        : undefined,
      signal: controller.signal,
    });
  } catch (error) {
    window.clearTimeout(timeoutId);

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError('La solicitud tardó demasiado. Inténtalo de nuevo.', 408, {
        originalError: error,
      });
    }

    throw new ApiClientError('No se pudo conectar con el servidor.', 0, {
      originalError: error,
    });
  }

  window.clearTimeout(timeoutId);

  if (response.status === 401) {
    clearAuthSession();
    window.dispatchEvent(new CustomEvent('empiria:unauthorized'));
    throw new ApiClientError(resolveApiErrorMessage(401), 401);
  }

  if (!response.ok) {
    const defaultMessage = resolveApiErrorMessage(response.status);
    let serverMessage: string | undefined;
    let serverCode: string | undefined;
    let details: unknown;

    try {
      const json = (await response.json()) as ApiErrorResponse;
      serverMessage = json.error?.message ?? json.message;
      serverCode = json.error?.code ?? json.code;
      details = json.error?.details ?? json.details;
    } catch {
      // Ignore invalid JSON response bodies.
    }

    throw new ApiClientError(serverMessage ?? defaultMessage, response.status, {
      code: serverCode,
      details,
    });
  }

  const blob = await response.blob();

  return {
    blob,
    metadata: {
      content_type: response.headers.get('content-type'),
      file_name: parseFileNameFromContentDisposition(
        response.headers.get('content-disposition'),
        'nomina-export.csv',
      ),
    },
  };
}

function mapNominaTurno(item: NominaMovimientoApi): NominaTurno {
  return {
    ...item,
    tipo_movimiento: NOMINA_TURNO_MOVIMIENTO_TIPO,
  };
}

function mapPaginatedNominaTurnos(
  data: PaginatedNominaMovimientosApi,
): PaginatedNominaTurnosApi {
  return {
    ...data,
    items: data.items.map(mapNominaTurno),
  };
}

function normalizeNominaPeriodosResponse(
  data: PaginatedNominaPeriodosApi | NominaPeriodoApi[],
): PaginatedNominaPeriodosApi {
  if (Array.isArray(data)) {
    return {
      items: data,
      pagination: {
        page: 1,
        limit: data.length,
        total: data.length,
        total_pages: 1,
      },
    };
  }

  return data;
}

export async function getNominaPeriodos(
  filters: NominaPeriodosQuery = {},
): Promise<PaginatedNominaPeriodosApi> {
  const response = await apiClient.get<ApiResponse<PaginatedNominaPeriodosApi | NominaPeriodoApi[]>>(
    '/nomina/periodos',
    {
      params: toParams(filters),
    },
  );

  return normalizeNominaPeriodosResponse(response.data);
}

export async function getNominaPeriodo(id: string): Promise<NominaPeriodoApi> {
  const response = await apiClient.get<ApiResponse<NominaPeriodoApi>>(`/nomina/periodos/${id}`);
  return response.data;
}

export async function createNominaPeriodo(
  input: CreateNominaPeriodoApi,
): Promise<NominaPeriodoApi> {
  const response = await apiClient.post<ApiResponse<NominaPeriodoApi>>('/nomina/periodos', input);
  return response.data;
}

export async function getNominaPeriodoDashboard(
  id: string,
): Promise<NominaPeriodoDashboardApi> {
  const response = await apiClient.get<ApiResponse<NominaPeriodoDashboardApi>>(
    `/nomina/periodos/${id}/dashboard`,
  );

  return response.data;
}

export async function getNominaPeriodoEmpleados(
  id: string,
  filters: NominaPeriodoEmpleadosQuery = {},
): Promise<PaginatedNominaEmpleadosApi> {
  const response = await apiClient.get<ApiResponse<PaginatedNominaEmpleadosApi>>(
    `/nomina/periodos/${id}/empleados`,
    {
      params: toParams(filters),
    },
  );

  return response.data;
}

export async function getAllNominaPeriodoEmpleados(
  id: string,
  filters: Omit<NominaPeriodoEmpleadosQuery, 'page' | 'limit'> = {},
): Promise<PaginatedNominaEmpleadosApi> {
  const firstPage = await getNominaPeriodoEmpleados(id, {
    ...filters,
    page: 1,
    limit: MAX_BATCH_LIMIT,
  });

  const totalPages = firstPage.pagination.total_pages;

  if (totalPages <= 1) {
    return firstPage;
  }

  const pageRequests: Array<Promise<PaginatedNominaEmpleadosApi>> = [];

  for (let page = 2; page <= totalPages; page += 1) {
    pageRequests.push(
      getNominaPeriodoEmpleados(id, {
        ...filters,
        page,
        limit: MAX_BATCH_LIMIT,
      }),
    );
  }

  const remainingPages = await Promise.all(pageRequests);
  const items = [
    ...firstPage.items,
    ...remainingPages.flatMap((pageData) => pageData.items),
  ];

  return {
    items,
    pagination: {
      page: 1,
      limit: items.length,
      total: firstPage.pagination.total,
      total_pages: totalPages,
    },
  };
}

export async function listarCorreccionesNomina(
  filters: NominaCorreccionFilters = {},
): Promise<NominaCorreccionesResponse> {
  const response = await apiClient.get<ApiResponse<NominaCorreccionesResponse>>(
    '/nomina/correcciones',
    {
      params: toParams({
        activo: filters.activo ?? true,
        estado: filters.estado,
        limit: filters.limit,
        nomina_empleado_id: filters.nomina_empleado_id,
        page: filters.page,
        periodo_id: filters.periodo_id,
        search: filters.search,
        tipo_correccion: filters.tipo_correccion,
        vinculacion_id: filters.vinculacion_id,
      }),
    },
  );

  return response.data;
}

export async function obtenerCorreccionNomina(
  id: string | number,
): Promise<NominaCorreccionDetalle> {
  const response = await apiClient.get<ApiResponse<NominaCorreccionDetalle>>(
    `/nomina/correcciones/${id}`,
  );

  return response.data;
}

export async function crearCorreccionNomina(
  payload: CreateNominaCorreccionPayload,
): Promise<NominaCorreccion> {
  const response = await apiClient.post<ApiResponse<NominaCorreccion>>(
    '/nomina/correcciones',
    payload,
  );

  return response.data;
}

export async function actualizarCorreccionNomina(
  id: string | number,
  payload: UpdateNominaCorreccionPayload,
): Promise<NominaCorreccion> {
  const response = await apiClient.patch<ApiResponse<NominaCorreccion>>(
    `/nomina/correcciones/${id}`,
    payload,
  );

  return response.data;
}

export async function solicitarCorreccionNomina(
  id: string | number,
): Promise<NominaCorreccion> {
  const response = await apiClient.patch<ApiResponse<NominaCorreccion>>(
    `/nomina/correcciones/${id}/solicitar`,
    {},
  );

  return response.data;
}

export async function revisarCorreccionNomina(
  id: string | number,
): Promise<NominaCorreccion> {
  const response = await apiClient.patch<ApiResponse<NominaCorreccion>>(
    `/nomina/correcciones/${id}/revisar`,
    {},
  );

  return response.data;
}

export async function aprobarCorreccionNomina(
  id: string | number,
): Promise<NominaCorreccion> {
  const response = await apiClient.patch<ApiResponse<NominaCorreccion>>(
    `/nomina/correcciones/${id}/aprobar`,
    {},
  );

  return response.data;
}

export async function rechazarCorreccionNomina(
  id: string | number,
  observacion: string,
): Promise<NominaCorreccion> {
  const response = await apiClient.patch<ApiResponse<NominaCorreccion>>(
    `/nomina/correcciones/${id}/rechazar`,
    {
      observacion_revision: observacion,
    },
  );

  return response.data;
}

export async function anularCorreccionNomina(
  id: string | number,
  observacion: string,
): Promise<NominaCorreccion> {
  const response = await apiClient.patch<ApiResponse<NominaCorreccion>>(
    `/nomina/correcciones/${id}/anular`,
    {
      observacion_revision: observacion,
    },
  );

  return response.data;
}

export async function desactivarCorreccionNomina(
  id: string | number,
): Promise<NominaCorreccion> {
  const response = await apiClient.patch<ApiResponse<NominaCorreccion>>(
    `/nomina/correcciones/${id}/deactivate`,
    {},
  );

  return response.data;
}

export async function getNominaNovedades(
  filters: NominaNovedadesQuery = {},
): Promise<PaginatedNominaNovedadesApi> {
  const response = await apiClient.get<ApiResponse<PaginatedNominaNovedadesApi>>('/nomina/novedades', {
    params: toParams(filters),
  });

  return response.data;
}

export async function getAllNominaNovedades(
  filters: Omit<NominaNovedadesQuery, 'page' | 'limit'> = {},
): Promise<PaginatedNominaNovedadesApi> {
  const firstPage = await getNominaNovedades({
    ...filters,
    page: 1,
    limit: MAX_BATCH_LIMIT,
  });

  const totalPages = firstPage.pagination.total_pages;

  if (totalPages <= 1) {
    return firstPage;
  }

  const pageRequests: Array<Promise<PaginatedNominaNovedadesApi>> = [];

  for (let page = 2; page <= totalPages; page += 1) {
    pageRequests.push(
      getNominaNovedades({
        ...filters,
        page,
        limit: MAX_BATCH_LIMIT,
      }),
    );
  }

  const remainingPages = await Promise.all(pageRequests);
  const items = [
    ...firstPage.items,
    ...remainingPages.flatMap((pageData) => pageData.items),
  ];

  return {
    items,
    pagination: {
      page: 1,
      limit: items.length,
      total: firstPage.pagination.total,
      total_pages: totalPages,
    },
  };
}

export async function listarTiposNovedad(
  filters: NominaTipoNovedadFilters = {},
): Promise<NominaTipoNovedadResponse> {
  const response = await apiClient.get<ApiResponse<NominaTipoNovedadResponse>>(
    '/nomina/tipos-novedad',
    {
      params: toParams({
        activo: filters.activo ?? true,
        empresa_id: filters.empresa_id,
        busqueda: filters.busqueda,
        categoria: filters.categoria,
        page: filters.page ?? 1,
        limit: filters.limit ?? 100,
      }),
    },
  );

  return response.data;
}

export async function obtenerTipoNovedad(
  id: string,
): Promise<NominaTipoNovedad> {
  const response = await apiClient.get<ApiResponse<NominaTipoNovedad>>(
    `/nomina/tipos-novedad/${id}`,
  );

  return response.data;
}

export async function getNominaLiquidaciones(
  periodoId: string,
  filters: NominaLiquidacionFilters = {},
): Promise<PaginatedNominaLiquidacionesApi> {
  const response = await apiClient.get<ApiResponse<PaginatedNominaLiquidacionesApi>>(
    `/nomina/liquidaciones/${periodoId}`,
    {
      params: toParams(filters),
    },
  );

  return response.data;
}

export async function getAllNominaLiquidaciones(
  periodoId: string,
  filters: Omit<NominaLiquidacionFilters, 'page' | 'limit'> = {},
): Promise<PaginatedNominaLiquidacionesApi> {
  const firstPage = await getNominaLiquidaciones(periodoId, {
    ...filters,
    page: 1,
    limit: MAX_BATCH_LIMIT,
  });

  const totalPages = firstPage.pagination.total_pages;

  if (totalPages <= 1) {
    return firstPage;
  }

  const pageRequests: Array<Promise<PaginatedNominaLiquidacionesApi>> = [];

  for (let page = 2; page <= totalPages; page += 1) {
    pageRequests.push(
      getNominaLiquidaciones(periodoId, {
        ...filters,
        page,
        limit: MAX_BATCH_LIMIT,
      }),
    );
  }

  const remainingPages = await Promise.all(pageRequests);
  const items = [
    ...firstPage.items,
    ...remainingPages.flatMap((pageData) => pageData.items),
  ];

  return {
    items,
    pagination: {
      page: 1,
      limit: items.length,
      total: firstPage.pagination.total,
      total_pages: totalPages,
    },
  };
}

export async function getNominaDesprendibles(
  periodoId: string,
  filters: NominaDesprendiblesQuery = {},
): Promise<NominaDesprendibleApi[]> {
  const response = await apiClient.get<ApiResponse<NominaDesprendibleApi[]>>(
    `/nomina/desprendibles/${periodoId}`,
    {
      params: toParams(filters),
    },
  );

  return response.data;
}

export async function getNominaDesprendible(
  periodoId: string,
  vinculacionId: string,
): Promise<NominaDesprendibleApi> {
  const response = await apiClient.get<ApiResponse<NominaDesprendibleApi>>(
    `/nomina/desprendibles/${periodoId}/${vinculacionId}`,
  );

  return response.data;
}

export async function openNominaDesprendible(
  periodoId: string,
  vinculacionId: string,
): Promise<NominaExportMetadata> {
  const desprendible = await getNominaDesprendible(periodoId, vinculacionId);
  const signedUrl = desprendible.documento.signed_url;

  if (!signedUrl) {
    throw new Error('El backend no devolvió una URL firmada para el desprendible.');
  }

  openSafeUrl(signedUrl);

  return {
    content_type: desprendible.documento.mime_type,
    file_name: buildNominaDesprendibleFileName(desprendible),
  };
}

export async function getNominaMovimientos(
  filters: NominaMovimientosQuery = {},
): Promise<PaginatedNominaMovimientosApi> {
  const response = await apiClient.get<ApiResponse<PaginatedNominaMovimientosApi>>('/nomina/movimientos', {
    params: toParams(filters),
  });

  return response.data;
}

export async function getAllNominaMovimientos(
  filters: Omit<NominaMovimientosQuery, 'page' | 'limit'> = {},
): Promise<PaginatedNominaMovimientosApi> {
  const firstPage = await getNominaMovimientos({
    ...filters,
    page: 1,
    limit: MAX_BATCH_LIMIT,
  });

  const totalPages = firstPage.pagination.total_pages;

  if (totalPages <= 1) {
    return firstPage;
  }

  const pageRequests: Array<Promise<PaginatedNominaMovimientosApi>> = [];

  for (let page = 2; page <= totalPages; page += 1) {
    pageRequests.push(
      getNominaMovimientos({
        ...filters,
        page,
        limit: MAX_BATCH_LIMIT,
      }),
    );
  }

  const remainingPages = await Promise.all(pageRequests);
  const items = [
    ...firstPage.items,
    ...remainingPages.flatMap((pageData) => pageData.items),
  ];

  return {
    items,
    pagination: {
      page: 1,
      limit: items.length,
      total: firstPage.pagination.total,
      total_pages: totalPages,
    },
  };
}

export async function getNominaTurnos(
  filters: NominaTurnoFilters = {},
): Promise<PaginatedNominaTurnosApi> {
  return mapPaginatedNominaTurnos(await getNominaMovimientos({
    ...filters,
    tipo_movimiento: NOMINA_TURNO_MOVIMIENTO_TIPO,
  }));
}

export async function getAllNominaTurnos(
  filters: Omit<NominaTurnoFilters, 'page' | 'limit'> = {},
): Promise<PaginatedNominaTurnosApi> {
  return mapPaginatedNominaTurnos(await getAllNominaMovimientos({
    ...filters,
    tipo_movimiento: NOMINA_TURNO_MOVIMIENTO_TIPO,
  }));
}

export async function createNominaNovedad(
  input: CreateNominaNovedadApi,
): Promise<NominaNovedadApi> {
  const response = await apiClient.post<ApiResponse<NominaNovedadApi>>('/nomina/novedades', input);
  return response.data;
}
export async function createNominaNovedadConTurno(input: CreateNominaNovedadConTurnoApi) { const response=await apiClient.post<ApiResponse<{novedad:NominaNovedadApi;turno_id:string}>>('/nomina/novedades/con-turno',input); return response.data; }
export async function getRevisionOperativa(periodoId:string) { const response=await apiClient.get<ApiResponse<RevisionOperativaApi[]>>(`/nomina/periodos/${periodoId}/revision-operativa`); return response.data; }
export async function updateRevisionOperativa(periodoId:string,empleadoId:string,estado:RevisionOperativaApi['estado_revision']) { const response=await apiClient.patch<ApiResponse<RevisionOperativaApi>>(`/nomina/periodos/${periodoId}/revision-operativa/${empleadoId}`,{estado_revision:estado}); return response.data; }
export async function closeNominaEmpleadoOperativo(periodoId:string,empleadoId:string) { const response=await apiClient.post<ApiResponse<NominaEmpleadoOperativoStateApi>>(`/nomina/periodos/${periodoId}/cierre-operativo/${empleadoId}`); return response.data; }
export async function reopenNominaEmpleadoOperativo(periodoId:string,empleadoId:string,motivo:string) { const response=await apiClient.post<ApiResponse<NominaEmpleadoOperativoStateApi>>(`/nomina/periodos/${periodoId}/reapertura-operativa/${empleadoId}`,{motivo}); return response.data; }
export async function markNominaAsistencia(periodoId:string,vinculacionId:string,fecha:string,presente:boolean) { const response=await apiClient.post<ApiResponse<unknown>>(`/nomina/periodos/${periodoId}/asistencia/marcar`,{vinculacion_id:vinculacionId,fecha,presente}); return response.data; }
export async function markNominaAsistenciaRango(periodoId:string,vinculacionId:string,fecha_inicio:string,fecha_fin:string) { const response=await apiClient.post<ApiResponse<unknown>>(`/nomina/periodos/${periodoId}/asistencia/rango`,{vinculacion_id:vinculacionId,fecha_inicio,fecha_fin}); return response.data; }
export async function markNominaAsistenciaMasiva(periodoId:string,vinculacion_ids:string[],fecha_inicio:string,fecha_fin:string) { const response=await apiClient.post<ApiResponse<unknown>>(`/nomina/periodos/${periodoId}/asistencia/masiva`,{vinculacion_ids,fecha_inicio,fecha_fin}); return response.data; }

export async function createNominaMovimiento(
  input: CreateNominaMovimientoApi,
): Promise<NominaMovimientoApi> {
  const response = await apiClient.post<ApiResponse<NominaMovimientoApi>>('/nomina/movimientos', input);
  return response.data;
}

export async function createNominaTurno(
  input: CreateNominaTurnoPayload,
): Promise<NominaTurno> {
  return mapNominaTurno(await createNominaMovimiento({
    ...input,
    tipo_movimiento: NOMINA_TURNO_MOVIMIENTO_TIPO,
  }));
}

export async function updateNominaMovimiento(
  id: string,
  input: UpdateNominaMovimientoApi,
): Promise<NominaMovimientoApi> {
  const response = await apiClient.patch<ApiResponse<NominaMovimientoApi>>('/nomina/movimientos/' + id, input);
  return response.data;
}

export async function reviewNominaMovimiento(
  id: string,
  input: { motivo_estado?: string | null } = {},
): Promise<NominaMovimientoApi> {
  const response = await apiClient.patch<ApiResponse<NominaMovimientoApi>>(
    '/nomina/movimientos/' + id + '/revisar',
    input,
  );

  return response.data;
}

export async function approveNominaMovimiento(
  id: string,
  input: { motivo_estado?: string | null } = {},
): Promise<NominaMovimientoApi> {
  const response = await apiClient.patch<ApiResponse<NominaMovimientoApi>>(
    '/nomina/movimientos/' + id + '/aprobar',
    input,
  );

  return response.data;
}

export async function rejectNominaMovimiento(
  id: string,
  input: { motivo_estado?: string | null } = {},
): Promise<NominaMovimientoApi> {
  const response = await apiClient.patch<ApiResponse<NominaMovimientoApi>>(
    '/nomina/movimientos/' + id + '/rechazar',
    input,
  );

  return response.data;
}

export async function updateNominaTurno(
  id: string,
  input: UpdateNominaTurnoPayload,
): Promise<NominaTurno> {
  return mapNominaTurno(await updateNominaMovimiento(id, {
    ...input,
    tipo_movimiento: NOMINA_TURNO_MOVIMIENTO_TIPO,
  }));
}

export async function deactivateNominaMovimiento(id: string): Promise<NominaMovimientoApi> {
  const response = await apiClient.patch<ApiResponse<NominaMovimientoApi>>(
    '/nomina/movimientos/' + id + '/deactivate',
  );

  return response.data;
}

export async function deactivateNominaTurno(id: string): Promise<NominaTurno> {
  return mapNominaTurno(await deactivateNominaMovimiento(id));
}

export async function reviewNominaTurno(
  id: string,
  input: { motivo_estado?: string | null } = {},
): Promise<NominaTurno> {
  return mapNominaTurno(await reviewNominaMovimiento(id, input));
}

export async function approveNominaTurno(
  id: string,
  input: { motivo_estado?: string | null } = {},
): Promise<NominaTurno> {
  return mapNominaTurno(await approveNominaMovimiento(id, input));
}

export async function rejectNominaTurno(
  id: string,
  input: { motivo_estado?: string | null } = {},
): Promise<NominaTurno> {
  return mapNominaTurno(await rejectNominaMovimiento(id, input));
}

export async function updateNominaNovedad(
  id: string,
  input: UpdateNominaNovedadApi,
): Promise<NominaNovedadApi> {
  const response = await apiClient.patch<ApiResponse<NominaNovedadApi>>(
    '/nomina/novedades/' + encodeURIComponent(id),
    input,
  );
  return response.data;
}

export async function deactivateNominaNovedad(id: string): Promise<NominaNovedadApi> {
  const response = await apiClient.patch<ApiResponse<NominaNovedadApi>>(
    '/nomina/novedades/' + encodeURIComponent(id) + '/deactivate',
  );

  return response.data;
}

export async function recalculateNominaPeriodo(
  id: string,
  input: NominaPeriodoActionApi = {},
): Promise<NominaPeriodoActionResultApi> {
  const hasPayload = Object.keys(input).length > 0;
  const response = await apiClient.post<ApiResponse<NominaPeriodoActionResultApi>>(
    '/nomina/periodos/' + id + '/recalcular',
    hasPayload ? input : undefined,
  );

  return response.data;
}

export async function generateNominaLiquidaciones(
  periodoId: string,
): Promise<GenerateNominaLiquidacionesResponse> {
  const response = await apiClient.post<ApiResponse<GenerateNominaLiquidacionesResponse>>(
    '/nomina/liquidaciones/' + periodoId + '/generar',
  );

  return response.data;
}

export async function generateNominaDesprendibles(
  periodoId: string,
): Promise<GenerateNominaDesprendiblesResponse> {
  const response = await apiClient.post<ApiResponse<GenerateNominaDesprendiblesResponse>>(
    '/nomina/desprendibles/' + periodoId + '/generar',
  );

  return response.data;
}

export async function exportNomina(
  periodoId: string,
  request: NominaExportRequest = {},
): Promise<NominaExportMetadata> {
  const { blob, metadata } = await fetchNominaFile('/nomina/export/' + periodoId, toParams({
    include_versiones: request.include_versiones,
    tipo: (request.tipo ?? 'todo') as NominaExportTipo,
  }));

  triggerBrowserDownload(blob, metadata.file_name);
  return metadata;
}

export async function exportNominaMovimientosCsv(
  periodoId: string,
): Promise<NominaExportMetadata> {
  return exportNomina(periodoId, {
    tipo: 'movimientos',
  });
}

export async function exportNominaLiquidacionesCsv(
  periodoId: string,
): Promise<NominaExportMetadata> {
  return exportNomina(periodoId, {
    tipo: 'liquidaciones',
  });
}
