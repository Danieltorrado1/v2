[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$TargetDirectory,
  [Parameter(Mandatory = $true)][string]$ProjectRef = 'scuvsocqibbubqnesvuf'
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $PSCommandPath
. (Join-Path $scriptRoot 'psql-connection.ps1')

$tables = @(
  'nomina_periodos', 'nomina_empleados', 'nomina_novedades', 'nomina_novedades_canonicas',
  'nomina_novedad_turnos', 'nomina_asistencia_diaria', 'nomina_movimientos', 'nomina_ajustes_manuales',
  'nomina_desprendibles', 'nomina_liquidaciones', 'nomina_revision_operativa', 'nomina_tipos_novedad',
  'nomina_parametros_economicos', 'nomina_categorias_salariales', 'auditoria_eventos'
)
$saved = @{}
foreach ($name in @('DATABASE_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')) {
  $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}

try {
  $connection = [Environment]::GetEnvironmentVariable('DATABASE_URL')
  if ([string]::IsNullOrWhiteSpace($connection)) { throw 'DATABASE_URL no disponible.' }
  $params = Get-PsqlConnectionParameters -ConnectionString $connection -ExpectedProjectRef $ProjectRef
  $env:PGHOST = $params.Host; $env:PGPORT = [string]$params.Port; $env:PGDATABASE = $params.Database
  $env:PGUSER = $params.User; $env:PGPASSWORD = $params.Password; $env:PGSSLMODE = 'require'; $env:PGCONNECT_TIMEOUT = '15'
  $pgDump = 'C:\Program Files\PostgreSQL\17\bin\pg_dump.exe'
  $pgRestore = 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe'
  if (-not (Test-Path -LiteralPath $pgDump -PathType Leaf)) { throw 'pg_dump PostgreSQL 17 no encontrado.' }
  if (-not (Test-Path -LiteralPath $pgRestore -PathType Leaf)) { throw 'pg_restore PostgreSQL 17 no encontrado.' }
  New-Item -ItemType Directory -Force -Path $TargetDirectory | Out-Null
  $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
  $files = @()
  foreach ($table in $tables) {
    $dumpPath = Join-Path $TargetDirectory "$table.dump"
    $listPath = Join-Path $TargetDirectory "$table.restore-list.txt"
    $stderrPath = Join-Path $TargetDirectory "$table.stderr.txt"
    & $pgDump --format=custom --no-owner --no-privileges --table="public.$table" --file=$dumpPath 2> $stderrPath
    if ($LASTEXITCODE -ne 0) { throw "pg_dump falló para $table." }
    if ((Get-Item -LiteralPath $stderrPath).Length -ne 0) { throw "stderr no vacío para $table." }
    & $pgRestore --list $dumpPath 1> $listPath 2> $stderrPath
    if ($LASTEXITCODE -ne 0) { throw "pg_restore --list falló para $table." }
    if ((Get-Item -LiteralPath $stderrPath).Length -ne 0) { throw "stderr de pg_restore no vacío para $table." }
    if (-not ((Get-Content -LiteralPath $listPath -Raw) -match [Regex]::Escape($table))) { throw "Tabla esperada ausente en lista: $table." }
    $hash = (Get-FileHash -LiteralPath $dumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $files += [pscustomobject]@{ table=$table; file=$dumpPath; restore_list=$listPath; sha256=$hash; size=(Get-Item -LiteralPath $dumpPath).Length; pg_dump_exit_code=0; restore_list_exit_code=0; stderr_empty=$true }
    Remove-Item -LiteralPath $stderrPath -Force
  }
  $manifest = [pscustomobject]@{
    utc=(Get-Date).ToUniversalTime().ToString('o'); project_ref=$ProjectRef; postgres_client=((& $pgDump --version) -join ' ')
    expected_dumps=$tables.Count; verified_dumps=$files.Count; files=$files; status='VERIFIED'
  }
  $manifestPath = Join-Path $TargetDirectory "$stamp-manifest.json"
  $manifest | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $manifestPath -Encoding utf8
  Write-Output (ConvertTo-Json ([pscustomobject]@{ status='VERIFIED'; manifest=$manifestPath; dumps=$files.Count }) -Compress)
}
finally {
  foreach ($name in $saved.Keys) {
    if ($null -eq $saved[$name]) { Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue }
    else { Set-Item -Path "Env:$name" -Value $saved[$name] }
  }
}
