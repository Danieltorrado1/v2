import type { ApiQueryParams } from '../types/api.types';

type QueryPair = [key: string, value: string];

function queryPairs(params?: ApiQueryParams): QueryPair[] {
  if (!params) return [];

  const pairs: QueryPair[] = [];
  for (const [key, rawValue] of Object.entries(params)) {
    if (rawValue === undefined) continue;
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    for (const value of values) {
      if (value !== undefined) pairs.push([key, String(value)]);
    }
  }

  return pairs.sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
}

export function normalizeQueryParams(params?: ApiQueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of queryPairs(params)) search.append(key, value);
  return search.toString();
}

export function buildGetRequestKey(
  tokenKey: string,
  path: string,
  params?: ApiQueryParams,
): string {
  const queryIndex = path.indexOf('?');
  const pathname = queryIndex === -1 ? path : path.slice(0, queryIndex);
  const search = new URLSearchParams(queryIndex === -1 ? '' : path.slice(queryIndex + 1));
  for (const [key, value] of queryPairs(params)) search.append(key, value);

  const sorted = [...search.entries()].sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey));
  const normalized = new URLSearchParams();
  for (const [key, value] of sorted) normalized.append(key, value);
  const query = normalized.toString();
  return `${tokenKey}:${pathname}${query ? `?${query}` : ''}`;
}
