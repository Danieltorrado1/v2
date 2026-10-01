import {readFileSync,writeFileSync} from 'node:fs';
import {parse} from 'dotenv';
import {Client} from 'pg';
import {readOnlyTransaction,inspectWorkbook,APPROVED_SHA256} from '../modules/cobertura/septiembre-controlled-preview';
import {normalizeFocalizacionText as norm} from '../modules/cobertura/cobertura.focalizacion.domain';

async function main(){
 if(process.argv.length!==2)throw Error('NO_ARGUMENTS_ALLOWED');
 const stopped=JSON.parse(readFileSync('reports/septiembre-preview-stopped-snapshot.json','utf8'));
 if(stopped.status!=='PREVIEW_FINAL_DETENIDO')throw Error('STOPPED_PREVIEW_REQUIRED');
 const input=inspectWorkbook(readFileSync('../../data/focalizacion-septiembre-2026.xlsx'));
 if(input.sha256!==APPROVED_SHA256)throw Error('SOURCE_CHANGED');
 const client=new Client({connectionString:parse(readFileSync('../../.env')).DATABASE_URL,ssl:{rejectUnauthorized:false},connectionTimeoutMillis:15000,options:'-c default_transaction_read_only=on'});
 await client.connect();
 try{
  const evidence=await readOnlyTransaction(client,async()=>{
   const sites=(await client.query('SELECT s.id::text,s.institucion_id::text,s.municipio_id::text,s.nombre_sede,i.nombre_institucion,m.nombre_municipio FROM sedes s JOIN instituciones i ON i.id=s.institucion_id JOIN contratos c ON c.id=i.contrato_id JOIN municipios m ON m.id=i.municipio_id WHERE i.contrato_id=24 AND c.empresa_id=15 AND s.id=ANY($1::bigint[])',[stopped.unresolved_rows.map((r:any)=>r.previous_ids.sede_id)])).rows;
   return stopped.unresolved_rows.map((r:any)=>{
    const source=input.rows.find(s=>s.fila===r.fila)!;
    const site=sites.find(s=>s.id===r.previous_ids.sede_id);
    if(!site)throw Error('PREVIOUS_SITE_NOT_IN_TENANT');
    return {fila:r.fila,municipio_excel:source.municipio,municipio_catalogo:site.nombre_municipio,municipio_id:site.municipio_id,institucion_id:site.institucion_id,sede_id:site.id,
     institution_name_matches:norm(site.nombre_institucion)===norm(String(source.institucion)),site_name_matches:norm(site.nombre_sede)===norm(String(source.sede)),municipality_name_matches:norm(site.nombre_municipio)===norm(String(source.municipio)),
     correction_applied:false,requires_explicit_mapping:true};
   });
  });
  const report={schema_version:'focalizacion.septiembre.stopped-identity-evidence.v1',timestamp_utc:new Date().toISOString(),mode:'PreviewOnly',transaction_read_only:'on',writes:0,source_sha256:input.sha256,evidence};
  writeFileSync('reports/septiembre-stopped-identity-evidence.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
 }finally{await client.end();}
}
void main().catch(e=>{console.error({code:'READ_ONLY_DIAGNOSIS_FAILED',message:e.message});process.exitCode=1;});
