$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$cluster=[IO.Path]::GetFullPath((Join-Path $root 'tmp\phase48-pooler-local\dynamic-cluster'))
$bin='C:\Program Files\PostgreSQL\17\bin'
$task=Join-Path $root ('tmp\phase48-v6-local\run-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
if($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'){throw 'WORKSPACE_MISMATCH'}
if((git -C $root branch --show-current).Trim() -ne 'fix/phase48-v6-production-entry'){throw 'BRANCH_MISMATCH'}
if(Test-Path -LiteralPath $cluster){throw 'PREEXISTING_CLUSTER_REFUSED'}
if((& (Join-Path $bin 'postgres.exe') --version) -notmatch '17\.11'){throw 'POSTGRES_17_11_REQUIRED'}
$probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,55470)
try{$probe.Start()}finally{$probe.Stop()}
New-Item -ItemType Directory -Path $task -Force | Out-Null
$started=$false
try{
 & (Join-Path $bin 'initdb.exe') -D $cluster -U phase48_dynamic_local --auth=trust --encoding=UTF8 --locale=C *> (Join-Path $task 'init.log')
 if($LASTEXITCODE -ne 0){throw 'INITDB_FAILED'}
 $startArgs="-D `"$cluster`" -l `"$(Join-Path $task 'server.log')`" -o `"-p 55470 -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off`" -w start"
 $started=$true
 $p=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $task 'start.out') -RedirectStandardError (Join-Path $task 'start.err')
 if(-not $p.WaitForExit(30000)){throw 'CLUSTER_START_TIMEOUT'}
 & (Join-Path $bin 'pg_ctl.exe') -D $cluster status | Out-Null
 if($LASTEXITCODE -ne 0){throw 'CLUSTER_START_FAILED'}
 $env:PHASE48_DYNAMIC_LOCAL_CERT='true'
 Push-Location -LiteralPath $root
 try{& node --require ./src/scripts/phase48-dynamic-local-guard.cjs --import tsx --test --test-concurrency=1 --test-reporter=tap src/tests/phase48.v6-production-local.test.ts | Out-File -LiteralPath (Join-Path $task 'proof.tap') -Encoding utf8;$certificateExit=$LASTEXITCODE}finally{Pop-Location}
}finally{
 Remove-Item Env:\PHASE48_DYNAMIC_LOCAL_CERT -ErrorAction SilentlyContinue
 if($started){& (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop *> (Join-Path $task 'stop.log');if($LASTEXITCODE -ne 0){throw 'CLUSTER_STOP_FAILED'}}
 # Preserve cluster files and all partial certification evidence after stopping.
}
Get-Content -LiteralPath (Join-Path $task 'proof.tap')
Write-Output ('CERTIFICATION_EVIDENCE='+$task)
exit $certificateExit
