import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {assertReadQuery} from '../modules/cobertura/phase48-readonly-repository';
import {validateReadOptions,READ_BACKUP_SHA,productionReadOnlyPreflight} from '../modules/cobertura/phase48-readonly-preflight';
import {contractDigest,buildAuthorizationPhrase,authorizationFields,DIGEST_FIELDS} from '../modules/cobertura/phase48-readonly-contract';
const options={target:'Local' as const,commit:'f'.repeat(40),backupSha:READ_BACKUP_SHA,observeFlags:async()=>({health200:true,databaseOk:true,outbox:false,sync:false,recalc:false,worker:false})};
test('read modes never accept mutation, resume or enabling options',()=>{
 for(const mode of ['PreflightOnly','PreviewOnly','PreflightAndPreview'])validateReadOptions({...options,mode});
 for(const mode of ['MutateProduction','Mutate','Apply','Resume','UNKNOWN'])assert.throws(()=>validateReadOptions({...options,mode}),/UNKNOWN_READ_MODE/);
 assert.throws(()=>validateReadOptions({...options,enabled:true} as any),/READ_OPTION_NOT_ALLOWED/);
});
test('repository blocks writable CTE, statement stacking, row locks and side-effect functions',()=>{
 assertReadQuery('SELECT count(*) FROM public.cobertura_asignaciones');
 for(const sql of ["WITH x AS (DELETE FROM t RETURNING *) SELECT * FROM x","SELECT nextval('s')","SELECT public.lower('x')","SELECT pg_catalog.set_config('x','y',false)",'SELECT * INTO t FROM a','SELECT 1; DELETE FROM t','SELECT * FROM t FOR SHARE','SELECT custom_function()','INSERT INTO t VALUES(1)'])assert.throws(()=>assertReadQuery(sql));
});
test('static dependency barrier: no imports or dispatch to mutation modules',()=>{
 const files=['src/modules/cobertura/phase48-readonly-tls.ts','src/modules/cobertura/phase48-readonly-target.ts','src/modules/cobertura/phase48-readonly-contract.ts','src/modules/cobertura/phase48-readonly-repository.ts','src/modules/cobertura/phase48-readonly-preflight.ts','src/modules/cobertura/phase48-readonly-receipts.ts','src/scripts/phase48-production-readonly.ts'];
 for(const file of files){
  const source=ts.createSourceFile(file,readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
  const visit=(node:ts.Node)=>{
   if(ts.isImportDeclaration(node)){const name=(node.moduleSpecifier as ts.StringLiteral).text;assert.ok(name==='pg'||name==='typescript'||name.startsWith('node:')||/phase48-readonly-(repository|preflight|receipts|contract|target|tls)$/.test(name),'Forbidden dependency '+name);}
   if(ts.isCallExpression(node)&&node.expression.kind===ts.SyntaxKind.ImportKeyword)assert.fail('Dynamic imports are forbidden');
   if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&['require','eval','Function','applyProductionMutation','executeAtomic'].includes(node.expression.text))assert.fail('Forbidden call '+node.expression.text);
   if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='query'&&node.arguments[0]){
    const arg=node.arguments[0];if(ts.isStringLiteral(arg)||ts.isNoSubstitutionTemplateLiteral(arg)){
     const sql=arg.text;if(!/^(BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY|BEGIN READ ONLY|ROLLBACK|SET TRANSACTION ISOLATION LEVEL REPEATABLE READ$|SET LOCAL (statement_timeout|lock_timeout|search_path)=)/.test(sql))assertReadQuery(sql);
    }else if(ts.isTemplateExpression(arg))assert.ok(/^SELECT\b/.test(arg.head.text),'Non-read query template');
    else assert.ok(file.endsWith('repository.ts')&&ts.isIdentifier(arg)&&arg.text==='sql','Opaque SQL outside repository barrier');
   }
   ts.forEachChild(node,visit);
  };visit(source);
  const fixture=(text:string)=>ts.createSourceFile('forbidden-fixture.ts',text,ts.ScriptTarget.Latest,true);
  assert.throws(()=>visit(fixture("import {executeAtomic} from './phase48-production-executor';")),/Forbidden dependency/);
  assert.throws(()=>visit(fixture("import('./phase48-production-executor');")),/Dynamic imports/);
  assert.throws(()=>visit(fixture("require('./phase48-production-executor');")),/Forbidden call/);
 }
});
test('unavailable flags stop without issuing any query or inventing values',async()=>{
 let calls=0;const result=await productionReadOnlyPreflight({query:async()=>{calls++;throw Error('unexpected');}} as any,{...options,observeFlags:async()=>({} as any)});
 assert.equal(result.status,'STOPPED');assert.equal(result.reason,'FLAGS_UNAVAILABLE_OR_UNSAFE');assert.equal(calls,0);
});
test('canonical digests preserve NULL and microseconds while normalizing timestamp offsets',()=>{
 assert.notEqual(contractDigest({x:null}),contractDigest({x:0}));
 assert.notEqual(contractDigest({x:null}),contractDigest({x:''}));
 assert.equal(contractDigest({t:'2026-10-08 11:00:00.123456-05'}),contractDigest({t:'2026-10-08T16:00:00.123456Z'}));
 assert.notEqual(contractDigest({t:'2026-10-08T16:00:00.123456Z'}),contractDigest({t:'2026-10-08T16:00:00.123457Z'}));
 assert.equal(contractDigest({b:2,a:null}),contractDigest({a:null,b:2}));
});
test('authorization rejects each missing field, invalid digest, unsafe flag and expiry',()=>{
 const now=Date.now(),receipt={commit:'f'.repeat(40),backup_sha:READ_BACKUP_SHA,project_ref:'scuvsocqibbubqnesvuf',scope:{empresa:15,contrato:24,actor:12},phase48_rows:730,digests:Object.fromEntries(DIGEST_FIELDS.map(k=>[k,'a'.repeat(64)])),nonce:'b'.repeat(64),issued_at:new Date(now).toISOString(),expires_at:new Date(now+600000).toISOString()};
 const fields=authorizationFields(receipt);
 for(const k of Object.keys(fields)){const missing={...fields};delete missing[k];assert.throws(()=>buildAuthorizationPhrase(missing),/AUTHORIZATION_FIELD_REQUIRED/);}
 for(const k of DIGEST_FIELDS)assert.throws(()=>buildAuthorizationPhrase({...fields,[k]:'invalid'}),/AUTHORIZATION_FIELD_INVALID/);
 assert.throws(()=>buildAuthorizationPhrase({...fields,OUTBOX:true}),/AUTHORIZATION_FLAGS_INVALID/);
 assert.throws(()=>buildAuthorizationPhrase({...fields,expires_at:new Date(now+600001).toISOString()}),/AUTHORIZATION_EXPIRATION_INVALID/);
 assert.throws(()=>buildAuthorizationPhrase({...fields,expires_at:fields.issued_at}),/AUTHORIZATION_EXPIRATION_INVALID/);
 assert.equal(buildAuthorizationPhrase(fields),buildAuthorizationPhrase(Object.fromEntries(Object.entries(fields).reverse())));
});
