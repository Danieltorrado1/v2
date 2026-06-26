import { apiClient } from './apiClient';
import { getAuthToken, clearAuthSession } from './tokenStorage';
import type { AuthUser, AuthSession } from '../types/auth.types';
import type { ApiResponse } from '../types/api.types';

// ── Backward-compatible type exports ──────────────────────────────────────────

export type { AuthUser };
export type LoginInput = { email: string; password: string };
export type LoginResult = AuthSession;

// ── Auth functions ─────────────────────────────────────────────────────────────

export async function login(credentials: LoginInput): Promise<AuthSession> {
  const response = await apiClient.post<ApiResponse<AuthSession>>(
    '/auth/login',
    credentials,
  );
  return response.data;
}

export function logout(): void {
  clearAuthSession();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!getAuthToken()) return null;
  try {
    const response = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
    return response.data;
  } catch {
    return null;
  }
}

// Backward-compat alias
export const getMe = getCurrentUser;
