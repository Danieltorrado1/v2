import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BACKUP_SHA,PROJECT_REF,confirmation,executeAtomic,validateOptions,assertProductionUrl,type Options} from '../modules/cobertura/phase48-production-executor';
import {assertHistoricalLocalIdentity} from '../modules/cobertura/phase48-historical-controlled';
const options=(extra:Partial<Options>={}):Options=>({actor:'12',empresa:15,contrato:24,expectedRows:730,backupSha:BACKUP_SHA,commit:'f'.repeat(40),actualCommit:'f'.repeat(40),projectRef:PROJECT_REF,runId:'phase48-'+randomUUID(),flags:{health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false},...extra});
test('default preflight accepts exact scope; unknown modes and every unsafe scope are rejected',()=>{
 validateOptions(options());for(const extra of [{mode:'UNKNOWN'},{actor:'13'},{empresa:16},{contrato:25},{expectedRows:729},{backupSha:'0'.repeat(64)},{projectRef:'wrong'},{commit:'0'.repeat(40)},{runId:'old'}])assert.throws(()=>validateOptions(options(extra)));
});
test('each flag and public health gate fails closed',()=>{
 for(const name of ['health200','databaseOk','outbox','sync','recalc','worker'] as const){const o=options();o.flags[name]=!o.flags[name];assert.throws(()=>validateOptions(o),/HEALTH_OR_FLAGS_UNSAFE/);}
});
test('full confirmation binds run, commit, backup and immediate baseline but remains revoked',()=>{
 const o=options({mode:'MutateProduction',enabled:true,authorization:'REVOKED',baseline:'a'.repeat(64)});o.confirmation=confirmation(o,o.baseline!);assert.throws(()=>validateOptions(o),/AUTHORIZATION_REVOKED/);
 for(const confirmation of ['',o.confirmation+' ',o.confirmation.replace('rows=730','rows=729')])assert.throws(()=>validateOptions({...o,confirmation}),/AUTHORIZATION_REVOKED/);
});
test('new external approval requires exact phrase, fresh expiry, enabled process and observers',()=>{
 const flags=options().flags;const o=options({mode:'MutateProduction',enabled:true,authorization:'ACTIVE',baseline:'b'.repeat(64),authorizationIssuedAt:new Date(Date.now()-1000).toISOString(),authorizationExpiresAt:new Date(Date.now()+60_000).toISOString(),observeFlags:async()=>flags,saveBaseline:async()=>{}});
 o.confirmation=confirmation(o,o.baseline!);validateOptions(o);
 for(const confirmation of ['',o.confirmation+' ',o.confirmation.replace('rows=730','rows=729')])assert.throws(()=>validateOptions({...o,confirmation}),/EXACT_CONFIRMATION_REQUIRED/);
 assert.throws(()=>validateOptions({...o,enabled:false}),/PRODUCTION_GATES_REQUIRED/);assert.throws(()=>validateOptions({...o,authorizationIssuedAt:'2000-01-01T00:00:00Z'}),/AUTHORIZATION_EXPIRED_OR_INVALID/);
});
test('revoked mutation returns STOPPED before even querying a supplied client',async()=>{
 const noQueries={query:async()=>{throw Error('MUST_NOT_CONNECT');}} as any;
 const result=await executeAtomic(noQueries,noQueries,options({mode:'MutateProduction'}));assert.equal(result.status,'STOPPED');assert.equal('reason' in result&&result.reason,'AUTHORIZATION_REVOKED');
});
test('simulation and original local runner reject remote identities without a network connection',async()=>{
 const remote={query:async()=>({rows:[{host:'192.0.2.1',port:5432,version:'17.6',directory:'/production',listen:'*',workers:'8',preload:'',database:'postgres'}]})} as any;
 const result=await executeAtomic(remote,remote,options({mode:'SimulateLocal'}));assert.equal(result.status,'STOPPED');assert.equal('reason' in result&&result.reason,'SIMULATION_LOOPBACK_REQUIRED');await assert.rejects(()=>assertHistoricalLocalIdentity(remote),/LOCAL_RESTORATION_REQUIRED/);
});
test('remote preflight also requires a new authorization; simulation cannot target production',async()=>{
 const noQueries={query:async()=>{throw Error('MUST_NOT_CONNECT');}} as any;
 const preflight=await executeAtomic(noQueries,noQueries,options({mode:'PreflightOnly',target:'Production'}));assert.equal(preflight.status,'STOPPED');assert.equal('reason' in preflight&&preflight.reason,'AUTHORIZATION_REVOKED');
 assert.throws(()=>validateOptions(options({mode:'SimulateLocal',target:'Production'})),/SIMULATION_LOOPBACK_REQUIRED/);
});
test('production transport binds project and session port; unrelated hosts and transaction pools are rejected',()=>{
 assertProductionUrl(`postgresql://postgres:unused@db.${PROJECT_REF}.supabase.co:5432/postgres`);
 for(const url of ['postgresql://postgres:unused@127.0.0.1:5432/postgres','postgresql://postgres:unused@unrelated.example:5432/postgres',`postgresql://postgres:unused@db.${PROJECT_REF}.supabase.co:6543/postgres`,`postgresql://postgres:unused@db.${PROJECT_REF}.supabase.co:5432/other`])assert.throws(()=>assertProductionUrl(url));
});
