import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { dbPool } from '../config/db';
import { buildContextualChecklistSnapshot, resolveCanonicalApplicability } from '../modules/documentos/documentos.checklist.service';
import { inferManipulationMode } from '../modules/documentos/documentos.manipulacion.domain';
import { manipulationContext, setManipulationMode } from '../modules/documentos/documentos.manipulacion.service';
import { uploadPersonaDocumento, uploadVinculacionDocumento } from '../modules/documentos/documentos.service';
import { documentReviewDossier, reviewDocument } from '../modules/documentos/documentos.review.service';
import { uploadDocumentoSchema } from '../modules/documentos/documentos.schemas';

test('A: Personal/Repositorio y backend documental permanecen UTF-8 sin mojibake',()=>{
 for(const dir of ['FrontendNuevo/src/pages/personal','FrontendNuevo/src/pages/repositorio','src/modules/documentos','src/modules/repositorioDocumental']) {
  for(const file of readdirSync(dir).filter(f=>/\.(tsx?|css)$/.test(f))) assert.doesNotMatch(readFileSync(`${dir}/${file}`,'utf8'),/[\u00c2\u00c3\ufffd]|\u00e2[\u0080-\u00bf\u20ac]/,`${dir}/${file}`);
 }
});
test('B/H: sin evidencia se pregunta; un soporte general legacy es combinado',()=>{
 assert.equal(inferManipulationMode(null,[]),null);
 assert.equal(inferManipulationMode(null,[{}]),'COMBINADO');
 assert.equal(inferManipulationMode(null,[{},{}]),'SEPARADO');
 assert.equal(inferManipulationMode(null,[{component:'CURSO'},{component:'EXAMENES'}]),'SEPARADO');
 assert.equal(inferManipulationMode('COMBINADO',[]),'COMBINADO');
});
test('aplicabilidad usa cargo real según la matriz obligatoria',()=>{
 assert.deepEqual(resolveCanonicalApplicability('MANIPULACION','CONDICIONAL',null,null,'MANIPULADOR(A) DE ALIMENTOS'),{aplica:true,obligatorio:true});
 assert.equal(resolveCanonicalApplicability('MANIPULACION','CONDICIONAL',false,null,'Manipuladora de alimentos').aplica,true);
 assert.equal(resolveCanonicalApplicability('MANIPULACION','CONDICIONAL',null,null,'Auxiliar administrativo').aplica,false);
});

