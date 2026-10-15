param([switch]$ResumeStartedCluster)
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'){throw 'WORKSPACE_MISMATCH'}
if((git -C $root branch --show-current).Trim() -ne 'fix/phase48-v6-production-entry'){throw 'BRANCH_MISMATCH'}
$cluster=Join-Path $root 'tmp\phase48-pooler-local\dynamic-cluster'
$bin='C:\Program Files\PostgreSQL\17\bin'
$prior=Join-Path $root 'tmp\phase48-v6-local\run-20261015T005605418Z\proof.tap'
if((Select-String -LiteralPath $prior -Pattern '^ok [1-4] -').Count -ne 4){throw 'PRIOR_PROOF_MISMATCH'}
$task=Join-Path $root ('tmp\phase48-v6-local\resume-'+[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ'))
New-Item -ItemType Directory -Path $task | Out-Null
$started=$false
try {
 & (Join-Path $bin 'pg_ctl.exe') -D $cluster status *> (Join-Path $task 'prior-status.log')
 $running=$LASTEXITCODE -eq 0
 if($running -and -not $ResumeStartedCluster){throw 'RUNNING_CLUSTER_REFUSED'}
 if(-not $running){
 $probe=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,55470)
 try{$probe.Start()}finally{$probe.Stop()}
 $args="-D `"$cluster`" -l `"$(Join-Path $task 'server.log')`" -o `"-p 55470 -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off`" -w start"
 $p=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $task 'start.out') -RedirectStandardError (Join-Path $task 'start.err')
 if(-not $p.WaitForExit(30000)){throw 'LOCAL_CLUSTER_START_TIMEOUT'}
 & (Join-Path $bin 'pg_ctl.exe') -D $cluster status *> (Join-Path $task 'started-status.log')
 if($LASTEXITCODE -ne 0){throw 'LOCAL_CLUSTER_START_FAILED'}
 }
 $started=$true
 $env:PHASE48_DYNAMIC_LOCAL_CERT='true'
 Push-Location -LiteralPath $root
 try {
  & node --require ./src/scripts/phase48-dynamic-local-guard.cjs --import tsx --test --test-concurrency=1 --test-reporter=tap '--test-skip-pattern=^V6 full 740 COMMIT|^V6 complete data/schema/sequence rollback at (BEFORE_PHASE48|AFTER_PHASE48|AFTER_ALBENY)$' src/tests/phase48.v6-production-local.test.ts *> (Join-Path $task 'proof.tap')
  $certificateExit=$LASTEXITCODE
 } finally {Pop-Location}
} finally {
 Remove-Item Env:\PHASE48_DYNAMIC_LOCAL_CERT -ErrorAction SilentlyContinue
 if($started){& (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop *> (Join-Path $task 'stop.log');if($LASTEXITCODE -ne 0){throw 'LOCAL_STOP_FAILED'}}
 # Preserve the interrupted cluster, prior logs, receipts, and resumed evidence.
}
Get-Content -LiteralPath (Join-Path $task 'proof.tap')
Write-Output ('CERTIFICATION_EVIDENCE='+$task)
exit $certificateExit
