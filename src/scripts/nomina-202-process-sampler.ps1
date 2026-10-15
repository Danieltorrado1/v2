param([int]$MasterPid,[int]$ExecutorPid,[int]$RunnerPid,[string]$OutputDirectory)
$ErrorActionPreference='Stop'
$known = [Collections.Generic.HashSet[int]]::new()
[void]$known.Add($MasterPid)
$peak = [ordered]@{postgres_working_set_sum=0; executor_working_set=0; runner_working_set=0; samples=0; postgres_pids=@(); definition='Windows WorkingSet64; PostgreSQL sum can double-count shared pages; executor and runner reported separately'}
while (-not (Test-Path -LiteralPath (Join-Path $OutputDirectory 'stop-sampler'))) {
    $all = @(Get-CimInstance Win32_Process -Filter "Name='postgres.exe'")
    do {
        $added=$false
        foreach($item in $all){ if($known.Contains([int]$item.ParentProcessId) -and $known.Add([int]$item.ProcessId)){ $added=$true } }
    } while($added)
    $pg = @($all | Where-Object { $known.Contains([int]$_.ProcessId) })
    $serverWs=0
    foreach($item in $pg){$serverWs += [long]$item.WorkingSetSize}
    $executor=Get-Process -Id $ExecutorPid -ErrorAction SilentlyContinue
    $runner=Get-Process -Id $RunnerPid -ErrorAction SilentlyContinue
    $peak.postgres_working_set_sum=[Math]::Max($peak.postgres_working_set_sum,$serverWs)
    if($executor){$peak.executor_working_set=[Math]::Max($peak.executor_working_set,$executor.WorkingSet64)}
    if($runner){$peak.runner_working_set=[Math]::Max($peak.runner_working_set,$runner.WorkingSet64)}
    $peak.samples++
    Start-Sleep -Milliseconds 200
}
$peak.postgres_pids=@($known)
$peak | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'process-memory.json') -Encoding UTF8
