import assert from 'node:assert/strict';
import { test } from 'node:test';
import express from 'express';
import jwt from 'jsonwebtoken';
import type { PoolClient } from 'pg';
import * as XLSX from 'xlsx';
import { municipalAuthorizationDatabase, syntheticAuthEnvironment } from './fixtures/planilla-operativa.authorization.synthetic';
Object.assign(process.env, syntheticAuthEnvironment);
const { dbPool } = require('../config/db') as typeof import('../config/db');
const { authMiddleware } = require('../middlewares/authMiddleware') as typeof import('../middlewares/authMiddleware');
const { requirePermissions } = require('../middlewares/roleMiddleware') as typeof import('../middlewares/roleMiddleware');
const { downloadPlanillaOperativaHandler } = require('../modules/nomina/planilla-operativa.controller') as typeof import('../modules/nomina/planilla-operativa.controller');

test('HTTP autentico: mismo enlace, parametros manipulados, token viejo y revocaciones', async t => {
  const db = await municipalAuthorizationDatabase();
  const sql: string[] = [];
  const query = async (text: string, values: unknown[] = []) => {
    sql.push(text);
    assert.match(text.trim(), /^(SELECT|BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY|COMMIT|ROLLBACK)\b/);
    if (/FROM (?:public\.)?usuarios u|SELECT EXISTS|AS empleado_id/.test(text)) return db.query(text, values);
    let rows: object[] = [];
    if (/AS snapshot/.test(text)) rows=(values[1] as string[]).map(id=>({id,snapshot:`synthetic-${id}`,bloqueado:false,novedades_dependientes:[]}));
    else if (/np\.id::text AS id/.test(text)) rows = [{ id: String(values[0]), contrato_id: values[0] === '72' ? '52' : '51', contrato_empresa_id: values[0] === '72' ? '42' : '41',
      contrato_numero: 'SINTETICO', nombre_periodo: 'NOVIEMBRE', estado: 'ABIERTO', fecha_inicio: '2026-10-26', fecha_fin: '2026-11-25' }];
    else if (/SELECT c\.id::text/.test(text)) rows = [{ id: String(values[0]), empresa_id: values[0] === '52' ? '42' : '41' }];
    else if (/ne\.id::text AS id/.test(text)) rows = [101,102,103,104].map((id, i) => ({ id: String(id), periodo_id: '71', vinculacion_id: String(81+i),
      activo: true, estado: 'PENDIENTE', persona_id: String(91+i), persona_numero_documento: `0000${id}`, primer_nombre: `PERSONA_${id}`, primer_apellido: 'Sintetica',
      vinculacion_empresa_id: id === 104 ? '42' : '41', vinculacion_contrato_id: id === 104 ? '52' : '51', fecha_inicio_vinculacion: '2026-01-01', fecha_fin_vinculacion: null,
      institucion_nombre: 'IGNORAR CONTEXTO LEGACY AJENO', sede_nombre: 'IGNORAR SEDE LEGACY AJENA' }));
    else if (/COUNT\(\*\).*total[\s\S]*nomina_asistencia_diaria/.test(text)) rows = [{ total: 0 }];
    return { rows, rowCount: rows.length };
  };
  t.mock.method(dbPool, 'query', query as never);
  t.mock.method(dbPool, 'connect', async () => ({ query, release() {} }) as unknown as PoolClient);
  const app = express();
  app.use(authMiddleware);
  app.use((req, _res, next) => {
    // Deliberately stale/wide middleware context: the export must reauthorize DB.
    req.tenant = { userId: Number(req.user!.userId), empresaIds: [41,42], contratoIds: [51,52], isGlobalAdmin: true, roleNames: ['ADMINISTRADOR'] };
    next();
  });
  app.get('/periodos/:id/planilla-operativa.xlsx', requirePermissions('nomina.export', 'nomina.operativa.read'), downloadPlanillaOperativaHandler);
  app.use((error: { statusCode?: number; code?: string; name?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(error.statusCode ?? (error.name === 'ZodError' ? 400 : 500)).json({ code: error.code ?? error.name });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const token = (actor: number) => jwt.sign({ sub: String(actor), roles: ['ADMINISTRADOR'], permissions: ['nomina.municipios.read_all'] }, 'test-only');
  const request = (actor: number, path = '/periodos/71/planilla-operativa.xlsx') => fetch(`http://127.0.0.1:${port}${path}`, { headers: { Authorization: `Bearer ${token(actor)}` } });
  try {
    for (const [actor, towns, people] of [[1,['Municipio Norte'],['101','103']], [2,['Municipio Sur'],['102']], [3,['Municipio Norte','Municipio Sur'],['101','102','103']]] as const) {
      const res = await request(actor); assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'private, no-store');
      const bytes = Buffer.from(await res.arrayBuffer()); const book = XLSX.read(bytes, { type: 'buffer' });
      assert.deepEqual(book.Workbook!.Sheets!.filter(s => !s.Hidden).map(s => s.name).sort(), [...towns].sort());
      const zip = XLSX.CFB.read(bytes, { type: 'buffer' });
      const contents = zip.FileIndex.map((f: { content?: Uint8Array }) => f.content ? Buffer.from(f.content).toString() : '').join('');
      assert.doesNotMatch(contents, /PERSONA_104|LEGACY AJEN/);
      for (const id of ['101','102','103'].filter(id => !people.includes(id as never))) assert.ok(!contents.includes(`PERSONA_${id}`));
    }
    for (const actor of [4,5,6,9,10]) assert.equal((await request(actor)).status, 403);
    for (const query of ['municipio_id=2','municipios=1,2','usuario_id=3','userId=3','firma=ajena']) assert.equal((await request(1, `/periodos/71/planilla-operativa.xlsx?${query}`)).status, 400);
    for (const query of ['empresa_id=42','contrato_id=52']) assert.equal((await request(1, `/periodos/71/planilla-operativa.xlsx?${query}`)).status, 403);
    assert.equal((await request(1, '/periodos/72/planilla-operativa.xlsx')).status, 403);
    await db.exec('UPDATE gestor_municipio_asignaciones SET activo=FALSE WHERE usuario_id=1');
    assert.equal((await request(1)).status, 403); // old token and exact same link
    await db.exec('UPDATE rol_permisos SET activo=FALSE WHERE rol_id=2 AND permiso_id=1');
    assert.equal((await request(2)).status, 403);
    assert.ok(sql.includes('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY'));
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.close();
  }
});
