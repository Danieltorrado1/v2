type ScopedStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function normalizeScopeValue(scopeId: number | string | null | undefined) {
  return scopeId === null || scopeId === undefined || scopeId === "" ? "global" : String(scopeId);
}

export function buildCompanyScopedStorageKey(
  baseKey: string,
  empresaId: number | string | null | undefined,
) {
  return `${baseKey}:${normalizeScopeValue(empresaId)}`;
}

export function readCompanyScopedStorage(
  storage: ScopedStorage | null | undefined,
  baseKey: string,
  empresaId: number | string | null | undefined,
) {
  if (!storage) {
    return null;
  }

  return storage.getItem(buildCompanyScopedStorageKey(baseKey, empresaId));
}

export function writeCompanyScopedStorage(
  storage: ScopedStorage | null | undefined,
  baseKey: string,
  empresaId: number | string | null | undefined,
  value: string | null,
) {
  if (!storage) {
    return;
  }

  const scopedKey = buildCompanyScopedStorageKey(baseKey, empresaId);

  if (value === null || value === "") {
    storage.removeItem(scopedKey);
    return;
  }

  storage.setItem(scopedKey, value);
}

export function pickAvailableScopedId<T extends { id: string | number }>(
  items: T[],
  preferredId: string | null | undefined,
  currentId: string | null | undefined,
) {
  const availableIds = new Set(items.map((item) => String(item.id)));

  if (preferredId && availableIds.has(String(preferredId))) {
    return String(preferredId);
  }

  if (currentId && availableIds.has(String(currentId))) {
    return String(currentId);
  }

  return items[0] ? String(items[0].id) : null;
}

export function pickAuthorizedCompanyId<T extends { id: number }>(
  companies: T[],
  storedId: number | null | undefined,
  defaultId: number | null | undefined,
) {
  const availableIds = new Set(companies.map((company) => company.id));

  if (storedId !== null && storedId !== undefined && availableIds.has(storedId)) {
    return storedId;
  }

  if (defaultId !== null && defaultId !== undefined && availableIds.has(defaultId)) {
    return defaultId;
  }

  return companies[0]?.id ?? null;
}
