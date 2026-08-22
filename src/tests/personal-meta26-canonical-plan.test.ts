import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface PlanRow {
  fila_xlsx: number;
  sha_archivo: string;
  contrato_cargo_id: number | string | null;
  tipo_vinculacion_id: number | string | null;
  aplica_cobertura: boolean;
  focalizacion_final_id: number | string | null;
  aplica_asignacion_laboral: boolean;
  ubicacion_laboral_id: number | string | null;
  presentada_licitacion: boolean;
  perfil_licitacion_id: number | string | null;
  aplica_condicion_economica: boolean;
  valor_condicion: number | null;
  motivo_condicion: string | null;
  vigencia_condicion_desde: string | null;
  es_retirada_historica: boolean;
  fecha_retiro: string | null;
  categoria_final: string;
}

const plan = JSON.parse(readFileSync('reports/personal-meta26-import-plan-final.json', 'utf8')) as { ready: boolean; blockers: unknown[]; records: PlanRow[] };
const smoke = JSON.parse(readFileSync('reports/personal-meta26-smoke-plan-v2.json', 'utf8')) as Array<PlanRow & { criterio: string }>;
const byRow = new Map(plan.records.map((row) => [row.fila_xlsx, row]));

const required = (value: unknown): boolean => value !== null && value !== undefined && value !== '';

test('plan canónico contiene exactamente 772 filas y no tiene bloqueadores', () => {
  assert.equal(plan.records.length, 772);
  assert.equal(plan.blockers.length, 0);
  assert.equal(plan.ready, true);
});

test('fila resuelta conserva focalizacion_final_id', () => {
  for (const row of plan.records.filter((item) => item.aplica_cobertura)) assert.ok(required(row.focalizacion_final_id));
  assert.equal(String(byRow.get(18)?.focalizacion_final_id), '166');
  assert.equal(String(byRow.get(20)?.focalizacion_final_id), '186');
});

test('cargo y tipo de vinculación conservan IDs técnicos', () => {
  for (const row of plan.records) {
    assert.ok(required(row.contrato_cargo_id));
    assert.ok(required(row.tipo_vinculacion_id));
  }
  assert.equal(String(byRow.get(690)?.contrato_cargo_id), '38');
});

test('cobertura rechaza conceptualmente focalización nula', () => {
  assert.equal(plan.records.filter((row) => row.aplica_cobertura && !required(row.focalizacion_final_id)).length, 0);
});

test('asignación laboral requiere ubicación', () => {
  assert.equal(plan.records.filter((row) => row.aplica_asignacion_laboral && !required(row.ubicacion_laboral_id)).length, 0);
});

test('licitación requiere perfil', () => {
  assert.equal(plan.records.filter((row) => row.presentada_licitacion && !required(row.perfil_licitacion_id)).length, 0);
});

test('CASO_ESPECIAL conserva vigencia 2026-07-29', () => {
  const cases = plan.records.filter((row) => row.aplica_condicion_economica);
  assert.equal(cases.length, 4);
  assert.ok(cases.every((row) => row.valor_condicion !== null && row.motivo_condicion && row.vigencia_condicion_desde === '2026-07-29'));
});

test('retiradas conservan fecha 2026-08-02', () => {
  const retired = plan.records.filter((row) => row.es_retirada_historica);
  assert.equal(retired.length, 17);
  assert.ok(retired.every((row) => row.fecha_retiro === '2026-08-02'));
});

test('smoke-plan V2 es subset exacto y sin filas duplicadas', () => {
  assert.ok(smoke.length >= 6 && smoke.length <= 10);
  assert.equal(new Set(smoke.map((row) => row.fila_xlsx)).size, smoke.length);
  for (const row of smoke) assert.equal(byRow.get(row.fila_xlsx)?.fila_xlsx, row.fila_xlsx);
});

test('smoke-plan no reinterpreta XLSX: copia IDs del plan canónico', () => {
  for (const row of smoke) {
    const canonical = byRow.get(row.fila_xlsx)!;
    assert.equal(row.contrato_cargo_id, canonical.contrato_cargo_id);
    assert.equal(row.tipo_vinculacion_id, canonical.tipo_vinculacion_id);
    assert.equal(row.focalizacion_final_id, canonical.focalizacion_final_id);
  }
});

