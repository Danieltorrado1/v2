import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readDatabaseUrl,validateReadTarget,classifyReadTarget,verifyReadServerIdentity,READ_SCHEMA_FINGERPRINT,READ_IDENTITY_TABLES,READ_SCHEMA_CANONICALIZATION_VERSION} from '../modules/cobertura/phase48-readonly-target';
import {PROJECT_REF} from '../modules/cobertura/phase48-readonly-contract';
// Synthetic values only. Assertions never compare/print credential strings.
const ref='abcdefghijklmnopqrst',other='zyxwvutsrqponmlkjihg';
const direct=(project=ref)=>`postgresql://postgres:synthetic@db.${project}.supabase.co:5432/postgres?sslmode=require`;
const pool=(project=ref,host='aws-0-us-east-1.pooler.supabase.com')=>`postgresql://postgres.${project}:synthetic@${host}:6543/postgres`;
const valid=(value:string)=>validateReadTarget(value,ref);
const reject=(value:string)=>assert.throws(()=>valid(value),/^Error: READ_[A-Z_]+$/);
test('target 01: direct official host',()=>{assert.equal(valid(direct()).classification.match,true);});
test('target 02: shared transaction pooler uses exact username identity',()=>{assert.equal(valid(pool()).format,'SHARED_TRANSACTION_POOLER');});
test('target 03: other official region and legacy regional endpoint',()=>{assert.equal(valid(pool(ref,'aws-1-eu-central-1.pooler.supabase.com')).classification.match,true);assert.equal(valid(pool(ref,'eu-central-1.pooler.supabase.com')).classification.match,true);});
test('target 04: other project is rejected',()=>reject(direct(other)));
test('target 05: partial project and suffix are rejected',()=>{reject(direct(ref.slice(0,-1)));reject(direct(ref+'x'));});
test('target 06: lookalike and additional domain suffix are rejected',()=>{reject(pool(ref,'aws-0-us-east-1.pooler.supabase.com.attacker.invalid'));reject(direct().replace('.supabase.co','.supabase.co.attacker.invalid'));reject(pool(ref,'aws-0-us-east-1.pooler.supabase-com.invalid'));});
test('target 07: identity embedded in password grants nothing',()=>{reject(direct(other).replace('synthetic',ref));});
test('target 08: localhost is rejected',()=>reject(`postgresql://postgres.${ref}:synthetic@localhost:5432/postgres`));
test('target 09: private IPv4 addresses are rejected',()=>{for(const host of ['127.0.0.1','10.0.0.1','172.16.0.1','192.168.1.1'])reject(pool(ref,host));});
test('target 10: local/private IPv6 literals are rejected',()=>{for(const host of ['[::1]','[::]','[fd00::1]','[fe80::1]'])reject(pool(ref,host));});
test('target 11: malformed URL produces a sanitized error only',()=>{reject('not-a-url');reject(pool().replace('synthetic','%zz'));assert.equal(classifyReadTarget('not-a-url').parser_success,false);});
test('target 12: encoded at sign is parsed without splitting credentials',()=>{const result=valid(pool().replace('synthetic','a%40b'));assert.equal(result.classification.password_present,true);assert.equal(createHash('sha256').update(result.config.password).digest('hex'),createHash('sha256').update('a@b').digest('hex'));});
test('target 13: encoded reserved characters are preserved safely',()=>{const result=valid(pool().replace('synthetic',encodeURIComponent('a:@/?#%b')));assert.equal(createHash('sha256').update(result.config.password).digest('hex'),createHash('sha256').update('a:@/?#%b').digest('hex'));});
test('target 14: pooler username without explicit project is rejected',()=>reject(pool().replace('postgres.'+ref,'postgres')));
test('target 15: other project in pooler username is rejected',()=>reject(pool(other)));
test('target 16: deceptive query identity and transport overrides are rejected',()=>{for(const suffix of ['project_ref='+ref,'host=db.'+ref+'.supabase.co','user=postgres.'+ref,'sslmode=disable','sslmode=prefer','options=unsafe','sslmode=require&sslmode=disable'])reject(pool()+'?'+suffix);reject(pool(other)+'?project_ref='+ref);});
test('target 17: hostname case normalizes; username case stays exact',()=>{assert.equal(valid(pool().replace('aws-0-us-east-1.pooler.supabase.com','AWS-0-US-EAST-1.POOLER.SUPABASE.COM')).classification.match,true);reject(pool().replace('postgres.','POSTGRES.'));});
test('target 18: env whitespace, quotes and comments are supported',()=>{for(const content of [`  DATABASE_URL = "${pool()}"  # synthetic comment\n`,`export DATABASE_URL='${pool()}'\n`,`DATABASE_URL=${pool()}\n`])assert.equal(valid(readDatabaseUrl(content)).classification.match,true);});
test('target 19: missing credential key fails closed',()=>assert.throws(()=>readDatabaseUrl('OTHER_KEY=synthetic\n'),/READ_CREDENTIAL_REQUIRED/));
test('target 20: duplicate conflicting credential keys fail closed',()=>assert.throws(()=>readDatabaseUrl(`DATABASE_URL=${direct()}\nDATABASE_URL=${pool(other)}\n`),/READ_CREDENTIAL_DUPLICATE/));
test('target 21: sanitized real format accepted only for exact expected project',()=>{
 const shape=pool(PROJECT_REF);assert.equal(validateReadTarget(shape).classification.match,true);assert.equal(validateReadTarget(shape).config.ssl.rejectUnauthorized,true);assert.equal(validateReadTarget(shape).classification.ssl_required_present,false);assert.throws(()=>validateReadTarget(pool(other)),/READ_PROJECT_TARGET_INVALID/);
});
test('offline SSL is mandatory in transport and cannot be downgraded',()=>{assert.equal(valid(direct()).config.ssl.rejectUnauthorized,true);assert.equal(valid(pool()).config.ssl.rejectUnauthorized,true);reject(pool()+'?sslmode=allow');});
test('official DNS direct format supports IPv6 without accepting literal IP identity',()=>{assert.equal(valid(direct().replace(':5432','')).format,'DIRECT');reject(pool(ref,'[2001:db8::1]'));});
test('future server identity requires PostgreSQL 17, tenant, tables and certified schema',()=>{
 const identity={database:'postgres',version:'17.6',empresa_exists:true,contrato_exists:true,schema_digest:READ_SCHEMA_FINGERPRINT,schema_identity_version:READ_SCHEMA_CANONICALIZATION_VERSION,tables:[...READ_IDENTITY_TABLES]};
 assert.equal(verifyReadServerIdentity(identity,'postgres').schema_matches,true);
 for(const patch of [{version:'16.11'},{database:'other'},{empresa_exists:false},{contrato_exists:false},{tables:[]},{schema_digest:'0'.repeat(64)}])assert.throws(()=>verifyReadServerIdentity({...identity,...patch},'postgres'),/^Error: READ_[A-Z_]+$/);
});
test('schema mismatch carries sanitized expected and observed digests and canonicalization version',()=>{
 const observed='0'.repeat(64);
 assert.throws(()=>verifyReadServerIdentity({database:'postgres',version:'17.6',empresa_exists:true,contrato_exists:true,tables:[...READ_IDENTITY_TABLES],schema_digest:observed,schema_identity_version:READ_SCHEMA_CANONICALIZATION_VERSION},'postgres'),(error:any)=>{
  assert.equal(error.message,'READ_SCHEMA_IDENTITY_MISMATCH');assert.equal(error.expected_schema_digest,READ_SCHEMA_FINGERPRINT);assert.equal(error.observed_schema_digest,observed);assert.equal(error.canonicalization_version,READ_SCHEMA_CANONICALIZATION_VERSION);assert.equal(error.schema_divergence_phase,'server_identity.critical_schema');assert.ok(!JSON.stringify(error).includes('CREATE'));return true;
 });
});
