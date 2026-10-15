import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parse as parsePgConnectionString } from 'pg-connection-string';
import { readFile } from 'node:fs/promises';
import { mkdtemp, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { ARGUMENT_ORDER, HISTORICAL_PDF_SIZE, PRODUCTION_HEALTH_URL, assertPrivateRegularFile, assertServiceRoleCredential, assertTargetDetailsMatchPin, assertTargetMatchesPin, makeEntryEvidence, parseAllowlistedEnvironment, parseLauncherArguments, readHistoricalPdf, validateHealthUrl, validateServiceConfiguration } from '../scripts/nomina-turno-202-production-launcher';
import { canonicalizeWindowsPath, parseHealthPayload, PRODUCTION_CA_SHA256, PRODUCTION_TARGET_PIN, sameCanonicalWindowsPath, type PendingReceipt } from '../scripts/nomina-turno-202-readonly-runner';
import { buildPendingEntryPhrase, verifyPendingEntryPhrase } from '../scripts/nomina-turno-202-entry-contract';

const hash=(x:Buffer|string)=>createHash('sha256').update(x).digest('hex');
const ref='abcdefghijklmnopqrst';
const jwt=(role:string)=>`header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
const goodEnv=(overrides:Record<string,string>={})=>({
  DATABASE_URL:`postgresql://postgres.${ref}:synthetic%2Fpassword@aws-1-us-east-1.pooler.supabase.com:6543/postgres`,
  SUPABASE_URL:`https://${ref}.supabase.co`,SUPABASE_SERVICE_ROLE_KEY:jwt('service_role'),SUPABASE_STORAGE_BUCKET:'cuentas-cobro',...overrides,
});
const validArgs=()=>[
  `--env-file=C:/tmp/synthetic.env`,`--ca-file=C:/tmp/ca.crt`,`--health-url=${PRODUCTION_HEALTH_URL}`,
  `--expected-head=${'a'.repeat(40)}`,'--expected-corrector-commit=95fc6bb6879409d37a088e451fb64f2edafacb5f',
  '--native-report-sha256=4d9456973bc1433b5c6175d347497d603999fb1ed35995e7e2493415cda3da41',
  '--readonly-report-sha256=1e2d8cfed0889bd238383054296870c1226be0f5fc89793d652755c584cabca8',
  '--backup-sha256=dd1f9d298e83fb9664d1795c4e452698c26b274569cca11715b2c2f03ff99d75',
  '--pdf-sha256=cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4','--pdf-size=3051',
  '--untracked-manifest-sha256=9c77ae07a8f4478b6e3a9d92d72f5074816a2888c2a98ef807c2ec19354f11c7',
  '--sync-confirmed=true','--pdf-attestation-confirmed=true','--output-directory=C:/tmp/receipts',
];

test('Windows artifact paths canonicalize separators and drive case, while ambiguous paths fail closed',()=>{
  const backslash='C:\\Users\\CORE ULTRA\\Documents\\Empiria Certificates\\root.crt';
  const slash='C:/Users/CORE ULTRA/Documents/Empiria Certificates/root.crt';
  const mixed='c:/Users\\CORE ULTRA/Documents/Empiria Certificates\\root.crt';
  const expected='C:\\Users\\CORE ULTRA\\Documents\\Empiria Certificates\\root.crt';
  assert.equal(canonicalizeWindowsPath(backslash),expected);
  assert.equal(canonicalizeWindowsPath(slash),expected);
  assert.equal(canonicalizeWindowsPath(mixed),expected);
  assert.equal(canonicalizeWindowsPath(`${expected}\\`),expected);
  assert.equal(canonicalizeWindowsPath(expected.toLowerCase()).toLowerCase(),expected.toLowerCase());
  assert.equal(sameCanonicalWindowsPath(slash,backslash),true);
  for(const bad of ['relative\\file','C:relative.env','\\\\server\\share\\file','\\\\?\\C:\\secret','\\\\.\\C:\\secret','C:\\file:secret','C:\\a\\..\\file','C:\\trailing.','C:\\trailing ','C:\\double\\\\separator','C:\\confusable-\u0430','C:\\nul\0byte'])assert.throws(()=>canonicalizeWindowsPath(bad));
});

