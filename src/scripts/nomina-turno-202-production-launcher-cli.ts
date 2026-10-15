import { productionLauncherCli, sanitizeLauncherFailure } from './nomina-turno-202-production-launcher';

void productionLauncherCli().then((result)=>{
  process.stdout.write(`${JSON.stringify(result)}\n`);
}).catch((error:unknown)=>{
  const failure=sanitizeLauncherFailure(error,'CLI_BOUNDARY');
  const code=`LAUNCHER_STOPPED_${failure.code}`;
  process.stderr.write(`${code}\n`);
  const details=error&&typeof error==='object'?error as {stoppedReceiptPublished?:unknown;receiptPublicationFailure?:unknown}:undefined;
  process.stderr.write(`${JSON.stringify({phase:failure.phase,category:failure.category,sqlstate:failure.sqlstate,stack_hash:failure.stack_hash,stopped_receipt_published:details?.stoppedReceiptPublished===true,receipt_publication_failure:details?.receiptPublicationFailure})}\n`);
  process.exitCode=1;
});
