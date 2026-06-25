import { useState, useCallback } from 'react';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export interface UseApiStateReturn<T> extends ApiState<T> {
  run: (fn: () => Promise<T>) => Promise<void>;
  reset: () => void;
}

export function useApiState<T>(initial: T | null = null): UseApiStateReturn<T> {
  const [state, setState] = useState<ApiState<T>>({
    data: initial,
    loading: false,
    error: null,
  });

  const run = useCallback(async (fn: () => Promise<T>) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      setState({ data, loading: false, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido';
      setState((s) => ({ ...s, loading: false, error: message }));
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: initial, loading: false, error: null });
  }, [initial]);

  return { ...state, run, reset };
}
