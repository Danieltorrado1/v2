import { createHash } from 'node:crypto';
import * as XLSX from 'xlsx';
import { normalizeFocalizacionText as norm } from './cobertura.focalizacion.domain';

export const SCOPE = Object.freeze({ empresa_id:15, contrato_id:24, mes:'2026-09', desde:'2026-09-01', hasta:'2026-09-30', carga_agosto:4 });
export const APPROVED_SHA256 = '745e04bbf1cc51ed194e5514704c3441b2b9088e34fe513f2e8f2ecf9db566a3';
export const metrics = ['techo_primaria','techo_secundaria','techo_total','focalizacion_primaria','focalizacion_secundaria','focalizacion_total'] as const;
export type TechnicalRow = { fila:number; municipio_id:string|null; institucion_id:string|null; sede_id:string|null; modalidad_id:string|null; reasons:string[]; [key:string]:unknown };
export const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Stable object keys; array order remains part of the certified contract. */
export function canonicalHash(value:unknown):string {
 const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v!==null&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
 return hash(canonical(value));
}
export const APPROVED_EXCLUSIONS = Object.freeze([
 {fila:691,motivo:'TOTAL_DEPARTAMENTAL'}, {fila:692,motivo:'RESIDUO_FORMULA'},
 {fila:693,motivo:'FORMULA_REF'}, {fila:697,motivo:'LEYENDA'}, {fila:699,motivo:'SEPARADOR'}
]);
export function approvedOperationalRows(input:ReturnType<typeof inspectWorkbook>){
 if(input.sha256!==APPROVED_SHA256)throw Error('APPROVED_FILE_HASH_MISMATCH');
 for(const e of APPROVED_EXCLUSIONS){
  const r=input.rows.find(r=>r.fila===e.fila);
  if(!r||!r.issues.includes('IDENTIDAD_INCOMPLETA'))throw Error('EXCLUSION_EVIDENCE_CHANGED:'+e.fila);
 }
 return input.rows.filter(r=>!APPROVED_EXCLUSIONS.some(e=>e.fila===r.fila));
}
export function resolveApprovedMunicipality(source:Record<string,unknown>,institution:any,site:any,municipalities:any[],august:any[],empresa=15,contrato=24){
 assertScope(empresa,contrato);
 const approved=Number(source.fila)>=491&&Number(source.fila)<=499||Number(source.fila)>=514&&Number(source.fila)<=529;
 if(approved){
  const id=Number(source.fila)<=499?'83':'86';
  const text=id==='83'?'CE LA SABANA':'INSTITUCION EDUCATIVA LA PRIMAVERA';
  const m=municipalities.find(m=>m.id==='734'&&m.nombre_municipio==='PUERTO RICO'&&m.nombre_departamento==='META');
  if(source.municipio!=='PUERTO RICO'||source.institucion!==text||!m||institution?.id!==id||institution.municipio_id!=='734'||site?.institucion_id!==id||site.municipio_id!=='734'||!august.some(a=>a.sede_id===site.id&&a.institucion_id===id&&a.municipio_id==='734'))throw Error('APPROVED_RESOLUTION_EVIDENCE_CHANGED:'+source.fila);
  return m;
 }
 const m=municipalities.find(m=>m.id===institution?.municipio_id&&m.id===site?.municipio_id&&norm(m.nombre_municipio)===norm(String(source.municipio??'')));
 return m??null;
}
export const EXPECTED_COUNTS=Object.freeze({agosto:687,septiembre:688,altas:25,bajas:24,modalidades:24,cupos:393,matriculados:367,cambios_metricas:398,instituciones_afectadas:108,sedes_afectadas:358});
export function assertCertifiedCounts(counts:Record<string,number>,rows:TechnicalRow[],coverage:number|null,difference:number|null){
 for(const [k,v]of Object.entries(EXPECTED_COUNTS))if(counts[k]!==v)throw Error('CERTIFIED_COUNT_MISMATCH:'+k+':'+counts[k]+'!='+v);
 if(rows.length!==688||new Set(rows.map(r=>r.sede_id+'|'+r.modalidad_id)).size!==688||rows.some(r=>r.reasons.length||!r.municipio_id||!r.institucion_id||!r.sede_id||!r.modalidad_id)||coverage!==695||difference!==33)throw Error('CERTIFIED_FINAL_SET_MISMATCH');
}
/** Preparation contract only. Even complete evidence cannot enable mutation. */
export const FUTURE_REQUIRED_GATES=Object.freeze(['exact_file_sha','exact_snapshot_digest','tenant_15_contract_24','exact_dates','active_actor_tenant_rbac','postgresql_17','verified_full_backup_restoration','advisory_lock','flags_off_worker_stopped','september_absent','august_4_digest_intact','single_transaction','total_rollback','idempotency','strict_audit','postflight','second_execution_no_duplicates','no_catalog_creation','no_personal_planilla_nomina_propagation','no_economic_recalculation']);
export function assertFutureEvidence(proofs:Record<string,boolean>){
 for(const gate of FUTURE_REQUIRED_GATES)if(proofs[gate]!==true)throw Error('FUTURE_GATE_REQUIRED:'+gate);
 throw Error('MUTATION_NOT_IMPLEMENTED');
}
export function assertScope(empresa:number,contrato:number){
 if(empresa!==SCOPE.empresa_id||contrato!==SCOPE.contrato_id)throw Error('TENANT_SCOPE_FORBIDDEN');
}
export function existingDisposition(rows:Array<{archivo_sha256:string;fecha_inicio_vigencia:string;fecha_fin_vigencia:string}>){
 if(!rows.length)return 'NEW';
 return rows.length===1&&rows[0]!.archivo_sha256===APPROVED_SHA256&&rows[0]!.fecha_inicio_vigencia===SCOPE.desde&&rows[0]!.fecha_fin_vigencia===SCOPE.hasta?'MATCH_REQUIRES_POSTFLIGHT':'CONFLICT';
}

