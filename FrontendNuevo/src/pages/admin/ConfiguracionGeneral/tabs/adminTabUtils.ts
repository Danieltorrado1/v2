export interface AdminFeedback {
  tone: 'success' | 'error';
  text: string;
}

export function hasAnyPermission(
  permissions: string[] | undefined,
  required: string[],
): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }

  return required.some((permission) => permissions.includes(permission));
}

export function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'No disponible';
  }

  const parsed = new Date(`${value}T00:00:00`);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(parsed);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return 'No disponible';
  }

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('es-CO', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

export function getErrorCode(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof (error as { code?: unknown }).code === 'string'
  ) {
    return (error as { code: string }).code;
  }

  return undefined;
}

export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

export function mapKnownError(
  error: unknown,
  fallback: string,
  messages: Record<string, string>,
): string {
  const code = getErrorCode(error);

  if (code && messages[code]) {
    return messages[code];
  }

  return getErrorMessage(error, fallback);
}

export function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
