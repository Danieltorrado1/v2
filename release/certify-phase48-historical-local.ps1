param([switch]$ResumeCertificationCluster,[switch]$FreshLocalRestoration)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$task = Join-Path $root 'tmp\phase48-historical-cert'
$cluster = [IO.Path]::GetFullPath((Join-Path $task 'cluster'))
$owner = Join-Path $task 'cluster-owner.txt'
$bin = 'C:\Program Files\PostgreSQL\17\bin'
if ($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad') { throw 'WORKSPACE_MISMATCH' }
if ((git -C $root branch --show-current) -ne 'fix/phase48-correcciones-historicas') { throw 'BRANCH_MISMATCH' }
if ((& (Join-Path $bin 'postgres.exe') --version).Trim() -ne 'postgres (PostgreSQL) 17.11') { throw 'POSTGRES_17_11_REQUIRED' }
if (-not $cluster.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'CLUSTER_OUTSIDE_WORKSPACE' }
if ((Test-Path -LiteralPath $cluster) -and -not $ResumeCertificationCluster) { throw 'EXISTING_CLUSTER_REFUSED' }
if ($ResumeCertificationCluster -and (-not (Test-Path -LiteralPath $owner) -or (Get-Content -LiteralPath $owner -Raw).Trim() -ne $cluster)) { throw 'CLUSTER_OWNERSHIP_REQUIRED' }
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,55465)
try { $probe.Start() } finally { $probe.Stop() }
New-Item -ItemType Directory -Path $task -Force | Out-Null
if (-not $ResumeCertificationCluster) {
  Set-Content -LiteralPath $owner -Value $cluster -Encoding UTF8
  & (Join-Path $bin 'initdb.exe') -D $cluster -U modalidad_verifier --auth=trust --encoding=UTF8 --locale=C *> (Join-Path $task 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'INITDB_FAILED' }
}
$started = $false
$certified = $false
try {
  $startArgs = "-D `"$cluster`" -l `"$(Join-Path $task 'server.log')`" -o `"-p 55465 -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off -c shared_preload_libraries=`" -w start"
  $p = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $task 'start.out') -RedirectStandardError (Join-Path $task 'start.err')
  $started = $true
  if (-not $p.WaitForExit(30000)) { throw 'STARTUP_TIMEOUT' }
  & (Join-Path $bin 'pg_ctl.exe') -D $cluster status | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'STARTUP_FAILED' }
  Push-Location -LiteralPath $root
  try {
    if ($FreshLocalRestoration) {
      & node src/scripts/certify-phase48-historical-local.cjs --fresh-local-restoration
    } else {
      & node src/scripts/certify-phase48-historical-local.cjs
    }
    if ($LASTEXITCODE -ne 0) { throw 'LOCAL_CERTIFICATION_FAILED' }
    $certified = $true
  } finally { Pop-Location }
} finally {
  if ($started) {
    & (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw 'SHUTDOWN_FAILED' }
  }
}
if ($certified) {
  # Delete only this certificate's new, stopped cluster, never backups or any
  # pre-existing cluster. The identity is also checked by every DB executor.
  if ([IO.Path]::GetFullPath($cluster) -ne (Join-Path $root 'tmp\phase48-historical-cert\cluster')) { throw 'CLEANUP_PATH_MISMATCH' }
  if ((Get-Content -LiteralPath $owner -Raw).Trim() -ne $cluster) { throw 'CLEANUP_OWNERSHIP_MISMATCH' }
  if ((Get-Item -LiteralPath $cluster).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'CLEANUP_REPARSE_POINT_REFUSED' }
  if (Test-Path -LiteralPath (Join-Path $cluster 'postmaster.pid')) { throw 'CLEANUP_RUNNING_CLUSTER_REFUSED' }
  Remove-Item -LiteralPath $cluster -Recurse -Force
  Set-Content -LiteralPath (Join-Path $task 'cluster-cleanup.json') -Value '{"stopped":true,"removed":true,"production_writes":0}' -Encoding UTF8
}
