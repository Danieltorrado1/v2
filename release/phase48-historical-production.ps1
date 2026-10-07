param([ValidateSet('PreflightOnly','PreviewOnly','SimulateLocal','MutateProduction')][string]$Mode='PreflightOnly',[Parameter(Mandatory=$true)][string]$Backup,[string]$AuthorizationFile,[ValidateSet('Local','Production')][string]$Target='Local')
$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if($root -ne 'C:\Users\CORE ULTRA\Desktop\V2-instituciones-modalidad'){throw 'WORKSPACE_MISMATCH'}
if($Mode -eq 'MutateProduction'){$Target='Production'}
if(($Mode -eq 'MutateProduction' -or $Target -eq 'Production') -and [string]::IsNullOrWhiteSpace($AuthorizationFile)){throw 'AUTHORIZATION_REVOKED'}
$runnerArgs=@('node_modules/tsx/dist/cli.mjs','src/scripts/phase48-historical-production.ts',"--mode=$Mode","--backup=$Backup","--target=$Target")
if(-not [string]::IsNullOrWhiteSpace($AuthorizationFile)){$runnerArgs+="--authorization-file=$AuthorizationFile"}
try{Push-Location -LiteralPath $root; & node @runnerArgs; $runnerExit=$LASTEXITCODE}
finally{Pop-Location;foreach($name in @('PGPASSWORD','PRODUCTION_MIGRATION_DATABASE_URL')){[Environment]::SetEnvironmentVariable($name,$null,'Process')}}
exit $runnerExit
