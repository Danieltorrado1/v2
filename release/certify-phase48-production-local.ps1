$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$task=Join-Path $root 'tmp\phase48-production-cert'
$cluster=[IO.Path]::GetFullPath((Join-Path $task 'cluster'))
$bin='C:\Program Files\PostgreSQL\17\bin'
if($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'){throw 'WORKSPACE_MISMATCH'}
if((git -C $root branch --show-current).Trim() -ne 'fix/phase48-production-runner'){throw 'BRANCH_MISMATCH'}
if(Test-Path -LiteralPath $cluster){throw 'PREEXISTING_CLUSTER_REFUSED'}
if((& (Join-Path $bin 'postgres.exe') --version) -notmatch '17\.11'){throw 'POSTGRES_17_11_REQUIRED'}
$probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,55466)
try{$probe.Start()}finally{$probe.Stop()}
New-Item -ItemType Directory -Path $task -Force | Out-Null
$started=$false
try{
 & (Join-Path $bin 'initdb.exe') -D $cluster -U modalidad_verifier --auth=trust --encoding=UTF8 --locale=C *> (Join-Path $task 'init.raw.log')
 if($LASTEXITCODE -ne 0){throw 'INITDB_FAILED'}
 $startArgs="-D `"$cluster`" -l `"$(Join-Path $task 'server.raw.log')`" -o `"-p 55466 -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off -c shared_preload_libraries=`" -w start"
 $started=$true
 $p=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $task 'start.raw.out') -RedirectStandardError (Join-Path $task 'start.raw.err')
 if(-not $p.WaitForExit(30000)){throw 'CLUSTER_START_TIMEOUT'}
 & (Join-Path $bin 'pg_ctl.exe') -D $cluster status | Out-Null
 if($LASTEXITCODE -ne 0){throw 'CLUSTER_START_FAILED'}
 Push-Location -LiteralPath $root
 try{& node src/scripts/certify-phase48-production-local.cjs;$certificateExit=$LASTEXITCODE}finally{Pop-Location}
}finally{
 foreach($name in @('PGPASSWORD','PRODUCTION_MIGRATION_DATABASE_URL')){[Environment]::SetEnvironmentVariable($name,$null,'Process')}
 if($started){& (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop;if($LASTEXITCODE -ne 0){throw 'CLUSTER_STOP_FAILED'}}
 if(Test-Path -LiteralPath $cluster){
  if([IO.Path]::GetFullPath($cluster) -ne (Join-Path $root 'tmp\phase48-production-cert\cluster')){throw 'CLEANUP_PATH_MISMATCH'}
  if((Get-Item -LiteralPath $cluster).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CLEANUP_REPARSE_REFUSED'}
  if(Test-Path -LiteralPath (Join-Path $cluster 'postmaster.pid')){throw 'RUNNING_CLUSTER_REFUSED'}
  Remove-Item -LiteralPath $cluster -Recurse -Force
 }
 foreach($file in (Get-ChildItem -LiteralPath $task -File)){if($file.Name -match '\.raw\.|^globals-local\.sql$|^use-list\.txt$'){Remove-Item -LiteralPath $file.FullName -Force}}
 Set-Content -LiteralPath (Join-Path $task 'cleanup.json') -Value '{"cluster_stopped":true,"cluster_removed":true,"raw_temporaries_removed":true,"production_connections":0,"production_writes":0}' -Encoding UTF8
}
exit $certificateExit
