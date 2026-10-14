import type {PoolClient} from 'pg';
import {scopedCapture} from './phase48-scoped-repository';
import {requireScoped} from './phase48-scoped-contract';
// Caller owns the RR READ ONLY transaction and MUST rollback/close in finally.
// This is a capture for backup comparison, never a mutator authorization seal.
export async function captureDynamicBackupPrecheck(db:Pick<PoolClient,'query'>){
 const session=(await db.query("SELECT current_setting('transaction_read_only') read_only,current_setting('transaction_isolation') isolation,current_setting('server_version') server_version")).rows[0];
 requireScoped(session.read_only==='on'&&session.isolation==='repeatable read','BACKUP_REPEATABLE_READ_ONLY_REQUIRED');
 requireScoped(/^17\./.test(session.server_version),'BACKUP_SERVER_17_REQUIRED');
 const metrics=(await db.query("SELECT (SELECT count(*)::int FROM pg_locks WHERE NOT granted) locks_waiting,(SELECT count(*)::int FROM pg_stat_activity WHERE state='active' AND pid<>pg_backend_pid() AND query ~* '^\\s*(ALTER|CREATE|DROP|TRUNCATE|REINDEX|GRANT|REVOKE)\\s') ddl_active")).rows[0];
 requireScoped(metrics.locks_waiting===0&&metrics.ddl_active===0,'BACKUP_LOCK_OR_DDL_ACTIVITY');
 const capture=await scopedCapture(db); // Exact certified events, not a blanket rejection.
 return {session,metrics,capture,mutator_authorization:false,backup_authorization:false};
}
