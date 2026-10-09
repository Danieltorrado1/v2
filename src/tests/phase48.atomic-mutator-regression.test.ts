// In-memory protocol doubles only. No pg Client/Pool, sockets, SQL execution,
// database fixtures, DDL or DML. The unchanged executor runs its real branches.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as contract from '../modules/cobertura/phase48-readonly-contract';

async function exercise(scenario:'ready'|'applied'|'snapshot-failure'|'rollback-failure'|'during-phase48'|'drift'){
 const queries:string[]=[];let captures=0;
 const run_id='phase48-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
 const applied=scenario==='applied';
 const payload=(action:string)=>({run_id,action,actor:12,empresa:15,contrato:24,backup_sha:contract.BACKUP_SHA256,runner_commit:'f'.repeat(40),before_digest:'a'.repeat(64),after_digest:'b'.repeat(64),result:'SUCCESS',timestamp:new Date().toISOString()});
 const audit=['ALBENY','DARY','PHASE48'].map(action=>({usuario_id:'12',accion:'UPDATE',tabla_afectada:'cobertura_asignaciones',empresa_id:'15',contrato_id:'24',entidad:'cobertura_asignaciones',datos_nuevos:payload(action)}));
 const snapshot={digest:'a'.repeat(64),schema:[{table_name:'cobertura_asignaciones',column_name:'focalizacion_final_id',is_nullable:applied?'YES':'NO'},...(applied?['institucion_id','sede_id','modalidad_id'].map(column_name=>({table_name:'cobertura_asignaciones',column_name,data_type:'bigint',is_nullable:'YES'})):[])],constraints:applied?['institucion_id','sede_id','modalidad_id'].map(k=>({relname:'cobertura_asignaciones',definition:'FOREIGN KEY ('+k+')'})):[],indexes:applied?[{indexname:'idx_cobertura_asignaciones_timeline'}]:[],routines:[],triggers:[],data:[{table:'cobertura_asignaciones',count:'730'}],sequences:['auditoria','auditoria_eventos'].map(k=>({sequence:k+'_id_seq',last_value:'0',is_called:false}))};
 const plan=[{applied,category_id:'34',target:{},coverage_id:'731'},{applied,category_id:null,estado_salarial:'REQUIERE_REVISION_SALARIAL',target:{},coverage_id:'11'}];
 const db:any={query:async(sql:string)=>{
  queries.push(sql);
  if(sql.startsWith('SELECT host(inet_server_addr())'))return {rows:[{host:'127.0.0.1',port:55466,version:'17.11',directory:process.cwd().replaceAll('\\','/')+'/tmp/phase48-production-cert/cluster',listen:'127.0.0.1',workers:'0',preload:''}]};
  if(sql==='ROLLBACK'&&scenario==='rollback-failure')throw Error('INDUCED_ROLLBACK_FAILURE');
  if(sql.includes('SELECT (SELECT count(*)'))return {rows:[{waiting:0,ddl:0}]};
  if(sql.includes('WHERE descripcion=$1'))return {rows:applied?audit:[]};
  if(sql.startsWith('SELECT ca.id::text cobertura_id'))return {rows:Array.from({length:730},(_,i)=>({cobertura_id:String(i+1),institucion_id:'44',sede_id:'196',modalidad_id:'1'}))};
  if(sql.includes('SELECT count(*)::int n FROM nomina_periodos'))return {rows:[{n:2}]};
  if(sql.startsWith('SELECT COALESCE(max(id),0)'))return {rows:[{id:'0'}]};
  if(sql==='SELECT pg_try_advisory_xact_lock(15,2448) locked')return {rows:[{locked:true}]};
  return {rows:[],rowCount:0};
 }};
 const exports:any={};
 const code=ts.transpileModule(readFileSync('src/modules/cobertura/phase48-production-executor.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{exports,Date,Buffer,require:(name:string)=>{
  if(name==='./phase48-readonly-contract')return contract;
  if(name==='./phase48-readonly-target')return {validateReadTarget:()=>assert.fail('no productive target')};
  if(name==='./phase48-readonly-repository')return {createReadOnlyRepository:()=>assert.fail('no productive authorization baseline')};
  if(name==='./phase48-historical-domain')return {actorGate:async()=>{},historicalPlan:async()=>structuredClone(plan),historicalSnapshot:async()=>{captures++;if(scenario==='snapshot-failure'||scenario==='rollback-failure')throw Error('INDUCED_SNAPSHOT_FAILURE');return structuredClone({...snapshot,digest:scenario==='drift'&&captures>1?'b'.repeat(64):snapshot.digest});},phaseSql:()=> 'SELECT 1;',nextId:()=>assert.fail('no sequence mutation'),restartSequence:()=>assert.fail('no sequence mutation')};
  if(name==='node:crypto')return require(name);assert.fail(name);
 }});
 const mode=['during-phase48','drift'].includes(scenario)?'SimulateLocal':'PreflightOnly';
 const options={mode,target:'Local',actor:'12',empresa:15,contrato:24,expectedRows:730,backupSha:contract.BACKUP_SHA256,commit:'f'.repeat(40),actualCommit:'f'.repeat(40),projectRef:contract.PROJECT_REF,runId:run_id,flags:{health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false},...(scenario==='during-phase48'?{simulation:{failAt:'during-phase48'}}:{})};
 return {result:await exports.executeAtomic(db,db,options),queries};
}
test('unchanged mutator preflight READY and rollback through protocol doubles',async()=>{
 const {result,queries}=await exercise('ready');assert.equal(result.status,'READY');assert.equal(result.writes,0);assert.equal(queries.at(-1),'ROLLBACK');assert.ok(!queries.some(q=>/^COMMIT|^ALTER|^INSERT|^UPDATE/.test(q)));
});
test('unchanged mutator already-applied idempotence: zero new writes/audits, explicit rollback',async()=>{
 const {result,queries}=await exercise('applied');assert.equal(result.status,'ALREADY_APPLIED');assert.equal(result.writes,0);assert.equal(result.newAudits,0);assert.equal(queries.at(-1),'ROLLBACK');
});
test('unchanged mutator snapshot failure rolls back and returns STOPPED',async()=>{
 const {result,queries}=await exercise('snapshot-failure');assert.equal(result.status,'STOPPED');assert.equal(result.reason,'INDUCED_SNAPSHOT_FAILURE');assert.equal(result.writes,0);assert.equal(queries.at(-1),'ROLLBACK');
});
test('unchanged mutator unconfirmed rollback fails closed with UNKNOWN writes',async()=>{
 const {result,queries}=await exercise('rollback-failure');assert.equal(result.status,'STOPPED');assert.equal(result.reason,'ROLLBACK_NOT_CONFIRMED');assert.equal(result.writes,'UNKNOWN');assert.equal(queries.at(-1),'ROLLBACK');
});
test('unchanged mutator induced phase48 failure reports ROLLED_BACK, never COMMIT (mock query only)',async()=>{
 const {result,queries}=await exercise('during-phase48');assert.equal(result.status,'ROLLED_BACK');assert.equal(result.writes,0);assert.equal(result.newAudits,0);assert.equal(result.reason,'INDUCED_PHASE48_FAILURE');assert.equal(queries.at(-1),'ROLLBACK');assert.ok(!queries.includes('COMMIT'));
});
test('unchanged mutator independent baseline drift stops before mock DDL/DML',async()=>{
 const {result,queries}=await exercise('drift');assert.equal(result.status,'STOPPED');assert.equal(result.reason,'SOURCE_DRIFT_DETECTED');assert.equal(result.writes,0);assert.equal(queries.at(-1),'ROLLBACK');assert.ok(!queries.some(q=>/^ALTER|^INSERT|^UPDATE/.test(q)));
});
