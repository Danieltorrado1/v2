[CmdletBinding()]
param(
  [switch]$PreflightOnly,
  [switch]$IdempotencyCheck,
  [long]$ActorUserId
)

$ErrorActionPreference = 'Stop'
$projectRef = 'scuvsocqibbubqnesvuf'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'psql-connection.ps1')

if ($PreflightOnly -and $IdempotencyCheck) { throw 'PreflightOnly e IdempotencyCheck son mutuamente excluyentes.' }
if ($IdempotencyCheck) { throw 'No existe un modo de idempotencia formal aprobado para este reconciliador.' }
if (-not $PreflightOnly -and $ActorUserId -le 0) { throw 'ActorUserId explícito es obligatorio para escritura.' }

$databaseUrl = [Environment]::GetEnvironmentVariable('PRODUCTION_MIGRATION_DATABASE_URL', 'Process')
if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw 'PRODUCTION_MIGRATION_DATABASE_URL es obligatorio.' }
if ([Environment]::GetEnvironmentVariable('SUPABASE_PROJECT_REF', 'Process') -ne $projectRef) { throw 'SUPABASE_PROJECT_REF no coincide con el proyecto aprobado.' }
foreach ($name in @('INTEGRACION_OUTBOX_ENABLED', 'INTEGRACION_SYNC_ENABLED', 'INTEGRACION_RECALC_ENABLED')) {
  $value = [Environment]::GetEnvironmentVariable($name, 'Process')
  if ($value -and $value.ToLowerInvariant() -eq 'true') { throw "$name debe permanecer false o ausente." }
}

$connection = $null
$psqlPath = $null
$previousEnv = @{}
$pgEnvNames = @('PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGCONNECT_TIMEOUT')

function Get-Psql17Path {
  $candidates = @('C:\Program Files\PostgreSQL\17\bin\psql.exe', ((Get-Command psql -ErrorAction SilentlyContinue).Source)) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
  foreach ($candidate in $candidates) {
    if (-not (Test-Path -LiteralPath $candidate)) { continue }
    $version = (& $candidate --version | Out-String).Trim()
    if ($version -match 'PostgreSQL\)\s+17\.') { return $candidate }
  }
  throw 'El runner exige cliente psql PostgreSQL 17.x; no se acepta 16.x.'
}

function Set-PsqlEnvironment {
  foreach ($name in $pgEnvNames) { $previousEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  [Environment]::SetEnvironmentVariable('PGHOST', $connection.Host, 'Process')
  [Environment]::SetEnvironmentVariable('PGPORT', [string]$connection.Port, 'Process')
  [Environment]::SetEnvironmentVariable('PGDATABASE', $connection.Database, 'Process')
  [Environment]::SetEnvironmentVariable('PGUSER', $connection.User, 'Process')
  [Environment]::SetEnvironmentVariable('PGPASSWORD', $connection.Password, 'Process')
  [Environment]::SetEnvironmentVariable('PGSSLMODE', 'require', 'Process')
  [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT', [string]$connection.ConnectTimeout, 'Process')
}

function Restore-PsqlEnvironment { foreach ($name in $pgEnvNames) { [Environment]::SetEnvironmentVariable($name, $previousEnv[$name], 'Process') } }

function Invoke-PsqlFile([string]$file, [long]$Actor = 0) {
  $args = @('-h', $connection.Host, '-p', [string]$connection.Port, '-U', $connection.User, '-d', $connection.Database, '--no-psqlrc', '--quiet', '--set=ON_ERROR_STOP=1', '--file', $file)
  if ($Actor -gt 0) { $args += @('--set=actor_user_id=' + [string]$Actor) }
  & $psqlPath @args
  if ($LASTEXITCODE -ne 0) { throw "psql falló para $([IO.Path]::GetFileName($file))." }
}

try {
  $connection = Get-PsqlConnectionParameters -ConnectionString $databaseUrl -ExpectedProjectRef $projectRef
  $psqlPath = Get-Psql17Path
  Set-PsqlEnvironment
  $mode = if ($PreflightOnly) { 'PREFLIGHT_ONLY' } else { 'RECONCILIACION_ESCRITURA' }
  Write-Host ("Modo={0}; conexión validada: host={1}, port={2}, database={3}, user={4}, sslmode=require; cliente={5}" -f $mode, $connection.Host, $connection.Port, (Get-SanitizedPsqlValue $connection.Database), (Get-SanitizedPsqlValue $connection.User), (& $psqlPath --version).Trim())
  if ($PreflightOnly) {
    Invoke-PsqlFile (Join-Path $PSScriptRoot 'preflight-reconciliacion-periodos.sql')
    Write-Host 'PREFLIGHT READ-ONLY APROBADO. No se invocó el SQL mutador.'
    exit 0
  }
  $confirmation = Read-Host "Escriba exactamente RECONCILIAR PERIODOS 3 4 6 SOLO CON FLAGS APAGADAS $projectRef"
  if ($confirmation -cne "RECONCILIAR PERIODOS 3 4 6 SOLO CON FLAGS APAGADAS $projectRef") { throw 'Confirmación inválida; no se ejecutaron escrituras.' }
  Invoke-PsqlFile (Join-Path $PSScriptRoot 'reconcile-periodos-3-4-6.sql') $ActorUserId
  Write-Host 'Reconciliación completada; no se procesaron eventos ni se ejecutaron recálculos.'
} finally {
  if ($previousEnv.Count -gt 0) { Restore-PsqlEnvironment }
}
