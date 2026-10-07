import {Client} from 'pg';
import {PGlite} from '@electric-sql/pglite';
import assert from 'node:assert/strict';

// Opt-in exclusively by the local certificate. No URL/env credentials accepted.
export async function createModalityTestDb() {
 if(process.env.MODALIDAD_LOCAL_PG_CERT!=='1')return new PGlite();
 const db=new Client({host:'127.0.0.1',port:55465,user:'modalidad_verifier',database:'phase48_temporal_fixtures',password:''});
 await db.connect();
 try {
  const r=(await db.query(`SELECT host(inet_server_addr()) host,inet_server_port() port,
   current_setting('server_version') version,current_setting('data_directory') directory,
   current_database() database,current_setting('max_worker_processes') workers`)).rows[0];
  assert.equal(r.host,'127.0.0.1');assert.equal(r.port,55465);assert.equal(r.version,'17.11');assert.equal(r.workers,'0');
  assert.equal(r.database,'phase48_temporal_fixtures');
  assert.equal(r.directory.replaceAll('\\','/'),'C:/Users/CORE ULTRA/Desktop/V2-instituciones-modalidad/tmp/phase48-historical-cert/cluster');
 }catch(e){await db.end();throw e;}
 return {
  exec:async(sql:string)=>{await db.query(sql);},
  query:async(sql:string,values?:any[])=>{const r=await db.query(sql,values);return {...r,affectedRows:r.rowCount};},
  close:()=>db.end(),
 };
}
