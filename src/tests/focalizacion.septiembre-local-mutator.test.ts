import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assertLocalArguments } from '../scripts/certify-septiembre-mutator-local';

test('certificación local mantiene PreviewOnly como valor predeterminado', () => {
 assert.equal(assertLocalArguments([]), 'PreviewOnly');
 assert.equal(assertLocalArguments(['--simulate-local']), 'SimulateLocal');
});

test('ningún argumento puede habilitar producción ni sustituir conexión, tenant o hashes', () => {
 for (const args of [['--mutate'],['--production'],['--credentials-env','../../.env'],['--host','db.example.com'],['--actor-id','13'],['--simulate-local','--production']]) {
  assert.throws(() => assertLocalArguments(args), /LOCAL_ONLY_PRODUCTION_MUTATION_DISABLED/);
 }
});

// Evidence from the actual restored PostgreSQL 17.11, not a mocked database.
test('PostgreSQL restaurado demuestra el bloqueo de la proyección mensual', () => {
 const r = JSON.parse(readFileSync('reports/septiembre-local-mutator-certification.json','utf8'));
 assert.equal(r.preflight.instance.version, '17.11');
 assert.equal(r.preflight.instance.host, '127.0.0.1');
 assert.equal(r.preflight.identities_resolved, 688);
 assert.equal(r.preflight.overlapping_active_projection.length, 663);
 assert.equal(r.projection_simulation.error.sqlstate, '23505');
 assert.equal(r.projection_simulation.error.constraint, 'uq_focalizacion_final_clave');
 assert.equal(r.status, 'MUTADOR DETENIDO — NO SEGURO PARA PRODUCCIÓN');
 assert.equal(r.idempotency.second_mutation_executed, false);
});

test('rollback de 344 filas y fallo de proyección conservan todas las tablas públicas', () => {
 const r = JSON.parse(readFileSync('reports/septiembre-local-mutator-certification.json','utf8'));
 assert.equal(r.induced_rollback.error, 'INDUCED_FAILURE_AT_344');
 assert.equal(r.induced_rollback.after_rows, 344);
 assert.equal(r.induced_rollback.all_public_tables_identical, true);
 assert.equal(r.postflight.all_public_tables_identical, true);
 assert.equal(r.postflight.august_count, 687);
 assert.equal(r.postflight.september_loads, 0);
 assert.equal(r.production_writes, 0);
 assert.notEqual(r.induced_rollback.run_id, r.projection_simulation.run_id);
});
