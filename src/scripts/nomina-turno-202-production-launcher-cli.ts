import { productionLauncherCli, sanitizeLauncherFailure } from './nomina-turno-202-production-launcher';

void productionLauncherCli().then((result)=>{
  process.stdout.write(`${JSON.stringify(result)}\n`);
}).catch((error:unknown)=>{
  const executionError=error&&typeof error==='object'?error as {failure_phase?:unknown;precheck_step_id?:unknown}:undefined;
  const failure=sanitizeLauncherFailure(error,typeof executionError?.failure_phase==='string'?executionError.failure_phase:'CLI_BOUNDARY',typeof executionError?.precheck_step_id==='string'?executionError.precheck_step_id:null);
  const code=`LAUNCHER_STOPPED_${failure.code}`;
  process.stderr.write(`${code}\n`);
  const details=error&&typeof error==='object'?error as {stoppedReceiptPublished?:unknown;receiptPublicationFailure?:unknown}:undefined;
  process.stderr.write(`${JSON.stringify({phase:failure.phase,precheck_step_id:failure.precheck_step_id,category:failure.category,system_error_code:failure.system_error_code,syscall:failure.syscall,errno:failure.errno,sqlstate:failure.sqlstate,stack_hash:failure.stack_hash,stopped_receipt_published:details?.stoppedReceiptPublished===true,receipt_publication_failure:details?.receiptPublicationFailure})}\n`);
  process.exitCode=1;
});