/** Does not coerce arbitrary strings/null into zero or silently discard incomplete data rows. */
export function inspectWorkbook(bytes:Buffer) {
 const workbook=XLSX.read(bytes,{type:'buffer'});
 const sheet=workbook.SheetNames.find(s=>norm(s)==='DETALLADO');
 if(!sheet)throw Error('DETALLADO_REQUIRED');
 const raw=XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheet]!,{header:1,raw:true,defval:null});
 const header=raw.findIndex(row=>row.some(v=>norm(String(v??''))==='CONSECUTIVO')&&row.some(v=>norm(String(v??''))==='SEDE EDUCATIVA'));
 if(header<0)throw Error('HEADERS_REQUIRED');
 const columns:Record<string,number>={};let group='';
 const groupHeaders=raw[header-1]??[],headers=raw[header]!;
 headers.forEach((v,i)=>{
   if(groupHeaders[i]!=null&&String(groupHeaders[i]).trim())group=norm(String(groupHeaders[i]));
   const n=norm(String(v??''));
   const identity:Record<string,string>={'CONSECUTIVO':'consecutivo','MUNICIPIO':'municipio','INSTITUCION EDUCATIVA':'institucion','SEDE EDUCATIVA':'sede','MODALIDAD':'modalidad','JORNADA':'jornada'};
   if(identity[n])columns[identity[n]!]=i;
   if(n.startsWith('CODIGO DANE')||n==='DANE')columns[n.includes('INSTITUCION')?'dane_institucion':'dane_sede']=i;
   if(n.startsWith('MODALIDAD '))columns.modalidad=i;
   if(['PRIMARIA','SECUNDARIA','TOTAL'].includes(n)){
    if(group.startsWith('TECHO'))columns['techo_'+n.toLowerCase()]=i;
    if(group.startsWith('FOCALIZACION'))columns['focalizacion_'+n.toLowerCase()]=i;
   }
 });
 const required=['consecutivo','municipio','institucion','sede','modalidad',...metrics];
 const missing=required.filter(k=>columns[k]===undefined);
 if(missing.length)throw Error('MISSING_COLUMNS:'+missing.join(','));
 let blank=0;const rows:Array<Record<string,unknown>&{fila:number;issues:string[]}>=[];
 for(let i=header+1;i<raw.length;i++){
  const cells=raw[i]!;
  if(cells.every(v=>v==null||String(v).trim()==='')){blank++;continue;}
  const row:Record<string,unknown>&{fila:number;issues:string[]}={fila:i+1,issues:[]};
  for(const [key,index]of Object.entries(columns))row[key]=cells[index]??null;
  if(['consecutivo','municipio','institucion','sede','modalidad'].some(k=>row[k]==null||!String(row[k]).trim()))row.issues.push('IDENTIDAD_INCOMPLETA');
  for(const key of metrics){
   const v=row[key];
   if(v==null||v===''){row[key]=null;row.issues.push('NUMERO_FALTANTE:'+key);}
   else if(typeof v!=='number'||!Number.isInteger(v)||v<0)row.issues.push('NUMERO_INVALIDO:'+key);
  }
  for(const prefix of ['techo','focalizacion'])if(typeof row[prefix+'_total']==='number'&&typeof row[prefix+'_primaria']==='number'&&typeof row[prefix+'_secundaria']==='number'&&row[prefix+'_total']!==(row[prefix+'_primaria'] as number)+(row[prefix+'_secundaria'] as number))row.issues.push('TOTAL_DIFIERE_DESGLOSE:'+prefix);
  rows.push(row);
 }
 return {sha256:createHash('sha256').update(bytes).digest('hex'),size_bytes:bytes.length,sheets:workbook.SheetNames,selected_sheet:sheet,header_row:header+1,
  headers:headers.map(v=>String(v??'')),group_headers:groupHeaders.map(v=>String(v??'')),columns,rows,physical_rows_after_header:raw.length-header-1,blank_rows:blank,
  missing_optional_columns:['dane_institucion','dane_sede','jornada'].filter(k=>columns[k]===undefined)};
}