test('C–J: uploads, revisión única, checklist, legacy y transición conservan evidencia en PostgreSQL embebido',async t=>{
 const db=new PGlite();
 await db.exec(`CREATE TABLE usuarios(id bigint PRIMARY KEY,nombre_completo text); INSERT INTO usuarios VALUES(1,'Revisor QA');
 CREATE TABLE personas(id bigint PRIMARY KEY); INSERT INTO personas VALUES(1);
 CREATE TABLE vinculaciones(id bigint PRIMARY KEY,persona_id bigint,contrato_id bigint,contrato_cargo_id bigint,tipo_vinculacion_id bigint); INSERT INTO vinculaciones VALUES(1,1,1,1,1);
 CREATE TABLE tipos_documentos(id bigint PRIMARY KEY,codigo text,nombre_documento text,requiere_fecha_expedicion boolean DEFAULT false,requiere_fecha_vencimiento boolean DEFAULT false);
 INSERT INTO tipos_documentos(id,codigo,nombre_documento) VALUES(1,'CURSO MAN DE ALIMENTOS','Curso'),(2,'EXAMENES MAN DE ALIMENTOS','Exámenes');
 CREATE TABLE documentos_requisitos_canonicos(id bigint PRIMARY KEY,codigo text,activo boolean DEFAULT true); INSERT INTO documentos_requisitos_canonicos(id,codigo) VALUES(1,'MANIPULACION');
 CREATE TABLE documentos_requisitos_aliases(requisito_canonico_id bigint,tipo_documento_id bigint,componente_codigo text); INSERT INTO documentos_requisitos_aliases VALUES(1,1,'CURSO'),(1,2,'EXAMENES');
 CREATE TABLE auditoria_eventos(id bigserial,usuario_id bigint,modulo text,entidad text,entidad_id text,accion text,descripcion text,datos_anteriores jsonb,datos_nuevos jsonb,fecha_evento timestamptz DEFAULT now());`);
 for(const scope of ['persona','vinculacion']) await db.exec(`CREATE TABLE documentos_${scope}(id bigserial PRIMARY KEY,persona_id bigint,vinculacion_id bigint,tipo_documento_id bigint,
 fecha_expedicion date,fecha_vencimiento date,fecha_carga timestamptz,nombre_original text,storage_path text,archivo_path text,storage_bucket text,mime_type text,tamano_bytes bigint,activo boolean,
 version integer DEFAULT 1,es_vigente boolean DEFAULT true,documento_reemplaza_id bigint)`);
 await db.exec(readFileSync('sql/phase-43-personal-documentos-revision.sql','utf8'));
 const migration=readFileSync('sql/phase-47-manipulacion-modalidad.sql','utf8');await db.exec(migration);await db.exec(migration);
 const query=async(sql:string,params?:unknown[])=>{
  if(sql.includes('pg_advisory_xact_lock'))return {rows:[],rowCount:0}; // PostgreSQL serialization is exercised by production locks.
  const result=await db.query(sql,params);return {...result,rowCount:result.affectedRows};
 };
 t.mock.method(dbPool,'connect',async()=>({query,release(){}}));
 t.mock.method(dbPool,'query',query);
 let blobs=0;
 t.mock.method(globalThis,'fetch',async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=String(input instanceof Request?input.url:input);
  assert.ok(url.includes('/storage/v1/object/'));assert.equal(init?.method?.toUpperCase(),'POST');blobs++;
  return new Response(JSON.stringify({Key:`qa-${blobs}`}),{status:200,headers:{'Content-Type':'application/json'}});
 });
 const file={originalname:'soporte.pdf',mimetype:'application/pdf',buffer:Buffer.from('%PDF-1.4\nQA\n%%EOF'),size:23} as Express.Multer.File;
 try{
  for(const scope of ['persona','vinculacion'] as const){
   const table=`documentos_${scope}`;
   const upload=scope==='persona'?uploadPersonaDocumento:uploadVinculacionDocumento;
   const snapshot=async()=>{
    const docs=(await query(`SELECT *,id::int,tipo_documento_id::int,NULL AS tipo_documento_nombre FROM ${table} d WHERE activo AND es_vigente ORDER BY d.fecha_carga DESC,d.id DESC`)).rows as any[];
    return buildContextualChecklistSnapshot({contratoCargoId:1,contratoId:1,personaId:1,vinculacionId:1,personaDocuments:docs,vinculacionDocuments:[],requirements:[{id:1,codigo:'MANIPULACION',nombre_requisito:'Manipulación',nombre_documento:'Manipulación',ambito_documental:'PERSONA',tipo_documento_id:1,tipo_documento_ids:[1,2],componentes:{1:'CURSO',2:'EXAMENES'},contrato_cargo_id:null,tipo_vinculacion_id:null,obligatorio:true,requiere_fecha_expedicion:false,requiere_fecha_vencimiento:false,dias_proximo_vencimiento:30,vigencia_meses:null}]});
   };
   assert.equal((await manipulationContext(scope,'1')).mode,null);
   await setManipulationMode(scope,'1','SEPARADO',false,'1');
   await setManipulationMode(scope,'1','COMBINADO',false,'1');
   assert.equal((await snapshot()).requisitos[0]?.estado_detallado,'SIN_DOCUMENTO');
   const beforeBlobs=blobs;
   const combined=await upload('1',file,uploadDocumentoSchema.parse({tipo_documento_id:'1',manipulacion_modalidad:'COMBINADO'}),'1');
   assert.equal(blobs-beforeBlobs,1,'un único archivo físico');
   let dossier=await documentReviewDossier(scope,'1',[1,2]);
   assert.equal(dossier.documents.length,1);assert.deepEqual(dossier.documents[0]!.metadata.componentes,['CURSO','EXAMENES']);
   assert.equal((await snapshot()).requisitos[0]?.estado_detallado,'PENDIENTE_REVISION');
   assert.deepEqual((await snapshot()).requisitos[0]?.componentes_documentales?.map(c=>[c.documento_id,c.estado]),[[Number(combined.id),'PENDIENTE_REVISION'],[Number(combined.id),'PENDIENTE_REVISION']]);
   await reviewDocument(scope,combined.id,'APROBADO',undefined,'1');
   assert.equal((await snapshot()).cumplimiento_porcentaje,100);
   assert.equal((await snapshot()).requisitos[0]?.estado_detallado,'APROBADO');
   assert.ok((await snapshot()).requisitos[0]?.componentes_documentales?.every(c=>c.estado==='APROBADO'));
   assert.equal((await snapshot()).requisitos[0]?.documentos?.length,1,'repositorio/exportación recibe un solo documento');
   await reviewDocument(scope,combined.id,'RECHAZADO','Ilegible','1');
   assert.equal((await snapshot()).requisitos[0]?.estado_detallado,'RECHAZADO');assert.equal((await snapshot()).completos,0);
   assert.ok((await snapshot()).requisitos[0]?.componentes_documentales?.every(c=>c.estado==='RECHAZADO'));
   await reviewDocument(scope,combined.id,'APROBADO',undefined,'1');
   await assert.rejects(()=>setManipulationMode(scope,'1','SEPARADO',false,'1'),/Confirma/);
   assert.equal((await snapshot()).completos,1);
   await setManipulationMode(scope,'1','SEPARADO',true,'1');
   dossier=await documentReviewDossier(scope,'1',[1,2]);assert.equal(dossier.documents[0]!.actual,false);assert.equal(dossier.documents[0]!.estado_revision,'APROBADO');
   await assert.rejects(()=>reviewDocument(scope,combined.id,'APROBADO',undefined,'1'),/actual/);
   await assert.rejects(()=>upload('1',file,uploadDocumentoSchema.parse({tipo_documento_id:'1',manipulacion_modalidad:'COMBINADO'}),'1'),/modalidad/);
   const curso=await upload('1',file,uploadDocumentoSchema.parse({tipo_documento_id:'1',manipulacion_modalidad:'SEPARADO'}),'1');
   await reviewDocument(scope,curso.id,'APROBADO',undefined,'1');
   assert.equal((await snapshot()).requisitos[0]?.estado_detallado,'PARCIAL');assert.equal((await snapshot()).completos,0);
   const exams=await upload('1',file,uploadDocumentoSchema.parse({tipo_documento_id:'2'}),'1');
   assert.equal((await snapshot()).requisitos[0]?.estado_detallado,'PENDIENTE_REVISION');
   await reviewDocument(scope,exams.id,'APROBADO',undefined,'1');assert.equal((await snapshot()).completos,1);
   // Legacy records have no modality metadata: two independent components remain valid.
   await query(`UPDATE ${table} SET metadatos_revision='{}' WHERE es_vigente`);
   await query(`UPDATE ${scope==='persona'?'personas':'vinculaciones'} SET manipulacion_modalidad=NULL`);
   assert.equal((await manipulationContext(scope,'1')).mode,'SEPARADO');assert.equal((await snapshot()).completos,1);
   const activeBeforeReuse=(await query(`SELECT id FROM ${table} WHERE es_vigente ORDER BY id`)).rows as {id:number}[];
   assert.ok(activeBeforeReuse.length>=2);
   await setManipulationMode(scope,'1','COMBINADO',true,'1',undefined,{reutilizarDocumentoId:String(activeBeforeReuse[0]!.id)});
   assert.equal((await query(`SELECT * FROM ${table}`)).rows.length,3,'ning?n documento eliminado');
   const reused=(await query(`SELECT * FROM ${table} WHERE id=$1`,[activeBeforeReuse[0]!.id])).rows[0] as any;
   assert.equal(reused.es_vigente,true,'el soporte seleccionado se conserva como vigente');
   assert.equal(reused.metadatos_revision.manipulacion_modalidad,'COMBINADO');
   assert.equal((await snapshot()).completos,1,'el soporte seleccionado conserva su revisi?n');
   const selectedId=String(activeBeforeReuse[0]!.id);
   const selectedVersion=reused.version;
   const selectedState=reused.estado_revision;
   await setManipulationMode(scope,'1','SEPARADO',true,'1');
   assert.equal(((await query(`SELECT es_vigente FROM ${table} WHERE id=$1`,[selectedId])).rows as any[])[0]!.es_vigente,false);
   await setManipulationMode(scope,'1','COMBINADO',true,'1',undefined,{reutilizarDocumentoId:selectedId});
   const recovered=(await query(`SELECT * FROM ${table} WHERE id=$1`,[selectedId])).rows[0] as any;
   assert.equal(recovered.es_vigente,true,'un soporte archivado seleccionado se recupera');
   assert.equal(recovered.version,selectedVersion,'recuperar no crea versión');
   assert.equal(recovered.estado_revision,selectedState,'recuperar no reinicia revisión');
   assert.equal(((await query(`SELECT count(*)::int AS n FROM ${table} WHERE es_vigente`)).rows as any[])[0]!.n,1,'no quedan dos soportes vigentes');
   assert.equal(((await query(`SELECT count(*)::int AS n FROM auditoria_eventos WHERE accion='MANIPULATION_MODE_RECOVERY'`)).rows as any[])[0]!.n,scope==='persona'?1:2,'la recuperación queda auditada');
  }
 }finally{t.mock.restoreAll();await db.close();}
});
