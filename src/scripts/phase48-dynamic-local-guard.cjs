// All test SQL is confined to the ephemeral 17.11 cluster on this dedicated port.
const pg=require('pg');
const query=pg.Client.prototype.query;
require('./phase48-atomic-local-guard.cjs');
pg.Client.prototype.query=function(sql,...args){
 const p=this.connectionParameters;
 const dynamic=process.env.PHASE48_READ_QUERY_LOCAL_CERT==='true';
 const port=dynamic?Number(process.env.PHASE48_READ_QUERY_LOCAL_PORT):55470;
 const directory=dynamic?require('node:path').resolve(process.env.PHASE48_READ_QUERY_LOCAL_CLUSTER||''):null;
 const root=require('node:path').resolve('tmp/phase48-v6-read-query-certification');
 const relative=dynamic?require('node:path').relative(root,directory).replaceAll('\\','/'):'';
 if(process.env.PHASE48_DYNAMIC_LOCAL_CERT!=='true'||(dynamic&&(!/^run-[a-f0-9]{32}\/cluster$/i.test(relative)||port<49152||port>65535))||p.host!=='127.0.0.1'||Number(p.port)!==port||
  p.user!=='phase48_dynamic_local'||p.database!=='postgres')throw Error('DYNAMIC_LOCAL_TARGET_REQUIRED');
 return query.call(this,sql,...args);
};
