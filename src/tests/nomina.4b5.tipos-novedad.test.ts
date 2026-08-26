import test from 'node:test';
import assert from 'node:assert/strict';
import { listNominaTiposNovedadQuerySchema } from '../modules/nomina/nomina.schemas';

test('4B.5 contrato de producción acepta empresa_id=7', () => {
  const parsed = listNominaTiposNovedadQuerySchema.parse({ activo: 'true', empresa_id: '7', page: '1', limit: '100' });
  assert.equal(parsed.empresa_id, 7);
  assert.equal(parsed.activo, true);
  assert.equal(parsed.limit, 100);
});

test('4B.5 empresa_id inválido abc devuelve 400 de validación', () => assert.throws(() => listNominaTiposNovedadQuerySchema.parse({ empresa_id: 'abc' })));
test('4B.5 empresa_id negativo devuelve 400 de validación', () => assert.throws(() => listNominaTiposNovedadQuerySchema.parse({ empresa_id: '-1' })));
test('4B.5 clave desconocida continúa rechazada por schema strict', () => assert.throws(() => listNominaTiposNovedadQuerySchema.parse({ empresa_id: '7', foo: 'bar' })));
