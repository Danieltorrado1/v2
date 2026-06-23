import { apiGet, apiPost, clearToken, getToken as getStoredToken, setToken } from "../lib/api";

const USER_STORAGE_KEY = "empiria_user";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  active: boolean;
  roles: string[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

interface LoginResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: AuthUser;
}

export function getStoredUser(): AuthUser | null {
  const raw = localStorage.getItem(USER_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function clearStoredUser(): void {
  localStorage.removeItem(USER_STORAGE_KEY);
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const result = await apiPost<LoginResult>("/auth/login", { email, password });
  setToken(result.accessToken);
  setStoredUser(result.user);
  return result.user;
}

// GET /auth/me — identidad real (nombre, roles, permisos) del usuario autenticado.
// Se usa al recargar la página, cuando ya hay un token pero el perfil en memoria se perdió.
export async function fetchCurrentUser(): Promise<AuthUser> {
  const user = await apiGet<AuthUser>("/auth/me");
  setStoredUser(user);
  return user;
}

export function getToken(): string | null {
  return getStoredToken();
}

export function logout(): void {
  clearToken();
  clearStoredUser();
}
