// Read-only certification helpers plus disposable-cluster role provisioning. No environment/remote configuration.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
exports.evidence=(local,backup,out)=>{
const hash=x=>crypto.createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const qi=x=>'"'+x.replaceAll('"','""')+'"',need=(v,c)=>{if(!v)throw Error(c)};
const read=n=>JSON.parse(fs.readFileSync(path.join(backup,n),'utf8')),write=(n,v)=>fs.writeFileSync(path.join(out,n),JSON.stringify(v,null,2)+'\n');
async function tableHash(c,s,t,where=''){return(await c.query(`SELECT count(*)::text AS count,encode(sha256(convert_to(COALESCE(string_agg(to_jsonb(t)::text,E'\n' ORDER BY to_jsonb(t)::text),''),'UTF8')),'hex') AS sha256 FROM ${qi(s)}.${qi(t)} t ${where}`)).rows[0];}
async function caseRows(){const o={};for(const[t,id]of[['cobertura_cuentas_cobro_externas',77],['cobertura_cuenta_cobro_externa_detalle',220],['nomina_movimientos',192],['nomina_revision_operativa',20114],['nomina_novedad_turnos',202]])o[t]=(await local.query(`SELECT to_jsonb(t) AS row FROM public.${qi(t)} t WHERE id=$1`,[id])).rows[0].row;return o;}
async function objectInventory(){return{
 tables:(await local.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind,c.relowner::regrole::text AS owner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname !~ '^pg_toast|^pg_temp' AND c.relkind IN('r','p','S','v','m','f') ORDER BY 1,2`)).rows,
 functions:(await local.query(`SELECT n.nspname AS schema,p.oid::regprocedure::text AS name,p.proowner::regrole::text AS owner,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_sha256 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN('pg_catalog','information_schema') AND n.nspname !~ '^pg_temp' AND p.prokind IN('f','p') ORDER BY 1,2`)).rows,
 constraints:(await local.query(`SELECT n.nspname AS schema,c.relname AS relation,k.conname AS name,k.contype AS type,pg_get_constraintdef(k.oid) AS definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN('pg_catalog','information_schema') ORDER BY 1,2,3`)).rows,
 indexes:(await local.query(`SELECT schemaname AS schema,tablename AS relation,indexname AS name,indexdef AS definition FROM pg_indexes WHERE schemaname NOT IN('pg_catalog','information_schema') ORDER BY 1,2,3`)).rows,
 triggers:(await local.query(`SELECT n.nspname AS schema,c.relname AS relation,t.tgname AS name,t.tgenabled AS enabled,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN('pg_catalog','information_schema') ORDER BY 1,2,3`)).rows,
 events:(await local.query(`SELECT evtname AS name,evtevent AS event,evtenabled AS enabled,evtowner::regrole::text AS owner FROM pg_event_trigger ORDER BY 1`)).rows};}
async function checkObjects(){const a=read('restored-object-inventory.json'),b=await objectInventory(),eq=[],summary={};
 for(const kind of Object.keys(b)){const expected=a[kind].filter(x=>x.schema!=='vault'),actual=b[kind].filter(x=>x.schema!=='vault');const key=x=>[x.schema,x.relation,x.name].join('|'),byKey=new Map(actual.map(x=>[key(x),x]));let equivalences=0;const differences=[];for(const x of expected){const y=byKey.get(key(x));if(hash(x)!==hash(y)){if(eq.some(e=>e.kind===kind&&hash(e.source)===hash(x)&&hash(e.restored)===hash(y)))equivalences++;else differences.push({name:x.name,relation:x.relation??null,source_sha256:hash(x),restored_sha256:hash(y??null)});}}const expectedKeys=new Set(expected.map(key));const additions=actual.filter(x=>!expectedKeys.has(key(x))).map(x=>x.name);summary[kind]={expected:expected.length,actual:actual.length,equivalences,differences,additions};need(!differences.length&&!additions.length,'OBJECT_DRIFT_'+kind);}
 write('object-comparison.json',summary);return summary;
}
async function provision(createRole=true){if(createRole)await local.query('CREATE ROLE nomina202_integral_local NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS');await local.query(`
 GRANT USAGE ON SCHEMA public TO nomina202_integral_local;GRANT SELECT ON ALL TABLES IN SCHEMA public TO nomina202_integral_local;
 GRANT UPDATE(cantidad,valor_calculado,valor_total,updated_by,updated_at) ON nomina_movimientos TO nomina202_integral_local;
 GRANT UPDATE(valor) ON cobertura_cuenta_cobro_externa_detalle TO nomina202_integral_local;
 GRANT UPDATE(valor_total,generado_bucket,generado_path,generado_at,updated_by,updated_at) ON cobertura_cuentas_cobro_externas TO nomina202_integral_local;
 GRANT UPDATE(estado_revision,version_revision,revisado_por,revisado_at,invalidado_at,motivo_invalidacion,updated_at) ON nomina_revision_operativa TO nomina202_integral_local;
 GRANT INSERT(periodo_id,nomina_empleado_id,persona_id,vinculacion_id,estado_revision,invalidado_at,motivo_invalidacion,updated_at) ON nomina_revision_operativa TO nomina202_integral_local;
 GRANT INSERT ON auditoria,auditoria_eventos,historial_cambios TO nomina202_integral_local;
 GRANT USAGE,SELECT ON SEQUENCE nomina_revision_operativa_id_seq,auditoria_id_seq,auditoria_eventos_id_seq,historial_cambios_id_seq TO nomina202_integral_local;`);}
function compare(a,b){const byKey=new Map(b.map(x=>[x.schema+'.'+x.table,x]));return a.map(x=>({schema:x.schema,table:x.table,before_count:x.count,after_count:byKey.get(x.schema+'.'+x.table)?.count,before_sha256:x.sha256,after_sha256:byKey.get(x.schema+'.'+x.table)?.sha256,changed:hash(x)!==hash(byKey.get(x.schema+'.'+x.table))}));}
return{tableHash,caseRows,objectInventory,checkObjects,provision,compare};
};
