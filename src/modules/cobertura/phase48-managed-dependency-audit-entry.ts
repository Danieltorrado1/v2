import {randomUUID,createHash} from 'node:crypto';
import {publishAtomicReceipt} from './phase48-readonly-receipts';
import {auditManagedDependencyGraph,type ManagedAuditClient} from './phase48-managed-dependency-audit';
import {validateGraphEvidence} from './phase48-managed-dependency-graph';

export interface ManagedAuditEntryPorts {
  precheck():Promise<{branch:string;head:string;remote:string;tracked_clean:boolean;ca_valid:boolean;destination_valid:boolean;manifest_valid:boolean}>;
  health():Promise<{http_status:number;success:boolean;database_status:string;outbox:boolean;recalc:boolean;worker_stopped:boolean}>;
  readCredential():Promise<unknown>;
  createClient(credential:unknown):ManagedAuditClient;
  validateTls(client:ManagedAuditClient):Promise<{protocol:string;encrypted:boolean;authorized:boolean;rejectUnauthorized:boolean;ca_pinned:boolean;hostname_verified:boolean;servername_matches:boolean;authorization_error:null|string}>;
  directory:string;
  expectedGraphEvidence?:unknown;
}
const sha=(x:string|Buffer)=>createHash('sha256').update(x).digest('hex');
const validHealth=(h:Awaited<ReturnType<ManagedAuditEntryPorts['health']>>)=>h.http_status===200&&h.success===true&&h.database_status==='ok'&&h.outbox===false&&h.recalc===false&&h.worker_stopped===true;
const sanitize=(error:unknown)=>({type:error instanceof Error?error.name:'Error',code:typeof (error as any)?.code==='string'?(error as any).code:null,sqlstate:/^[0-9A-Z]{5}$/.test(String((error as any)?.code??''))?String((error as any).code):null,query_id:typeof (error as any)?.query_id==='string'?(error as any).query_id:null});

/** Future production sequencing boundary. All external adapters are injected;
 * this entrypoint itself reads no environment, credential file, or network. */
export async function runManagedDependencyAuditEntry(ports:ManagedAuditEntryPorts){
  const id=randomUUID(),runId=`phase48-${id}`;let phase='offline_precheck',healthInitialAttempted=false,healthInitial:any=null,healthFinal:any=null,healthFinalError:any=null,credentialRead=false,credential:unknown,clientCreated=false,connectAttempted=false,connected=false,tls:any=null,transactionStarted=false,rollbackAttempted=false,rollbackConfirmed=false,clientEndAttempted=false,clientClosed=false,rollbackError:any=null,closeError:any=null,connectionCount=0,graph:any=null,error:any=null,client:ManagedAuditClient|undefined,auditOwnsCleanup=false;
  try{
    const pre=await ports.precheck();if(!pre.tracked_clean||!pre.ca_valid||!pre.destination_valid||!pre.manifest_valid||!pre.branch||!pre.head||!pre.remote)throw Object.assign(Error('AUDIT_PRECHECK_FAILED'),{phase});
    phase='health_initial';healthInitialAttempted=true;healthInitial=await ports.health();if(!validHealth(healthInitial))throw Error('AUDIT_HEALTH_INITIAL_FAILED');
    phase='credential_read';credentialRead=true;credential=await ports.readCredential();
    phase='client_creation';client=ports.createClient(credential);clientCreated=true;connectionCount=1;
    phase='connect';connectAttempted=true;await client.connect();connected=true;
    phase='tls_validation';tls=await ports.validateTls(client);if(tls.protocol!=='TLSv1.3'||tls.encrypted!==true||tls.authorized!==true||tls.rejectUnauthorized!==true||tls.ca_pinned!==true||tls.hostname_verified!==true||tls.servername_matches!==true||tls.authorization_error!==null)throw Error('AUDIT_TLS_INVALID');
    phase='catalog_audit';auditOwnsCleanup=true;graph=await auditManagedDependencyGraph(client,{alreadyConnected:true,expectedGraphEvidence:ports.expectedGraphEvidence});transactionStarted=graph.transaction_started;rollbackAttempted=graph.rollback_attempted;rollbackConfirmed=graph.rollback_confirmed;clientEndAttempted=graph.client_end_attempted;clientClosed=graph.client_closed;connected=false;
  }catch(e){const x=e as any;if(auditOwnsCleanup){transactionStarted=x?.transaction_started===true;rollbackAttempted=x?.rollback_attempted===true;rollbackConfirmed=x?.rollback_confirmed===true;clientEndAttempted=x?.close_attempted===true;clientClosed=x?.client_closed===true;rollbackError=x?.rollback_error?sanitize(x.rollback_error):null;closeError=x?.close_error?sanitize(x.close_error):null;connected=false;}error={phase,...sanitize(x?.cause??e),query_id:typeof x?.query_id==='string'?x.query_id:(sanitize(x?.cause??e).query_id)};}
  finally{
    credential=undefined;
    if(client&&connectAttempted&&!auditOwnsCleanup){
      clientEndAttempted=true;try{await client.end();clientClosed=true;}catch(e){closeError=sanitize(e);error??={phase:'client_close',...sanitize(e)};}
    }
    if(healthInitialAttempted){try{phase='health_final';healthFinal=await ports.health();if(!validHealth(healthFinal)){healthFinalError={code:'AUDIT_HEALTH_FINAL_FAILED'};error??={phase:'health_final',...healthFinalError,sqlstate:null};}}catch(e){healthFinalError=sanitize(e);error??={phase:'health_final',...sanitize(e)};}}
  }
  if(graph){transactionStarted=graph.transaction_started;rollbackAttempted=graph.rollback_attempted;rollbackConfirmed=graph.rollback_confirmed;clientEndAttempted=graph.client_end_attempted;clientClosed=graph.client_closed;}
  const localEvidence=graph;
  if(graph){const {nodes,edges,...summary}=graph;validateGraphEvidence(summary);graph=summary;}
  const receipt={kind:'PHASE48_MANAGED_DEPENDENCY_AUDIT',run_id:runId,status:error?'STOPPED':'CAPTURED',phase:error?.phase??'complete',health_initial:healthInitial,health_final:healthFinal,health_final_error:healthFinalError,credential_read_attempted:credentialRead,client_created:clientCreated,connect_attempted:connectAttempted,tls,transaction_started:transactionStarted,rollback_attempted:rollbackAttempted,rollback_confirmed:rollbackConfirmed,rollback_error:rollbackError,client_end_attempted:clientEndAttempted,client_closed:clientClosed,close_error:closeError,connection_count:connectionCount,graph,error,writes:0,mutator_invoked:false,nonce_generated:false,phrase_generated:false};
  const path=publishAtomicReceipt(ports.directory,`${runId}.${error?'stopped':'receipt'}.json`,receipt,{exclusive:true});
  const bytes=(await import('node:fs')).readFileSync(path);
  return {receipt,path,size_bytes:bytes.length,sha256:sha(bytes),localEvidence};
}
