import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,readdirSync,unlinkSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {checkServerIdentity} from 'node:tls';
import {CERTIFICATE_SHA256,MUTATOR_COMMIT,BACKUP_SHA256,PROJECT_REF,DIGEST_FIELDS,authorizationFields,buildAuthorizationPhrase,parseAuthorizationPhrase} from '../modules/cobertura/phase48-readonly-contract';
import {parseProductionGrant} from '../modules/cobertura/phase48-production-authorization';
import {saveReadReceipt,consumeCurrentNonce,validateCurrentNonce,RECEIPT_FILE} from '../modules/cobertura/phase48-readonly-receipts';
import {verifiedProductionConfig,assertVerifiedTls} from '../modules/cobertura/phase48-readonly-tls';
import {runReadOnlyLifecycle,READ_BACKUP_SHA} from '../modules/cobertura/phase48-readonly-preflight';
import {confirmation,validateOptions,type Options} from '../modules/cobertura/phase48-production-executor';

function receipt(){const now=Date.now();const r:any={commit:'f'.repeat(40),backup_sha:BACKUP_SHA256,certificate_sha256:CERTIFICATE_SHA256,project_ref:PROJECT_REF,scope:{empresa:15,contrato:24,actor:12},phase48_rows:730,digests:Object.fromEntries(DIGEST_FIELDS.map(k=>[k,'a'.repeat(64)])),nonce:'b'.repeat(64),issued_at:new Date(now-1000).toISOString(),expires_at:new Date(now+60000).toISOString(),status:'PENDIENTE_DE_AUTORIZACION',authorization_status:'PENDIENTE_DE_AUTORIZACION',rollback:'CONFIRMED',principal_connection_closed:true,post_rollback_verification:{status:'STABLE',rollback:'CONFIRMED',connection_closed:true},writes:0,run_id:'phase48-preflight-local-fixture'};r.authorization_phrase=buildAuthorizationPhrase(authorizationFields(r));return r;}
test('strict phrase rejects missing/wrong/duplicate/unknown certificate, whitespace and ambiguous values',()=>{
 const r=receipt(),phrase=r.authorization_phrase;assert.equal(parseAuthorizationPhrase(phrase).certificate_sha256,CERTIFICATE_SHA256);
 assert.equal(parseAuthorizationPhrase(phrase).mutator_commit,MUTATOR_COMMIT);
 for(const bad of [phrase.replace('|certificate_sha256='+CERTIFICATE_SHA256,''),phrase.replace(CERTIFICATE_SHA256,'0'.repeat(64)),phrase+'|certificate_sha256='+CERTIFICATE_SHA256,phrase+'|extra=true',phrase+' ',phrase.replace('empresa=15','empresa=015'),phrase.replace('empresa=15','empresa=+15'),phrase.replace(CERTIFICATE_SHA256,CERTIFICATE_SHA256.toLowerCase()),phrase.replace('certificate_sha256=',' certificate_sha256='),phrase.replace('mutator_commit='+MUTATOR_COMMIT,'mutator_commit=dcbd37a'),phrase.replace('mutator_commit='+MUTATOR_COMMIT,'mutator_commit=dcbd37adacc9c6a0a67439eaef92a8b47b8abf67')])assert.throws(()=>parseAuthorizationPhrase(bad));
 assert.ok(!phrase.includes('BEGIN CERTIFICATE'));assert.ok(!phrase.includes('EmpiriaCertificates'));
 const fields=authorizationFields(r);assert.throws(()=>buildAuthorizationPhrase({...fields,certificate_sha256:undefined}),/REQUIRED/);
 assert.throws(()=>buildAuthorizationPhrase({...fields,certificate_sha256:'0'.repeat(64)}),/CERTIFICATE_SHA256_INVALID/);
 assert.throws(()=>buildAuthorizationPhrase({...fields,extra:true}),/REQUIRED/);
});
test('strict ACTIVE grant uses exact keys, canonical bytes, pinned CA and current phrase',()=>{
 const r=receipt(),grant={authorization:'ACTIVE',actor:'12',empresa:15,contrato:24,expectedRows:730,backupSha:BACKUP_SHA256,commit:r.commit,runId:'phase48-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',projectRef:PROJECT_REF,baseline:'a'.repeat(64),confirmation:'local-fixture',authorizationIssuedAt:r.issued_at,authorizationExpiresAt:r.expires_at,syncManualConfirmation:false,certificate_sha256:CERTIFICATE_SHA256,authorizationPhrase:r.authorization_phrase};
 const raw=JSON.stringify(grant);assert.equal(parseProductionGrant(raw).certificate_sha256,CERTIFICATE_SHA256);
 for(const bad of [raw+' ',raw.replace('"certificate_sha256":','"certificate_sha256":"'+CERTIFICATE_SHA256+'","certificate_sha256":'),JSON.stringify({...grant,extra:true}),JSON.stringify({...grant,certificate_sha256:'0'.repeat(64)}),JSON.stringify({...grant,certificate_sha256:undefined}),raw.replace('certificate_sha256','certificate_\\u0073ha256'),JSON.stringify({...grant,commit:'0'.repeat(40)}),JSON.stringify({...grant,syncManualConfirmation:true})])assert.throws(()=>parseProductionGrant(bad));
});
test('nonce binds certificate, entire receipt and final postcheck, expires and is consumed once across publishers',()=>{
 const directory=mkdtempSync(join(tmpdir(),'phase48-nonce-'));
 try{
  const r=receipt(),phrase=r.authorization_phrase;saveReadReceipt(directory,r);validateCurrentNonce(r,phrase);
  for(const bad of [{...r,certificate_sha256:undefined},{...r,certificate_sha256:'0'.repeat(64)},{...r,authorization_status:'REVOCADA'},{...r,nonce:'c'.repeat(64)},{...r,post_rollback_verification:{status:'NOT_EXECUTED'}}])assert.throws(()=>validateCurrentNonce(bad,phrase));
  assert.throws(()=>parseAuthorizationPhrase(phrase.replace(r.expires_at,new Date(Date.now()-1).toISOString())));
  const lock=join(directory,'.'+RECEIPT_FILE+'.tmp');writeFileSync(lock,'OTHER_PROCESS',{flag:'wx'});
  assert.throws(()=>consumeCurrentNonce(directory,phrase),{code:'EEXIST'});assert.equal(readFileSync(lock,'utf8'),'OTHER_PROCESS');unlinkSync(lock);
  consumeCurrentNonce(directory,phrase);assert.equal(JSON.parse(readFileSync(join(directory,RECEIPT_FILE),'utf8')).status,'CONSUMED');
  assert.throws(()=>consumeCurrentNonce(directory,phrase),/NONCE_REVOKED_OR_REUSED/);assert.deepEqual(readdirSync(directory),[RECEIPT_FILE]);
  const next=receipt();next.nonce='c'.repeat(64);next.authorization_phrase=buildAuthorizationPhrase(authorizationFields(next));saveReadReceipt(directory,next);
  assert.equal(next.previous_authorization.status,'REVOCADA');assert.throws(()=>consumeCurrentNonce(directory,phrase),/NONCE_REVOKED_OR_REUSED/);
 }finally{for(const file of readdirSync(directory))unlinkSync(join(directory,file));rmdirSync(directory);}
});
test('bad certificate stops both read lifecycle and TLS config before connection or credential callback',async()=>{
 let opened=0,credentials=0;
 const open=async()=>{opened++;throw Error('MUST_NOT_CONNECT');};
 for(const certificateSha of [undefined,'0'.repeat(64),CERTIFICATE_SHA256+' ',CERTIFICATE_SHA256.toLowerCase()])await assert.rejects(()=>runReadOnlyLifecycle(open,{target:'Production',commit:'f'.repeat(40),backupSha:READ_BACKUP_SHA,certificateSha,observeFlags:async()=>{throw Error('MUST_NOT_FETCH');}} as any),/CERTIFICATE_SHA256_INVALID/);
 for(const env of [{},{PHASE48_SSL_ROOT_CERT_SHA256:'0'.repeat(64)},{PHASE48_SSL_ROOT_CERT_SHA256:CERTIFICATE_SHA256,PHASE48_SSL_ROOT_CERT_PATH:'absent.crt'}])assert.throws(()=>verifiedProductionConfig(()=>{credentials++;throw Error('MUST_NOT_READ');},env));
 assert.equal(opened,0);assert.equal(credentials,0);
 for(const patch of [{rejectUnauthorized:false},{minVersion:'TLSv1.2' as const},{servername:'other.invalid'},{checkServerIdentity:()=>undefined},{ca:undefined}])assert.throws(()=>assertVerifiedTls({ca:Buffer.from('synthetic'),minVersion:'TLSv1.3',rejectUnauthorized:true,servername:'db.invalid',checkServerIdentity,...patch},'db.invalid'));
});
test('mutator static approval checks pinned phrase, CA, nonce and exact confirmation before any query',()=>{
 const r=receipt(),o:Options={mode:'MutateProduction',target:'Production',actor:'12',empresa:15,contrato:24,expectedRows:730,backupSha:BACKUP_SHA256,commit:r.commit,actualCommit:r.commit,projectRef:PROJECT_REF,runId:'phase48-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',flags:{health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false},enabled:true,authorization:'ACTIVE',certificateSha:CERTIFICATE_SHA256,authorizationPhrase:r.authorization_phrase,nonceConsumed:true,baseline:'a'.repeat(64),authorizationIssuedAt:r.issued_at,authorizationExpiresAt:r.expires_at,observeFlags:async()=>o.flags,saveBaseline:async()=>{}};
 o.confirmation=confirmation(o,o.baseline!);validateOptions(o);
 for(const patch of [{certificateSha:undefined},{certificateSha:'0'.repeat(64)},{nonceConsumed:false},{authorizationPhrase:r.authorization_phrase.replace(MUTATOR_COMMIT,'dcbd37a')},{confirmation:o.confirmation+' '},{authorizationExpiresAt:'2000-01-01T00:00:00.000Z'}])assert.throws(()=>validateOptions({...o,...patch}));
});
