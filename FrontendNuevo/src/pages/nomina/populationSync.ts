/** A cancelled view does not cancel its mutating HTTP request. */
export function createPopulationSyncCoordinator() {
  const pending = new Map<string, Promise<unknown>>();
  const uncertain = new Set<string>();
  const listeners = new Set<() => void>();
  let snapshot = { pending: 0, uncertain: 0 };
  const publish = () => {
    snapshot = { pending: pending.size, uncertain: uncertain.size };
    for (const listener of listeners) listener();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    hasPending: (key: string) => pending.has(key),
    run<T>(key: string, request: () => Promise<T>): Promise<T> {
      const existing = pending.get(key);
      if (existing) return existing as Promise<T>;
      if (uncertain.size) return Promise.reject(new Error('La sincronización anterior requiere verificación en el servidor antes de continuar.'));
      const operation = Promise.resolve().then(request).catch((error: unknown) => {
        const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined;
        // A timeout/disconnection/server failure does not prove that the write
        // stopped. Keep Excel blocked rather than retrying a mutating request.
        if (typeof status !== 'number' || status === 0 || status === 408 || status >= 500) uncertain.add(key);
        throw error;
      }).finally(() => {
        pending.delete(key);
        publish();
      });
      pending.set(key, operation);
      publish();
      return operation;
    },
  };
}

// Shared across Planilla mounts in this browser session. No network calls here.
export const populationSync = createPopulationSyncCoordinator();
