$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'){throw 'WORKSPACE_MISMATCH'}
if((git -C $root branch --show-current).Trim() -ne 'fix/phase48-v6-sha-comparison-unification'){throw 'BRANCH_MISMATCH'}
$bin='C:\Program Files\PostgreSQL\17\bin';$openssl='C:\Program Files\Git\usr\bin\openssl.exe'
if((& (Join-Path $bin 'postgres.exe') --version) -notmatch '17\.11'){throw 'POSTGRES_17_11_REQUIRED'}
if(-not (Test-Path -LiteralPath $openssl)){throw 'LOCAL_OPENSSL_REQUIRED'}
# This gate requires a clean committed release tree. Run it before creating
# this harness's disposable cluster and receipts.
Push-Location -LiteralPath $root
try { & node --import tsx --test src/tests/phase48.v6-cli-parser.test.ts; if($LASTEXITCODE -ne 0){throw 'V6_LAUNCHER_TESTS_FAILED'} } finally {Pop-Location}
$source=Join-Path $root 'tmp\phase48-v6-window-local\cluster'
& (Join-Path $bin 'pg_ctl.exe') -D $source status *> $null
if($LASTEXITCODE -eq 0){throw 'PRESERVED_SOURCE_CLUSTER_MUST_REMAIN_STOPPED'}
$taskRoot=Join-Path $root 'tmp\phase48-v6-read-query-certification'
New-Item -ItemType Directory -Path $taskRoot -Force | Out-Null
$task=Join-Path $taskRoot ('run-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $task | Out-Null
$cluster=Join-Path $task 'cluster';$started=$false;$port=$null;$serverPid=$null;$success=$false
$log=Join-Path $task 'postgres.log';$receiptDir=Join-Path $task 'receipts';$ca=Join-Path $task 'server.crt';$key=Join-Path $task 'server.key'
try {
 Copy-Item -LiteralPath $source -Destination $cluster -Recurse
 $listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Parse('127.0.0.1'),0)
 try{$listener.Start();$port=([Net.IPEndPoint]$listener.LocalEndpoint).Port}finally{$listener.Stop()}
 if($port -lt 49152 -or $port -gt 65535){throw 'DYNAMIC_PORT_OUT_OF_RANGE'}
 $opensslArgs='req -x509 -newkey rsa:2048 -sha256 -days 1 -nodes -keyout "'+$key+'" -out "'+$ca+'" -subj /CN=localhost -addext subjectAltName=DNS:localhost,IP:127.0.0.1 -addext extendedKeyUsage=serverAuth'
 $opensslProc=Start-Process -FilePath $openssl -ArgumentList $opensslArgs -WindowStyle Hidden -PassThru -Wait -RedirectStandardOutput (Join-Path $task 'openssl.out') -RedirectStandardError (Join-Path $task 'openssl.log')
 if($opensslProc.ExitCode -ne 0){throw 'LOCAL_TLS_FIXTURE_FAILED'}
 $caConf=$ca.Replace('\','/');$keyConf=$key.Replace('\','/')
 Add-Content -LiteralPath (Join-Path $cluster 'postgresql.conf') -Encoding ASCII -Value @("ssl=on","ssl_min_protocol_version='TLSv1.3'","ssl_cert_file='$caConf'","ssl_key_file='$keyConf'","port=$port","listen_addresses='127.0.0.1'")
 $args="-D `"$cluster`" -l `"$log`" -o `"-p $port -h 127.0.0.1 -c max_worker_processes=0 -c max_parallel_workers=0 -c max_logical_replication_workers=0 -c autovacuum=off`" -w start"
 $proc=Start-Process -FilePath (Join-Path $bin 'pg_ctl.exe') -ArgumentList $args -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $task 'start.out') -RedirectStandardError (Join-Path $task 'start.err')
 if(-not $proc.WaitForExit(30000)){throw 'LOCAL_START_TIMEOUT'}
 & (Join-Path $bin 'pg_ctl.exe') -D $cluster status *> (Join-Path $task 'status.log')
 if($LASTEXITCODE -ne 0){throw 'LOCAL_BIND_FAILURE_NO_DETERMINABLE'}
 $started=$true
 $pidFile=Join-Path $cluster 'postmaster.pid';if(-not (Test-Path -LiteralPath $pidFile)){throw 'POSTMASTER_PID_MISSING'}
 $serverPid=[int](Get-Content -LiteralPath $pidFile -TotalCount 1)
 $process=Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"
 $normalizedCluster=$cluster.Replace('\','/')
 if(-not $process -or $process.ExecutablePath -ne (Join-Path $bin 'postgres.exe') -or $process.CommandLine.Replace('\','/') -notlike "*$normalizedCluster*" -or $process.CommandLine -notmatch "(?<!\d)$port(?!\d)"){throw 'CLUSTER_PROCESS_OWNERSHIP_FAILED'}
 $deadline=[DateTime]::UtcNow.AddSeconds(30);$ready=$false
 do { & (Join-Path $bin 'pg_isready.exe') -h 127.0.0.1 -p $port -U phase48_dynamic_local -d postgres *> $null;if($LASTEXITCODE -eq 0){$ready=$true;break};Start-Sleep -Milliseconds 250 } while([DateTime]::UtcNow -lt $deadline)
 if(-not $ready){throw 'LOCAL_READINESS_FAILED'}
 $stamp=[DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ')+'-'+[guid]::NewGuid().ToString('N')
 $certificate=Join-Path $root ('reports\phase48-v6-read-query-certificate-'+$stamp+'.local.json')
 $receiptExport=Join-Path $root ('reports\phase48-v6-read-query-'+$stamp+'.receipt.json')
 $stream=[IO.File]::Open($certificate,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=[Text.Encoding]::UTF8.GetBytes('{}'+[Environment]::NewLine);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
 $env:PHASE48_READ_QUERY_LOCAL_CERT='true';$env:PHASE48_DYNAMIC_LOCAL_CERT='true';$env:PHASE48_WINDOW_LOCAL_CERT='true';$env:PHASE48_READ_QUERY_LOCAL_PORT=[string]$port;$env:PHASE48_READ_QUERY_LOCAL_CA=$ca;$env:PHASE48_READ_QUERY_LOCAL_RECEIPTS=$receiptDir;$env:PHASE48_READ_QUERY_LOCAL_CLUSTER=$cluster;$env:PHASE48_READ_QUERY_LOCAL_PID=[string]$serverPid;$env:PHASE48_READ_QUERY_LOCAL_RECEIPT_OUT=$receiptExport
 $env:PHASE48_READ_QUERY_LOCAL_CERTIFICATE=$certificate
 Push-Location -LiteralPath $root
 try {
  & node --import tsx --test --test-concurrency=1 src/tests/phase48.v6-read-query-postgres-local.test.ts; if($LASTEXITCODE -ne 0){throw 'LOCAL_READ_QUERY_TESTS_FAILED'}
  & node --import tsx --test --test-concurrency=1 src/tests/phase48.v6-read-query-diagnostic.test.ts src/tests/phase48.v6-window-local.test.ts src/tests/phase48.atomic-mutator-regression.test.ts src/tests/phase48.atomic-receipts.test.ts; if($LASTEXITCODE -ne 0){throw 'LOCAL_V6_REGRESSIONS_FAILED'}
 } finally {Pop-Location}
 $success=$true
 [pscustomobject]@{status='LOCAL_READ_QUERY_CERTIFICATION_PASSED';postgres='17.11';port=$port;pid=$serverPid;data_directory=$cluster;certificate=$certificate}|ConvertTo-Json -Depth 5
} catch {
 Write-Error $_
 if(Test-Path -LiteralPath $log){Write-Output ('SANITIZED_SERVER_LOG='+$log);Get-Content -LiteralPath $log -Tail 25}
 throw
} finally {
 Remove-Item Env:\PHASE48_READ_QUERY_LOCAL_CERT -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_DYNAMIC_LOCAL_CERT -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_WINDOW_LOCAL_CERT -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_READ_QUERY_LOCAL_PORT -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_READ_QUERY_LOCAL_CA -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_READ_QUERY_LOCAL_RECEIPTS -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_READ_QUERY_LOCAL_CERTIFICATE -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_READ_QUERY_LOCAL_CLUSTER -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_READ_QUERY_LOCAL_PID -ErrorAction SilentlyContinue
 Remove-Item Env:\PHASE48_READ_QUERY_LOCAL_RECEIPT_OUT -ErrorAction SilentlyContinue
 if($started){& (Join-Path $bin 'pg_ctl.exe') -D $cluster -m fast -w stop *> (Join-Path $task 'stop.log');if($LASTEXITCODE -ne 0){throw 'OWNED_CLUSTER_STOP_FAILED'}}
 if($serverPid){if(Get-CimInstance Win32_Process -Filter "ProcessId=$serverPid"){throw 'OWNED_POSTGRES_PROCESS_REMAINS'}}
 if($port){$residual=Get-NetTCPConnection -LocalAddress '127.0.0.1' -LocalPort $port -State Listen -ErrorAction SilentlyContinue|Where-Object OwningProcess -eq $serverPid;if($residual){throw 'OWNED_LISTENER_REMAINS'}}
 if($success){$resolvedRoot=(Resolve-Path -LiteralPath $taskRoot).Path;$resolvedTask=(Resolve-Path -LiteralPath $task).Path;if(-not $resolvedTask.StartsWith($resolvedRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'OWNED_TEMP_PATH_INVALID'};Remove-Item -LiteralPath $task -Recurse}
}
