param([switch]$Resume,[string]$Pattern='')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'){throw 'WORKSPACE_MISMATCH'}
if((git -C $root branch --show-current).Trim() -ne 'fix/phase48-v6-execution-window'){throw 'BRANCH_MISMATCH'}
$cluster=Join-Path $root 'tmp\phase48-v6-window-local\cluster'
$bin='C:\Program Files\PostgreSQL\17\bin'
if((& (Join-Path $bin 'postgres.exe') --version) -notmatch '17\.11'){throw 'POSTGRES_17_11_REQUIRED'}
$task=Join-Path $root ('tmp\phase48-v6-window-local\run-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
New-Item -ItemType Directory -Path $task | Out-Null
if((Test-Path -LiteralPath $cluster) -and -not $Resume){throw 'PRESERVED_CLUSTER_REQUIRES_RESUME'}
$probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,55470)
try{$probe.Start()}finally{$probe.Stop()}
if(-not (Test-Path -LiteralPath $cluster)){
 & (Join-Path $bin 'initdb.exe') -D $cluster -U phase48_dynamic_local --auth=trust --encoding=UTF8 --locale=C *> (Join-Path $task 'init.log')
 if($LASTEXITCODE -ne 0){throw 'INITDB_FAILED'}
}
$started=$false
try{
 $args="-D `"$cluster`" -l `"$(Join-Path $task 'server.log')`" -o `"-p 55470 -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off`" -w start"
 $p=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $task 'start.out') -RedirectStandardError (Join-Path $task 'start.err')
 if(-not $p.WaitForExit(30000)){throw 'LOCAL_START_TIMEOUT'}
 & (Join-Path $bin 'pg_ctl.exe') -D $cluster status *> (Join-Path $task 'status.log')
 if($LASTEXITCODE -ne 0){throw 'LOCAL_START_FAILED'}
 $started=$true
 $env:PHASE48_DYNAMIC_LOCAL_CERT='true'
 $env:PHASE48_WINDOW_LOCAL_CERT='true'
 Push-Location -LiteralPath $root
 try{
  $testArgs=@('--require','./src/scripts/phase48-dynamic-local-guard.cjs','--import','tsx','--test','--test-concurrency=1','--test-reporter=tap')
  if($Pattern){$testArgs+=('--test-name-pattern='+$Pattern)}
  $testArgs+='src/tests/phase48.v6-production-local.test.ts'
  & node @testArgs *> (Join-Path $task 'proof.tap')
  $certificateExit=$LASTEXITCODE
 }finally{Pop-Location}
}finally{
 Remove-Item Env:\PHASE48_DYNAMIC_LOCAL_CERT -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_WINDOW_LOCAL_CERT -ErrorAction SilentlyContinue
 if($started){& (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop *> (Join-Path $task 'stop.log');if($LASTEXITCODE -ne 0){throw 'LOCAL_STOP_FAILED'}}
}
Get-Content -LiteralPath (Join-Path $task 'proof.tap')
Write-Output ('CERTIFICATION_EVIDENCE='+$task)
exit $certificateExit
