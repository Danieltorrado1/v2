// This isolated proof permits only loopback and the exact metadata-only queries.
const originalQuery=require('pg').Client.prototype.query;
require('./phase48-atomic-local-guard.cjs');
const allowed=new Set(['BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY','ROLLBACK',"SELECT version() AS version, current_setting('transaction_read_only') AS read_only, current_setting('transaction_isolation') AS isolation, txid_current_if_assigned()::text AS assigned_xid, pg_backend_pid() AS pid, pg_current_snapshot()::text AS snapshot, (SELECT virtualtransaction FROM pg_catalog.pg_locks WHERE pid=pg_backend_pid() AND locktype='virtualxid') AS virtual_transaction"]);
require('pg').Client.prototype.query=function(sql,...args){
 if(process.env.PHASE48_POOLER_LOCAL_CERT!=='true'||!allowed.has(sql))throw Error('LOCAL_METADATA_ONLY_REQUIRED');
 return originalQuery.call(this,sql,...args);
};
