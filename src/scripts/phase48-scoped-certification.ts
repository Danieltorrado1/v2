// New local-only entry. No credential file, dotenv, HTTP health or production URL.
import {resolve} from 'node:path';
import {createScopedLocalAuthority,requireScoped} from '../modules/cobertura/phase48-scoped-contract';
import {preflightScopedLocal,publishScopedPreflight,executeScopedLocal} from '../modules/cobertura/phase48-scoped-local';
import {scopedRelease} from '../modules/cobertura/phase48-scoped-release';
async function main(){
 const args=process.argv.slice(2);requireScoped(args.every(a=>['--mode=ReadOnly','--mode=Rollback','--definitions-window-confirmed=true'].includes(a))&&new Set(args).size===args.length,'LOCAL_ARGUMENT_REQUIRED');
 const mode=args.find(a=>a.startsWith('--mode='))??'--mode=ReadOnly';
 const release=scopedRelease(),authority=createScopedLocalAuthority(),target={clusterDirectory:resolve('tmp/phase48-pooler-local/dynamic-cluster')};
 const preflight=await preflightScopedLocal(authority,target,release);
 publishScopedPreflight('tmp/phase48-pooler-local/scoped-receipts',preflight);
 if(mode==='--mode=ReadOnly'){console.log(JSON.stringify({...preflight,productive_authorization:'REVOKED'}));return;}
 const result=await executeScopedLocal(authority,preflight,target,{mode:'Rollback',definitions_window_confirmed:args.includes('--definitions-window-confirmed=true'),receipt_directory:'tmp/phase48-pooler-local/scoped-receipts'});
 console.log(JSON.stringify(result));
}
main().catch(e=>{console.error(JSON.stringify({status:'STOPPED',reason:/^[A-Z0-9_:]+$/.test(e.message)?e.message:'LOCAL_CERTIFICATION_FAILED',productive_writes:0}));process.exitCode=1;});
