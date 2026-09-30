import assert from "node:assert/strict";
import test from "node:test";
import { applyAttendanceAcks, attendanceDiagnosticCsv, buildAttendanceDiagnostic, classifyAttendanceFailure, classifyAttendanceItem, migrateAttendanceQueue, queueStatusLabel } from "./attendanceQueue";

const context = { empresaId: "15", contratoId: "24", periodoId: "3" };

test("migra cola antigua y conserva el contexto actual", () => {
  const result = migrateAttendanceQueue([
    { vinculacion_id: "10", fecha: "2026-09-01", presente: true },
    { vinculacion_id: "11", fecha: "2026-09-01", presente: false, context: { empresaId: "15", periodoId: "4" } },
    { vinculacion_id: "bad", fecha: "2026-09-01", presente: true },
  ], context, () => "key-1");
  assert.equal(result.recovered, 2);
  assert.equal(result.discarded, 1);
  assert.equal(result.items[0]?.state, "PENDIENTE_LOCAL");
  assert.equal(result.items[0]?.idempotency_key, "key-1");
});

test("clasifica errores de permisos/conflicto como acción requerida", () => {
  assert.equal(classifyAttendanceFailure(401), "ERROR_REQUIERE_USUARIO");
  assert.equal(classifyAttendanceFailure(403), "ERROR_REQUIERE_USUARIO");
  assert.equal(classifyAttendanceFailure(409), "ERROR_REQUIERE_USUARIO");
  assert.equal(classifyAttendanceFailure(429), "ERROR_REINTENTABLE");
  assert.equal(classifyAttendanceFailure(500), "ERROR_REINTENTABLE");
});

test("no muestra Guardado mientras haya cambios sin ACK", () => {
  const items = migrateAttendanceQueue([{ vinculacion_id: "10", fecha: "2026-09-01", presente: true }], context, () => "key").items;
  assert.equal(queueStatusLabel(items), "1 cambio pendiente");
  assert.equal(queueStatusLabel(items.map((item) => ({ ...item, state: "ENVIANDO" as const }))), "Guardando...");
  assert.equal(queueStatusLabel(items.map((item) => ({ ...item, state: "CONFIRMADO_SERVIDOR" as const }))), "Cambios guardados");
});

test("conserva y bloquea operaciones de otro contexto", () => {
  const item = migrateAttendanceQueue([{ vinculacion_id: "10", fecha: "2026-09-01", presente: true, context: { empresaId: "99", contratoId: "24", periodoId: "3" } }], context, () => "key").items[0]!;
  assert.equal(classifyAttendanceItem(item, context), "CONTEXTO_DIFERENTE");
});

test("el ACK por operación no limpia otra pendiente y el diagnóstico no contiene identidad", () => {
  const items = migrateAttendanceQueue([
    { vinculacion_id: "10", fecha: "2026-09-01", presente: true, idempotency_key: "a" },
    { vinculacion_id: "11", fecha: "2026-09-01", presente: false, idempotency_key: "b" },
  ], context, () => "unused").items;
  const remaining = applyAttendanceAcks(items, ["a"]);
  assert.equal(remaining.length, 1);
  assert.equal(remaining[0]?.idempotency_key, "b");
  const diagnostic = buildAttendanceDiagnostic(remaining, context, "ack");
  assert.equal("nombre" in diagnostic, false);
  assert.match(attendanceDiagnosticCsv(remaining), /idempotency_key/);
});

test("errores de red y respuesta parcial conservan la cola hasta cada ACK", () => {
  assert.equal(classifyAttendanceFailure(null), "ERROR_REINTENTABLE");
  const items = migrateAttendanceQueue([
    { vinculacion_id: "10", fecha: "2026-09-01", presente: true, idempotency_key: "a" },
    { vinculacion_id: "11", fecha: "2026-09-01", presente: false, idempotency_key: "b" },
  ], context, () => "unused").items;
  assert.equal(applyAttendanceAcks(items, ["a"]).length, 1);
  assert.equal(applyAttendanceAcks(items, []).length, 2);
});

test("una operación ENVIANDO heredada exige verificación y no se reanuda sola", () => {
  const result = migrateAttendanceQueue([
    { vinculacion_id: "10", fecha: "2026-09-01", presente: true, idempotency_key: "sending", state: "ENVIANDO" },
  ], context, () => "unused");
  assert.equal(result.items[0]?.state, "PENDING_VERIFICATION");
  assert.match(queueStatusLabel(result.items), /requieren/);
});

test("una operación de otro periodo queda bloqueada para revisión", () => {
  const item = migrateAttendanceQueue([
    { vinculacion_id: "10", fecha: "2026-09-01", presente: true, context: { empresaId: "15", contratoId: "24", periodoId: "99" } },
  ], context, () => "unused").items[0]!;
  assert.equal(item.state, "ERROR_REQUIERE_USUARIO");
  assert.equal(classifyAttendanceItem(item, context), "CONTEXTO_DIFERENTE");
});

test("diagnóstico real de 119 pendientes ofrece envío manual y nunca sincronización falsa", () => {
  const dates = Array.from({ length: 25 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`);
  const entries = Array.from({ length: 119 }, (_, index) => ({
    vinculacion_id: String(100 + (index % 6)),
    fecha: dates[index % dates.length]!,
    presente: index % 2 === 0,
    idempotency_key: `real-${index + 1}`,
    state: "PENDIENTE_LOCAL",
  }));
  const items = migrateAttendanceQueue(entries, context, () => "unused").items;
  assert.equal(items.length, 119);
  assert.equal(queueStatusLabel(items), "119 cambios pendientes");
  assert.doesNotMatch(queueStatusLabel(items), /Sincronizando/);
});

test("ACK parcial, timeout sin ACK y ACK completo conservan la semántica por operación", () => {
  const items = migrateAttendanceQueue([
    { vinculacion_id: "10", fecha: "2026-09-01", presente: true, idempotency_key: "a" },
    { vinculacion_id: "11", fecha: "2026-09-01", presente: true, idempotency_key: "b" },
  ], context, () => "unused").items;
  assert.equal(applyAttendanceAcks(items, ["a"]).length, 1);
  assert.equal(applyAttendanceAcks(items.map((item) => ({ ...item, state: "PENDING_VERIFICATION" as const })), []).length, 2);
  assert.equal(applyAttendanceAcks(items, ["a", "b"]).length, 0);
});
