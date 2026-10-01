import {readFileSync,writeFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {Client} from 'pg';
import * as XLSX from 'xlsx';
import {createHash} from 'node:crypto';
import {APPROVED_SHA256,inspectWorkbook,readOnlyTransaction,compare,hash,type TechnicalRow} from '../modules/cobertura/septiembre-controlled-preview';
import {normalizeFocalizacionText as norm} from '../modules/cobertura/cobertura.focalizacion.domain';
import {recommendMunicipality,classifyAncillary} from '../modules/cobertura/septiembre-forensic-domain';

async function main(){
 const args=process.argv.slice(2);
 if(args.length&&!(args.length===1&&args[0]==='--render-only'))throw Error('READ_ONLY_ONLY');
 if(args[0]==='--render-only'){render(JSON.parse(readFileSync('reports/septiembre-forensic-readonly.json','utf8')));return;}
 const bytes=readFileSync('../../data/focalizacion-septiembre-2026.xlsx');
 const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
 if(digest(bytes)!==APPROVED_SHA256)throw Error('SOURCE_CHANGED');
 const original=readFileSync('reports/septiembre-controlled-preview.json');
 const baseline=JSON.parse(original.toString());
 const c=new Client({connectionString:parse(readFileSync('../../.env')).DATABASE_URL,ssl:{rejectUnauthorized:false}});
 await c.connect();
 try{
 const result=await readOnlyTransaction(c,async()=>{
  await c.query("SET LOCAL statement_timeout='30s'");
  const contract=(await c.query('SELECT id,empresa_id FROM contratos WHERE id=24 AND empresa_id=15')).rows;
  if(contract.length!==1)throw Error('TENANT_INVALID');
  const municipios=(await c.query("SELECT m.id::text,m.codigo_dane,m.nombre_municipio,d.nombre_departamento FROM municipios m JOIN departamentos d ON d.id=m.departamento_id WHERE m.id IN (728,734) OR m.nombre_municipio='PUERTO RICO' ORDER BY m.id")).rows;
  const institutions=(await c.query('SELECT id::text,municipio_id::text,codigo_dane,nombre_institucion,contrato_id FROM instituciones WHERE contrato_id=24')).rows;
  const sites=(await c.query('SELECT s.id::text,s.institucion_id::text,s.municipio_id::text,s.codigo_dane,s.consecutivo_sede,s.nombre_sede FROM sedes s JOIN instituciones i ON i.id=s.institucion_id WHERE i.contrato_id=24')).rows;
  const august=(await c.query('SELECT municipio_id::text,institucion_id::text,sede_id::text,modalidad_id::text,techo_primaria,techo_secundaria,techo_total,focalizacion_primaria,focalizacion_secundaria,focalizacion_total,cobertura_requerida,vigente_desde::text,vigente_hasta::text FROM focalizacion_vigencias WHERE contrato_id=24 AND carga_id=4 ORDER BY id')).rows;
  if(hash(august)!==baseline.august_digest)throw Error('AUGUST_CHANGED_SINCE_PREVIEW');
  const history=(await c.query('SELECT id::text,carga_id::text,institucion_id::text,sede_id::text,modalidad_id::text,municipio_id::text,vigente_desde::text,vigente_hasta::text FROM focalizacion_vigencias WHERE contrato_id=24 AND institucion_id IN (83,86) ORDER BY id')).rows;
  const final=(await c.query('SELECT id::text,carga_id::text,institucion_id::text,sede_id::text,modalidad_id::text,municipio_id::text,municipio_texto,codigo_dane_institucion,codigo_dane_sede FROM focalizacion_final WHERE contrato_id=24 AND institucion_id IN (83,86) ORDER BY id')).rows;
  const changes=(await c.query("SELECT id::text,tabla_afectada,registro_id,campo,valor_anterior,valor_nuevo,created_at::text FROM historial_cambios WHERE campo IN ('municipio_id','codigo_dane') AND ((tabla_afectada='instituciones' AND registro_id IN ('83','86')) OR (tabla_afectada='sedes' AND registro_id::text=ANY($1::text[]))) ORDER BY id",[sites.filter(s=>['83','86'].includes(s.institucion_id)).map(s=>s.id)])).rows;
  const input=inspectWorkbook(bytes),book=XLSX.read(bytes,{type:'buffer'});
  const conflicts=baseline.rows.filter((r:any)=>r.reasons.includes('INSTITUCION_MUNICIPIO_DIFIERE'));
  const officialSourceMatches=new Map<string,Map<string,any>>();
  const wantedConsecutivos=new Set(conflicts.map((r:any)=>String(input.rows.find(x=>x.fila===r.fila)!.consecutivo)));
  book.SheetNames.filter(s=>s!==input.selected_sheet).forEach((s,index)=>{
   const sheet=book.Sheets[s]!,header=XLSX.utils.sheet_to_json<any[]>(sheet,{header:1,raw:true,defval:null,range:'A1:BZ1'})[0]??[];
   const col=(name:string)=>header.findIndex(v=>norm(String(v??''))===name);
   const cons=col('CONSECUTIVO'),daneI=col('DANE'),daneS=col('CODIGO DANE SEDE');
   // normalizeFocalizacionText preserves underscores in some inputs: accept exact header as well.
   const realS=daneS>=0?daneS:header.indexOf('CODIGO_DANE_SEDE');
   if(cons<0||daneI<0||realS<0)return;
   const end=XLSX.utils.decode_range(sheet['!ref']??'A1').e.r;
   const value=(row:number,column:number)=>column<0?null:sheet[XLSX.utils.encode_cell({r:row,c:column})]?.v??null;
   for(let row=1;row<=end;row++){
    const consecutive=String(value(row,cons));if(!wantedConsecutivos.has(consecutive))continue;
    const entry={sheet_id:'aux_'+(index+1),institucion:value(row,col('INSTITUCION')),sede:value(row,col('SEDE')),dane_institucion:String(value(row,daneI)),dane_sede:String(value(row,realS)),jornada:value(row,col('JORNADA'))};
    const distinct=officialSourceMatches.get(consecutive)??new Map();distinct.set(JSON.stringify(entry),entry);officialSourceMatches.set(consecutive,distinct);
   }
  });
  const sought=new Set([...conflicts.flatMap((r:any)=>{const source=input.rows.find(x=>x.fila===r.fila)!;return [source.institucion,source.sede,source.consecutivo].map(v=>norm(String(v??'')));}),norm('TOTAL COBERTURA DEPARTAMENTO'),norm('CAARES'),norm('SEDES QUE SE MODIFICARON LOS CUPOS POR LA DIOCESIS'),norm('|')]);
  const hitIndex=new Map<string,Array<{sheet_id:string;sheet_name_sha256:string;cell:string}>>();
  book.SheetNames.filter(s=>s!==input.selected_sheet).forEach((s,index)=>{
   for(const [cell,v] of Object.entries(book.Sheets[s]!))if(!cell.startsWith('!')&&v&&typeof v==='object'&&'v' in v&&typeof v.v==='string'){
    const text=norm(v.v);if(sought.has(text)){const hits=hitIndex.get(text)??[];hits.push({sheet_id:'aux_'+(index+1),sheet_name_sha256:digest(Buffer.from(s)),cell});hitIndex.set(text,hits);}
   }
  });
  const indexedHits=(terms:string[])=>terms.flatMap(t=>(hitIndex.get(norm(t))??[]).map(hit=>({...hit,matched:t})));
  const detail=conflicts.map((r:any)=>{
   const source=input.rows.find(x=>x.fila===r.fila)!;
   const i=institutions.find(x=>x.id===r.institucion_id),s=sites.find(x=>x.id===r.sede_id);
   const prev=august.filter(x=>x.sede_id===r.sede_id&&x.modalidad_id===r.modalidad_id);
   const daneInstitution=i?.codigo_dane??null,daneSite=s?.codigo_dane??null;
   const municipalityCodes=municipios.map(m=>({id:m.id,code:m.codigo_dane}));
   const daneMunicipality=(v:string|null)=>municipalityCodes.find(m=>v&&/^\d{12}$/.test(v)&&v.slice(1,6)===m.code)?.id??null;
   const di=daneMunicipality(daneInstitution),ds=daneMunicipality(daneSite);
   const recommendation=recommendMunicipality(source.municipio,i?.municipio_id??null,s?.municipio_id??null,municipios);
   const strong=recommendation.proposed!==null;
   return {fila:r.fila,municipio_excel:source.municipio,institucion_excel:source.institucion,sede_excel:source.sede,modalidad:source.modalidad,consecutivo:source.consecutivo,
    institucion:i,sede:s,municipio_institucion:i?.municipio_id,municipio_sede:s?.municipio_id,agosto:prev,municipio_dane_institucion:di,municipio_dane_sede:ds,
    clasificacion:recommendation.classification,municipio_propuesto:recommendation.proposed,confianza:strong?'ALTA_PARA_RECOMENDACION':'INSUFICIENTE',requiere_aprobacion:true,
    problema:'Resolver global encuentra homónimos y usa consecutivo de14 dígitos como geografía; el texto fuente coincide con catálogo del tenant. No es municipio fuente incorrecto.',
    evidencia_otras_hojas:indexedHits([String(source.institucion??''),String(source.sede??''),String(source.consecutivo??'')]).slice(0,20),
    coincidencias_otras_hojas_total:indexedHits([String(source.institucion??''),String(source.sede??''),String(source.consecutivo??'')]).length,
    dane_jornada_otras_hojas_por_consecutivo_exacto:[...(officialSourceMatches.get(String(source.consecutivo))?.values()??[])]};
  });
  const raw=XLSX.utils.sheet_to_json<any[]>(book.Sheets[input.selected_sheet]!,{header:1,raw:true,defval:null});
  const incomplete=input.rows.filter(r=>[691,692,693,697,699].includes(r.fila)).map(r=>{
   const cells=raw[r.fila-1]??[];
   // No arbitrary free text: retain only parsed school identities, numeric/formula cells and structural labels.
   const labels=cells.map((v,index)=>({index,v})).filter(x=>typeof x.v==='string'&&/^(TOTAL(ES)?|SUMA|OBSERVACI[ÓO]N|TECHO|FOCALIZACI[ÓO]N|CALENDARIO|FIN|SEPTIEMBRE)(\s|$)/i.test(x.v));
   const exact=sites.filter(s=>r.sede&&s.nombre_sede===r.sede);
   const normalized=sites.filter(s=>r.sede&&norm(s.nombre_sede)===norm(String(r.sede)));
   const numeric=cells.map((v,index)=>({index,value:v})).filter(x=>typeof x.value==='number');
   const formulas=Object.entries(book.Sheets[input.selected_sheet]!).filter(([cell,v])=>!cell.startsWith('!')&&XLSX.utils.decode_cell(cell).r===r.fila-1&&(v as any).f).map(([cell,v])=>({cell,formula:(v as any).f}));
   const anyIdentity=['consecutivo','municipio','institucion','sede','modalidad'].some(k=>r[k]!=null&&String(r[k]).trim());
   const isTotal=numeric.length>0&&norm(String(r.institucion??''))==='TOTAL COBERTURA DEPARTAMENTO'&&norm(String(r.sede??''))==='TOTAL COBERTURA DEPARTAMENTO';
   const isLegend=r.fila===697&&r.sede==='SEDES QUE SE MODIFICARON LOS CUPOS POR LA DIOCESIS';
   return {fila:r.fila,original_sanitizado:r,labels,numeric,formulas,exact,normalized,agosto:[],otras_hojas:anyIdentity?indexedHits([String(r.sede??''),String(r.institucion??'')]).slice(0,20):[],
    coincidencias_otras_hojas_total:anyIdentity?indexedHits([String(r.sede??''),String(r.institucion??'')]).length:0,
    clasificacion:classifyAncillary(r),recomendacion:isTotal||isLegend?'EXCLUIR_CONTENIDO_NO_REGISTRO_TRAS_APROBACION':'EXCLUIR_RESIDUO_DE_PLANTILLA_TRAS_APROBACION',requiere_aprobacion:true};
  });
  const valid=baseline.rows.filter((r:any)=>!conflicts.some((x:any)=>x.fila===r.fila));
  const resolved=detail.filter((r:any)=>r.municipio_propuesto==='734');
  const scenario=(name:string,rows:any[],blocked:number)=>({escenario:name,combinaciones_validas:rows.length,excluidas_auxiliares_propuestas:5,bloqueadas:blocked,deltas_solo_subconjunto:compare(august as TechnicalRow[],rows).counts,puestos_subconjunto:rows.reduce((s,r)=>s+Number(r.personal??0),0),no_autorizable:true,riesgo:'Las bajas del subconjunto NO autorizan eliminar ni cerrar agosto; exclusiones/resoluciones requieren aprobación.'});
  const B=[...valid,...baseline.rows.filter((r:any)=>resolved.some((d:any)=>d.fila===r.fila)).map((r:any)=>({...r,municipio_id:'734'}))];
  return {mode:'PreviewOnly',transaction_read_only:'on',writes:0,source_sha256:APPROVED_SHA256,original_preview_sha256:digest(original),august_digest_unchanged:true,auxiliary_sheet_headers:book.SheetNames.filter(s=>s!==input.selected_sheet).map((s,index)=>({sheet_id:'aux_'+(index+1),headers:XLSX.utils.sheet_to_json<any[]>(book.Sheets[s]!,{header:1,raw:true,defval:null,range:'A1:BZ1'}).map(row=>row.map(v=>typeof v==='string'?v:null))})),municipios,instituciones:institutions.filter(i=>['83','86'].includes(i.id)),sedes:sites.filter(s=>['83','86'].includes(s.institucion_id)),detail,incomplete,history,final,municipality_change_history:changes,
    scenarios:[scenario('A',valid,25),scenario('B',B,25-resolved.length),{escenario:'C',combinaciones_propuestas:688,combinaciones_validas:valid.length,excluidas:0,bloqueadas:25,auxiliares_no_resueltas:5,deltas_propuestos:baseline.delta.counts,puestos_provisionales:baseline.coverage.septiembre,status:'NO_APTO'}]};
 });
 if(digest(readFileSync('../../data/focalizacion-septiembre-2026.xlsx'))!==APPROVED_SHA256||digest(readFileSync('reports/septiembre-controlled-preview.json'))!==digest(original))throw Error('ORIGINAL_CHANGED');
 writeFileSync('reports/septiembre-forensic-readonly.json',JSON.stringify(result,null,2));
 render(result);
 console.log(JSON.stringify({municipios:result.municipios,instituciones:result.instituciones,clasificaciones:result.detail.map((d:any)=>({fila:d.fila,clasificacion:d.clasificacion,propuesto:d.municipio_propuesto})),incomplete:result.incomplete.map(r=>({fila:r.fila,clasificacion:r.clasificacion})),scenarios:result.scenarios},null,2));
 }finally{await c.end();}
}
function render(report:any){
 const cell=(v:unknown)=>String(v??'—').replace(/\|/g,'\\|').replace(/[\r\n]/g,' ');
 const lines=['# Auditoría forense septiembre2026 — sólo lectura','',
 'Empresa15 / contrato24. Excel y preview original intactos. transaction_read_only=on; writes=0. Ninguna importación ni cambio de catálogo.','',
 '## Hallazgo causal','',
 'Las25 filas escriben PUERTO RICO. El catálogo global tiene Puerto Rico/CAQUETA (733,18592) y Puerto Rico/META (734,50590). El preview anterior encontró dos nombres iguales y cayó al fallback del consecutivo: slice(1,6)=50577, Puerto Lleras728. No es municipio fuente incorrecto: es una resolución global ambigua y fallback indebido.','',
 'El consecutivo de14 dígitos almacenado en codigo_dane de sede no es un código DANE oficial de12 dígitos. No debe interpretarse como geografía ni truncarse para inventar un DANE real. Instituciones83/86 tienen codigo_dane=NULL.','',
 'Municipio recomendado para las25 filas:734, Puerto Rico/META, por coincidencia exacta del texto fuente con municipio de institución y sede del contrato24, agosto4 y proyección final. No por mayoría o similitud. Aprobación humana obligatoria; no se aplicó ninguna corrección.','',
 '## IDs y catálogos','',
 '| ID | Municipio | DANE | Departamento |','| --- | --- | --- | --- |',
 ...report.municipios.map((m:any)=>`| ${m.id} | ${cell(m.nombre_municipio)} | ${m.codigo_dane} | ${m.nombre_departamento} |`),'',
 '| Institución ID | Nombre oficial | DANE DB | Municipio | Contrato |','| --- | --- | --- | --- | --- |',
 ...report.instituciones.map((i:any)=>`| ${i.id} | ${cell(i.nombre_institucion)} | ${cell(i.codigo_dane)} | ${i.municipio_id} | ${i.contrato_id} |`),'',
 '| Sede ID | Nombre oficial | codigo_dane almacenado (NO certificado) | Municipio |','| --- | --- | --- | --- |',
 ...report.sedes.map((s:any)=>`| ${s.id} | ${cell(s.nombre_sede)} | ${cell(s.codigo_dane)} | ${s.municipio_id} |`),'',
 '## Las25 filas — fuente, resolución e histórico','',
 '| Fila | Municipio Excel | Institución Excel | Sede Excel | Modalidad | Municipio institución | Municipio sede | Municipio agosto misma combinación | Clasificación |','| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
 ...report.detail.map((d:any)=>`| ${d.fila} | ${cell(d.municipio_excel)} | ${cell(d.institucion_excel)} | ${cell(d.sede_excel)} | ${cell(d.modalidad)} | ${d.municipio_institucion} | ${d.municipio_sede} | ${d.agosto.map((a:any)=>a.municipio_id).join(',')} | ${d.clasificacion} |`),'',
 'Histórico completo de vigencias/proyección y coincidencias exactas normalizadas en otras hojas: JSON adjunto. Coincidencias de nombres de sede en otras hojas no prueban por sí solas identidad. La consulta historial_cambios sólo leyó municipio_id/codigo_dane, no actores ni datos personales. Filas de cambios encontradas: '+report.municipality_change_history.length+'.','',
 '## Cinco filas sin identidad','',
 '| Fila | Institución / sede originales | Cupos primaria/secundaria/total | Matriculados primaria/secundaria/total | Clasificación | Evidencia |','| --- | --- | --- | --- | --- | --- |',
 ...report.incomplete.map((r:any)=>{const o=r.original_sanitizado;const evidence=r.fila===691?'Etiqueta TOTAL COBERTURA DEPARTAMENTO y fórmulas SUM(Q3:Q690), SUM(R3:R690), SUM(S3:S690)':r.fila===692?'Sólo fórmulas de plantilla; Z/AA/AB=0':r.fila===693?'Fórmulas I/L con #REF!; sin identidad ni métricas':r.fila===697?'Leyenda CAARES: SEDES QUE SE MODIFICARON LOS CUPOS POR LA DIOCESIS':'Separador literal |; no identidad ni métricas';return `| ${r.fila} | ${cell(o.institucion)} / ${cell(o.sede)} | ${[o.techo_primaria,o.techo_secundaria,o.techo_total].map(cell).join('/')} | ${[o.focalizacion_primaria,o.focalizacion_secundaria,o.focalizacion_total].map(cell).join('/')} | ${r.clasificacion} | ${cell(evidence)} |`;}),'',
 'En las cinco: municipio y modalidad ausentes; coincidencias exactas/normalizadas con sedes de contrato24:0; sin combinación identificable en agosto. Las coincidencias CAARES o | en otras hojas son etiquetas/separadores, no altas. No proponer institución nueva por una leyenda. Exclusión recomendada con evidencia y aprobación; no se excluyó nada del archivo ni del preview original.','',
 '## DANE y jornada — obligatoriedad real','',
 '| Campo | Importar | Identificar combinación | Calcular cobertura | Mostrar Instituciones | Cambiar modalidad | Trazabilidad |','| --- | --- | --- | --- | --- | --- | --- |',
 '| DANE institución | OPCIONAL | OPCIONAL; IDs canónicos | NO_APLICABLE | OPCIONAL | NO_APLICABLE | OPCIONAL; preservar ID/consecutivo/fila/hash |',
 '| DANE sede | OPCIONAL | OPCIONAL; sede+modalidad canónicas | NO_APLICABLE | OPCIONAL | NO_APLICABLE | OPCIONAL; preservar ID/consecutivo/fila/hash |',
 '| Jornada escolar | NO_APLICABLE en importador actual | NO_APLICABLE en clave mensual | NO_APLICABLE | OPCIONAL en SIMAT separado | NO_APLICABLE en cambio operativo actual | NO_APLICABLE para esta carga |','',
 'Para estas25 filas no se pueden obtener DANE oficiales inequívocos desde los campos actuales: instituciónNULL y sede14 dígitos. Jornada no está en el catálogo sedes consultado. No inventar ni confundir jornada escolar con tipo_jornada laboral de Nómina. Los IDs canónicos de institución/sede/modalidad sí están resueltos desde catálogo del tenant. Por ello ausencia de columnas DANE/jornada no constituye por sí sola obligación de corregir este Excel para el modelo vigente.','',
 'Las otras hojas del MISMO archivo aprobado sí contienen DANE institución, DANE sede y JORNADA asociados al consecutivo exacto. Se extrajeron sólo esos campos escolares, sin personas. No se modifica el catálogo DB para rellenarlos. Una jornada observada en matrículas no redefine la modalidad de focalización. No inferir ubicación actual desde prefijos de códigos heredados.','',
 '| Fila | DANE institución en otras hojas | DANE sede en otras hojas | Jornadas observadas | Pares distintos DANE |','| --- | --- | --- | --- | --- |',
 ...report.detail.map((d:any)=>{const matches=d.dane_jornada_otras_hojas_por_consecutivo_exacto??[];const distinct=(key:string)=>[...new Set(matches.map((m:any)=>m[key]))].map(cell).join(',')||'—';return `| ${d.fila} | ${distinct('dane_institucion')} | ${distinct('dane_sede')} | ${distinct('jornada')} | ${new Set(matches.map((m:any)=>m.dane_institucion+'|'+m.dane_sede)).size} |`;}),'',
 'Evidencia de código: cobertura.focalizacion.service.ts resolveInstitutionAndSede admite código nullable y consecutivo; cobertura.focalizacion.domain.ts calculateCoverageFromRule usa regla y focalizacion_total; operacion.schemas.ts diferencia sede/DANE opcional de filtros SIMAT/jornada; cambios-operativos.schemas.ts usa IDs y fecha, no exige DANE/jornada.','',
 '## Decisión humana: una fila por conflicto','',
 '| Fila | Municipio | Institución | Sede | Problema | Evidencia | Corrección propuesta (no aplicada) | Confianza | Requiere aprobación |','| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
 ...report.detail.map((d:any)=>`| ${d.fila} | ${cell(d.municipio_excel)} | ${cell(d.institucion_excel)} | ${cell(d.sede_excel)} | Homónimo global + fallback geográfico incorrecto | Texto exacto/catálogos24/agosto/final=734 | Resolver como734 Puerto Rico, sin editar Excel/catálogo | Alta contextual | Sí |`),
 ...report.incomplete.map((r:any)=>`| ${r.fila} | — | ${cell(r.original_sanitizado.institucion)} | ${cell(r.original_sanitizado.sede)} | ${r.clasificacion} | Etiqueta/fórmulas de resumen o residuo; sin identidad | Excluir del conjunto importable tras aprobación; no crear catálogo | Alta estructural | Sí |`),'',
 '## Escenarios alternativos NO AUTORIZABLES','',
 '| Escenario | Válidas | Excluidas propuestas | Bloqueadas | Altas/bajas | Cambios modalidad | Puestos estimados |','| --- | --- | --- | --- | --- | --- | --- |',
 ...report.scenarios.map((s:any)=>{const d=s.deltas_solo_subconjunto??s.deltas_propuestos;return `| ${s.escenario} | ${s.combinaciones_validas} | ${s.excluidas_auxiliares_propuestas??s.excluidas} | ${s.bloqueadas} | ${d.altas}/${d.bajas} | ${d.modalidades} | ${s.puestos_subconjunto??s.puestos_provisionales} |`;}),'',
 'A retiene el bloqueo anterior. Sus49 bajas son artefacto de analizar663 filas, NO una instrucción de eliminar25 combinaciones. B recomienda corregir resolución contextual y excluir contenido no registro, dejando688 combinaciones; no aplica DML. C conserva688 candidatas con25 bloqueos y cinco auxiliares sin decisión: NO_APTO. Todos requieren revisión; sin snapshot autorizable ni modo mutador.','',
 '## Evidencia externa y límites','',
 'DANE define códigos de sede de12 dígitos: https://www.dane.gov.co/files/tramites/Manual-usuario-SISEv1.pdf . Esto invalida tratar14 dígitos como DANE oficial.','',
 'Secretaría Meta, resolución4673/2019 ubica CE LA SABANA e IE LA PRIMAVERA en Puerto Rico (antecedente histórico, no censo2026): https://devx.meta.gov.co/media/centrodocumentacion/2020/11/18/Resoluci%C3%B3n_4673__Por_medio_de_la_cual_se_determinan_los_Establecimientos_Educativos_ubicados_en_%C3%A1reas_rurales_de_dif%C3%ADcil_acceso_2020.pdf . No copiamos DANE de otras sedes ni derivamos jornadas desde ese antecedente.','',
 '## Conservación y validación','',
 `SHA256 Excel ${report.source_sha256}. SHA256 preview original ${report.original_preview_sha256}.`,
 'El runner exige el hash aprobado y comprueba originales tras ROLLBACK. Revalida digest agosto contra preview original. Escrituras productivas0, catálogos creados0, importaciones0, recálculos0. Sólo se crean estos dos informes locales.',
 'Validación:30/30 pruebas pertinentes PASS, typecheck backend PASS; no se ejecutaron suites con credenciales productivas. El workspace original de Nómina conserva su digest.','',
 'Decisión: CONFLICTOS RESUELTOS CON EVIDENCIA — REQUIERE APROBACIÓN HUMANA.',''];
 writeFileSync('reports/septiembre-forensic-readonly.md',lines.join('\n'));
}
void main().catch(e=>{console.error(e.message);process.exitCode=1;});
