import { apiPost, clearToken, getToken as getStoredToken, setToken } from "../lib/api";

interface AuthUser {
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

export async function login(email: string, password: string): Promise<LoginResult> {
  const result = await apiPost<LoginResult>("/auth/login", { email, password });
  setToken(result.accessToken);
  return result;
}

export function getToken(): string | null {
  return getStoredToken();
}

export function logout(): void {
  clearToken();
}