test('launcher argument parser stores canonical paths so slash variants bind the same plan inputs',()=>{
  const first=validArgs(),second=validArgs();
  first[0]='--env-file=C:/tmp/nomina 202/.env';first[1]='--ca-file=C:/tmp/nomina 202/root.crt';first[13]='--output-directory=C:/tmp/nomina 202/receipts';
  second[0]='--env-file=c:\\tmp\\nomina 202\\.env';second[1]='--ca-file=c:\\tmp\\nomina 202\\root.crt';second[13]='--output-directory=c:\\tmp\\nomina 202\\receipts\\';
  const a=parseLauncherArguments(first),b=parseLauncherArguments(second);
  for(const k of ['--env-file','--ca-file','--output-directory'] as const)assert.equal(a[k],b[k]);
  assert.equal(hash(JSON.stringify(a)),hash(JSON.stringify(b)),'separator variants must bind the same canonical launcher plan');
  assert.equal(a['--env-file'],'C:\\tmp\\nomina 202\\.env');
});

test('launcher requires the exact ordered argument grammar and certified pins',()=>{
  assert.equal(ARGUMENT_ORDER.length,14);assert.equal(parseLauncherArguments(validArgs())['--health-url'],PRODUCTION_HEALTH_URL);
  for(const bad of [validArgs().slice(1),[...validArgs(), '--extra=x'],validArgs().map((x,i)=>i===0?x.replace('--env-file','--unknown'):x),validArgs().map((x,i)=>i===1?'--env-file=C:/tmp/other.env':x),validArgs().map((x,i)=>i===2?'--health-url=https://evil.invalid/api/health':x),validArgs().map((x,i)=>i===11?'--sync-confirmed=false':x)])assert.throws(()=>parseLauncherArguments(bad));
});

test('health pin is exact, and the backend health payload maps to the real runner gates',()=>{
  assert.equal(validateHealthUrl(PRODUCTION_HEALTH_URL),PRODUCTION_HEALTH_URL);
  for(const bad of ['http://api.empiriasuite.com/api/health','https://api.empiriasuite.com/api/health?x=1','https://api.empiriasuite.com/health','https://user@api.empiriasuite.com/api/health'])assert.throws(()=>validateHealthUrl(bad));
  const good=parseHealthPayload(200,{success:true,data:{status:'ok',database:{status:'ok'},integracion_outbox:{enabled:false,started:false,running:false,recalc:{requested:false,active:false}}}});
  assert.deepEqual(good,{httpStatus:200,databaseStatus:'ok',outbox:false,sync:false,recalcRequested:false,recalcActive:false,workerStopped:true});
  assert.notEqual(parseHealthPayload(503,{success:false,data:{}}).databaseStatus,'ok');
  assert.equal(parseHealthPayload(200,{success:true,data:{database:{status:'ok'},integracion_outbox:{enabled:true,started:false,running:false,recalc:{requested:false,active:false}}}}).outbox,true);
});

