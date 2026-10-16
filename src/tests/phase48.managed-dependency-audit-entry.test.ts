import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runManagedDependencyAuditEntry} from '../modules/cobertura/phase48-managed-dependency-audit-entry';

const healthOk={http_status:200,success:true,database_status:'ok',outbox:false,recalc:false,worker_stopped:true};

test('offline precheck failure stops before health and credential adapter',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase48-managed-entry-'));const calls:string[]=[];
  try{
    const out=await runManagedDependencyAuditEntry({directory:dir,precheck:async()=>{calls.push('precheck');return {branch:'',head:'',remote:'',tracked_clean:false,ca_valid:false,destination_valid:false,manifest_valid:false};},health:async()=>{calls.push('health');return healthOk;},readCredential:async()=>{calls.push('credential');throw Error('must not read');},createClient:()=>{throw Error('must not create');},validateTls:async()=>{throw Error('must not TLS');}});
    assert.equal(out.receipt.status,'STOPPED');assert.deepEqual(calls,['precheck']);assert.equal(out.receipt.connection_count,0);assert.equal(out.receipt.credential_read_attempted,false);assert.equal(JSON.parse(readFileSync(out.path,'utf8')).writes,0);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('health failure is followed by one final GET and never reads credential',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'phase48-managed-entry-'));let healthCount=0,credentialCount=0,clientCount=0;
  try{
    const out=await runManagedDependencyAuditEntry({directory:dir,precheck:async()=>({branch:'b',head:'h',remote:'r',tracked_clean:true,ca_valid:true,destination_valid:true,manifest_valid:true}),health:async()=>{healthCount++;return {...healthOk,http_status:503};},readCredential:async()=>{credentialCount++;return 'never';},createClient:()=>{clientCount++;throw Error('never');},validateTls:async()=>{throw Error('never');}});
    assert.equal(out.receipt.status,'STOPPED');assert.equal(healthCount,2);assert.equal(credentialCount,0);assert.equal(clientCount,0);assert.equal(out.receipt.health_initial.http_status,503);assert.equal(out.receipt.health_final.http_status,503);
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('entry source cannot import business capture or mutator modules',()=>{
  const source=readFileSync('src/modules/cobertura/phase48-managed-dependency-audit-entry.ts','utf8');
  for(const forbidden of ['scopedCapture','phase48-scoped-repository','phase48-production-executor','phase48-v6-atomic','phase48-v6-entry'])assert.equal(source.includes(forbidden),false,forbidden);
});
