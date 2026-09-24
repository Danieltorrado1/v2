[CmdletBinding()]
param([switch]$AllowLocalValidation)
$ErrorActionPreference = 'Stop'
$projectRef = 'scuvsocqibbubqnesvuf'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'psql-connection.ps1')

$databaseUrl = [Environment]::GetEnvironmentVariable('PRODUCTION_MIGRATION_DATABASE_URL', 'Process')
$connection = $null
$previousEnv = @{}
$pgEnvNames = @('PGHOST', 'PGPORT', 'PGDATABASE', 'PGUSER', 'PGPASSWORD', 'PGSSLMODE', 'PGCONNECT_TIMEOUT')

function Get-Psql17Path {
  $candidate = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
  $path = if (Test-Path -LiteralPath $candidate) { $candidate } else { (Get-Command psql -ErrorAction SilentlyContinue).Source }
  if ([string]::IsNullOrWhiteSpace($path)) { throw 'No se encontró psql.' }
  $version = (& $path --version | Out-String).Trim()
  if ($version -notmatch 'PostgreSQL\)\s+17\.') { throw 'El runner exige cliente psql PostgreSQL 17.x.' }
  return $path
}

function Set-PsqlEnvironment {
  foreach ($name in $pgEnvNames) { $previousEnv[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
  [Environment]::SetEnvironmentVariable('PGHOST', $connection.Host, 'Process')
  [Environment]::SetEnvironmentVariable('PGPORT', [string]$connection.Port, 'Process')
  [Environment]::SetEnvironmentVariable('PGDATABASE', $connection.Database, 'Process')
  [Environment]::SetEnvironmentVariable('PGUSER', $connection.User, 'Process')
  [Environment]::SetEnvironmentVariable('PGPASSWORD', $connection.Password, 'Process')
  [Environment]::SetEnvironmentVariable('PGSSLMODE', $connection.SslMode, 'Process')
  [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT', [string]$connection.ConnectTimeout, 'Process')
}

function Restore-PsqlEnvironment {
  foreach ($name in $pgEnvNames) { [Environment]::SetEnvironmentVariable($name, $previousEnv[$name], 'Process') }
}

function Invoke-PsqlFile([string]$file, [switch]$Write) {
  $args = @('-h', $connection.Host, '-p', [string]$connection.Port, '-U', $connection.User, '-d', $connection.Database, '--no-psqlrc', '--quiet', '--set=ON_ERROR_STOP=1', '-f', $file)
  if (!$Write) { $args += @('--tuples-only', '--no-align') }
  & $psqlPath @args
  if ($LASTEXITCODE -ne 0) { throw "psql falló para $file." }
}

function Invoke-PsqlCommand([string]$sql) {
  $args = @('-h', $connection.Host, '-p', [string]$connection.Port, '-U', $connection.User, '-d', $connection.Database, '--no-psqlrc', '--quiet', '--tuples-only', '--no-align', '--set=ON_ERROR_STOP=1', '-c', $sql)
  $out = & $psqlPath @args
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el estado de fases.' }
  return $out
}

try {
  $connection = Get-PsqlConnectionParameters -ConnectionString $databaseUrl -ExpectedProjectRef $projectRef -AllowLocalValidation:$AllowLocalValidation
  $psqlPath = Get-Psql17Path
  Set-PsqlEnvironment
  Write-Host ("Conexión validada: host={0}, port={1}, database={2}, user={3}, sslmode=require" -f $connection.Host, $connection.Port, (Get-SanitizedPsqlValue $connection.Database), (Get-SanitizedPsqlValue $connection.User))
  $migration56 = Join-Path $root 'sql/phase-56-integracion-periodos-semantica.sql'
  $migration57 = Join-Path $root 'sql/phase-57-nomina-periodizacion-controlada.sql'
  $post56 = Join-Path $root 'release/postflight-integracion-phase56.sql'
  $post57 = Join-Path $root 'release/postflight-integracion-phase57.sql'
  $has56 = (Invoke-PsqlCommand "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_integracion_evento_impacto_estado' AND pg_get_constraintdef(oid) LIKE '%BLOQUEADO_PERIODIZACION%')" | Select-Object -Last 1).ToString().Trim() -eq 't'
  $has57 = (Invoke-PsqlCommand "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nomina_calendarios_contractuales')" | Select-Object -Last 1).ToString().Trim() -eq 't'
  if ($has57) { Invoke-PsqlFile $post57; Write-Host 'PHASE_57 ALREADY_APPLIED y verificada.'; exit 0 }
  $confirmation = Read-Host "Escriba exactamente APLICAR PHASE 56 Y 57 PERIODIZACION $projectRef"
  if ($confirmation -cne "APLICAR PHASE 56 Y 57 PERIODIZACION $projectRef") { throw 'Confirmación inválida; no se ejecutó ninguna escritura.' }
  if (!$has56) { Invoke-PsqlFile $migration56 -Write; Invoke-PsqlFile $post56 }
  Invoke-PsqlFile $migration57 -Write
  Invoke-PsqlFile $post57
  Write-Host 'Phase 56/57 aplicadas y verificadas. No se ejecuta reconciliación.'
} finally {
  if ($previousEnv.Count -gt 0) { Restore-PsqlEnvironment }
}
