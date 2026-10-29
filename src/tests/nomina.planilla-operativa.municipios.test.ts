import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import type { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';
import * as XLSX from 'xlsx';
import { municipalAuthorizationDatabase, syntheticAuthEnvironment } from './fixtures/planilla-operativa.authorization.synthetic';
import { syntheticSnapshot } from './fixtures/planilla-operativa.synthetic';
import { buildPlanillaOperativaXlsx } from '../modules/nomina/planilla-operativa.xlsx';
Object.assign(process.env, syntheticAuthEnvironment);
const { resolvePlanillaAuthorizedContexts } = require('../modules/nomina/planilla-operativa.scope') as typeof import('../modules/nomina/planilla-operativa.scope');
let db: PGlite;
const period = { id: '71', contrato_id: '51', contrato_empresa_id: '41', fecha_inicio: '2026-10-26', fecha_fin: '2026-11-25' };
const resolve = (id: number, p = period) => resolvePlanillaAuthorizedContexts(db as unknown as PoolClient, id, p);
before(async () => { db = await municipalAuthorizationDatabase(); });
after(async () => { await db.close(); });

for (const [actor, expected] of [[1, ['101','103']], [2,['102']], [3,['101','102','103']], [7,['101']], [8,['102']], [11,['102']], [12,['101','103']]] as const) {
  test(`usuario ${actor}: SQL PostgreSQL real restringe personal, hojas y todo el ZIP`, async () => {
    const { contexts } = await resolve(actor);
    assert.deepEqual([...contexts.keys()].sort(), [...expected].sort());
    const snapshot = syntheticSnapshot();
    snapshot.novedades = []; snapshot.asistencias = [];
    snapshot.trabajadores = [...contexts.values()].map(c => ({ ...snapshot.trabajadores[0]!, id: c.empleado_id,
      persona_id: c.empleado_id, vinculacion_id: c.vinculacion_id, municipio_id: c.municipio_id, municipio: c.municipio,
      institucion: c.institucion, sede: c.sede, modalidad: c.modalidad, nombre: `PERSONA_${c.empleado_id}` }));
    const buffer = buildPlanillaOperativaXlsx(snapshot, 'synthetic');
    const book = XLSX.read(buffer, { type: 'buffer' });
    assert.deepEqual(book.Workbook!.Sheets!.filter(s => !s.Hidden).map(s => s.name).sort(), [...new Set([...contexts.values()].map(c => c.municipio))].sort());
    const zip = XLSX.CFB.read(buffer, { type: 'buffer' });
    const contents = zip.FileIndex.map((f: { content?: Uint8Array }) => f.content ? Buffer.from(f.content).toString() : '').join('');
    assert.doesNotMatch(contents, /MUNICIPIO AJENO|INSTITUCION AJENA|SEDE AJENA|PERSONA_104/);
    for (const id of ['101','102','103'].filter(id => !expected.includes(id as never))) assert.ok(!contents.includes(`PERSONA_${id}`));
    if (actor !== 3 && actor !== 2 && actor !== 8 && actor !== 11) assert.doesNotMatch(contents, /Municipio Sur|Institucion Sur|Sede Sur/);
  });
}
for (const actor of [4,5,6,9,10]) test(`usuario ${actor}: vacio, revocado, vencido o sin empresa/permiso deniega`, async () => {
  await assert.rejects(resolve(actor), { code: 'PLANILLA_ACCESS_DENIED' });
});
test('empresa y contrato manipulados no amplian alcance incluso con permiso general', async () => {
  await assert.rejects(resolve(3, { ...period, contrato_empresa_id: '42' }), { code: 'PLANILLA_ACCESS_DENIED' });
  await assert.rejects(resolve(3, { ...period, contrato_id: '52', contrato_empresa_id: '42' }), { code: 'PLANILLA_ACCESS_DENIED' });
});
test('revocacion posterior a descarga: mismo usuario/enlace se reevalua', async () => {
  assert.equal((await resolve(1)).contexts.size, 2);
  await db.exec('UPDATE gestor_municipio_asignaciones SET activo=FALSE WHERE usuario_id=1');
  await assert.rejects(resolve(1), { code: 'PLANILLA_ACCESS_DENIED' });
  await db.exec('UPDATE gestor_municipio_asignaciones SET activo=TRUE WHERE usuario_id=1');
});
test('retirar permiso general no hereda acceso del rol administrador', async () => {
  await db.exec('UPDATE rol_permisos SET activo=FALSE WHERE rol_id=3 AND permiso_id=3');
  await assert.rejects(resolve(3), { code: 'PLANILLA_ACCESS_DENIED' });
  await db.exec('UPDATE rol_permisos SET activo=TRUE WHERE rol_id=3 AND permiso_id=3');
});
test('contextos autorizados y ajenos de la misma trabajadora se rechazan sin elegir arbitrariamente', async () => {
  await db.exec("INSERT INTO cobertura_asignaciones VALUES (9,81,2,'2026-11-01',NULL,TRUE)");
  await assert.rejects(resolve(1), { code: 'PLANILLA_AMBIGUOUS_SCOPE' });
  await assert.rejects(resolve(3), { code: 'PLANILLA_AMBIGUOUS_SCOPE' });
  await db.exec('DELETE FROM cobertura_asignaciones WHERE id=9');
});
test('maestros territoriales inconsistentes no exponen nombres de otro municipio', async () => {
  await db.exec('UPDATE focalizacion_final SET institucion_id=12 WHERE id=1');
  await assert.rejects(resolve(1), { code: 'PLANILLA_AMBIGUOUS_SCOPE' });
  await db.exec('UPDATE focalizacion_final SET institucion_id=11 WHERE id=1');
});
test('permiso download revocado en DB se rechaza aunque el contexto anterior conserve rol', async () => {
  await db.exec('UPDATE rol_permisos SET activo=FALSE WHERE rol_id=1 AND permiso_id=1');
  await assert.rejects(resolve(1), { code: 'PLANILLA_ACCESS_DENIED' });
  await db.exec('UPDATE rol_permisos SET activo=TRUE WHERE rol_id=1 AND permiso_id=1');
});
test('asignaciones de otro rol o responsabilidades antiguas no amplian el alcance efectivo TH', async () => {
  await db.exec("INSERT INTO nomina_responsabilidades_usuario VALUES (2,1,41,51,'COBERTURA',TRUE); INSERT INTO nomina_responsabilidad_municipios VALUES (2,2)");
  assert.deepEqual([...(await resolve(1)).contexts.keys()].sort(), ['101','103']);
  await db.exec('UPDATE usuario_roles SET rol_id=4 WHERE usuario_id=2');
  await assert.rejects(resolve(2), { code: 'PLANILLA_ACCESS_DENIED' });
  await db.exec('UPDATE usuario_roles SET rol_id=2 WHERE usuario_id=2');
});
