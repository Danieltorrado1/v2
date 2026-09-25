export type AttendanceSyncState =
  | "PENDIENTE_LOCAL"
  | "ENVIANDO"
  | "CONFIRMADO_SERVIDOR"
  | "ERROR_REINTENTABLE"
  | "ERROR_REQUIERE_USUARIO";

export type AttendanceQueueContext = {
  empresaId: string;
  contratoId: string | null;
  periodoId: string;
};

export type AttendanceQueueItem = {
  vinculacion_id: string;
  fecha: string;
  presente: boolean;
  idempotency_key: string;
  context: AttendanceQueueContext;
  state: AttendanceSyncState;
  error: string | null;
  updated_at: string;
};

export function classifyAttendanceFailure(status: number | null): AttendanceSyncState {
  return status === 401 || status === 403 || status === 409
    ? "ERROR_REQUIERE_USUARIO"
    : "ERROR_REINTENTABLE";
}

export function migrateAttendanceQueue(
  raw: unknown,
  context: AttendanceQueueContext,
  newKey: () => string,
): { items: AttendanceQueueItem[]; recovered: number; discarded: number } {
  if (!Array.isArray(raw)) return { items: [], recovered: 0, discarded: 0 };
  const items: AttendanceQueueItem[] = [];
  let discarded = 0;
  for (const value of raw) {
    if (!value || typeof value !== "object") { discarded += 1; continue; }
    const candidate = value as Record<string, unknown>;
    const vinculacionId = String(candidate.vinculacion_id ?? "").trim();
    const fecha = String(candidate.fecha ?? "").trim();
    if (!/^\d+$/.test(vinculacionId) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || typeof candidate.presente !== "boolean") {
      discarded += 1;
      continue;
    }
    const candidateContext = candidate.context && typeof candidate.context === "object"
      ? candidate.context as Record<string, unknown>
      : null;
    const sameContext = !candidateContext || (
      String(candidateContext.empresaId ?? context.empresaId) === context.empresaId &&
      String(candidateContext.contratoId ?? context.contratoId ?? "") === String(context.contratoId ?? "") &&
      String(candidateContext.periodoId ?? context.periodoId) === context.periodoId
    );
    if (!sameContext) { discarded += 1; continue; }
    items.push({
      vinculacion_id: vinculacionId,
      fecha,
      presente: candidate.presente,
      idempotency_key: typeof candidate.idempotency_key === "string" && candidate.idempotency_key.trim()
        ? candidate.idempotency_key
        : newKey(),
      context,
      state: "PENDIENTE_LOCAL",
      error: null,
      updated_at: new Date().toISOString(),
    });
  }
  const deduped = new Map(items.map((item) => [`${item.vinculacion_id}|${item.fecha}`, item]));
  return { items: [...deduped.values()], recovered: deduped.size, discarded };
}

export function queueStatusLabel(items: AttendanceQueueItem[]): string {
  const pending = items.filter((item) => item.state !== "CONFIRMADO_SERVIDOR").length;
  if (!pending) return "Guardado";
  if (items.some((item) => item.state === "ENVIANDO")) return "Guardando…";
  if (items.some((item) => item.state.startsWith("ERROR_"))) return "Error de sincronización";
  return "Cambios pendientes";
}

export function applyAttendanceAcks(items: AttendanceQueueItem[], acknowledgedKeys: Iterable<string>): AttendanceQueueItem[] {
  const acknowledged = new Set(acknowledgedKeys);
  return items.filter((item) => !acknowledged.has(item.idempotency_key));
}

export function buildAttendanceDiagnostic(items: AttendanceQueueItem[], context: AttendanceQueueContext, lastAck: string | null) {
  return {
    generated_at: new Date().toISOString(),
    context,
    counts: {
      pending: items.filter((item) => item.state === "PENDIENTE_LOCAL").length,
      sending: items.filter((item) => item.state === "ENVIANDO").length,
      retryable: items.filter((item) => item.state === "ERROR_REINTENTABLE").length,
      requires_user: items.filter((item) => item.state === "ERROR_REQUIERE_USUARIO").length,
      confirmed: items.filter((item) => item.state === "CONFIRMADO_SERVIDOR").length,
    },
    last_ack: lastAck,
    entries: items.map(({ vinculacion_id, fecha, presente, idempotency_key, state, error }) => ({ vinculacion_id, fecha, presente, idempotency_key, state, error })),
  };
}

export function attendanceDiagnosticCsv(items: AttendanceQueueItem[]): string {
  const escape = (value: string | boolean | null) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return [
    "vinculacion_id,fecha,presente,idempotency_key,state,error",
    ...items.map((item) => [item.vinculacion_id, item.fecha, item.presente, item.idempotency_key, item.state, item.error].map(escape).join(",")),
  ].join("\n");
}
