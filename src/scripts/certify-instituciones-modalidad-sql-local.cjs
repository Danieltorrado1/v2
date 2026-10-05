// Fixed loopback target: this tool cannot accept a production URL.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {spawnSync} = require('node:child_process');
const {Client} = require('pg');
const root = path.resolve(__dirname, '../..');
const output = path.join(root, 'tmp/modalidad-release-cert');
const backup = 'C:/Users/CORE ULTRA/Documents/EmpiriaBackups/focalizacion-septiembre-pre-import-retry-20261001T125631Z';
const expected = '2e2f0608f609e2e3123e6bfdf56067bae08f11719cc3939ca73d0cdc387f0bc1';
const cluster = path.join(output, 'cluster').replaceAll('\\','/');
const bin = 'C:/Program Files/PostgreSQL/17/bin';
const connection = {host:'127.0.0.1',port:55463,user:'modalidad_verifier',database:'modalidad_release',password:'',connectionTimeoutMillis:5000};
const env = Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^PG|DATABASE_URL|SUPABASE|JWT_|INTEGRACION_/.test(key)));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const invariant = (condition,message)=>{if(!condition)throw Error(message);};
function run(name,args,log) {
  const fd=fs.openSync(path.join(output,log),'wx');
  try {
    const result=spawnSync(path.join(bin,name+'.exe'),args,{env,windowsHide:true,stdio:['ignore',fd,fd]});
    invariant(!result.error && result.status===0,`${name} failed: inspect local ${log}`);
    return result.status;
  } finally {fs.closeSync(fd);}
}
async function identity(client) {
  const row=(await client.query(`SELECT host(inet_server_addr()) host,inet_server_port() port,
    current_setting('server_version') version,current_setting('data_directory') directory,
    current_setting('listen_addresses') listen,current_setting('max_worker_processes') workers,
    current_setting('shared_preload_libraries') preload`)).rows[0];
  invariant(row.host==='127.0.0.1' && row.port===55463 && row.version.startsWith('17.')
    && row.directory.replaceAll('\\','/')===cluster && row.listen==='127.0.0.1'
    && row.workers==='0' && row.preload==='', 'LOCAL_CLUSTER_IDENTITY_MISMATCH');
  return row;
}
async function snapshot(client) {
  const tables=(await client.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`)).rows;
  const data=[];
  for(const {tablename} of tables) {
    const quoted='"'+tablename.replaceAll('"','""')+'"';
    const expression=tablename==='cobertura_asignaciones'
      ? "(to_jsonb(t)-'institucion_id'-'sede_id'-'modalidad_id')::text" : 'to_jsonb(t)::text';
    const row=(await client.query(`SELECT count(*)::text rows,md5(COALESCE(string_agg(${expression},E'\\n' ORDER BY ${expression}),'')) digest FROM public.${quoted} t`)).rows[0];
    data.push({table:tablename,...row});
  }
  const columns=(await client.query(`SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns
    WHERE table_schema='public' AND table_name='cobertura_asignaciones' ORDER BY ordinal_position`)).rows;
  const constraints=(await client.query(`SELECT conname,contype,pg_get_constraintdef(oid) definition FROM pg_constraint
    WHERE conrelid='public.cobertura_asignaciones'::regclass ORDER BY conname`)).rows;
  const indexes=(await client.query(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public'
    AND tablename='cobertura_asignaciones' ORDER BY indexname`)).rows;
  const triggers=(await client.query(`SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) definition
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname`)).rows;
  const functions=(await client.query(`SELECT p.oid::regprocedure::text identity,md5(pg_get_functiondef(p.oid)) digest
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind='f' ORDER BY 1`)).rows;
  const periods=(await client.query(`SELECT estado,count(*)::int count FROM nomina_periodos GROUP BY estado ORDER BY estado`)).rows;
  const coverage=(await client.query(`SELECT count(*)::int count,count(*) FILTER(WHERE activo)::int active FROM cobertura_asignaciones`)).rows[0];
  const coverageFull=(await client.query(`SELECT md5(string_agg(to_jsonb(t)::text,E'\\n' ORDER BY t.id)) digest FROM cobertura_asignaciones t`)).rows[0];
  return {data,columns,constraints,indexes,triggers,functions,periods,coverage,coverageFull};
}
async function main() {
  invariant(fs.existsSync(output),'Create a fresh isolated cluster first');
  const dump=path.join(backup,'full.dump');
  invariant(hash(fs.readFileSync(dump))===expected,'BACKUP_HASH_MISMATCH');
  const manifest=JSON.parse(fs.readFileSync(path.join(backup,'manifest.json'),'utf8').replace(/^\uFEFF/,''));
  // This file is a verified complete dump. Local TOC excludes only provider
  // Vault objects and managed event hooks, as documented in its manifest.
  const report={started_utc:new Date().toISOString(),production_connections:0,production_writes:0,
    backup_sha256:expected,sql_sha256:hash(fs.readFileSync(path.join(root,'sql/phase-48-operational-assignment-identities.sql'))),
    backup_manifest_timestamp:manifest.timestamp_utc,rollback:'NO_DOWN_AVAILABLE',
    local_toc_sha256:hash(fs.readFileSync(path.join(backup,'local-restore-use-list.txt')))};
  const admin=new Client({...connection,database:'postgres'});await admin.connect();
  report.instance=await identity(admin);
  invariant(!(await admin.query('SELECT 1 FROM pg_database WHERE datname=$1',[connection.database])).rows.length,'DATABASE_ALREADY_EXISTS');
  await admin.query('CREATE ROLE authenticated NOLOGIN');
  await admin.query('CREATE DATABASE modalidad_release');await admin.end();
  const common=['--host=127.0.0.1','--port=55463','--username=modalidad_verifier','--dbname=modalidad_release','--no-password'];
  report.restore_exit=run('pg_restore',[...common,'--no-owner','--no-privileges','--exit-on-error','--single-transaction',
    '--use-list='+path.join(backup,'local-restore-use-list.txt'),dump],'restore.log');
  const client=new Client(connection);await client.connect();await identity(client);
  try {
    const baseline=await snapshot(client);
    fs.writeFileSync(path.join(output,'baseline.sanitized.json'),JSON.stringify(baseline,null,2));
    invariant(!baseline.columns.some(row=>['institucion_id','sede_id','modalidad_id'].includes(row.column_name)),'PARTIAL_OR_ALREADY_APPLIED_STOP');
    report.backup_schema_classification='REQUERIDO';report.production_schema_classification='NO_DETERMINABLE';
    const expectedBackfill=(await client.query(`SELECT count(*)::int count FROM cobertura_asignaciones ca JOIN focalizacion_final ff
      ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id`)).rows[0].count;
    run('pg_dump',[...common,'--schema-only','--no-owner','--no-privileges','--file='+path.join(output,'baseline-schema.sql')],'schema-before.log');
    const sql=path.join(root,'sql/phase-48-operational-assignment-identities.sql');
    report.first_exit=run('psql',[...common,'-X','--set=ON_ERROR_STOP=1','--single-transaction','--file='+sql],'sql-first.log');
    const first=await snapshot(client);
    invariant(JSON.stringify(baseline.data)===JSON.stringify(first.data),'PROTECTED_DATA_CHANGED');
    invariant(JSON.stringify(baseline.triggers)===JSON.stringify(first.triggers),'APPLICATION_TRIGGERS_CHANGED');
    invariant(JSON.stringify(baseline.functions)===JSON.stringify(first.functions),'APPLICATION_FUNCTIONS_CHANGED');
    invariant(first.columns.filter(row=>['institucion_id','sede_id','modalidad_id'].includes(row.column_name)&&row.data_type==='bigint'&&row.is_nullable==='YES').length===3,'COLUMN_POSTFLIGHT');
    invariant(first.columns.find(row=>row.column_name==='focalizacion_final_id').is_nullable==='YES','FOCALIZACION_NULLABILITY');
    invariant(first.constraints.length===baseline.constraints.length+3,'FK_POSTFLIGHT');
    invariant(first.indexes.some(row=>row.indexname==='idx_cobertura_asignaciones_timeline'),'INDEX_POSTFLIGHT');
    const backfill=(await client.query(`SELECT count(*) FILTER(WHERE ca.institucion_id=ff.institucion_id AND ca.sede_id=ff.sede_id AND ca.modalidad_id=ff.modalidad_id)::int filled,
      count(*) FILTER(WHERE ca.institucion_id IS DISTINCT FROM ff.institucion_id OR ca.sede_id IS DISTINCT FROM ff.sede_id OR ca.modalidad_id IS DISTINCT FROM ff.modalidad_id)::int mismatched
      FROM cobertura_asignaciones ca JOIN focalizacion_final ff ON ff.id=ca.focalizacion_final_id AND ff.contrato_id=ca.contrato_id`)).rows[0];
    invariant(backfill.filled===expectedBackfill && backfill.mismatched===0,'BACKFILL_POSTFLIGHT');
    report.second_exit=run('psql',[...common,'-X','--set=ON_ERROR_STOP=1','--single-transaction','--file='+sql],'sql-second.log');
    const second=await snapshot(client);
    invariant(JSON.stringify(first)===JSON.stringify(second),'NOT_IDEMPOTENT');
    run('pg_dump',[...common,'--schema-only','--no-owner','--no-privileges','--file='+path.join(output,'postflight-schema.sql')],'schema-after.log');
    report.baseline={tables:baseline.data.length,coverage:baseline.coverage,periods:baseline.periods};
    report.backfill=backfill;report.protected_tables_identical=baseline.data.length;
    report.new_foreign_keys=first.constraints.filter(row=>!baseline.constraints.some(old=>old.conname===row.conname));
    report.idempotent=true;report.functions_unchanged=true;report.triggers_unchanged=true;
    report.local_certification='PASS';report.finished_utc=new Date().toISOString();
    fs.writeFileSync(path.join(root,'reports/instituciones-modalidad-sql-local.json'),JSON.stringify(report,null,2)+'\n');
    fs.writeFileSync(path.join(output,'postflight.sanitized.json'),JSON.stringify(second,null,2));
    console.log(JSON.stringify(report,null,2));
  } finally {await client.end();}
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