test('dotenv reader extracts only required names and rejects duplicate/missing or wrong target variables',()=>{
  const env=goodEnv();const text=Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\nUNRELATED=ignored\n';
  assert.deepEqual(parseAllowlistedEnvironment(text),env);
  assert.throws(()=>parseAllowlistedEnvironment(text+`DATABASE_URL=${env.DATABASE_URL}\n`),/ENV_DUPLICATE_VARIABLE/);
  assert.throws(()=>parseAllowlistedEnvironment(text.replace(/SUPABASE_STORAGE_BUCKET=.*\n/,'')),/ENV_REQUIRED_VARIABLE_MISSING/);
  assert.throws(()=>parseAllowlistedEnvironment(Object.entries({...env,DATABASE_URL:env.DATABASE_URL.replace(ref,'zzzzzzzzzzzzzzzzzzzz')}).map(([k,v])=>`${k}=${v}`).join('\n')),/DATABASE_TARGET_MISMATCH/);
  assert.throws(()=>parseAllowlistedEnvironment(Object.entries({...env,DATABASE_URL:env.DATABASE_URL+'?sslmode=disable'}).map(([k,v])=>`${k}=${v}`).join('\n')),/DATABASE_URL_TLS_MODE_REJECTED/);
  assert.throws(()=>parseAllowlistedEnvironment(Object.entries({...env,SUPABASE_SERVICE_ROLE_KEY:jwt('anon')}).map(([k,v])=>`${k}=${v}`).join('\n')),/STORAGE_CREDENTIAL_ROLE_INVALID/);
});

test('service configuration pins Supabase project ref and validates canonical database hash under external strict TLS',()=>{
  assert.deepEqual(validateServiceConfiguration(goodEnv()),{protocolClass:'POSTGRESQL',projectRef:ref,databaseHost:'aws-1-us-east-1.pooler.supabase.com',databasePort:6543,databaseName:'postgres',databaseSha256:'a942b37ccfaf5a813b1432caa209a43b9d144e47ad0de1549c289c253e556cd5',tlsPolicy:'EXTERNAL_STRICT_TLS'});
  assert.throws(()=>validateServiceConfiguration(goodEnv({SUPABASE_URL:'https://zzzzzzzzzzzzzzzzzzzz.supabase.co'})),/DATABASE_TARGET_MISMATCH/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL.replace('pooler.supabase.com','evil.example')})),/DATABASE_TARGET_MISMATCH/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL.replace('postgresql://','mysql://')})),/DATABASE_URL_PROTOCOL_REJECTED/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL+'?sslmode=disable'})),/DATABASE_URL_TLS_MODE_REJECTED/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL+'?sslmode=prefer'})),/DATABASE_URL_TLS_MODE_REJECTED/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL+'?sslmode=allow'})),/DATABASE_URL_TLS_MODE_REJECTED/);
  for(const mode of ['require','verify-full'])assert.equal(validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL+`?sslmode=${mode}`})).tlsPolicy,'EXTERNAL_STRICT_TLS');
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL+'?sslmode=require&sslmode=verify-full'})),/DATABASE_URL_TLS_QUERY_REJECTED/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL+'?sslrootcert=%2Fbad'})),/DATABASE_URL_TLS_QUERY_REJECTED/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL.replace(':6543/postgres',':6543/other')})),/DATABASE_PATH_PIN_MISMATCH/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:goodEnv().DATABASE_URL.replace(`postgres.${ref}`,'postgres')})),/DATABASE_TARGET_MISMATCH/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:'postgresql://postgres:p%ZZ@aws-1-us-east-1.pooler.supabase.com:6543/postgres'})),/DATABASE_URL_POLICY/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:`postgresql://postgres:${encodeURIComponent('pa:ss@word')}@aws-1-us-east-1.pooler.supabase.com:6543/postgres`})),/DATABASE_TARGET_MISMATCH/);
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:`postgresql://postgres.${ref}:pw@[::1]:6543/postgres`})),/DATABASE_TARGET_MISMATCH/);
});

