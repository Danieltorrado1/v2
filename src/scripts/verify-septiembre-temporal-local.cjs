const fs=require('fs'),assert=require('assert/strict'),{Client}=require('pg');
const {service}=require('./certify-septiembre-temporal-local.cjs');
const {septemberPostflight,publishSeptemberLocal,publicFingerprint,sequenceFingerprint}=require('../../dist/modules/cobertura/septiembre-monthly-publisher');
const {canonicalHash,inspectWorkbook}=require('../../dist/modules/cobertura/septiembre-controlled-preview');
async function main(){const c=new Client({host:'127.0.0.1',port:55440,user:'local_verifier',database:'septiembre_local'});await c.connect();try{
 const instance=(await c.query("SELECT current_database() db,host(inet_server_addr()) host,inet_server_port() port,current_setting('server_version') version")).rows[0];assert.deepEqual(instance,{db:'septiembre_local',host:'127.0.0.1',port:55440,version:'17.11'});
 const cert=JSON.parse(fs.readFileSync('reports/septiembre-temporal-local-certification.json')),snapshot=JSON.parse(fs.readFileSync('reports/septiembre-certified-snapshot.json'));
 const baseline=await publicFingerprint(c),sequences=await sequenceFingerprint(c),load=cert.mutate.load_id;
 const report={local_only:true,corruption_cases:[],legacy_sync:null};
 for(const sql of ['UPDATE focalizacion_preliminar SET focalizacion_vigencia_id=NULL WHERE carga_id=$1','UPDATE focalizacion_final SET municipio_id=NULL WHERE carga_id=$1 AND activo']){
  await c.query('BEGIN');try{await c.query(sql,[load]);await assert.rejects(septemberPostflight(c,snapshot,load),/PROJECTION_NOT_DERIVED_FROM_VIGENCIA/);report.corruption_cases.push({table:sql.includes('preliminar')?'focalizacion_preliminar':'focalizacion_final',nullable_link_corruption_rejected:true});}finally{await c.query('ROLLBACK');}
 }
 const projection=(await c.query('SELECT id::text,sede_id::text,modalidad_id::text,clave_sede_modalidad FROM focalizacion_final WHERE carga_id=$1 AND sede_modalidad_id IS NULL AND activo ORDER BY id LIMIT 1',[load])).rows[0];assert.ok(projection);
 const importer=service('src/modules/cobertura/cobertura.focalizacion.service.ts',c,true);
 await c.query('BEGIN');try{await importer.__sync(c,24,Number(projection.sede_id),Number(projection.modalidad_id),null);const rows=(await c.query('SELECT id::text,sede_id::text,modalidad_id::text,clave_sede_modalidad FROM focalizacion_final WHERE contrato_id=24 AND sede_id=$1 AND modalidad_id=$2',[projection.sede_id,projection.modalidad_id])).rows;assert.equal(rows.length,1);assert.deepEqual(rows[0],projection);report.legacy_sync={stable_id:true,stable_key:true,duplicates:0,optional_site_mode_link_supported:true};}finally{await c.query('ROLLBACK');}
 assert.equal(canonicalHash(baseline),canonicalHash(await publicFingerprint(c)));assert.equal(canonicalHash(sequences),canonicalHash(await sequenceFingerprint(c)));report.all_tables_and_sequences_identical=true;
 report.second_after_hardening=await publishSeptemberLocal(c,snapshot,new Map(inspectWorkbook(fs.readFileSync('../../data/focalizacion-septiembre-2026.xlsx')).rows.map(r=>[r.fila,r])),{mode:'MutateLocal',confirmation:'LOCAL_RESTORATION_ONLY'});assert.equal(report.second_after_hardening.status,'ALREADY_APPLIED');
 fs.writeFileSync('reports/septiembre-temporal-postflight-hardening.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await c.end();}}
main().catch(e=>{console.error(e.stack);process.exitCode=1});
