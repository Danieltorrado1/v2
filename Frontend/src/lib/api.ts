const API_URL = import.meta.env.VITE_API_URL as string;
const TOKEN_STORAGE_KEY = "empiria_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

interface ApiErrorBody {
  success: false;
  error: {
    code?: string;
    message: string;
    details?: unknown;
  };
}

interface ApiSuccessBody<T> {
  success: true;
  message?: string;
  data: T;
}

type ApiBody<T> = ApiSuccessBody<T> | ApiErrorBody;

async function request<T>(path: string, method: string, body?: unknown): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  const json = (text ? JSON.parse(text) : undefined) as ApiBody<T> | undefined;

  if (response.status === 401) {
    clearToken();
    throw new Error(
      json && json.success === false ? json.error.message : "Sesión expirada. Inicia sesión nuevamente."
    );
  }

  if (!json || json.success === false) {
    throw new Error(
      json && json.success === false ? json.error.message : `Error en la solicitud (${response.status})`
    );
  }

  return json.data;
}

export function apiGet<T = unknown>(path: string): Promise<T> {
  return request<T>(path, "GET");
}

export function apiPost<T = unknown>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, "POST", body);
}

export function apiPatch<T = unknown>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, "PATCH", body);
}

export function apiDelete<T = unknown>(path: string): Promise<T> {
  return request<T>(path, "DELETE");
}
