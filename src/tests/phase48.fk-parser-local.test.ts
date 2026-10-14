import {test} from 'node:test';
import assert from 'node:assert/strict';
import {scopedFixture} from './fixtures/phase48-scoped-fixture';
import {localClient} from '../modules/cobertura/phase48-dynamic-local';
test('PostgreSQL 17.11: original name[] is string; explicit text[] reliably decodes FK columns',async()=>{
 await scopedFixture();const db=localClient();await db.connect();
 try{
  await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const rows=(await db.query(`SELECT ARRAY(SELECT a.attname FROM unnest(k.conkey) u(num) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=u.num) original,
   ARRAY(SELECT a.attname::text FROM unnest(k.conkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=u.num ORDER BY u.ord) corrected,
   ARRAY(SELECT a.attname::text FROM unnest(k.confkey) WITH ORDINALITY u(num,ord) JOIN pg_attribute a ON a.attrelid=k.confrelid AND a.attnum=u.num ORDER BY u.ord) referenced
   FROM pg_constraint k WHERE k.conrelid='public.cobertura_asignaciones'::regclass AND k.contype='f' ORDER BY k.conname`)).rows;
  assert.equal(rows.length,4);for(const row of rows){assert.equal(typeof row.original,'string');assert(Array.isArray(row.corrected));assert.deepEqual(row.referenced,['id']);}
 }finally{await db.query('ROLLBACK');await db.end();}
});
