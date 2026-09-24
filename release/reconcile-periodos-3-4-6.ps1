[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$projectRef='scuvsocqibbubqnesvuf'
$databaseUrl=[Environment]::GetEnvironmentVariable('PRODUCTION_MIGRATION_DATABASE_URL','Process')
if([string]::IsNullOrWhiteSpace($databaseUrl)){throw 'PRODUCTION_MIGRATION_DATABASE_URL es obligatorio.'}
$configuredProject=[Environment]::GetEnvironmentVariable('SUPABASE_PROJECT_REF','Process')
if($configuredProject -ne $projectRef){throw 'SUPABASE_PROJECT_REF no coincide con el proyecto aprobado.'}
foreach($name in @('INTEGRACION_OUTBOX_ENABLED','INTEGRACION_SYNC_ENABLED','INTEGRACION_RECALC_ENABLED')){
  $value=[Environment]::GetEnvironmentVariable($name,'Process')
  if($value -and $value.ToLowerInvariant() -eq 'true'){throw "$name debe permanecer false o ausente."}
}
$root=Split-Path -Parent $PSScriptRoot
$sql=Join-Path $root 'release/reconcile-periodos-3-4-6.sql'
$confirmation=Read-Host "Escriba exactamente RECONCILIAR PERIODOS 3 4 6 SOLO CON FLAGS APAGADAS $projectRef"
if($confirmation -cne "RECONCILIAR PERIODOS 3 4 6 SOLO CON FLAGS APAGADAS $projectRef"){throw 'Confirmacion invalida; no se ejecutaron escrituras.'}
& psql --dbname=$databaseUrl --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file=$sql
if($LASTEXITCODE -ne 0){throw 'La reconciliacion fallo y la transaccion fue revertida.'}
Write-Host 'Reconciliacion completada; no se procesaron eventos ni se ejecutaron recalculos.'
