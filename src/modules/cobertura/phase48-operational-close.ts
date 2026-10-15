import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {recordV6Timing,v6TimedSync} from './phase48-v6-timing';
import {readFileSync} from 'node:fs';
import {resolve,relative} from 'node:path';
import certificate from './phase48-operational-certificate.json';
import {requireScoped,scopedDigest} from './phase48-scoped-contract';
import type {ScopedDb} from './phase48-scoped-repository';
function freeze(value:any){if(value&&typeof value==='object'){Object.freeze(value);for(const v of Object.values(value))freeze(v);}return value;}
freeze(certificate);
export const operationalRowDigest=(row:unknown)=>v6TimedSync(String((row as any)?.id)==='1203'&&(row as any)?.fecha_fin==='2026-11-30'?'digest:assignment_1203_before_digest':'row_digest:'+String((row as any)?.id??'unknown'),()=>createHash('sha256').update(JSON.stringify(row)).digest('hex'));
export async function validateCloseRetirement(db:ScopedDb){
 const r=(await db.query(`SELECT LEAST(v.fecha_fin,(SELECT MIN(COALESCE(n.fecha_inicio,n.fecha_fin)) FROM nomina_novedades n JOIN nomina_tipos_novedad t ON t.id=n.tipo_novedad_id WHERE n.vinculacion_id=v.id AND COALESCE(n.activo,TRUE) AND UPPER(TRIM(t.nombre))='FECHA DE RETIRO'))::text retirement FROM vinculaciones v WHERE id=1461`)).rows[0];
 requireScoped(r?.retirement===certificate.close.retirement,'CLOSE1203_EFFECTIVE_RETIREMENT_CHANGED');
}
export function validateOperationalRows(coverage:any[],linkage:any,ff:any,pins:typeof certificate=certificate){
 const closeStart=performance.now();
 const expected=certificate.close,row=coverage.find(r=>String(r.id)===expected.id);
 requireScoped(row,'CLOSE1203_ROW_MISSING');
 for(const k of ['id','vinculacion_id','contrato_id','focalizacion_final_id','municipio_id','modalidad','fecha_inicio','fecha_fin'] as const)requireScoped(String(row[k])===expected[k],'CLOSE1203_PRECONDITION:'+k);
 requireScoped(row.activo===true&&linkage&&ff,'CLOSE1203_CONTEXT_MISSING');
 for(const k of ['persona_id','empresa_id','contrato_id'] as const)requireScoped(String(linkage[k])===expected[k],'CLOSE1203_LINKAGE:'+k);
 requireScoped(String(linkage.id)==='1461'&&linkage.fecha_inicio===expected.fecha_inicio&&linkage.fecha_fin===expected.retirement&&linkage.estado_vinculacion==='RETIRADA','CLOSE1203_RETIREMENT_CHANGED');
 for(const k of ['institucion_id','sede_id','modalidad_id','municipio_id','contrato_id'] as const)requireScoped(String(ff[k])===expected[k],'CLOSE1203_IDENTITY:'+k);
 requireScoped(operationalRowDigest(row)===pins.close.before_digest,'CLOSE1203_BEFORE_DIGEST_CHANGED');
 recordV6Timing('validation:1203',closeStart);const archivesStart=performance.now();
 const archives=certificate.archives.map(rule=>{
  const a=coverage.find(r=>String(r.id)===rule.id),pin=pins.archives.find(p=>p.id===rule.id);
  requireScoped(a&&pin&&a.activo===false&&String(a.vinculacion_id)==='249'&&String(a.contrato_id)==='24'&&String(a.focalizacion_final_id)===rule.focalizacion_final_id&&a.fecha_inicio==='2026-09-03'&&a.fecha_fin==='2026-09-03','ARCHIVED_VERSION_CHANGED:'+rule.id);
  requireScoped(operationalRowDigest(a)===pin.before_digest,'ARCHIVED_BEFORE_DIGEST_CHANGED:'+rule.id);
  return {id:rule.id,classification:'ARCHIVED_INACTIVE_VERSIONS',before_digest:pin.before_digest,will_reactivate:false,will_delete:false,economic_authorization:false};
 });
 recordV6Timing('validation:archives',archivesStart);
 return {close:{...expected,before_digest:pins.close.before_digest,after_digest:operationalRowDigest({...row,fecha_fin:expected.retirement}),new_fecha_fin:expected.retirement,reason:'RETIRO_CONFIRMADO',economic_authorization:false},archives};
}
export async function operationalPins(db:ScopedDb):Promise<typeof certificate>{
 if(process.env.PHASE48_DYNAMIC_LOCAL_CERT!=='true')return certificate;
 // Synthetic fixture pins have no productive path. Local harnesses must
 // identify their exact disposable data directory and dynamic loopback port.
 const r=(await db.query("SELECT host(inet_server_addr()) host,inet_server_port() port,current_user actor,current_database() database,current_setting('data_directory') directory,current_setting('server_version') version")).rows[0];
 const window=process.env.PHASE48_WINDOW_LOCAL_CERT==='true';
 const readQuery=process.env.PHASE48_READ_QUERY_LOCAL_CERT==='true';
 const expectedDirectory=readQuery?process.env.PHASE48_READ_QUERY_LOCAL_CLUSTER:resolve(window?'tmp/phase48-v6-window-local/cluster':'tmp/phase48-pooler-local/dynamic-cluster');
 const expectedPort=readQuery?Number(process.env.PHASE48_READ_QUERY_LOCAL_PORT):55470;
 if(readQuery){const root=resolve('tmp/phase48-v6-read-query-certification');const candidate=resolve(expectedDirectory??'');const rel=relative(root,candidate).replaceAll('\\','/');requireScoped(process.env.PHASE48_WINDOW_LOCAL_CERT==='true'&&process.env.PHASE48_READ_QUERY_LOCAL_PID&&expectedPort>49151&&expectedPort<65536&&/^run-[a-f0-9]{32}\/cluster$/i.test(rel),'READ_QUERY_LOCAL_CERTIFICATE_SCOPE_REQUIRED');}
 requireScoped(r.host==='127.0.0.1'&&r.port===expectedPort&&r.actor==='phase48_dynamic_local'&&r.database==='postgres'&&r.version==='17.11'&&resolve(r.directory)===resolve(expectedDirectory??''),'SYNTHETIC_CERTIFICATE_LOCAL_ONLY');
 const pins=JSON.parse(readFileSync(readQuery||window?'tmp/phase48-v6-window-local/operational-synthetic-pins.json':'tmp/phase48-pooler-local/operational-synthetic-pins.json','utf8'));
 requireScoped(pins.version===certificate.version&&scopedDigest({...pins.close,before_digest:certificate.close.before_digest})===scopedDigest(certificate.close)&&pins.archives.length===7,'SYNTHETIC_CERTIFICATE_SCOPE_CHANGED');
 return pins;
}
export {certificate as OPERATIONAL_CERTIFICATE};
