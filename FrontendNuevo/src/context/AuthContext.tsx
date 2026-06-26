import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser, AuthSession } from '../types/auth.types';
import {
  getAuthToken,
  getAuthUser,
  setAuthToken,
  setAuthUser,
} from '../services/tokenStorage';
import { login as authServiceLogin, logout as authServiceLogout, type LoginInput } from '../services/authService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginInput) => Promise<AuthUser>;
  logout: () => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Hydrate session from tokenStorage on first render
  useEffect(() => {
    const savedToken = getAuthToken();
    const savedUser = getAuthUser();
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(savedUser);
    }
    setIsLoading(false);
  }, []);

  // React to 401 events dispatched by apiClient
  useEffect(() => {
    function onUnauthorized() {
      setToken(null);
      setUser(null);
    }
    window.addEventListener('empiria:unauthorized', onUnauthorized);
    return () => {
      window.removeEventListener('empiria:unauthorized', onUnauthorized);
    };
  }, []);

  const login = useCallback(async (credentials: LoginInput): Promise<AuthUser> => {
    const session: AuthSession = await authServiceLogin(credentials);
    setAuthToken(session.accessToken);
    setAuthUser(session.user);
    setToken(session.accessToken);
    setUser(session.user);
    return session.user;
  }, []);

  const logout = useCallback((): void => {
    authServiceLogout();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, token, isAuthenticated: !!token, isLoading, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
