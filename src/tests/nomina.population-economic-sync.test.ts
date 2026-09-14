import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

test('la sincronizacion cierra la brecha economica de materializacion tardia', async () => {
  const source = await readFile('src/modules/nomina/nomina.service.ts', 'utf8');

  assert.match(source, /nomina_categorias_salariales/);
  assert.match(source, /cobertura_asignaciones/);
  assert.match(source, /RETURNING ne\.id::text AS id/);
  assert.match(source, /recalculateNominaPeriodo\(/);
  assert.match(source, /for \(const nominaEmpleadoId of new Set\(recalculableImportedEmployeeIds\)\)/);
  assert.match(source, /ne\.detalle_calculo IS NULL/);
  assert.match(source, /ne\.categoria_salarial_id IS NULL/);
});
