[CmdletBinding()]
param([switch]$AllowLocalValidation)

$ErrorActionPreference='Stop'
$projectRef='scuvsocqibbubqnesvuf'
$root=Split-Path -Parent $PSScriptRoot
$databaseUrl=[Environment]::GetEnvironmentVariable('PRODUCTION_MIGRATION_DATABASE_URL','Process')
if([string]::IsNullOrWhiteSpace($databaseUrl)){throw 'PRODUCTION_MIGRATION_DATABASE_URL es obligatorio.'}
$parsed=[Uri]$databaseUrl
if($parsed.Scheme -notin @('postgres','postgresql')){throw 'La URL debe usar postgres/postgresql.'}
if($AllowLocalValidation){if($parsed.Host -notmatch '(^|\.)localhost$|127\.0\.0\.1|::1'){throw 'La validación local sólo acepta localhost.'}}
else {if($databaseUrl -notmatch [Regex]::Escape($projectRef)){throw 'La URL no corresponde al project ref esperado.'}; if($parsed.Host -match '(^|\.)localhost$|127\.0\.0\.1'){throw 'El runner productivo no acepta localhost.'}}

$detector=Join-Path $root 'release/detect-integracion-phase.sql'
$postflight=Join-Path $root 'release/postflight-integracion-phase56.sql'
$migration=Join-Path $root 'sql/phase-56-integracion-periodos-semantica.sql'
function Invoke-Read([string]$file){& psql --dbname=$databaseUrl --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --file=$file;if($LASTEXITCODE-ne 0){throw "psql falló para $file."}}
function Get-State{$value=(& psql --dbname=$databaseUrl --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --file=$detector);if($LASTEXITCODE-ne 0){throw 'No se pudo detectar el estado.'};return ($value|Select-Object -Last 1).ToString().Trim()}
$state=Get-State
if($state-ne 'PHASE_55'){if($state-eq 'PHASE_56'){Invoke-Read $postflight;Write-Host 'PHASE_56 ya aplicada y verificada.';exit 0};throw "Se requiere PHASE_55 completa; estado actual: $state"}
$confirmation=Read-Host "Escriba exactamente APLICAR PHASE 56 PERIODIZACION $projectRef"
if($confirmation-cne "APLICAR PHASE 56 PERIODIZACION $projectRef"){throw 'Confirmación no válida; no se ejecutó ninguna escritura.'}
& psql --dbname=$databaseUrl --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file=$migration;if($LASTEXITCODE-ne 0){throw 'Falló Phase 56; no se ejecutaron correcciones adicionales.'}
Invoke-Read $postflight
if((Get-State)-ne 'PHASE_56'){throw 'El estado posterior no es PHASE_56.'}
Write-Host 'Phase 56 aplicada y verificada. No se modificaron eventos ni datos operativos.'
