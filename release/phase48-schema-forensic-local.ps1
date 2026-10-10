$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$task=Join-Path $root 'tmp\phase48-schema-forensic-local'
$cluster=[IO.Path]::GetFullPath((Join-Path $task 'cluster'))
$bin='C:\Program Files\PostgreSQL\17\bin'
if($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'){throw 'WORKSPACE_MISMATCH'}
if(Test-Path -LiteralPath $task){throw 'EXISTING_LOCAL_TASK_REFUSED'}
if((& (Join-Path $bin 'postgres.exe') --version) -notmatch '17\.11'){throw 'LOCAL_VERSION_INVALID'}
$probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,55468)
try{$probe.Start()}finally{$probe.Stop()}
New-Item -ItemType Directory -Path $task | Out-Null
$started=$false
$captureExit=1
try{
 & (Join-Path $bin 'initdb.exe') -D $cluster -U modalidad_verifier --auth=trust --encoding=UTF8 --locale=C *> (Join-Path $task 'init.raw.log')
 if($LASTEXITCODE -ne 0){throw 'LOCAL_INITDB_FAILED'}
 $startArgs="-D `"$cluster`" -l `"$(Join-Path $task 'server.raw.log')`" -o `"-p 55468 -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off -c shared_preload_libraries=`" -w start"
 $started=$true
 $process=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $task 'start.raw.out') -RedirectStandardError (Join-Path $task 'start.raw.err')
 if(-not $process.WaitForExit(30000)){throw 'LOCAL_START_TIMEOUT'}
 & (Join-Path $bin 'pg_ctl.exe') -D $cluster status | Out-Null
 if($LASTEXITCODE -ne 0){throw 'LOCAL_START_FAILED'}
 Push-Location -LiteralPath $root
 try{& .\node_modules\.bin\tsx.cmd src/scripts/phase48-schema-restore-local.ts;$captureExit=$LASTEXITCODE}finally{Pop-Location}
}finally{
 if($started){& (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop | Out-Null;if($LASTEXITCODE -ne 0){throw 'LOCAL_STOP_FAILED'}}
 if([IO.Path]::GetFullPath($task) -ne (Join-Path $root 'tmp\phase48-schema-forensic-local')){throw 'CLEANUP_PATH_MISMATCH'}
 if((Get-Item -LiteralPath $task).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CLEANUP_REPARSE_REFUSED'}
 if(Test-Path -LiteralPath (Join-Path $cluster 'postmaster.pid')){throw 'RUNNING_CLUSTER_REFUSED'}
 Remove-Item -LiteralPath $task -Recurse -Force
}
exit $captureExit
