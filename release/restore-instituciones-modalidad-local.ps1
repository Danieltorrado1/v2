$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$taskDirectory = Join-Path $root 'tmp\modalidad-release-cert'
$cluster = [IO.Path]::GetFullPath((Join-Path $taskDirectory 'cluster'))
$bin = 'C:\Program Files\PostgreSQL\17\bin'
if (-not $cluster.StartsWith($root + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Cluster outside this worktree' }
if (Test-Path -LiteralPath $cluster) { throw 'Existing cluster: refuse to initialize, reuse or alter it' }
if ((git -C $root branch --show-current) -ne 'release/instituciones-cambio-modalidad-vigente') { throw 'Release branch required' }
if ((& (Join-Path $bin 'postgres.exe') --version) -notmatch 'PostgreSQL\) 17\.') { throw 'PostgreSQL 17.x required' }
$probe = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 55463)
try { $probe.Start() } finally { $probe.Stop() }
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
& (Join-Path $bin 'initdb.exe') -D $cluster -U modalidad_verifier --auth=trust --encoding=UTF8 --locale=C
if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
$serverLog = Join-Path $taskDirectory 'server.log'
$startArguments = "-D `"$cluster`" -l `"$serverLog`" -o `"-p 55463 -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off -c shared_preload_libraries=`" -w start"
$started = $false
try {
  # Do not use Start-Process -Wait: it also waits for the server descendant.
  $taskProcess = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $startArguments -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $taskDirectory 'start.out') -RedirectStandardError (Join-Path $taskDirectory 'start.err')
  $started = $true
  if (-not $taskProcess.WaitForExit(30000) -or $taskProcess.ExitCode -ne 0) { throw 'Cluster startup failed' }
  Push-Location -LiteralPath $root
  try {
    & node src/scripts/certify-instituciones-modalidad-sql-local.cjs
    if ($LASTEXITCODE -ne 0) { throw 'Local restore/SQL certification failed' }
    & (Join-Path $bin 'psql.exe') -X --host=127.0.0.1 --port=55463 --username=modalidad_verifier --dbname=modalidad_release --no-password --set=ON_ERROR_STOP=1 --set=actor_id=12 --file=release/preflight-instituciones-modalidad-readonly.sql --output=tmp/modalidad-release-cert/preflight-local.txt
    if ($LASTEXITCODE -ne 0) { throw 'Local readonly preflight failed' }
  } finally { Pop-Location }
} finally {
  if ($started) {
    & (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop
    if ($LASTEXITCODE -ne 0) { throw 'Check this task cluster shutdown; no other cluster was targeted' }
  }
}
# Preserve the new stopped cluster and logs; never delete existing backups/data.
