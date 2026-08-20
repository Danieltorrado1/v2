import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dbPool } from '../config/db';
import { env } from '../config/env';
import { uploadHistoricalFocalizacionFile } from '../modules/cobertura/cobertura.focalizacion.service';

const main = async () => {
  const filePath=path.resolve('reports/focalizacion-smoke-agosto-2026.xlsx'); const buffer=await readFile(filePath);
  const hash=createHash('sha256').update(buffer).digest('hex');
  const pre=await dbPool.query<{instituciones:number;sedes:number;relaciones:number;vigencias:number}>(`SELECT
    (SELECT COUNT(*)::int FROM instituciones WHERE contrato_id=24) instituciones,
    (SELECT COUNT(*)::int FROM sedes s JOIN instituciones i ON i.id=s.institucion_id WHERE i.contrato_id=24) sedes,
    (SELECT COUNT(*)::int FROM sede_modalidades WHERE contrato_id=24) relaciones,
    (SELECT COUNT(*)::int FROM focalizacion_vigencias WHERE contrato_id=24) vigencias`);
  const contract=await dbPool.query<{id:string;empresa_id:string;nombre_empresa:string}>(`SELECT c.id::text,c.empresa_id::text,e.nombre_empresa FROM contratos c JOIN empresas e ON e.id=c.empresa_id WHERE c.id=24`);
  const row=pre.rows[0]; const target=contract.rows[0];
  if(!row||row.instituciones!==111||row.sedes!==605||row.relaciones!==687||row.vigencias!==0) throw new Error(`SMOKE_PRECHECK_COUNTS:${JSON.stringify(row)}`);
  if(!target||target.empresa_id!=='15'||target.nombre_empresa.replace(/[^A-Z0-9]/gi,'').toUpperCase()!=='CONSORCIOPAEMETA26') throw new Error('SMOKE_CONTRACT_INVALID');
  console.log(JSON.stringify({host:new URL(env.DATABASE_URL).host,database:new URL(env.DATABASE_URL).pathname.slice(1),empresa:target.empresa_id,contrato:`${target.id} — ${target.nombre_empresa}`,vigencia:'2026-08-01/2026-08-31',filas:10,sample_sha256:hash,maestros:row},null,2));
  const result=await uploadHistoricalFocalizacionFile(buffer,'focalizacion-smoke-agosto-2026.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','2',24);
  await writeFile(path.resolve('reports/focalizacion-smoke-result.json'),JSON.stringify({sample_sha256:hash,result},null,2),'utf8');
  console.log(JSON.stringify(result,null,2)); await dbPool.end();
};
main().catch(async(error:unknown)=>{console.error(error instanceof Error?error.stack:error);await dbPool.end().catch(()=>undefined);process.exitCode=1});
