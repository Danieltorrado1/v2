import assert from 'node:assert/strict';
import test from 'node:test';

import { applyBootstrapPlan, BOOTSTRAP_CONFIRMATION, BOOTSTRAP_CONTRACT_ID, buildBootstrapApplyPlan, runApplyTransaction, validateApplyProtection, type BootstrapApplyPlan, type BootstrapApplyStore } from '../modules/cobertura/cobertura.bootstrap.apply';
import type { BootstrapCatalogs, BootstrapDetail, BootstrapSourceRow } from '../modules/cobertura/cobertura.bootstrap.domain';

const catalogs = (): BootstrapCatalogs => ({ municipios: [{ id: '900', codigo_dane: '50006', nombre_municipio: 'ACACÍAS' }], instituciones: [], sedes: [], modalidades: [{ id: '1', codigo_original: 'CAA', codigo_base: 'CAA', nombre_modalidad: 'CAA' }], modalidadAliases: [], institucionHistorial: [], sedeHistorial: [], sedeModalidades: [] });
const source: BootstrapSourceRow = { fila: 3, municipio: 'ACACÍAS', institucion: 'I.E. NORMAL', sede: 'SEDE PRINCIPAL', modalidad: 'CAA', consecutivo: '15000600093403', focalizacion: 10 };
const detail: BootstrapDetail = { fila: 3, municipio_original: 'ACACÍAS', municipio_resuelto: 'ACACÍAS', institucion_original: 'I.E. NORMAL', institucion_normalizada: 'INSTITUCIÓN EDUCATIVA NORMAL', institucion_id_existente: null, accion_institucion: 'CREAR', sede_original: 'SEDE PRINCIPAL', sede_normalizada: 'SEDE PRINCIPAL', sede_id_existente: null, accion_sede: 'CREAR', modalidad_original: 'CAA', modalidad_resuelta: 'CAA', modalidad_id: '1', accion_sede_modalidad: 'CREAR', focalizacion_original: 10, estado: 'CREAR', observaciones: [] };
const plan = (): BootstrapApplyPlan => buildBootstrapApplyPlan(Buffer.from('xlsx'), [source], [detail], catalogs());

class MemoryStore implements BootstrapApplyStore {
  institutions = new Map<string, string>(); sedes = new Map<string, string>(); relations = new Map<string, string>();
  institutionHistory = new Set<string>(); sedeHistory = new Set<string>(); links = new Set<string>(); audited = 0; failAt = '';
  async resolveInstitution(spec: BootstrapApplyPlan['institutions'][number]) { if (this.failAt === 'institution') throw new Error('mid'); const old = this.institutions.get(spec.key); if (old) return { id: old, created: false }; const id = `i${this.institutions.size + 1}`; this.institutions.set(spec.key, id); return { id, created: true }; }
  async ensureInstitutionHistory(id: string, spec: BootstrapApplyPlan['institutions'][number]) { this.institutionHistory.add(`${id}|${spec.nombreNormalizado}|${spec.codigoDane}`); }
  async resolveSede(spec: BootstrapApplyPlan['sedes'][number], institutionId: string) { if (this.failAt === 'sede') throw new Error('mid'); const old = this.sedes.get(spec.key); if (old) return { id: old, created: false }; const id = `s${this.sedes.size + 1}`; this.sedes.set(spec.key, id); assert.ok(institutionId); return { id, created: true }; }
  async ensureSedeHistory(id: string, spec: BootstrapApplyPlan['sedes'][number]) { this.sedeHistory.add(`${id}|${spec.nombreNormalizado}|${spec.codigoDane}`); }
  async ensureSedeInstitutionHistory(sedeId: string, institutionId: string) { this.links.add(`${sedeId}|${institutionId}`); }
  async resolveRelation(spec: BootstrapApplyPlan['relations'][number], sedeId: string) { const old = this.relations.get(spec.key); if (old) return { id: old, created: false }; const id = `r${this.relations.size + 1}`; this.relations.set(spec.key, id); assert.ok(sedeId); return { id, created: true }; }
  async validate() { if (this.failAt === 'validate') throw new Error('invalid'); }
  async audit() { this.audited += 1; }
}

test('APPLY crea los maestros correctos', async () => {
  const store = new MemoryStore(); const result = await applyBootstrapPlan(store, plan());
  assert.deepEqual(result, { institutions: { created: 1, reused: 0 }, sedes: { created: 1, reused: 0 }, relations: { created: 1, reused: 0 } });
  assert.equal(store.audited, 1);
});

test('APPLY reutiliza y una segunda ejecución no duplica', async () => {
  const store = new MemoryStore(); await applyBootstrapPlan(store, plan()); const result = await applyBootstrapPlan(store, plan());
  assert.equal(result.institutions.reused, 1); assert.equal(result.sedes.reused, 1); assert.equal(result.relations.reused, 1);
  assert.equal(store.institutions.size, 1); assert.equal(store.sedes.size, 1); assert.equal(store.relations.size, 1);
});

test('históricos y relación sede-modalidad no se duplican', async () => {
  const store = new MemoryStore(); await applyBootstrapPlan(store, plan()); await applyBootstrapPlan(store, plan());
  assert.equal(store.institutionHistory.size, 1); assert.equal(store.sedeHistory.size, 1); assert.equal(store.links.size, 1); assert.equal(store.relations.size, 1);
});

test('error a mitad provoca rollback', async () => {
  const queries: string[] = []; const client = { query: async (sql: string) => { queries.push(sql); } }; const store = new MemoryStore(); store.failAt = 'sede';
  await assert.rejects(runApplyTransaction(client, () => applyBootstrapPlan(store, plan())), /mid/);
  assert.deepEqual(queries, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'ROLLBACK']);
});

test('éxito transaccional hace un solo commit', async () => {
  const queries: string[] = []; const client = { query: async (sql: string) => { queries.push(sql); } };
  await runApplyTransaction(client, async () => 'ok');
  assert.deepEqual(queries, ['BEGIN ISOLATION LEVEL SERIALIZABLE', 'COMMIT']);
});

test('contrato y confirmación incorrectos abortan', () => {
  assert.throws(() => validateApplyProtection({ apply: true, contractId: '23', confirm: BOOTSTRAP_CONFIRMATION }), /CONTRACT_ID/);
  assert.throws(() => validateApplyProtection({ apply: true, contractId: BOOTSTRAP_CONTRACT_ID, confirm: 'OTRO' }), /CONFIRMACION/);
});

test('municipio inexistente aborta', () => {
  const data = catalogs(); data.municipios = [];
  assert.throws(() => buildBootstrapApplyPlan(Buffer.from('x'), [source], [detail], data), /MUNICIPIO_NO_RECONOCIDO/);
});

test('modalidad inexistente aborta', () => {
  const data = catalogs(); data.modalidades = [];
  assert.throws(() => buildBootstrapApplyPlan(Buffer.from('x'), [source], [detail], data), /MODALIDAD_NO_RECONOCIDA/);
});

test('dry-run es el default y no requiere confirmación', () => {
  assert.doesNotThrow(() => validateApplyProtection({ apply: false }));
});
