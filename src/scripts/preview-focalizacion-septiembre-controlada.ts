import { readFileSync,writeFileSync } from 'node:fs';
import { parse } from 'dotenv';
import { Client } from 'pg';
import { APPROVED_SHA256,SCOPE,inspectWorkbook,readOnlyTransaction,compare,hash,metrics,assertScope,existingDisposition,type TechnicalRow } from '../modules/cobertura/septiembre-controlled-preview';
import { normalizeFocalizacionText as norm,calculateCoverageFromRule } from '../modules/cobertura/cobertura.focalizacion.domain';
import { loadCoverageRuleForContext } from '../modules/cobertura/cobertura.rules.service';

async function main(){
 const args=process.argv.slice(2),options:Record<string,string>={};
 for(let i=0;i<args.length;i+=2){if(!['--file','--credentials-env','--output','--actor-id'].includes(args[i]??'')||!args[i+1])throw Error('PREVIEW_ONLY_ARGUMENTS_REQUIRED');options[args[i]!]=args[i+1]!;}
 if(!options['--file']||!options['--credentials-env']||!options['--output'])throw Error('FILE_CREDENTIALS_OUTPUT_REQUIRED');
 const input=inspectWorkbook(readFileSync(options['--file']));
 if(input.sha256!==APPROVED_SHA256)throw Error('APPROVED_FILE_HASH_MISMATCH');
 const response=await fetch('https://api.empiriasuite.com/api/health');
 const publicHealth=await response.json() as any;
 const h=publicHealth.data,o=h?.integracion_outbox;
 if(response.status!==200||publicHealth.success!==true||h?.status!=='ok'||h?.database?.status!=='ok'||[o?.configured,o?.enabled,o?.started,o?.running,o?.recalc?.requested,o?.recalc?.active].some(v=>v!==false))throw Error('PUBLIC_HEALTH_OR_FLAGS_FAILED');
 const credentials=parse(readFileSync(options['--credentials-env']));
 if(!credentials.DATABASE_URL)throw Error('DATABASE_CREDENTIAL_REQUIRED');
 const client=new Client({connectionString:credentials.DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000});
 await client.connect();
 try{
 const report=await readOnlyTransaction(client,async()=>{
  await client.query("SET LOCAL statement_timeout='30s'");
  const contract=(await client.query('SELECT id::text,empresa_id::text,fecha_inicio::text,fecha_finalizacion::text,activo FROM contratos WHERE id=24 AND empresa_id=15')).rows[0];
  if(!contract?.activo||contract.fecha_inicio>SCOPE.desde||contract.fecha_finalizacion<SCOPE.hasta)throw Error('CONTRACT_SCOPE_OR_DATES_INVALID');
  assertScope(Number(contract.empresa_id),Number(contract.id));
  const cargas=(await client.query(`SELECT id::text,archivo_sha256,fecha_inicio_vigencia::text,fecha_fin_vigencia::text,estado FROM focalizacion_cargas WHERE contrato_id=24 ORDER BY id`)).rows;
  const existing=cargas.filter(c=>(c.fecha_inicio_vigencia<=SCOPE.hasta&&c.fecha_fin_vigencia>=SCOPE.desde)||c.archivo_sha256===input.sha256);
  const reasons:string[]=[];
  const disposition=existingDisposition(existing);
  if(disposition!=='NEW')reasons.push(disposition==='MATCH_REQUIRES_POSTFLIGHT'?'ALREADY_IMPORTED_NOOP_VERIFY_POSTFLIGHT':'SEPTEMBER_EXISTS_CONFLICT');
  const municipios=(await client.query('SELECT id::text,codigo_dane,nombre_municipio FROM municipios')).rows;
  const institutions=(await client.query('SELECT id::text,municipio_id::text,codigo_dane,nombre_institucion FROM instituciones WHERE contrato_id=24 AND COALESCE(activo,TRUE)')).rows;
  const sites=(await client.query('SELECT s.id::text,s.institucion_id::text,s.municipio_id::text,s.codigo_dane,s.consecutivo_sede,s.nombre_sede FROM sedes s JOIN instituciones i ON i.id=s.institucion_id WHERE i.contrato_id=24 AND COALESCE(s.activo,TRUE)')).rows;
  const modes=(await client.query('SELECT id::text,codigo_original,nombre_modalidad FROM modalidades WHERE COALESCE(activo,TRUE)')).rows;
  const aliases=(await client.query('SELECT modalidad_id::text,alias FROM modalidad_aliases WHERE COALESCE(activo,TRUE)')).rows;
  const proposed:TechnicalRow[]=input.rows.map(r=>{
   const errors=[...r.issues];
   const explicitMunicipality=municipios.filter(m=>[m.codigo_dane,m.nombre_municipio].some(v=>norm(v)===norm(String(r.municipio??''))));
   const embedded=String(r.consecutivo??'').replace(/\D/g,'').slice(1,6);
   const municipality=explicitMunicipality.length===1?explicitMunicipality[0]:municipios.filter(m=>m.codigo_dane===embedded).length===1?municipios.find(m=>m.codigo_dane===embedded):null;
   const matching=sites.filter(s=>norm(s.consecutivo_sede)===norm(String(r.consecutivo??'')));
   const site=matching.length===1?matching[0]:null;
   const institution=site?institutions.find(i=>i.id===site.institucion_id):null;
   const exact=modes.filter(m=>[m.codigo_original,m.nombre_modalidad].some(v=>norm(v)===norm(String(r.modalidad??''))));
   const alias=aliases.filter(a=>norm(a.alias)===norm(String(r.modalidad??'')));
   const mode=exact.length===1?exact[0]:alias.length===1?modes.find(m=>m.id===alias[0].modalidad_id):null;
   if(!municipality)errors.push('MUNICIPIO_NO_RESUELTO');
   if(!site||!institution)errors.push('SEDE_INSTITUCION_NO_RESUELTA_SIN_AUTOCREACION');
   if(!mode)errors.push('MODALIDAD_NO_RESUELTA');
   if(institution&&norm(institution.nombre_institucion)!==norm(String(r.institucion??'')))errors.push('INSTITUCION_NOMBRE_DIFIERE');
   if(site&&norm(site.nombre_sede)!==norm(String(r.sede??'')))errors.push('SEDE_NOMBRE_DIFIERE');
   if(municipality&&institution&&String(institution.municipio_id)!==String(municipality.id))errors.push('INSTITUCION_MUNICIPIO_DIFIERE');
   if(site?.municipio_id&&municipality&&String(site.municipio_id)!==String(municipality.id))errors.push('SEDE_MUNICIPIO_DIFIERE');
   for(const [field,record] of [['dane_institucion',institution],['dane_sede',site]] as const)if(r[field]!=null&&String(r[field]).trim()&&String(r[field]).trim()!==String(record?.codigo_dane??'').trim())errors.push('DANE_DIFIERE:'+field);
   return {fila:r.fila,municipio_id:municipality?.id??null,institucion_id:institution?.id??null,sede_id:site?.id??null,modalidad_id:mode?.id??null,
    catalogo_institucion_municipio_id:institution?.municipio_id??null,catalogo_sede_municipio_id:site?.municipio_id??null,
    ...Object.fromEntries(metrics.map(k=>[k,r[k]])),reasons:errors};
  });
  const auxiliary=proposed.filter(r=>r.reasons.includes('IDENTIDAD_INCOMPLETA'));
  const candidates=proposed.filter(r=>!r.reasons.includes('IDENTIDAD_INCOMPLETA'));
  if(auxiliary.length)reasons.push('ANCILLARY_INCOMPLETE_ROWS_REQUIRE_EXPLICIT_EXCLUSION_REVIEW');
  const keys=candidates.map(r=>r.sede_id+'|'+r.modalidad_id);
  const unique=new Set(keys);
  if(candidates.length!==688||unique.size!==688)reasons.push('ROW_COUNT_OR_DUPLICATE_MISMATCH');
  if(proposed.some(r=>r.reasons.length))reasons.push('ROW_VALIDATION_FAILED');
  if(input.missing_optional_columns.length)reasons.push('DANE_JORNADA_NOT_EXPLICIT_IN_SOURCE_REVIEW_REQUIRED');
  const august=(await client.query('SELECT municipio_id::text,institucion_id::text,sede_id::text,modalidad_id::text,techo_primaria,techo_secundaria,techo_total,focalizacion_primaria,focalizacion_secundaria,focalizacion_total,cobertura_requerida,vigente_desde::text,vigente_hasta::text FROM focalizacion_vigencias WHERE contrato_id=24 AND carga_id=4 ORDER BY id')).rows;
  if(august.length!==687)reasons.push('AUGUST_BASELINE_CHANGED');
  const delta=compare(august as TechnicalRow[],candidates);
  const counts=delta.counts;
  if(counts.altas!==25||counts.bajas!==24||counts.modalidades!==24||counts.cambios_metricas!==398)reasons.push('UNEXPLAINED_BASELINE_DELTA');
  const rules=new Map<string,any>();
  for(const id of new Set(candidates.map(r=>r.modalidad_id).filter(Boolean))){
   const first=await loadCoverageRuleForContext(client as never,{contratoId:24,modalidadId:Number(id),fechaVigencia:SCOPE.desde});
   const last=await loadCoverageRuleForContext(client as never,{contratoId:24,modalidadId:Number(id),fechaVigencia:SCOPE.hasta});
   if(!first||!last||first.id!==last.id){reasons.push('COVERAGE_MISSING_OR_CHANGING:'+id);continue;}
   rules.set(id!,first);
  }
  const transitions=(await client.query(`SELECT id::text,modalidad_id::text,vigencia_desde::text,vigencia_hasta::text FROM calculadora_personal_config WHERE estado='activo' AND COALESCE(dominio_calculo,'GENERAL')='COBERTURA_PAE' AND (contrato_id=24 OR contrato_id IS NULL) AND vigencia_desde<='2026-09-30' AND (vigencia_hasta IS NULL OR vigencia_hasta>='2026-09-01') AND (vigencia_desde>'2026-09-01' OR (vigencia_hasta IS NOT NULL AND vigencia_hasta<'2026-09-30'))`)).rows;
  if(transitions.length)reasons.push('INTRAMONTH_COVERAGE_TRANSITION_REVIEW');
  const coverage=candidates.map(r=>{
    const rule=rules.get(r.modalidad_id??'');
    if(!rule||typeof r.focalizacion_total!=='number')return {fila:r.fila,sede_id:r.sede_id,modalidad_id:r.modalidad_id,rule_id:null,personal:null};
    const calculated=calculateCoverageFromRule(rule,r.focalizacion_total);
    if(calculated.status!=='OK'||calculated.manipuladores_requeridos===null)reasons.push('COVERAGE_UNRESOLVED:'+r.fila);
    return {fila:r.fila,sede_id:r.sede_id,modalidad_id:r.modalidad_id,rule_id:rule.id,personal:calculated.manipuladores_requeridos};
  });
  const payroll=(await client.query('SELECT id::text,estado,activo,fecha_inicio::text,fecha_fin::text FROM nomina_periodos WHERE contrato_id=24 ORDER BY id')).rows;
  let actorValidated=false;
  if(options['--actor-id']){
   if(!/^\d+$/.test(options['--actor-id']))throw Error('INVALID_ACTOR');
   actorValidated=(await client.query('SELECT id FROM usuarios WHERE id=$1::bigint AND activo=TRUE',[options['--actor-id']])).rows.length===1;
   if(!actorValidated)reasons.push('ACTOR_NOT_VALID');
  }
  const stable=candidates.map(r=>({...r,rule_id:coverage.find(c=>c.fila===r.fila)?.rule_id,personal:coverage.find(c=>c.fila===r.fila)?.personal})).sort((a,b)=>Number(a.sede_id)-Number(b.sede_id)||Number(a.modalidad_id)-Number(b.modalidad_id));
  const oldRequired=august.reduce((sum,r)=>sum+Number(r.cobertura_requerida??0),0);
  const newRequired=coverage.every(c=>c.personal!==null)?coverage.reduce((sum,c)=>sum+Number(c.personal),0):null;
  const tables=(await client.query(`SELECT conrelid::regclass::text tabla,confrelid::regclass::text referencia FROM pg_constraint WHERE contype='f' AND (conrelid::regclass::text ILIKE '%focalizacion%' OR confrelid::regclass::text ILIKE '%focalizacion%') ORDER BY 1,2`)).rows;
  return {mode:'PreviewOnly',writes:0,status:reasons.length?'PREVIEW_DETENIDO':'PREVIEW_VALIDADO_NO_AUTORIZADO',scope:SCOPE,
    public_health:{http:response.status,status:h.status,database:h.database.status,outbox:o.enabled,worker_started:o.started,worker_running:o.running,recalc_requested:o.recalc.requested,recalc_active:o.recalc.active,sync:false,sync_evidence:'MANUAL_RENDER_CONFIRMATION',timestamp:h.timestamp},
    source:{approved_by_user:true,sha256:input.sha256,size_bytes:input.size_bytes,sheet_count:input.sheets.length,sheets:input.sheets.map((name,index)=>({technical_id:'sheet_'+(index+1),name_sha256:hash(name),selected:name===input.selected_sheet})),selected_sheet:input.selected_sheet,headers:input.headers,group_headers:input.group_headers,physical_rows:input.physical_rows_after_header,blank_rows:input.blank_rows,nonblank_rows:input.rows.length,data_rows:candidates.length,missing_explicit_fields:input.missing_optional_columns},
    combinations:unique.size,delta,rows:stable,auxiliary_rows:auxiliary,blocking:[...new Set(reasons)],actor_validated:actorValidated,
    coverage:{agosto:oldRequired,septiembre:newRequired,difference:newRequired===null?null:newRequired-oldRequired,by_combination:coverage,transitions},
    august_digest:hash(august),final_set_digest:hash({scope:SCOPE,source:input.sha256,rows:stable}),payroll_readonly:payroll,
    proposed_load:{id:null,empresa_id:15,contrato_id:24,mes:'2026-09',desde:SCOPE.desde,hasta:SCOPE.hasta,estado:'PROCESADO',vigencias:688},
    future_write_allowlist:['focalizacion_cargas','focalizacion_preliminar','focalizacion_vigencias','focalizacion_final','auditoria','auditoria_eventos','historial_cambios'],
    forbidden_writes:['carga4','vigencias_agosto','instituciones','sedes','modalidades','nomina_periodos','nomina_empleados','asignaciones','outbox'],
    expected_counts:{inserted_vigencias:688,updated_august:0,rejected:0},audit_proposal:{action:'focalizacion.septiembre.controlled-import',actor_required:true,actor_id:options['--actor-id']??null},
    mutation_implemented:false,backup_required:'FULL_POSTGRESQL_17',foreign_key_dependencies:tables};
 });
 writeFileSync(options['--output'],JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,rows:undefined,delta:report.delta.counts,coverage:{...report.coverage,by_combination:undefined},payroll_readonly:undefined},null,2));
 }finally{await client.end();}
}
void main().catch(e=>{console.error({code:'PREVIEW_FAILED',message:e.message});process.exitCode=1;});
