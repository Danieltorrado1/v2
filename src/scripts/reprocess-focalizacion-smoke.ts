import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { dbPool } from '../config/db';
import { reprocessHistoricalFocalizacionImport } from '../modules/cobertura/cobertura.focalizacion.service';

const main=async()=>{const result=await reprocessHistoricalFocalizacionImport(2,'2',{});await writeFile(path.resolve('reports/focalizacion-smoke-reprocess.json'),JSON.stringify(result,null,2),'utf8');console.log(JSON.stringify(result,null,2));await dbPool.end()};
main().catch(async(error:unknown)=>{console.error(error instanceof Error?error.stack:error);await dbPool.end().catch(()=>undefined);process.exitCode=1});