test('canonical database path rejects ambiguous segment encodings and both PostgreSQL schemes normalize equally',()=>{
  const build=(scheme:string,pathValue:string)=>`${scheme}//postgres.${ref}:pw@aws-1-us-east-1.pooler.supabase.com:6543${pathValue}`;
  const a=validateServiceConfiguration(goodEnv({DATABASE_URL:build('postgres:','/postgres')}));
  const b=validateServiceConfiguration(goodEnv({DATABASE_URL:build('postgresql:','/%70ostgres')}));
  assert.deepEqual({...a,databaseName:undefined},{...b,databaseName:undefined});
  for(const bad of ['', '//postgres', '/one/two', '/%252f', '/%2fpostgres', '/%5cpostgres', '/.', '/..', '/%00', '/%70%6f%73%74%67%72%65%73%25', '/po%CC%81stgres']){
    assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:build('postgresql:',bad)})));
  }
  const directA=parsePgConnectionString(build('postgres:','/postgres'));
  const directB=parsePgConnectionString(build('postgresql:','/postgres'));
  assert.deepEqual({host:directA.host,port:directA.port,database:directA.database,user:directA.user},{host:directB.host,port:directB.port,database:directB.database,user:directB.user});
  assert.throws(()=>validateServiceConfiguration(goodEnv({DATABASE_URL:build('mysql:','/postgres')})),/DATABASE_URL_PROTOCOL_REJECTED/);
});

