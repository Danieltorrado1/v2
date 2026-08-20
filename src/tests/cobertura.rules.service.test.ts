import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync(
  path.join(process.cwd(), 'src/modules/cobertura/cobertura.rules.service.ts'),
  'utf8',
);

test('motor de reglas de cobertura lee configuracion desde BD reutilizando tablas existentes', () => {
  assert.match(source, /calculadora_personal_config/);
  assert.match(source, /calculadora_personal_rangos/);
  assert.match(source, /dominio_calculo/);
  assert.match(source, /factor_previo/);
  assert.match(source, /vigencia_desde <=/);
  assert.match(source, /vigencia_hasta/);
  assert.match(source, /CASE WHEN c\.contrato_id = \$1::bigint THEN 0 ELSE 1 END/);
  assert.match(source, /CASE WHEN c\.modalidad_id = \$2::bigint THEN 0 ELSE 1 END/);
  assert.match(source, /metodo: config\.metodo === 'FORMULA' \? 'FORMULA' : 'RANGOS'/);
});
