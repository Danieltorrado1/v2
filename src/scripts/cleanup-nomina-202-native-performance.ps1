param([Parameter(Mandatory=$true)][string[]]$ReportDirectory)
$ErrorActionPreference='Stop'
$taskRoot=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$reportsRoot=Join-Path $taskRoot 'reports'
$tmpRoot=Join-Path $taskRoot 'tmp'
$processes=@(Get-CimInstance Win32_Process -Filter "Name='postgres.exe'")
foreach($directory in $ReportDirectory){
    $evidenceRoot=[IO.Path]::GetFullPath($directory)
    $name=[IO.Path]::GetFileName($evidenceRoot)
    if([IO.Path]::GetDirectoryName($evidenceRoot) -ne $reportsRoot -or $name -notmatch '^nomina-202-performance-(\d{8}T\d{6}Z)$'){throw 'REPORT_PATH_REJECTED'}
    $stamp=$Matches[1]
    $receipt=Get-Content -LiteralPath (Join-Path $evidenceRoot 'report.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $target=[IO.Path]::GetFullPath((Join-Path $tmpRoot ('nomina-202-performance-cluster-'+$stamp)))
    if([IO.Path]::GetDirectoryName($target) -ne $tmpRoot -or [IO.Path]::GetFullPath($receipt.cleanup.cluster) -ne $target -or -not $receipt.cleanup.stopped){throw 'CLUSTER_OWNERSHIP_OR_STOP_EVIDENCE_REJECTED'}
    if(-not $target.StartsWith($taskRoot+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'TARGET_OUTSIDE_WORKSPACE'}
    if((Get-Item -LiteralPath $target).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'REPARSE_CLUSTER_REFUSED'}
    if(@(Get-ChildItem -LiteralPath $target -Recurse -Force | Where-Object {$_.Attributes -band [IO.FileAttributes]::ReparsePoint}).Count){throw 'REPARSE_DESCENDANT_REFUSED'}
    $status=(& 'C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe' -D $target status 2>&1 | Out-String)
    if($LASTEXITCODE -ne 3){throw 'OWN_CLUSTER_NOT_STOPPED'}
    $logPath=Join-Path $evidenceRoot 'server.private.log'
    $ownIds=@([regex]::Matches((Get-Content -LiteralPath $logPath -Raw),'\[(\d+)\]') | ForEach-Object {[int]$_.Groups[1].Value} | Select-Object -Unique)
    $remaining=@($processes | Where-Object {$_.ProcessId -in $ownIds -or ($_.CommandLine -and $_.CommandLine.Contains($target))})
    if($remaining.Count){throw 'OWN_POSTGRES_PROCESS_REMAINS'}
    if(@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object {$_.LocalPort -eq $receipt.local_cluster.port}).Count){throw 'OWN_PORT_STILL_LISTENING'}
    Remove-Item -LiteralPath $target -Recurse -Force
    if(Test-Path -LiteralPath $target){throw 'OWN_CLUSTER_DELETE_FAILED'}
    $removed=@()
    foreach($private in @(Get-ChildItem -LiteralPath $evidenceRoot -File -Filter '*.private.log')){
        $removed += [ordered]@{name=$private.Name;sha256=(Get-FileHash -LiteralPath $private.FullName -Algorithm SHA256).Hash.ToLowerInvariant()}
        Remove-Item -LiteralPath $private.FullName -Force
    }
    [ordered]@{verified_utc=[DateTime]::UtcNow.ToString('o');stopped=$true;removed=$true;cluster=$target;master_pid=$receipt.cleanup.master_pid;owned_postgres_processes=0;owned_listeners=0;unrelated_clusters_touched=$false;private_logs_removed=$removed} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'cleanup.json') -Encoding UTF8
    Write-Output ('CLEANUP_VERIFIED '+$stamp+' OWN_PROCESSES=0 OWN_LISTENERS=0')
}