test('runner installs strict TLS directly and never passes a URL that could override the TLS object',async()=>{
  const src=await readFile('src/scripts/nomina-turno-202-readonly-runner.ts','utf8');
  assert.match(src,/ssl:\{rejectUnauthorized:true,ca:caPem,minVersion:'TLSv1\.3',maxVersion:'TLSv1\.3',servername:plan\.servername,checkServerIdentity:/);
  assert.match(src,/TLS_CONFIGURATION_MISMATCH/);
  assert.doesNotMatch(src,/connectionString\s*:/);
  assert.match(src,/tls_policy!=='EXTERNAL_STRICT_TLS'/);
});

test('independent destination pin accepts only exact host, port, database, project-ref hash, protocol and TLS policy',()=>{
  const fixed={host:PRODUCTION_TARGET_PIN.host,port:PRODUCTION_TARGET_PIN.port,databaseSha256:PRODUCTION_TARGET_PIN.database_sha256,projectRefSha256:PRODUCTION_TARGET_PIN.project_ref_sha256};
  assert.equal(assertTargetDetailsMatchPin(fixed),true);
  for(const patch of [{host:'evil.example'},{port:5432},{databaseSha256:hash('other')},{projectRefSha256:hash('other-ref')}])assert.throws(()=>assertTargetDetailsMatchPin({...fixed,...patch}),/DATABASE_TARGET_PIN_MISMATCH/);
  const target=validateServiceConfiguration(goodEnv());
  const syntheticPin={...PRODUCTION_TARGET_PIN,host:target.databaseHost,port:target.databasePort,database_sha256:target.databaseSha256,project_ref_sha256:hash(ref),protocol_class:'POSTGRESQL',tls_policy:'EXTERNAL_STRICT_TLS',tls:{...PRODUCTION_TARGET_PIN.tls,ca_sha256:PRODUCTION_CA_SHA256}};
  assert.equal(assertTargetMatchesPin(target,syntheticPin),true);
  for(const patch of [{host:'evil.example'},{port:5432},{database_sha256:hash('other')},{project_ref_sha256:hash('other-ref')},{protocol_class:'POSTGRES'},{tls_policy:'URL_TLS'},{tls:{...syntheticPin.tls,min_version:'TLSv1.2'}},{tls:{...syntheticPin.tls,reject_unauthorized:false}},{tls:{...syntheticPin.tls,ca_sha256:'0'.repeat(64)}}])assert.throws(()=>assertTargetMatchesPin(target,{...syntheticPin,...patch} as typeof syntheticPin),/DATABASE_TARGET_PIN_MISMATCH/);
  const direct=validateServiceConfiguration(goodEnv({DATABASE_URL:`postgresql://postgres:${encodeURIComponent('p:a@ss')}@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`}));
  assert.equal(direct.databaseHost,`db.${ref}.supabase.co`);
  assert.throws(()=>assertTargetMatchesPin(direct,syntheticPin),/DATABASE_TARGET_PIN_MISMATCH/);
});

test('service-role parser never places synthetic token contents in errors',()=>{
  assert.equal(assertServiceRoleCredential(jwt('service_role')),true);
  const secret='do-not-print-this-synthetic-token';assert.throws(()=>assertServiceRoleCredential(secret),e=>!String(e).includes(secret));
});

test('explicit env paths reject relative paths, symlinks and broad Windows ACL grants',async t=>{
  await assert.rejects(assertPrivateRegularFile('relative.env'),/ENV_PATH_NOT_ABSOLUTE/);
  if(process.platform!=='win32'){t.skip('Windows ACL behavior is certified only on Windows');return;}
  const dir=await realpath(await mkdtemp(path.join(os.tmpdir(),'nomina202-launcher-acl-'))),file=path.join(dir,'synthetic.env'),link=path.join(dir,'link.env');
  try{
    await writeFile(file,'SYNTHETIC_ONLY=not-a-secret\n',{mode:0o600});
    await execFileSync('icacls.exe',[file,'/grant','*S-1-1-0:(R)'],{windowsHide:true,stdio:'ignore'});
    await assert.rejects(assertPrivateRegularFile(file),/ENV_ACL_INSECURE/);
    try{await symlink(file,link);await assert.rejects(assertPrivateRegularFile(link),/ENV_FILE_NOT_REGULAR/);}catch(error){if((error as NodeJS.ErrnoException).code!=='EPERM')throw error;t.diagnostic('Symlink rejection path remains enforced; host policy prevents synthetic symlink creation.');}
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('PDF provider reads only the expected bucket/key and verifies metadata and downloaded bytes in memory',async()=>{
  const pdf=await readFile('C:/Users/CORE ULTRA/Documents/EmpiriaBackups/nomina-turno-202-pre-correccion-20261015T013132Z/historical-account-77.pdf');
  assert.equal(pdf.length,HISTORICAL_PDF_SIZE);assert.equal(hash(pdf),'cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4');
  let infoCalls=0,downloadCalls=0;
  const fake=(()=>({storage:{from:(bucket:string)=>({info:async(key:string)=>{infoCalls++;assert.equal(bucket,'cuentas-cobro');assert.equal(key,'2026/account-77/current.pdf');return{data:{contentType:'application/pdf',size:3051,eTag:'"synthetic-etag"'},error:null};},download:async(key:string)=>{downloadCalls++;assert.equal(key,'2026/account-77/current.pdf');return{data:new Blob([pdf],{type:'application/pdf'}),error:null};}})}})) as unknown as typeof createClient;
  const result=await readHistoricalPdf(goodEnv(),{bucket:'cuentas-cobro',path:'2026/account-77/current.pdf'},fake);
  assert.equal(infoCalls,1);assert.equal(downloadCalls,1);assert.equal(result.mime,'application/pdf');assert.equal(result.etag,'"synthetic-etag"');assert.equal(hash(result.bytes),hash(pdf));result.bytes.fill(0);
  await assert.rejects(readHistoricalPdf(goodEnv(),{bucket:'wrong-bucket',path:'2026/account-77/current.pdf'},fake),/PDF_REFERENCE_REJECTED/);
  await assert.rejects(readHistoricalPdf(goodEnv(),{bucket:'cuentas-cobro',path:'../private.pdf'},fake),/PDF_REFERENCE_REJECTED/);
});

test('PDF provider rejects metadata, byte drift, and storage failures without leaking storage errors',async()=>{
  const pdf=await readFile('C:/Users/CORE ULTRA/Documents/EmpiriaBackups/nomina-turno-202-pre-correccion-20261015T013132Z/historical-account-77.pdf');
  const mock=(info:any,download:any)=>((()=>({storage:{from:()=>({info:async()=>info,download:async()=>download})}})) as unknown as typeof createClient);
  const refObj={bucket:'cuentas-cobro',path:'2026/account-77/current.pdf'};
  await assert.rejects(readHistoricalPdf(goodEnv(),refObj,mock({data:{contentType:'text/plain',size:3051,eTag:'x'},error:null},{data:new Blob([pdf]),error:null})),/PDF_METADATA_MISMATCH/);
  await assert.rejects(readHistoricalPdf(goodEnv(),refObj,mock({data:{contentType:'application/pdf',size:3051,eTag:'x'},error:null},{data:new Blob([Buffer.concat([pdf,Buffer.from('x')])]),error:null})),/PDF_HASH_MISMATCH/);
  await assert.rejects(readHistoricalPdf(goodEnv(),refObj,mock({data:null,error:new Error('secret-like backend detail')},{data:null,error:new Error('x')})),e=>/PDF_METADATA_READ_FAILED/.test(String(e))&&!String(e).includes('secret-like'));
});

test('launcher and runner imports contain no mutator dependency',async()=>{
  const src=await readFile('src/scripts/nomina-turno-202-production-launcher.ts','utf8');
  assert.doesNotMatch(src,/nomina-turno-202-integral-local|executeIntegral|claimNonceThenReadCredentials|activateAuthorization/);
  assert.match(src,/runReadOnlyEntryPreflight/);assert.doesNotMatch(src,/setval\s*\(|nextval\s*\(|UPDATE\s+|INSERT\s+|DELETE\s+/i);
});

test('a successful local runner receipt creates a fresh, short-lived phrase accepted by the inert contract parser',()=>{
  const now=Date.now(),digestSet=Object.fromEntries(['critical_schema','sources','movement_192','detail_220','account_77','revision_20114','related_audits','related_history','pdf_metadata','protected_tables','write_set_before','sequence_baseline'].map(k=>[k,hash(k)]));
  const receipt={status:'PENDING_USER_CONFIRMATION',synthetic:true,generatedAt:new Date(now).toISOString(),connections:[{id:'1c4802f2-6720-4c76-b03e-1372f4f80b91',observedAt:new Date(now-1000).toISOString(),serverVersion:'17.11',tlsProtocol:'TLSv1.3',servername:'localhost',transactionReadOnly:true},{id:'fd23e33a-3c8b-4acf-aa8d-3a90be39c9ca',observedAt:new Date(now).toISOString(),serverVersion:'17.11',tlsProtocol:'TLSv1.3',servername:'localhost',transactionReadOnly:true}],digests:digestSet,sequenceBaseline:{'public.auditoria_id_seq':'10','public.auditoria_eventos_id_seq':'20','public.nomina_revision_operativa_id_seq':'30','public.historial_cambios_id_seq':'40'},pdf:{sha256:'cf061de69f85976bd884439e12a58281bde4d32d2542b36e653a96a3a9c7d8a4',size:3051,referenceSha256:hash('bucket/key'),mime:'application/pdf',etag:'"local-etag"'},checks:{health:{httpStatus:200,databaseStatus:'ok',outbox:false,sync:false,recalcRequested:false,recalcActive:false,workerStopped:true},syncConfirmation:{enabled:false},locks:{waiting:0,ddl:0}}} as unknown as PendingReceipt;
  const evidence=makeEntryEvidence(receipt,'b'.repeat(40),now),phrase=buildPendingEntryPhrase(evidence,now);
  assert.equal(verifyPendingEntryPhrase(phrase,evidence,now),true);assert.match(phrase,/PENDING_USER_CONFIRMATION/);assert.match(phrase,/public\.historial_cambios_id_seq=\+42/);assert.ok(Date.parse(evidence.expiresAt)-now<=15*60_000);
  const next=makeEntryEvidence(receipt,'b'.repeat(40),now);assert.notEqual(next.runId,evidence.runId);assert.notEqual(next.nonce,evidence.nonce);
});
