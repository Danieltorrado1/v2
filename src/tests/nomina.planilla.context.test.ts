import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'node:test';

const serviceSource = readFileSync(
  resolve(process.cwd(), 'src/modules/nomina/nomina.service.ts'),
  'utf8'
) + readFileSync(
  resolve(process.cwd(), 'src/modules/nomina/infrastructure/repositories/nomina-poblacion.repository.ts'),
  'utf8'
);

test('Planilla Operativa prioriza el snapshot de contexto por periodo', () => {
  assert.match(serviceSource, /LEFT JOIN nomina_contextos_operativos_base contexto_base/);
  assert.match(serviceSource, /contexto_base\.contexto ->> 'institucion'/);
  assert.match(serviceSource, /contexto_base\.contexto ->> 'sede'/);
  assert.match(serviceSource, /contexto_base\.contexto ->> 'modalidad'/);
  assert.match(serviceSource, /contexto_base\.contexto ->> 'municipio'/);
});

test('la sincronizacion rehidrata contexto solo cuando no existe cobertura intersectante', () => {
  assert.match(serviceSource, /NOT EXISTS \([\s\S]*FROM cobertura_asignaciones ca_period/);
  assert.match(serviceSource, /REHIDRATACION|SINCRONIZACION_PERSONAL/);
  assert.match(serviceSource, /ON CONFLICT \(periodo_id, nomina_empleado_id\) DO UPDATE/);
  assert.match(serviceSource, /contexto IS DISTINCT FROM EXCLUDED\.contexto/);
});
