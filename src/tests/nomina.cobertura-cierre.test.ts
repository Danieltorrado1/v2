import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { assertPeriodoAllowsRecalculate } from '../modules/nomina/nomina.service';
import { resolveNominaMovimientoFamilia } from '../modules/nomina/nomina.movimientos';

const sql = readFileSync(resolve('sql/phase-33-nomina-4a-cobertura.sql'), 'utf8');
const service = readFileSync(resolve('src/modules/nomina/nomina.service.ts'), 'utf8');

test('liquidaciones cerradas y pagadas bloquean recálculo incluso forzado', () => {
  for (const estado of ['CERRADO', 'PAGADO']) {
    assert.throws(() => assertPeriodoAllowsRecalculate(estado, true, { isGlobalAdmin: true } as never), {
      code: 'NOMINA_PERIODO_CERRADO'
    });
  }
});

test('liquidación editable admite recálculo y REVISADO solo reapertura administrativa existente', () => {
  assert.deepEqual(assertPeriodoAllowsRecalculate('ABIERTO', false), { forced: false });
  assert.deepEqual(assertPeriodoAllowsRecalculate('REVISADO', true, { isGlobalAdmin: true } as never), { forced: true });
});

test('invalidación reutiliza revision operativa para novedad cambio operativo y adición interna', () => {
  assert.match(sql, /nomina_invalidar_revision_operativa/);
  assert.match(sql, /TG_TABLE_NAME='nomina_novedades'/);
  assert.match(sql, /TG_TABLE_NAME='nomina_movimientos'/);
  assert.match(sql, /estado_revision\s*=\s*'REQUIERE_REVISION'/);
  assert.match(sql, /np\.estado = 'ABIERTO'/);
});

test('aporta_pension invalida periodos editables por vigencia y conserva snapshot de cálculo', () => {
  assert.match(sql, /trg_vinculacion_condicion_revision/);
  assert.match(sql, /FUENTE_APORTA_PENSION/);
  assert.match(service, /condiciones_economicas/);
  assert.match(service, /aporta_pension: coberturaResult\.aporta_pension/);
  assert.match(service, /detalle_calculo = \$12::jsonb/);
});

test('categorías activas del mismo código y contrato no pueden solapar vigencias', () => {
  assert.match(sql, /DROP CONSTRAINT IF EXISTS nomina_categorias_salariales_contrato_id_codigo_categoria_key/);
  assert.match(sql, /ex_nomina_categoria_salarial_sin_solape/);
  assert.match(sql, /contrato_id WITH =/);
  assert.match(sql, /UPPER\(BTRIM\(codigo_categoria\)\)/);
});

test('TURNO_EXTERNO conserva flujo anterior y queda fuera de adiciones internas COBERTURA', () => {
  assert.equal(resolveNominaMovimientoFamilia('TURNO_EXTERNO'), 'ADICION_DEVENGO');
  assert.match(service, /nnt\.tipo_turno = 'INTERNO'/);
  assert.doesNotMatch(service, /nnt\.tipo_turno = 'TURNO_EXTERNO'/);
  assert.match(service, /movimientos_ss_devengados/);
});
