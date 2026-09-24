[CmdletBinding()]
param(
  [switch]$AllowLocalValidation
)

$ErrorActionPreference = 'Stop'
$projectRef = 'scuvsocqibbubqnesvuf'
$root = Split-Path -Parent $PSScriptRoot
$databaseUrl = [Environment]::GetEnvironmentVariable('PRODUCTION_MIGRATION_DATABASE_URL', 'Process')

if ([string]::IsNullOrWhiteSpace($databaseUrl)) { throw 'PRODUCTION_MIGRATION_DATABASE_URL es obligatorio y no se imprime ni se lee desde archivos.' }
try { $parsed = [Uri]$databaseUrl } catch { throw 'PRODUCTION_MIGRATION_DATABASE_URL no es una URL PostgreSQL válida.' }
if ($parsed.Scheme -notin @('postgres', 'postgresql')) { throw 'La URL debe usar el esquema postgres/postgresql.' }
if ($AllowLocalValidation) {
  if ($parsed.Host -notmatch '(^|\.)localhost$|127\.0\.0\.1|::1') { throw '-AllowLocalValidation sólo acepta localhost.' }
  Write-Host 'MODO VALIDACION LOCAL EXPLICITO: no es producción.'
} else {
  if ($databaseUrl -notmatch [Regex]::Escape($projectRef)) { throw 'La URL no contiene el project ref esperado.' }
  if ($parsed.Host -match '(^|\.)localhost$|127\.0\.0\.1|::1') { throw 'El runner productivo no acepta localhost.' }
}

$detector = Join-Path $root 'release/detect-integracion-phase.sql'
$phases = @(
  @{ Name = 'Phase 52'; StateBefore = 'NONE'; StateAfter = 'PHASE_52'; File = 'sql/phase-52-integracion-outbox.sql'; Postflight = 'release/postflight-integracion-phase52.sql' },
  @{ Name = 'Phase 53'; StateBefore = 'PHASE_52'; StateAfter = 'PHASE_53'; File = 'sql/phase-53-integracion-sync-selectiva.sql'; Postflight = 'release/postflight-integracion-phase53.sql' },
  @{ Name = 'Phase 54'; StateBefore = 'PHASE_53'; StateAfter = 'PHASE_54'; File = 'sql/phase-54-integracion-actividad-laboral.sql'; Postflight = 'release/postflight-integracion-phase54.sql' },
  @{ Name = 'Phase 55'; StateBefore = 'PHASE_54'; StateAfter = 'PHASE_55'; File = 'sql/phase-55-integracion-recalc-selectivo.sql'; Postflight = 'release/postflight-integracion-phase55.sql' }
)

function Invoke-PsqlFile([string]$file) {
  & psql --dbname=$databaseUrl --no-psqlrc --quiet --pset=pager=off --set=ON_ERROR_STOP=1 --file=$file
  if ($LASTEXITCODE -ne 0) { throw "psql falló para $file." }
}

function Get-IntegrationPhaseState {
  $result = (& psql --dbname=$databaseUrl --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --file=$detector)
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo detectar el estado de integración.' }
  $state = ($result | Select-Object -Last 1).ToString().Trim()
  if ($state -notin @('NONE','PHASE_52','PHASE_53','PHASE_54','PHASE_55','PARTIAL_INVALID')) { throw "Estado de integración no reconocido: $state" }
  return $state
}

function Invoke-PhasePostflight([hashtable]$phase) {
  Write-Host "$($phase.Name): postflight read-only..."
  Invoke-PsqlFile (Join-Path $root $phase.Postflight)
}

$currentState = Get-IntegrationPhaseState
Write-Host "Estado detectado: $currentState"
if ($currentState -eq 'PARTIAL_INVALID') { throw 'PARTIAL_INVALID: no se puede reanudar; requiere revisión manual.' }

if ($currentState -eq 'PHASE_55') {
  Invoke-PhasePostflight $phases[3]
  Write-Host 'PHASE_55 ya estaba aplicada y verificada. No se ejecutaron escrituras.'
  exit 0
}

$confirmation = Read-Host "Escriba exactamente APLICAR MIGRACIONES PHASE 52-55 AL PROYECTO $projectRef"
if ($confirmation -cne "APLICAR MIGRACIONES PHASE 52-55 AL PROYECTO $projectRef") { throw 'Confirmación no válida; no se ejecutó ninguna escritura.' }

while ($currentState -ne 'PHASE_55') {
  if ($currentState -eq 'NONE') { $phase = $phases[0] }
  elseif ($currentState -eq 'PHASE_52') { Write-Host 'Phase 52: ALREADY_APPLIED'; $phase = $phases[1] }
  elseif ($currentState -eq 'PHASE_53') { Write-Host 'Phase 52-53: ALREADY_APPLIED'; $phase = $phases[2] }
  elseif ($currentState -eq 'PHASE_54') { Write-Host 'Phase 52-54: ALREADY_APPLIED'; $phase = $phases[3] }
  else { throw "Estado no reanudable: $currentState" }

  $beforeWrite = Get-IntegrationPhaseState
  if ($beforeWrite -ne $phase.StateBefore) { throw "Estado cambió antes de $($phase.Name): esperado $($phase.StateBefore), actual $beforeWrite." }
  $file = Join-Path $root $phase.File
  if (-not (Test-Path -LiteralPath $file)) { throw "Falta el archivo $($phase.File)." }
  Write-Host "$($phase.Name): aplicando..."
  Invoke-PsqlFile $file
  Invoke-PhasePostflight $phase
  $currentState = Get-IntegrationPhaseState
  if ($currentState -ne $phase.StateAfter) { throw "Estado posterior inesperado: esperado $($phase.StateAfter), actual $currentState." }
  Write-Host "$($phase.Name): OK ($currentState)"
}

Write-Host 'Migraciones Phase 52-55 aplicadas y verificadas. No se activaron flags.'
