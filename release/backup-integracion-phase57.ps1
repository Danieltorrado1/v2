[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference='Stop'
$projectRef='scuvsocqibbubqnesvuf'
$root=(Resolve-Path (Split-Path -Parent $PSScriptRoot)).Path
$target=(New-Item -ItemType Directory -Force -Path $OutputDirectory).FullName
if($target.StartsWith($root,[StringComparison]::OrdinalIgnoreCase)){throw 'El respaldo debe estar fuera del repositorio.'}
$databaseUrl=[Environment]::GetEnvironmentVariable('PRODUCTION_MIGRATION_DATABASE_URL','Process')
if([string]::IsNullOrWhiteSpace($databaseUrl)){throw 'PRODUCTION_MIGRATION_DATABASE_URL es obligatorio.'}
$configuredProject=[Environment]::GetEnvironmentVariable('SUPABASE_PROJECT_REF','Process')
if($configuredProject -ne $projectRef){throw 'SUPABASE_PROJECT_REF no coincide con el proyecto aprobado.'}
$stamp=(Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$tables=@('nomina_periodos','nomina_revision_operativa','integracion_eventos','integracion_evento_impactos','nomina_liquidaciones')
$files=@()
foreach($table in $tables){
  $file=Join-Path $target "$stamp-$table.dump"
  & pg_dump --format=custom --no-owner --no-privileges --dbname=$databaseUrl --table="public.$table" --file=$file
  if($LASTEXITCODE -ne 0 -or !(Test-Path $file) -or (Get-Item $file).Length -le 0){throw "No se pudo verificar el respaldo de $table."}
  & pg_restore --list $file | Set-Content -LiteralPath "$file.list" -Encoding utf8
  if($LASTEXITCODE -ne 0 -or (Get-Item "$file.list").Length -le 0){throw "No se pudo verificar pg_restore --list para $table."}
  $files += [pscustomobject]@{table=$table;file=$file;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash;bytes=(Get-Item $file).Length;restore_list="$file.list"}
}
$manifest=[pscustomobject]@{utc=(Get-Date).ToUniversalTime().ToString('o');project_ref=$projectRef;commit=(git -C $root rev-parse HEAD).Trim();pg_dump_version=((pg_dump --version) -join ' ');migrations=@('phase-56-integracion-periodos-semantica.sql','phase-57-nomina-periodizacion-controlada.sql');files=$files}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $target "$stamp-manifest.json") -Encoding utf8
Write-Host "Respaldo verificado fuera del repositorio: $target"
