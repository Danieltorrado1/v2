import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vinculacionesSchemasPromise = import('../modules/vinculaciones/' + 'vinculaciones.schemas.ts');

test('listContractPersonalQuerySchema acepta combinaciones paginadas de contrato, busqueda, cargo y estado', async () => {
  const { listContractPersonalQuerySchema } = await vinculacionesSchemasPromise;

  const parsed = listContractPersonalQuerySchema.parse({
    contrato_id: '15',
    contrato_cargo_id: '7',
    estado_vinculacion: 'ACTIVA',
    search: '  maria perez  ',
    page: '2',
    limit: '50'
  });

  assert.deepEqual(parsed, {
    contrato_id: 15,
    contrato_cargo_id: 7,
    estado_vinculacion: 'ACTIVA',
    search: 'maria perez',
    page: 2,
    limit: 50
  });
});

test('listContractPersonal aplica tenant del contrato antes de consultar y combina search, cargo y estado en la misma SQL', () => {
  const source = readFileSync(
    path.join(root, 'src/modules/vinculaciones/vinculaciones.service.ts'),
    'utf8'
  );

  assert.match(source, /await ensureContractTenantAccess\(client, tenant, filters\.contrato_id\);/);
  assert.match(source, /if \(filters\.search\)/);
  assert.match(source, /p\.numero_documento ILIKE/);
  assert.match(source, /p\.primer_nombre ILIKE/);
  assert.match(source, /p\.primer_apellido ILIKE/);
  assert.match(source, /if \(filters\.contrato_cargo_id !== undefined && filters\.contrato_cargo_id !== null\)/);
  assert.match(source, /v\.contrato_cargo_id = \$\$\{paramIndex\}::bigint/);
  assert.match(source, /if \(filters\.estado_vinculacion\)/);
});
