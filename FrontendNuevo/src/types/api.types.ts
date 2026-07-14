export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
  code?: string;
  originalError?: unknown;
}

export type ApiQueryParamValue = string | number | boolean | null | undefined;

export type ApiQueryParams = Record<string, ApiQueryParamValue>;

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

export interface ApiPaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages?: number;
  total_pages?: number;
}

export interface PaginatedResponse<T, TPagination extends ApiPaginationMeta = ApiPaginationMeta> {
  success: boolean;
  data: T[];
  pagination: TPagination;
  message?: string;
}

export interface ApiErrorResponse {
  success?: boolean;
  message?: string;
  code?: string;
  details?: unknown;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
}

export interface ApiRequestOptions {
  headers?: Record<string, string>;
  params?: ApiQueryParams;
  timeout?: number;
  skipAuth?: boolean;
}
