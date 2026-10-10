import {Client} from 'pg';
import {readFileSync,writeFileSync,openSync,closeSync,existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {collectSchemaForensic} from '../modules/cobertura/phase48-readonly-schema-catalog';
import {criticalSchemaDigest,EXPECTED_CRITICAL_SCHEMA_DIGEST} from '../modules/cobertura/phase48-readonly-schema-identity';
const task=process.cwd()+'/tmp/phase48-schema-forensic-local';
const backup='C:/Users/CORE ULTRA/Documents/EmpiriaBackups/phase48-modalidad-pre-migracion-20261007T132031Z';
const env=Object.fromEntries(Object.entries(process.env).filter(([k])=>!/^PG|DATABASE_URL|PRODUCTION_|SUPABASE|JWT_|INTEGRACION_|PHASE48_SSL_|NODE_OPTIONS/.test(k)));
const cfg={host:'127.0.0.1',port:55468,user:'modalidad_verifier',database:'postgres',connectionTimeoutMillis:5000};
function native(name:string,args:string[],label:string){const out=openSync(task+'/'+label+'.raw.out','w'),err=openSync(task+'/'+label+'.raw.err','w');try{if(spawnSync('C:/Program Files/PostgreSQL/17/bin/'+name+'.exe',args,{env,stdio:['ignore',out,err],windowsHide:true}).status!==0)throw Error('LOCAL_NATIVE_FAILED_'+label.toUpperCase());}finally{closeSync(out);closeSync(err);}}
async function main(){
 const sha=createHash('sha256').update(readFileSync(backup+'/full.dump')).digest('hex');if(sha!=='4271775ee853bf03b9f70402f7ecfd7becbe048269e3b10c76f027f981303e26')throw Error('BACKUP_SHA_INVALID');
 const admin=new Client(cfg);await admin.connect();
 try{if((await admin.query('SHOW server_version')).rows[0].server_version!=='17.11')throw Error('LOCAL_VERSION_INVALID');
 const globals=readFileSync(backup+'/globals.sql','utf8');if(/\bPASSWORD\s+'(?!')/i.test(globals))throw Error('UNSANITIZED_GLOBALS');const roles=[...globals.matchAll(/^CREATE ROLE ([a-z_]+);$/gm)].map(m=>m[1]);
 writeFileSync(task+'/globals-local.sql',roles.map(r=>'CREATE ROLE "'+r+'" NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;').join('\n'));
 native('psql',['--host=127.0.0.1','--port=55468','--username=modalidad_verifier','--dbname=postgres','-X','--single-transaction','--set=ON_ERROR_STOP=1','--file='+task+'/globals-local.sql'],'roles');
 const toc=spawnSync('C:/Program Files/PostgreSQL/17/bin/pg_restore.exe',['--list',backup+'/full.dump'],{env,encoding:'utf8',windowsHide:true});if(toc.status!==0)throw Error('LOCAL_TOC_FAILED');let excluded=0;
 writeFileSync(task+'/use-list.txt',toc.stdout.split('\n').map(l=>{if(/ EXTENSION - supabase_vault\s| COMMENT - EXTENSION supabase_vault\s| TABLE DATA vault secrets\s| EVENT TRIGGER - (issue_graphql_placeholder|issue_pg_cron_access|issue_pg_graphql_access|issue_pg_net_access|pgrst_ddl_watch|pgrst_drop_watch)\s/.test(l)){excluded++;return ';'+l;}return l;}).join('\n'));if(excluded!==9)throw Error('RESTORE_EXCLUSIONS_CHANGED');
 await admin.query('CREATE DATABASE phase48_schema_forensic');
 native('pg_restore',['--host=127.0.0.1','--port=55468','--username=modalidad_verifier','--dbname=phase48_schema_forensic','--no-password','--no-owner','--no-privileges','--single-transaction','--exit-on-error','--use-list='+task+'/use-list.txt',backup+'/full.dump'],'restore');
 }finally{await admin.end();}
 const db=new Client({...cfg,database:'phase48_schema_forensic'});await db.connect();
 try{await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await db.query('SET LOCAL search_path=pg_catalog,public');
 const schema=await collectSchemaForensic(db);await db.query('ROLLBACK');
 if(!existsSync('reports/phase48-schema-backup-catalogs.json'))writeFileSync('reports/phase48-schema-backup-catalogs.json',JSON.stringify({scope:'LOCAL_CERTIFIED_BACKUP',version:'17.11',backup_sha256:sha,restore_exclusions:'9 previously certified Supabase-only entries; no public schema entries excluded',ownership_and_acl:'--no-owner --no-privileges; ACL differences are restoration artifacts',schema,rollback:'CONFIRMED',completed_utc:new Date().toISOString()},null,2)+'\n',{flag:'wx'});
 else {
  if(schema.global_digest!=='2fbba2269828d8573ed10eb5a6749d89e30d62adc75652ac713f375467df19a9'||criticalSchemaDigest(schema.inventory)!==EXPECTED_CRITICAL_SCHEMA_DIGEST)throw Error('LOCAL_BASELINE_NOT_REPRODUCED');
  const cases=[];
  for(const [name,ddl,material] of [['critical column','ALTER TABLE public.cobertura_asignaciones ADD COLUMN phase48_schema_probe integer',true],['unrelated object','CREATE TABLE public.phase48_unrelated_schema_probe (id integer)',false]] as const){
   await db.query('BEGIN');await db.query(ddl);await db.query('SET LOCAL search_path=pg_catalog,public');const sample=await collectSchemaForensic(db),digest=criticalSchemaDigest(sample.inventory);await db.query('ROLLBACK');
   if((digest!==EXPECTED_CRITICAL_SCHEMA_DIGEST)!==material)throw Error('LOCAL_MATERIALITY_TEST_FAILED');cases.push({name,material,detected:digest!==EXPECTED_CRITICAL_SCHEMA_DIGEST,rollback:'CONFIRMED'});
  }
  writeFileSync('reports/phase48-schema-local-validation.json',JSON.stringify({scope:'LOCAL_ONLY',postgresql:'17.11',backup_sha256:sha,legacy_pin_reproduced:schema.global_digest,critical_digest:EXPECTED_CRITICAL_SCHEMA_DIGEST,live_ddl_tests:cases,production_connections:0,production_writes:0,cluster_cleanup:'Launcher stops and removes cluster plus all raw temporaries in finally'},null,2)+'\n',{flag:'wx'});
 }
 console.log(JSON.stringify({local_restore:'PASS',global_digest:schema.global_digest,inventory_counts:Object.fromEntries(Object.entries(schema.inventory).map(([k,v])=>[k,(v as any[]).length]))}));
 }finally{await db.end();}
}
main().catch(()=>{console.error('LOCAL_SCHEMA_RESTORE_OR_CAPTURE_FAILED');process.exitCode=1;});
