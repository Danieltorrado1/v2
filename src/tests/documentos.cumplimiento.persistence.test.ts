import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { dbPool } from '../config/db';
import { buildContextualVinculacionChecklist } from '../modules/documentos/documentos.checklist.service';

test('SQL contextual: Dotación, reglas profesionales, contratos aislados y migración idempotente',async t=>{
 const db=new PGlite();
 try{
  await db.exec(`
    CREATE TABLE contratos(id bigint PRIMARY KEY,empresa_id bigint); INSERT INTO contratos VALUES(1,1),(2,2);
    CREATE TABLE contrato_cargos(id bigint PRIMARY KEY,nombre_cargo text); INSERT INTO contrato_cargos VALUES(1,'MANIPULADOR(A) DE ALIMENTOS'),(2,'PROFESIONAL');
    CREATE TABLE vinculaciones(id bigint PRIMARY KEY,persona_id bigint,contrato_id bigint,contrato_cargo_id bigint,tipo_vinculacion_id bigint,cotiza_pension boolean); INSERT INTO vinculaciones VALUES(1,1,1,1,1,true),(2,1,2,2,1,false);
    CREATE TABLE tipos_documentos(id bigint PRIMARY KEY,codigo text,nombre_documento text); INSERT INTO tipos_documentos VALUES(39,'DOTACION','Acta'),(90,'OTRO','Soporte'),(22,'TARJETA_PROFESIONAL','Tarjeta'),(23,'ANTECEDENTES_PROFESIONALES','Antecedentes profesionales');
    CREATE TABLE documentos_requisitos_canonicos(id bigint PRIMARY KEY,codigo text,nombre text,grupo_visual text,tipo_requisito text,cuenta_cumplimiento boolean,activo boolean); INSERT INTO documentos_requisitos_canonicos VALUES(1,'DOTACION_HISTORICA','Dotación','SST','HISTORICO',false,true),(2,'TARJETA_PROFESIONAL','Tarjeta','FORMACION','CONDICIONAL',true,true),(3,'ANTECEDENTES_PROFESIONALES','Antecedentes profesionales','FORMACION','CONDICIONAL',true,true);
    CREATE TABLE documentos_requisitos_aliases(requisito_canonico_id bigint,tipo_documento_id bigint,tipo_alias text,componente_codigo text,PRIMARY KEY(requisito_canonico_id,tipo_documento_id));
    CREATE TABLE documentos_requisitos_reglas(id bigint,requisito_canonico_id bigint,contrato_id bigint,contrato_cargo_id bigint,tipo_vinculacion_id bigint,aplica boolean);
    CREATE TABLE contrato_documento_requisitos(id bigint,tipo_documento_id bigint,contrato_id bigint,contrato_cargo_id bigint,tipo_vinculacion_id bigint,objetivo_requisito text,activo boolean,obligatorio boolean);
    CREATE TABLE sst_dotacion_epp(id bigint PRIMARY KEY,tipo_item text,activo boolean,contrato_id bigint,empresa_id bigint); INSERT INTO sst_dotacion_epp VALUES(1,'DOTACION',true,1,1),(2,'DOTACION',true,2,2),(3,'EPP',true,1,1);
    CREATE TABLE sst_dotacion_epp_entregas(id bigint PRIMARY KEY,item_id bigint,persona_id bigint,vinculacion_id bigint,documento_persona_id bigint,estado_entrega text,activo boolean);
  `);
  for(const scope of ['persona','vinculacion'])await db.exec(`CREATE TABLE documentos_${scope}(id bigint PRIMARY KEY,${scope}_id bigint,tipo_documento_id bigint,nombre_original text,fecha_expedicion date,fecha_vencimiento date,fecha_carga timestamptz,activo boolean,es_vigente boolean,version integer,estado_revision text,metadatos_revision jsonb,storage_path text,archivo_path text)`);
  const migration=readFileSync('sql/phase-48-personal-cumplimiento-aliases.sql','utf8');await db.exec(migration);await db.exec(migration);
  assert.equal((await db.query('SELECT * FROM documentos_requisitos_aliases')).rows.length,3);
  t.mock.method(dbPool,'query',async(sql:string,params?:unknown[])=>db.query(sql,params));
  const snapshot=()=>buildContextualVinculacionChecklist('1',undefined,{audit:false});
  assert.equal((await snapshot()).exigibles,1);
  await db.exec(`INSERT INTO documentos_persona VALUES(101,1,90,'acta.pdf',NULL,NULL,now(),true,true,1,'APROBADO','{}','qa.pdf',NULL);
    INSERT INTO sst_dotacion_epp_entregas VALUES(1,2,1,2,101,'ENTREGADO',true);`);
  assert.equal((await snapshot()).cumplidos,0,'no admite entrega de otro contrato/empresa');
  await db.exec("UPDATE sst_dotacion_epp_entregas SET item_id=3,vinculacion_id=1");
  assert.equal((await snapshot()).cumplidos,0,'EPP no satisface Dotación');
  await db.exec("UPDATE sst_dotacion_epp_entregas SET item_id=1,estado_entrega='PENDIENTE'");
  assert.equal((await snapshot()).cumplidos,0);
  await db.exec("UPDATE sst_dotacion_epp_entregas SET estado_entrega='ENTREGADO'; UPDATE documentos_persona SET estado_revision='PENDIENTE_REVISION'");
  assert.equal((await snapshot()).requisitos[0]?.estado_detallado,'PENDIENTE_REVISION');
  await db.exec("UPDATE documentos_persona SET estado_revision='APROBADO'; INSERT INTO sst_dotacion_epp_entregas VALUES(2,1,1,1,101,'REPUESTO',true)");
  let result=await snapshot();assert.equal(result.cumplidos,1);assert.equal(result.exigibles,1);assert.equal(result.requisitos[0]?.documentos?.length,1);
  await db.exec("INSERT INTO contrato_documento_requisitos VALUES(1,22,1,1,NULL,'VINCULACION',true,true)");
  result=await snapshot();assert.equal(result.exigibles,2);assert.equal(result.requisitos.find(r=>r.codigo==='TARJETA_PROFESIONAL')?.obligatorio,true);
  await db.exec("UPDATE contrato_documento_requisitos SET obligatorio=false");
  result=await snapshot();assert.equal(result.exigibles,1);assert.equal(result.requisitos.find(r=>r.codigo==='TARJETA_PROFESIONAL')?.aplica,true);
  await db.exec("INSERT INTO documentos_requisitos_reglas VALUES(1,2,1,1,NULL,false)");
  result=await snapshot();assert.equal(result.requisitos.find(r=>r.codigo==='TARJETA_PROFESIONAL')?.estado_detallado,'NO_APLICA');
  assert.equal((await buildContextualVinculacionChecklist('2',undefined,{audit:false})).requisitos.find(r=>r.codigo==='TARJETA_PROFESIONAL')?.obligatorio,false,'no hereda regla de otro cargo/contrato');
 }finally{t.mock.restoreAll();await db.close();}
});
