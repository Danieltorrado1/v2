$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$task=Join-Path $root 'tmp\phase48-pooler-local'
$cluster=[IO.Path]::GetFullPath((Join-Path $task 'dynamic-cluster'))
$bin='C:\Program Files\PostgreSQL\17\bin'
if($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'){throw 'WORKSPACE_MISMATCH'}
if((git -C $root branch --show-current).Trim() -ne 'fix/phase48-close-assignment-1203'){throw 'BRANCH_MISMATCH'}
if(Test-Path -LiteralPath $cluster){throw 'PREEXISTING_CLUSTER_REFUSED'}
if((& (Join-Path $bin 'postgres.exe') --version) -notmatch '17\.11'){throw 'POSTGRES_17_11_REQUIRED'}
$probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,55470)
try{$probe.Start()}finally{$probe.Stop()}
New-Item -ItemType Directory -Path $task -Force | Out-Null
$started=$false
try{
 & (Join-Path $bin 'initdb.exe') -D $cluster -U phase48_dynamic_local --auth=trust --encoding=UTF8 --locale=C *> (Join-Path $task 'dynamic-init.raw.log')
 if($LASTEXITCODE -ne 0){throw 'INITDB_FAILED'}
 $startArgs="-D `"$cluster`" -l `"$(Join-Path $task 'dynamic-server.raw.log')`" -o `"-p 55470 -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c autovacuum=off`" -w start"
 $started=$true
 $p=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $task 'dynamic-start.raw.out') -RedirectStandardError (Join-Path $task 'dynamic-start.raw.err')
 if(-not $p.WaitForExit(30000)){throw 'CLUSTER_START_TIMEOUT'}
 & (Join-Path $bin 'pg_ctl.exe') -D $cluster status | Out-Null
 if($LASTEXITCODE -ne 0){throw 'CLUSTER_START_FAILED'}
 $env:PHASE48_DYNAMIC_LOCAL_CERT='true'
 Push-Location -LiteralPath $root
 try{& node --require ./src/scripts/phase48-dynamic-local-guard.cjs --import tsx --test --test-concurrency=1 --test-reporter=tap src/tests/phase48.close1203-local.test.ts src/tests/phase48.scoped-local.test.ts src/tests/phase48.fk-parser-local.test.ts src/tests/phase48.dynamic-local.test.ts src/tests/phase48.managed-events-local.test.ts src/tests/phase48.constant-sql-local.test.ts src/tests/phase48.pseudorecord-local.test.ts | Out-File -LiteralPath (Join-Path $task 'close1203-proof.tap') -Encoding utf8;$certificateExit=$LASTEXITCODE}finally{Pop-Location}
}finally{
 Remove-Item Env:\PHASE48_DYNAMIC_LOCAL_CERT -ErrorAction SilentlyContinue
 if($started){& (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop;if($LASTEXITCODE -ne 0){throw 'CLUSTER_STOP_FAILED'}}
 if(Test-Path -LiteralPath $cluster){
  if([IO.Path]::GetFullPath($cluster) -ne (Join-Path $root 'tmp\phase48-pooler-local\dynamic-cluster')){throw 'CLEANUP_PATH_MISMATCH'}
  if((Get-Item -LiteralPath $cluster).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'CLEANUP_REPARSE_REFUSED'}
  if(Test-Path -LiteralPath (Join-Path $cluster 'postmaster.pid')){throw 'RUNNING_CLUSTER_REFUSED'}
  Remove-Item -LiteralPath $cluster -Recurse -Force
 }
 foreach($file in (Get-ChildItem -LiteralPath $task -File)){if($file.Name -match '^dynamic-.*\.raw\.'){Remove-Item -LiteralPath $file.FullName -Force}}
}
Get-Content -LiteralPath (Join-Path $task 'close1203-proof.tap')
exit $certificateExit
