// All test SQL is confined to the ephemeral 17.11 cluster on this dedicated port.
const pg=require('pg');
const query=pg.Client.prototype.query;
require('./phase48-atomic-local-guard.cjs');
pg.Client.prototype.query=function(sql,...args){
 const p=this.connectionParameters;
 if(process.env.PHASE48_DYNAMIC_LOCAL_CERT!=='true'||p.host!=='127.0.0.1'||p.port!==55470||
  p.user!=='phase48_dynamic_local'||p.database!=='postgres')throw Error('DYNAMIC_LOCAL_TARGET_REQUIRED');
 return query.call(this,sql,...args);
};
