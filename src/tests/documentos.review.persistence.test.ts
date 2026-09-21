import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dbPool } from '../config/db';
import { reviewDocument, persistUploadReview, documentReviewDossier } from '../modules/documentos/documentos.review.service';

test('PostgreSQL: migración idempotente, revisión y auditoría atómicas, reemplazo pendiente', {skip:process.env.RUN_DOCUMENT_REVIEW_DB !== '1'}, async t=>{
 const client=await dbPool.connect();const query=client.query.bind(client);
 try{
  await query('BEGIN');
  await query("CREATE TEMP TABLE usuarios(id bigint PRIMARY KEY,nombre_completo text) ON COMMIT DROP; INSERT INTO usuarios VALUES(1,'Revisor de prueba')");
  for(const table of ['documentos_persona','documentos_vinculacion'])await query(`CREATE TEMP TABLE ${table} (id bigserial PRIMARY KEY,persona_id bigint,vinculacion_id bigint,tipo_documento_id bigint,fecha_expedicion date,fecha_vencimiento date,fecha_carga timestamptz DEFAULT now(),nombre_original text,storage_path text DEFAULT 'test.pdf',archivo_path text,activo boolean DEFAULT true${table==='documentos_persona'?',version integer DEFAULT 1,es_vigente boolean DEFAULT true,documento_reemplaza_id bigint':''}) ON COMMIT DROP`);
  await query(`CREATE TEMP TABLE auditoria_eventos(id bigserial,usuario_id bigint,modulo text,entidad text,entidad_id text,accion text,descripcion text,datos_anteriores jsonb,datos_nuevos jsonb,fecha_evento timestamptz DEFAULT now()) ON COMMIT DROP`);
  const migration=readFileSync('sql/phase-43-personal-documentos-revision.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');
  await query(migration);await query(migration);
  const actor=String((await query('SELECT id FROM usuarios ORDER BY id LIMIT 1')).rows[0].id);
  const type=String((await query(`SELECT id FROM tipos_documentos WHERE codigo='HV' LIMIT 1`)).rows[0].id);
  let failAudit=false;
  const fakeClient={query:(sql:string,params?:unknown[])=>{if(failAudit&&sql.includes('INSERT INTO auditoria_eventos'))throw new Error('audit unavailable');return query(sql==='BEGIN'?'SAVEPOINT review_service':sql==='COMMIT'?'RELEASE SAVEPOINT review_service':sql==='ROLLBACK'?'ROLLBACK TO SAVEPOINT review_service':sql,params);},release:()=>{}};
  t.mock.method(dbPool,'connect',async()=>fakeClient);
  t.mock.method(dbPool,'query',(sql:string,params?:unknown[])=>query(sql,params));
  for(const scope of ['persona','vinculacion'] as const){
   const table=`documentos_${scope}`;
   const first=String((await query(`INSERT INTO ${table}(${scope}_id,tipo_documento_id,nombre_original) VALUES(1,$1,'primero.pdf') RETURNING id`,[type])).rows[0].id);
   await persistUploadReview(client,scope,first,actor,{});
   assert.equal((await query(`SELECT estado_revision FROM ${table} WHERE id=$1`,[first])).rows[0].estado_revision,'PENDIENTE_REVISION');
   await assert.rejects(()=>reviewDocument(scope,first,'RECHAZADO',' ',actor),/motivo/);
   failAudit=true;await assert.rejects(()=>reviewDocument(scope,first,'APROBADO',undefined,actor),/audit unavailable/);failAudit=false;
   assert.equal((await query(`SELECT estado_revision FROM ${table} WHERE id=$1`,[first])).rows[0].estado_revision,'PENDIENTE_REVISION');
   await reviewDocument(scope,first,'APROBADO',undefined,actor);
   let stored=(await query(`SELECT * FROM ${table} WHERE id=$1`,[first])).rows[0];assert.equal(String(stored.revisado_por),actor);assert.ok(stored.revisado_en);assert.equal(stored.estado_revision,'APROBADO');
   await reviewDocument(scope,first,'RECHAZADO','Archivo ilegible',actor);stored=(await query(`SELECT * FROM ${table} WHERE id=$1`,[first])).rows[0];assert.equal(stored.motivo_rechazo,'Archivo ilegible');
   await reviewDocument(scope,first,'APROBADO',undefined,actor);
   await query(`UPDATE ${table} SET es_vigente=false WHERE id=$1`,[first]);
   const second=String((await query(`INSERT INTO ${table}(${scope}_id,tipo_documento_id,nombre_original,version,documento_reemplaza_id) VALUES(1,$1,'nuevo.pdf',2,$2) RETURNING id`,[type,first])).rows[0].id);
   await persistUploadReview(client,scope,second,actor,{});
   await assert.rejects(()=>reviewDocument(scope,first,'APROBADO',undefined,actor),/versión actual/);
   const dossier=await documentReviewDossier(scope,'1',[Number(type)]);assert.equal(dossier.documents.length,2);assert.equal(dossier.documents.find(d=>d.id===second)?.estado,'PENDIENTE_REVISION');assert.equal(dossier.documents.find(d=>d.id===first)?.estado_revision,'APROBADO');assert.equal(dossier.history.filter(h=>h.accion==='DOCUMENT_REVIEW').length,3);
   assert.ok(dossier.history.every(h=>String(h.usuario_id)===actor&&h.fecha_evento));
  }
 }finally{t.mock.restoreAll();await query('ROLLBACK');client.release();await dbPool.end();}
});
