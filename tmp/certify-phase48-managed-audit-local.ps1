$ErrorActionPreference = 'Stop'
$root = 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'
if ((Resolve-Path -LiteralPath '.').Path -ne $root) { throw 'WORKSPACE_MISMATCH' }
$bin = 'C:\Program Files\PostgreSQL\17\bin'
$tls = Join-Path $root 'src\tests\fixtures\phase48-tls'
$run = Join-Path $root ('tmp\phase48-managed-audit-' + [guid]::NewGuid().ToString('N'))
$cluster = Join-Path $run 'cluster'
$receipts = Join-Path $root ('reports\phase48-managed-dependency-audit-receipts\' + (Split-Path -Leaf $run))
$log = Join-Path $run 'postgres.log'
$port = $null
$postgresPid = $null
$started = $false
$success = $false
New-Item -ItemType Directory -Path $run | Out-Null
New-Item -ItemType Directory -Path $receipts | Out-Null
try {
  if ((& (Join-Path $bin 'postgres.exe') --version) -notmatch '17\.11') { throw 'POSTGRES_17_11_REQUIRED' }
  & (Join-Path $bin 'initdb.exe') -D $cluster -U postgres --auth-local=trust --auth-host=trust -E UTF8 *> (Join-Path $run 'initdb.log')
  if ($LASTEXITCODE -ne 0) { throw 'INITDB_FAILED' }
  $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'), 0)
  try { $listener.Start(); $port = ([Net.IPEndPoint]$listener.LocalEndpoint).Port } finally { $listener.Stop() }
  if ($port -lt 49152) { throw 'PORT_NOT_HIGH' }
  $cert = (Join-Path $tls 'server.crt').Replace('\','/')
  $key = (Join-Path $tls 'server-test-only.key').Replace('\','/')
  Add-Content -LiteralPath (Join-Path $cluster 'postgresql.conf') -Encoding ascii -Value @("ssl=on", "ssl_min_protocol_version='TLSv1.3'", "ssl_cert_file='$cert'", "ssl_key_file='$key'", "port=$port", "listen_addresses='127.0.0.1'", "log_statement='none'", 'autovacuum=off')
  $args = '-D "' + $cluster + '" -l "' + $log + '" -o "-p ' + $port + ' -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0" -w start'
  $starter = Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $run 'start.out') -RedirectStandardError (Join-Path $run 'start.err')
  if (-not $starter.WaitForExit(30000)) { throw 'START_TIMEOUT' }
  & (Join-Path $bin 'pg_ctl.exe') -D $cluster status *> (Join-Path $run 'status.log')
  if ($LASTEXITCODE -ne 0) { throw 'START_FAILED' }
  $started = $true
  $postgresPid = [int](Get-Content -LiteralPath (Join-Path $cluster 'postmaster.pid') -TotalCount 1)
  $proc = Get-CimInstance Win32_Process -Filter "ProcessId=$postgresPid"
  $norm = $cluster.Replace('\','/')
  if (-not $proc -or $proc.ExecutablePath -ne (Join-Path $bin 'postgres.exe') -or $proc.CommandLine.Replace('\','/') -notlike "*$norm*") { throw 'OWNERSHIP_FAILED' }
  & (Join-Path $bin 'pg_isready.exe') -h 127.0.0.1 -p $port -U postgres -d postgres *> (Join-Path $run 'ready.log')
  if ($LASTEXITCODE -ne 0) { throw 'NOT_READY' }
  $sql = @'
CREATE ROLE managed_audit_owner NOLOGIN;
CREATE SCHEMA extensions;
CREATE FUNCTION extensions.pgrst_ddl_watch() RETURNS event_trigger LANGUAGE plpgsql SET search_path TO '' AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION extensions.pgrst_drop_watch() RETURNS event_trigger LANGUAGE plpgsql SET search_path TO '' AS $$ BEGIN RETURN; END $$;
CREATE FUNCTION public.unrelated_audit_event() RETURNS event_trigger LANGUAGE plpgsql AS $$ BEGIN RETURN; END $$;
ALTER FUNCTION extensions.pgrst_ddl_watch() OWNER TO managed_audit_owner;
CREATE EVENT TRIGGER pgrst_ddl_watch ON ddl_command_end EXECUTE FUNCTION extensions.pgrst_ddl_watch();
CREATE EVENT TRIGGER pgrst_drop_watch ON sql_drop EXECUTE FUNCTION extensions.pgrst_drop_watch();
CREATE EVENT TRIGGER unrelated_audit_event ON ddl_command_start EXECUTE FUNCTION public.unrelated_audit_event();
'@
  & (Join-Path $bin 'psql.exe') -h 127.0.0.1 -p $port -U postgres -d postgres -X -v ON_ERROR_STOP=1 -c $sql *> (Join-Path $run 'fixture.log')
  if ($LASTEXITCODE -ne 0) { throw 'FIXTURE_CREATE_FAILED' }
  $env:PHASE48_MANAGED_AUDIT_LOCAL = 'true'
  $env:PHASE48_MANAGED_AUDIT_PORT = [string]$port
  $env:PHASE48_MANAGED_AUDIT_CA = Join-Path $tls 'ca.crt'
  $env:PHASE48_MANAGED_AUDIT_RECEIPTS = $receipts
  $env:PHASE48_MANAGED_AUDIT_DATA_DIRECTORY = $cluster
  $env:PHASE48_MANAGED_AUDIT_POSTMASTER_PID = [string]$postgresPid
  $env:PHASE48_MANAGED_AUDIT_CERTIFICATE_PATH = Join-Path $root ('reports\phase48-managed-dependency-audit-local-' + [guid]::NewGuid().ToString('N') + '.json')
  node --import tsx --test src/tests/phase48.managed-dependency-audit.test.ts *> (Join-Path $run 'test.log')
  if ($LASTEXITCODE -ne 0) { Get-Content -LiteralPath (Join-Path $run 'test.log'); throw 'LOCAL_AUDIT_TEST_FAILED' }
  $success = $true
  Get-Content -LiteralPath (Join-Path $run 'test.log')
  $certificateHash = (Get-FileHash -LiteralPath $env:PHASE48_MANAGED_AUDIT_CERTIFICATE_PATH -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{certificate=$env:PHASE48_MANAGED_AUDIT_CERTIFICATE_PATH;sha256=$certificateHash;bytes=(Get-Item -LiteralPath $env:PHASE48_MANAGED_AUDIT_CERTIFICATE_PATH).Length;port=$port;postmaster_pid=$postgresPid;cluster=$cluster}|ConvertTo-Json -Compress
} catch {
  Write-Output ('LOCAL_FAILURE=' + $_.Exception.Message)
  if (Test-Path -LiteralPath $log) { Get-Content -LiteralPath $log -Tail 30 }
  throw
} finally {
  Remove-Item Env:\PHASE48_MANAGED_AUDIT_LOCAL -ErrorAction SilentlyContinue
  Remove-Item Env:\PHASE48_MANAGED_AUDIT_PORT -ErrorAction SilentlyContinue
  Remove-Item Env:\PHASE48_MANAGED_AUDIT_CA -ErrorAction SilentlyContinue
  Remove-Item Env:\PHASE48_MANAGED_AUDIT_RECEIPTS -ErrorAction SilentlyContinue
  Remove-Item Env:\PHASE48_MANAGED_AUDIT_DATA_DIRECTORY -ErrorAction SilentlyContinue
  Remove-Item Env:\PHASE48_MANAGED_AUDIT_POSTMASTER_PID -ErrorAction SilentlyContinue
  Remove-Item Env:\PHASE48_MANAGED_AUDIT_CERTIFICATE_PATH -ErrorAction SilentlyContinue
  if (-not $started -and (Test-Path -LiteralPath (Join-Path $cluster 'postmaster.pid'))) {
    $possible = [int](Get-Content -LiteralPath (Join-Path $cluster 'postmaster.pid') -TotalCount 1)
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$possible"
    if ($owner -and $owner.ExecutablePath -eq (Join-Path $bin 'postgres.exe') -and $owner.CommandLine.Replace('\','/').Contains($cluster.Replace('\','/'))) { $postgresPid = $possible; $started = $true }
  }
  if ($started) { & (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop *> (Join-Path $run 'stop.log'); if ($LASTEXITCODE -ne 0) { throw 'OWN_CLUSTER_STOP_FAILED' } }
  if ($postgresPid -and (Get-CimInstance Win32_Process -Filter "ProcessId=$postgresPid")) { throw 'OWN_PROCESS_REMAINS' }
  if ($success -and $started -and (Test-Path -LiteralPath $cluster)) {
    $resolvedRun = (Resolve-Path -LiteralPath $run).Path
    if (-not $resolvedRun.StartsWith((Join-Path $root 'tmp') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'TEMP_PATH_INVALID' }
    Remove-Item -LiteralPath $run -Recurse -Force
  }
}
