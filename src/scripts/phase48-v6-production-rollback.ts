// Separate post-COMMIT reversal entry. Requires its own new literal and nonce.
import {readFileSync} from 'node:fs';
import {reverseV6,parseV6Reversal} from '../modules/cobertura/phase48-v6-entry';
import {parseV6Cli} from './phase48-v6-production';
import {productionV6Host} from '../modules/cobertura/phase48-v6-production-host';
import {v6PrivatePath} from '../modules/cobertura/phase48-v6-evidence';
import {requireScoped} from '../modules/cobertura/phase48-scoped-contract';
export async function runV6RollbackCli(args:string[]){const v=parseV6Cli(args);requireScoped(v.mode==='Mutate','V6_REVERSAL_MUTATION_GATE_REQUIRED');v6PrivatePath(v['approval-file']!);const raw=readFileSync(v['approval-file']!,'utf8');parseV6Reversal(raw);const h=productionV6Host({evidence:{backupDirectory:v['backup-directory']!,certifiedPreflight:v['certified-preflight']!,blockedRequest:v['blocked-request']!},credentialPath:v['credential-path']!,caPath:v['ca-path']!,caSha256:v['ca-sha256']!,directory:v['receipt-directory']!,keyPath:v['key-path'],syncManuallyConfirmed:false});return reverseV6(h,raw);}
if(require.main===module)runV6RollbackCli(process.argv.slice(2)).then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(JSON.stringify({status:'STOPPED',reason:/^[A-Z0-9_:.-]+$/.test(e.message)?e.message:'V6_REVERSAL_CONTROL_FAILED',committed:e.committed===true}));process.exitCode=1;});
