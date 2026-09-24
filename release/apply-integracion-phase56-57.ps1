[CmdletBinding()]
param([switch]$AllowLocalValidation)
$ErrorActionPreference='Stop'
$projectRef='scuvsocqibbubqnesvuf'
$root=Split-Path -Parent $PSScriptRoot
$databaseUrl=[Environment]::GetEnvironmentVariable('PRODUCTION_MIGRATION_DATABASE_URL','Process')
if([string]::IsNullOrWhiteSpace($databaseUrl)){throw 'PRODUCTION_MIGRATION_DATABASE_URL es obligatorio.'}
$parsed=[Uri]$databaseUrl
if($parsed.Scheme -notin @('postgres','postgresql')){throw 'La URL debe usar postgres/postgresql.'}
if($AllowLocalValidation){if($parsed.Host -notmatch '(^|\.)localhost$|127\.0\.0\.1|::1'){throw 'La validacion local solo acepta localhost.'}}
elseif($databaseUrl -notmatch [Regex]::Escape($projectRef)){throw 'La URL no corresponde al project ref esperado.'}
$migration56=Join-Path $root 'sql/phase-56-integracion-periodos-semantica.sql'
$migration57=Join-Path $root 'sql/phase-57-nomina-periodizacion-controlada.sql'
$post56=Join-Path $root 'release/postflight-integracion-phase56.sql'
$post57=Join-Path $root 'release/postflight-integracion-phase57.sql'
function Invoke-Psql([string]$file,[switch]$Write){
  $args=@('--dbname='+$databaseUrl,'--no-psqlrc','--quiet','--set=ON_ERROR_STOP=1','--file='+$file)
  if(!$Write){$args += @('--tuples-only','--no-align')}
  & psql @args
  if($LASTEXITCODE -ne 0){throw "psql fallo para $file."}
}
function HasObject([string]$sql){
  $out=& psql --dbname=$databaseUrl --no-psqlrc --quiet --tuples-only --no-align --set=ON_ERROR_STOP=1 --command=$sql
  if($LASTEXITCODE -ne 0){throw 'No se pudo detectar el estado de fases.'}
  return ($out | Select-Object -Last 1).ToString().Trim() -eq 't'
}
$has56=HasObject "SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='chk_integracion_evento_impacto_estado' AND pg_get_constraintdef(oid) LIKE '%BLOQUEADO_PERIODIZACION%')"
$has57=HasObject "SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nomina_calendarios_contractuales')"
if($has57){Invoke-Psql $post57; Write-Host 'PHASE_57 ALREADY_APPLIED y verificada.'; exit 0}
$confirmation=Read-Host "Escriba exactamente APLICAR PHASE 56 Y 57 PERIODIZACION $projectRef"
if($confirmation -cne "APLICAR PHASE 56 Y 57 PERIODIZACION $projectRef"){throw 'Confirmacion invalida; no se ejecuto ninguna escritura.'}
if(!$has56){Invoke-Psql $migration56 -Write; Invoke-Psql $post56}
Invoke-Psql $migration57 -Write
Invoke-Psql $post57
Write-Host 'Phase 56/57 aplicadas y verificadas. No se ejecuta reconciliacion.'
