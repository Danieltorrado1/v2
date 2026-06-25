import { env } from '../config/env';
import { getAuthToken, clearAuthSession } from './tokenStorage';
import type { ApiRequestOptions } from '../types/api.types';

const DEFAULT_TIMEOUT_MS = 30_000;

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;
  readonly originalError: unknown;

  constructor(
    message: string,
    status: number,
    options?: { code?: string; details?: unknown; originalError?: unknown },
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = options?.code;
    this.details = options?.details;
    this.originalError = options?.originalError;
  }
}

function resolveErrorMessage(status: number): string {
  if (status === 401) return 'Sesión expirada. Inicia sesión nuevamente.';
  if (status === 403) return 'No tienes permisos para realizar esta acción.';
  if (status === 404) return 'Recurso no encontrado.';
  if (status === 500) return 'Error interno del servidor.';
  return `Error ${status}`;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  options: ApiRequestOptions = {},
): Promise<T> {
  const {
    headers: extraHeaders = {},
    params,
    timeout = DEFAULT_TIMEOUT_MS,
    skipAuth = false,
  } = options;

  const url = new URL(`${env.apiUrl}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const isFormData = body instanceof FormData;
  const headers: Record<string, string> = { ...extraHeaders };

  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }

  if (!skipAuth) {
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => { controller.abort(); }, timeout);

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body:
        body === undefined
          ? undefined
          : isFormData
            ? (body as FormData)
            : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiClientError(
        'La solicitud tardó demasiado. Inténtalo de nuevo.',
        408,
        { originalError: err },
      );
    }
    throw new ApiClientError(
      'No se pudo conectar con el servidor.',
      0,
      { originalError: err },
    );
  }

  clearTimeout(timeoutId);

  if (response.status === 401) {
    clearAuthSession();
    throw new ApiClientError(resolveErrorMessage(401), 401);
  }

  if (!response.ok) {
    const defaultMessage = resolveErrorMessage(response.status);
    let serverMessage: string | undefined;
    let details: unknown;

    try {
      const json = (await response.json()) as { message?: string; details?: unknown };
      serverMessage = json.message;
      details = json.details;
    } catch {
      // body is not JSON — use default message
    }

    throw new ApiClientError(serverMessage ?? defaultMessage, response.status, { details });
  }

  if (
    response.status === 204 ||
    response.headers.get('content-length') === '0'
  ) {
    return undefined as unknown as T;
  }

  const contentType = response.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return response.json() as Promise<T>;
  }

  return response.text() as unknown as Promise<T>;
}

export const apiClient = {
  get: <T>(path: string, options?: ApiRequestOptions): Promise<T> =>
    request<T>('GET', path, undefined, options),

  post: <T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>('POST', path, body, options),

  put: <T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>('PUT', path, body, options),

  patch: <T>(path: string, body?: unknown, options?: ApiRequestOptions): Promise<T> =>
    request<T>('PATCH', path, body, options),

  delete: <T>(path: string, options?: ApiRequestOptions): Promise<T> =>
    request<T>('DELETE', path, undefined, options),
};
