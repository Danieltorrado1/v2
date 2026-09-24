[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$projectRef = 'scuvsocqibbubqnesvuf'
$root = Split-Path -Parent $PSScriptRoot
$databaseUrl = [Environment]::GetEnvironmentVariable('PRODUCTION_MIGRATION_DATABASE_URL', 'Process')

if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  throw 'PRODUCTION_MIGRATION_DATABASE_URL es obligatorio y no se imprime ni se lee desde archivos.'
}

try { $parsed = [Uri]$databaseUrl } catch { throw 'PRODUCTION_MIGRATION_DATABASE_URL no es una URL PostgreSQL válida.' }
if ($parsed.Scheme -notin @('postgres', 'postgresql')) { throw 'La URL debe usar el esquema postgres/postgresql.' }
if ($databaseUrl -notmatch [Regex]::Escape($projectRef)) { throw 'La URL no contiene el project ref esperado.' }
if ($parsed.Host -match '(^|\.)localhost$|127\.0\.0\.1|::1') { throw 'El runner productivo no acepta localhost.' }

$confirmation = Read-Host "Escriba exactamente APLICAR MIGRACIONES PHASE 52-55 AL PROYECTO $projectRef"
if ($confirmation -cne "APLICAR MIGRACIONES PHASE 52-55 AL PROYECTO $projectRef") { throw 'Confirmación no válida; no se ejecutó ninguna escritura.' }

$phases = @(
  @{ Name = 'Phase 52'; File = 'sql/phase-52-integracion-outbox.sql' },
  @{ Name = 'Phase 53'; File = 'sql/phase-53-integracion-sync-selectiva.sql' },
  @{ Name = 'Phase 54'; File = 'sql/phase-54-integracion-actividad-laboral.sql' },
  @{ Name = 'Phase 55'; File = 'sql/phase-55-integracion-recalc-selectivo.sql' }
)
$postflight = Join-Path $root 'release/postflight-integracion.sql'

foreach ($phase in $phases) {
  $file = Join-Path $root $phase.File
  if (-not (Test-Path -LiteralPath $file)) { throw "Falta el archivo $($phase.File)." }
  Write-Host "$($phase.Name): aplicando..."
  & psql --dbname=$databaseUrl --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file=$file
  if ($LASTEXITCODE -ne 0) { throw "$($phase.Name) falló; el runner se detuvo." }
  Write-Host "$($phase.Name): verificación read-only..."
  & psql --dbname=$databaseUrl --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file=$postflight
  if ($LASTEXITCODE -ne 0) { throw "Postflight de $($phase.Name) falló; el runner se detuvo." }
}

Write-Host 'Migraciones Phase 52-55 aplicadas y verificadas. No se activaron flags.'