export interface Executor {query(sql:string,values?:any[]):Promise<{rows:any[]}>}
/** No mutation option exists: callers cannot activate DML through a flag. */
export async function readOnlyTransaction<T>(db:Executor, work:()=>Promise<T>, mode='PreviewOnly'):Promise<T>{
 if(mode!=='PreviewOnly')throw Error('MUTATION_NOT_IMPLEMENTED');
 await db.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try {
  const readOnly=(await db.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only;
  if(readOnly!=='on')throw Error('READ_ONLY_REQUIRED');
  const locked=(await db.query('SELECT pg_try_advisory_xact_lock(15,24092026) AS locked')).rows[0]?.locked;
  if(!locked)throw Error('MONTHLY_LOCK_BUSY');
  return await work();
 }finally{await db.query('ROLLBACK');}
}

export function compare(previous:TechnicalRow[],proposed:TechnicalRow[]){
 const key=(r:TechnicalRow)=>r.sede_id+'|'+r.modalidad_id;
 const before=new Map(previous.map(r=>[key(r),r])),after=new Map(proposed.map(r=>[key(r),r]));
 const additions=proposed.filter(r=>!before.has(key(r))),removals=previous.filter(r=>!after.has(key(r)));
 const common=proposed.filter(r=>before.has(key(r)));
 const cups=common.filter(r=>metrics.slice(0,3).some(k=>r[k]!==before.get(key(r))![k]));
 const enrolment=common.filter(r=>metrics.slice(3).some(k=>r[k]!==before.get(key(r))![k]));
 const changed=common.filter(r=>metrics.some(k=>r[k]!==before.get(key(r))![k]));
 const substitutions=additions.filter(r=>removals.some(p=>p.sede_id===r.sede_id));
 const affected=[...additions,...removals,...changed];
 const ids=(rows:TechnicalRow[])=>rows.map(r=>({institucion_id:r.institucion_id,sede_id:r.sede_id,modalidad_id:r.modalidad_id}));
 return {counts:{agosto:previous.length,septiembre:proposed.length,altas:additions.length,bajas:removals.length,sin_cambios:common.length-changed.length,
  modalidades:substitutions.length,cupos:cups.length,matriculados:enrolment.length,cambios_metricas:changed.length,
  instituciones_afectadas:new Set(affected.map(r=>r.institucion_id)).size,sedes_afectadas:new Set(affected.map(r=>r.sede_id)).size},
  altas:ids(additions),bajas:ids(removals),modalidades:ids(substitutions),cupos:ids(cups),matriculados:ids(enrolment),
  instituciones_afectadas:[...new Set(affected.map(r=>r.institucion_id))].sort(),
  sedes_afectadas:[...new Set(affected.map(r=>r.sede_id))].sort(),
  cambios:changed.map(r=>({ ...ids([r])[0],antes:Object.fromEntries(metrics.map(k=>[k,before.get(key(r))![k]])),despues:Object.fromEntries(metrics.map(k=>[k,r[k]]))}))};
}
