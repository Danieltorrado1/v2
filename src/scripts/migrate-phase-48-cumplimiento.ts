import {readFileSync} from 'node:fs';
import {dbPool} from '../config/db';
async function main(){
 const client=await dbPool.connect();
 try{
  await client.query(readFileSync('sql/phase-48-personal-cumplimiento-aliases.sql','utf8'));
  console.log('PASS: aliases de Dotación y requisitos profesionales registrados. Sin cambios en documentos, revisión ni historial.');
 }catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
}main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(()=>dbPool.end());
