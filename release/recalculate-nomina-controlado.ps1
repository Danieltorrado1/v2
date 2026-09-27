[CmdletBinding()]
param(
  [switch]$PreflightOnly,
  [switch]$Mutate,
  [switch]$SecondPass,
  [string]$Confirmation,
  [string]$ManifestPath = 'C:\Users\CORE ULTRA\Documents\EmpiriaBackups\nomina-periodo3-pre-recalculo-20260927T011019Z\20260927T011019Z-manifest.json'
)

$ErrorActionPreference = 'Stop'
$scriptRoot = Split-Path -Parent $PSCommandPath
$repoRoot = Split-Path -Parent $scriptRoot

if (-not $PreflightOnly -and -not $Mutate) { $PreflightOnly = $true }
if ($PreflightOnly -and $Mutate) { throw 'Use -PreflightOnly o -Mutate, no ambos.' }
if ($SecondPass -and -not $Mutate) { throw '-SecondPass sólo puede usarse con -Mutate.' }
if ($Mutate -and [string]::IsNullOrWhiteSpace($Confirmation)) { throw 'El modo mutador requiere -Confirmation.' }

. (Join-Path $scriptRoot 'psql-connection.ps1')

$saved = @{}
foreach ($name in @('DATABASE_URL','PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')) {
  $saved[$name] = [Environment]::GetEnvironmentVariable($name)
}

try {
  if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) { throw 'El manifiesto de backup no es accesible.' }
  $manifest = Get-Content -LiteralPath $ManifestPath -Raw | ConvertFrom-Json
  if ($manifest.expected_dumps -ne 15 -or $manifest.verified_dumps -ne 15 -or $manifest.files.Count -ne 15) {
    throw 'El manifiesto no declara exactamente 15 dumps verificados.'
  }
  foreach ($file in $manifest.files) {
    if (-not (Test-Path -LiteralPath $file.file -PathType Leaf)) { throw "Falta dump del backup: $($file.table)." }
    $actual = (Get-FileHash -LiteralPath $file.file -Algorithm SHA256).Hash.ToUpperInvariant()
    if ($actual -ne $file.sha256.ToUpperInvariant()) { throw "Hash divergente en dump: $($file.table)." }
  }

  $connection = [Environment]::GetEnvironmentVariable('DATABASE_URL')
  if ([string]::IsNullOrWhiteSpace($connection)) { throw 'DATABASE_URL no está disponible para conexión productiva.' }
  $params = Get-PsqlConnectionParameters -ConnectionString $connection -ExpectedProjectRef 'scuvsocqibbubqnesvuf'
  $env:DATABASE_URL = $connection
  $env:PGHOST = $params.Host
  $env:PGPORT = [string]$params.Port
  $env:PGDATABASE = $params.Database
  $env:PGUSER = $params.User
  $env:PGPASSWORD = $params.Password
  $env:PGSSLMODE = 'require'
  $env:PGCONNECT_TIMEOUT = '15'

  $psql17 = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
  $pgRestore17 = 'C:\Program Files\PostgreSQL\17\bin\pg_restore.exe'
  if (-not (Test-Path -LiteralPath $psql17 -PathType Leaf)) { throw 'No se encontró psql de PostgreSQL 17.x.' }
  if (-not (Test-Path -LiteralPath $pgRestore17 -PathType Leaf)) { throw 'No se encontró pg_restore de PostgreSQL 17.x.' }
  $version = (& $psql17 --version 2>$null | Out-String).Trim()
  if ($version -notmatch 'PostgreSQL\)\s+17\.') { throw 'El cliente psql no es PostgreSQL 17.x.' }
  foreach ($file in $manifest.files) {
    if (-not (Test-Path -LiteralPath $file.restore_list -PathType Leaf) -or $file.restore_list_exit_code -ne 0) {
      throw "La lista pg_restore no es válida: $($file.table)."
    }
    & $pgRestore17 --list $file.file *> $null
    if ($LASTEXITCODE -ne 0) { throw "pg_restore --list falló: $($file.table)." }
  }

  $mode = if ($Mutate) { 'mutate' } else { 'preflight' }
  $arguments = @((Join-Path $repoRoot 'src/scripts/recalculate-nomina-controlado.ts'), "--mode=$mode")
  if ($SecondPass) { $arguments += '--second-pass' }
  if ($Mutate) { $arguments += "--confirmation=$Confirmation" }
  $tsx = Join-Path $repoRoot 'node_modules\.bin\tsx.cmd'
  if (-not (Test-Path -LiteralPath $tsx -PathType Leaf)) { throw 'No se encontró el ejecutor local TypeScript.' }
  & $tsx @arguments
  if ($LASTEXITCODE -ne 0) { throw "El runner terminó con código $LASTEXITCODE." }
}
finally {
  foreach ($name in $saved.Keys) {
    if ($null -eq $saved[$name]) {
      Remove-Item -Path "Env:$name" -ErrorAction SilentlyContinue
    } else {
      Set-Item -Path "Env:$name" -Value $saved[$name]
    }
  }
}
