import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import type { PoolClient } from 'pg';
import { listTurnContextOptions, selectTurnContext } from '../modules/nomina/nomina.turn-context';

test('catálogo de turno respeta contrato, fecha, institución, sede y modalidad elegida', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE TABLE municipios(id bigint,nombre_municipio text);
      CREATE TABLE instituciones(id bigint,contrato_id bigint,nombre_institucion text,activo boolean);
      CREATE TABLE sedes(id bigint,institucion_id bigint,municipio_id bigint,nombre_sede text,activo boolean);
      CREATE TABLE modalidades(id bigint,nombre_modalidad text,activo boolean);
      CREATE TABLE sede_modalidades(contrato_id bigint,sede_id bigint,modalidad_id bigint,activo boolean);
      CREATE TABLE focalizacion_vigencias(contrato_id bigint,institucion_id bigint,sede_id bigint,modalidad_id bigint,vigente_desde date,vigente_hasta date);
      INSERT INTO municipios VALUES(1,'Municipio');
      INSERT INTO instituciones VALUES(1,24,'Institución',TRUE),(2,25,'Otra empresa',TRUE);
      INSERT INTO sedes VALUES(1,1,1,'Sede uno',TRUE),(2,1,1,'Sede dos',TRUE),(3,2,1,'Sede otra empresa',TRUE);
      INSERT INTO modalidades VALUES(1,'CAA',TRUE),(2,'CAARES',TRUE),(3,'Inactiva',FALSE);
      INSERT INTO sede_modalidades VALUES(24,1,1,TRUE),(24,2,2,TRUE),(25,3,2,TRUE),(24,1,3,TRUE);
      INSERT INTO focalizacion_vigencias VALUES
        (24,1,1,1,'2026-08-01','2026-09-25'),(24,1,2,2,'2026-08-26','2026-09-25'),
        (25,2,3,2,'2026-08-01',NULL),(24,1,1,3,'2026-08-01',NULL);
    `);
    const executor = { query: (sql:string, params?:unknown[]) => db.query(sql,params) } as unknown as Pick<PoolClient,'query'>;
    const options = await listTurnContextOptions(executor,'24','2026-08-28');
    assert.deepEqual(options.map(option => option.modalidad).sort(),['CAA','CAARES']);
    assert.equal(selectTurnContext(options,{institucion_id:'1',modalidad_id:'1',sede_id:'1'}).modalidad,'CAA');
    assert.equal(selectTurnContext(options,{institucion_id:'1',modalidad_id:'2',sede_id:'2'}).modalidad,'CAARES');
    assert.throws(() => selectTurnContext(options,{institucion_id:'1',modalidad_id:'2',sede_id:'1'}));
    for (const missing of ['institucion_id','sede_id','modalidad_id'] as const) {
      const input: Record<string,string>={institucion_id:'1',sede_id:'1',modalidad_id:'1'};
      delete input[missing];
      assert.throws(() => selectTurnContext(options,input), (error:any) => error.statusCode===400);
    }
    assert.throws(() => selectTurnContext(options,{institucion_id:'2',sede_id:'1',modalidad_id:'1'}));
    assert.equal((await listTurnContextOptions(executor,'24','2026-09-26')).length,0);
    assert.equal((await listTurnContextOptions(executor,'24','2026-08-25')).length,1);
    assert.equal((await listTurnContextOptions(executor,'24','2026-09-25','2026-09-26')).length,0);
  } finally { await db.close(); }
});
