import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { inspectWorkbook,readOnlyTransaction,compare,hash,SCOPE,assertScope,existingDisposition,APPROVED_SHA256,type TechnicalRow } from '../modules/cobertura/septiembre-controlled-preview';

function fixture(values:unknown[]=[10,2,12,8,2,10]){
 const wb=XLSX.utils.book_new();
 const sheet=XLSX.utils.aoa_to_sheet([
  [null,null,null,null,null,'TECHO',null,null,'FOCALIZACION',null,null],
  ['CONSECUTIVO','MUNICIPIO','INSTITUCION EDUCATIVA','SEDE EDUCATIVA','MODALIDAD','PRIMARIA','SECUNDARIA','TOTAL','PRIMARIA','SECUNDARIA','TOTAL'],
  ['15000600093403','50006','fixture','fixture','RI',...values],
 ]);
 XLSX.utils.book_append_sheet(wb,sheet,'DETALLADO ');
 return XLSX.write(wb,{type:'buffer',bookType:'xlsx'}) as Buffer;
}
const row=(sede:string,mod:string,n=12):TechnicalRow=>({fila:3,municipio_id:'1',institucion_id:'1',sede_id:sede,modalidad_id:mod,reasons:[],techo_primaria:10,techo_secundaria:2,techo_total:n,focalizacion_primaria:8,focalizacion_secundaria:2,focalizacion_total:10});

test('parser estricto conserva total y no convierte negativos/textos/vacíos a cero',()=>{
 assert.equal(inspectWorkbook(fixture()).rows.length,1);
 for(const bad of ['texto',-1,null,1.5])assert.ok(inspectWorkbook(fixture([bad,2,12,8,2,10])).rows[0]!.issues.length);
 assert.ok(inspectWorkbook(fixture([10,2,13,8,2,10])).rows[0]!.issues.includes('TOTAL_DIFIERE_DESGLOSE:techo'));
});
test('parser expone campos ausentes y no inventa DANE ni jornada',()=>{
 assert.deepEqual(inspectWorkbook(fixture()).missing_optional_columns,['dane_institucion','dane_sede','jornada']);
});
test('digest idempotente; diferencias no alteran baseline ni colapsan modalidad',()=>{
 const before=[row('1','1'),row('2','1')],after=[row('1','1',13),row('2','2'),row('3','1')],snapshot=hash(before);
 const delta=compare(before,after);
 assert.equal(delta.counts.altas,2);assert.equal(delta.counts.bajas,1);assert.equal(delta.counts.modalidades,1);
 assert.equal(delta.counts.cupos,1);assert.equal(delta.counts.matriculados,0);
 assert.equal(hash(before),snapshot);assert.equal(hash(after),hash(after));
 assert.equal(SCOPE.desde,'2026-09-01');assert.equal(SCOPE.hasta,'2026-09-30');assert.equal(SCOPE.carga_agosto,4);
});
test('modo mutador rechazado antes de iniciar transacción',async()=>{
 let calls=0;
 await assert.rejects(readOnlyTransaction({query:async()=>{calls++;return {rows:[]};}},async()=>null,'MUTATE'),/MUTATION_NOT_IMPLEMENTED/);
 assert.equal(calls,0);
});
test('tenant ajeno rechazado y segunda carga igual/distinta clasificada sin escrituras',()=>{
 assert.doesNotThrow(()=>assertScope(15,24));
 assert.throws(()=>assertScope(16,24),/TENANT_SCOPE_FORBIDDEN/);
 assert.throws(()=>assertScope(15,25),/TENANT_SCOPE_FORBIDDEN/);
 const existing={archivo_sha256:APPROVED_SHA256,fecha_inicio_vigencia:SCOPE.desde,fecha_fin_vigencia:SCOPE.hasta};
 assert.equal(existingDisposition([]),'NEW');
 assert.equal(existingDisposition([existing]),'MATCH_REQUIRES_POSTFLIGHT');
 assert.equal(existingDisposition([{...existing,archivo_sha256:'different'}]),'CONFLICT');
 assert.equal(existingDisposition([existing,existing]),'CONFLICT');
});
test('duplicados de identidad no se vuelven combinaciones distintas por nombre de fila',()=>{
 const first=row('1','1'),second={...first,fila:4};
 assert.equal(new Set([first,second].map(r=>r.sede_id+'|'+r.modalidad_id)).size,1);
 assert.notEqual(hash(first),hash({...first,techo_total:13}));
});
test('lock ocupado y entorno no READ ONLY hacen rollback completo',async()=>{
 for(const readonly of ['on','off']){
  const calls:string[]=[];
  const db={query:async(sql:string)=>{calls.push(sql);return {rows:sql.startsWith('SHOW')?[{transaction_read_only:readonly}]:[{locked:false}]};}};
  await assert.rejects(readOnlyTransaction(db,async()=>{throw Error('never');}),readonly==='on'?/MONTHLY_LOCK_BUSY/:/READ_ONLY_REQUIRED/);
  assert.equal(calls.at(-1),'ROLLBACK');assert.equal(calls.includes('COMMIT'),false);
 }
});
test('rollback inducido y rechazo SQL mutador en PostgreSQL aislado; nada se duplica',async()=>{
 const db=new PGlite();
 try{
  await db.exec("CREATE TABLE carga(id int PRIMARY KEY);INSERT INTO carga VALUES(4)");
  const executor={query:async(sql:string,params?:unknown[])=>db.query(sql,params)} as any;
  // PGlite may not expose advisory locks; use a stub for that SELECT only.
  const wrapped={query:async(sql:string)=>sql.includes('pg_try_advisory_xact_lock')?{rows:[{locked:true}]}:executor.query(sql)};
  await assert.rejects(readOnlyTransaction(wrapped,async()=>{await executor.query('INSERT INTO carga VALUES(9)');}),/read-only transaction/i);
  await assert.rejects(readOnlyTransaction(wrapped,async()=>{throw Error('INDUCED_FAILURE');}),/INDUCED_FAILURE/);
  for(let i=0;i<2;i++)await readOnlyTransaction(wrapped,async()=>{assert.equal((await executor.query('SELECT COUNT(*)::int total FROM carga')).rows[0].total,1);});
  assert.deepEqual((await db.query('SELECT id FROM carga')).rows,[{id:4}]);
 }finally{await db.close();}
});
test('runner no ofrece importador, altas de catálogo, outbox ni DML de Nómina',()=>{
 const source=readFileSync('src/scripts/preview-focalizacion-septiembre-controlada.ts','utf8');
 assert.doesNotMatch(source,/\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|COMMIT)\b/i);
 assert.doesNotMatch(source,/uploadHistoricalFocalizacionFile|createInstitucion|createSede|ensureCurrentNominaPeriods|processNextIntegracionEvent/);
 assert.match(source,/WHERE id=24 AND empresa_id=15/);
 assert.match(source,/APPROVED_FILE_HASH_MISMATCH/);
});
