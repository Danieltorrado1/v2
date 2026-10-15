import { productionLauncherCli } from './nomina-turno-202-production-launcher';

void productionLauncherCli().then((result)=>{
  process.stdout.write(`${JSON.stringify(result)}\n`);
}).catch((error:unknown)=>{
  const message=error instanceof Error?error.message:'';
  const code=/^(?:LAUNCHER_STOPPED|STOPPED)_[A-Z0-9_]+/.exec(message)?.[0]??'LAUNCHER_STOPPED_UNEXPECTED';
  process.stderr.write(`${code}\n`);
  process.exitCode=1;
});
