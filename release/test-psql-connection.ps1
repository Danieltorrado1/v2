$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'psql-connection.ps1')

function Assert-True([bool]$value, [string]$message) { if (-not $value) { throw $message } }
function Assert-Equal([object]$actual, [object]$expected, [string]$message) { if ($actual -ne $expected) { throw "$message. Actual: $actual" } }

$tokens = $null; $parseErrors = $null
[System.Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot 'reconcile-periodos-3-4-6.ps1'), [ref]$tokens, [ref]$parseErrors) | Out-Null
if ($parseErrors.Count -gt 0) { throw 'El runner no pasa el parseo PowerShell.' }

$encoded = Get-PsqlConnectionParameters -ConnectionString 'postgresql://pooler.user:p%40ss%3Aword%21@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require' -ExpectedProjectRef 'pooler.user'
Assert-Equal $encoded.User 'pooler.user' 'Usuario compuesto no preservado'
Assert-Equal $encoded.Password 'p@ss:word!' 'Contraseña percent-encoded no decodificada correctamente'
Assert-Equal $encoded.Database 'postgres' 'Database no preservada'
Assert-Equal $encoded.Port 6543 'Puerto no preservado'
Assert-Equal $encoded.SslMode 'require' 'SSL no forzado'

try { Get-PsqlConnectionParameters -ConnectionString 'postgresql://u:p@127.0.0.1:5432/test' -ExpectedProjectRef 'test' | Out-Null; throw 'Debió rechazar localhost productivo' } catch { Assert-True ($_.Exception.Message -match 'locales') 'No rechazó localhost productivo' }
try { Get-PsqlConnectionParameters -ConnectionString 'postgresql://u:p@pooler.example:6543/postgres' -ExpectedProjectRef 'expected-ref' | Out-Null; throw 'Debió rechazar project ref' } catch { Assert-True ($_.Exception.Message -match 'project ref') 'No rechazó project ref incorrecto' }

$runner = Get-Content (Join-Path $PSScriptRoot 'reconcile-periodos-3-4-6.ps1') -Raw
$preflight = Get-Content (Join-Path $PSScriptRoot 'preflight-reconciliacion-periodos.sql') -Raw
$postflight = Get-Content (Join-Path $PSScriptRoot 'postflight-reconciliacion-periodos.sql') -Raw
Assert-True ($runner -match "psql-connection\.ps1") 'Falta importación obligatoria del helper'
Assert-True ($runner -notmatch '--dbname=\$databaseUrl') 'El runner todavía pasa la URI completa a psql'
foreach ($name in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT')) { Assert-True ($runner -match $name) "Falta variable $name" }
Assert-True ($runner -match 'finally' -and $runner -match 'Restore-PsqlEnvironment') 'Falta limpieza de entorno en finally'
Assert-True ($runner -match 'PostgreSQL\\\)\\s\+17\\\.') 'Falta guardia de cliente PostgreSQL 17'
Assert-True ($runner -match 'PreflightOnly') 'Falta modo PreflightOnly'
Assert-True ($runner -match 'IdempotencyCheck') 'Falta bloqueo explícito de segunda ejecución no formal'
Assert-True ($runner -match 'RECONCILIAR PERIODOS 3 4 6 SOLO CON FLAGS APAGADAS') 'Falta confirmación de escritura'
Assert-True ($runner -match 'preflight-reconciliacion-periodos\.sql' -and $runner -match 'reconcile-periodos-3-4-6\.sql') 'Rutas de preflight/mutador incompletas'
Assert-True ($preflight -match 'BEGIN READ ONLY' -and $preflight -notmatch '(?im)^\s*(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE|MERGE)\b') 'El preflight no es read-only'
foreach ($marker in @('PREFLIGHT_PERIOD_ALREADY_CANCELLED','PREFLIGHT_IMPACT_DISTRIBUTION_NOT_5_5_5','PREFLIGHT_REVISIONS_4_NOT_47','PREFLIGHT_EVENT_ORPHAN','PREFLIGHT_AMBIGUOUS_CANONICAL_MATCH','PREFLIGHT_PHASE56_INDEX_MISSING','PREFLIGHT_PHASE57_CALENDAR_MISSING')) { Assert-True ($preflight -match $marker) "Falta prueba/guardia $marker" }
Assert-True ($preflight -match 'recalc_attempts <> 0' -and $preflight -match 'PREFLIGHT_LOCKS_WAITING') 'Faltan guardias de recálculo/locks'
foreach ($marker in @('POSTFLIGHT_IMPACTOS_4_TRAZABILIDAD_INVALIDA','POSTFLIGHT_IMPACTOS_6_CANONICO_AMBIGUO','POSTFLIGHT_VINCULOS_4_INVALIDOS','POSTFLIGHT_REVISIONES_4_INVALIDAS','POSTFLIGHT_DUPLICADOS','POSTFLIGHT_CICLOS')) { Assert-True ($postflight -match $marker) "Falta validación postflight $marker" }
Assert-True ($runner -notmatch 'Write-Host[^\r\n]*(Password|ConnectionString)') 'Secreto potencial en logs'

$psql16 = 'C:\Program Files\PostgreSQL\16\bin\psql.exe'
$psql17 = 'C:\Program Files\PostgreSQL\17\bin\psql.exe'
if (Test-Path -LiteralPath $psql16) { Assert-True ((& $psql16 --version) -notmatch 'PostgreSQL\)\s+17\.') 'El cliente 16 fue aceptado como 17' }
Assert-True (Test-Path -LiteralPath $psql17) 'No existe cliente PostgreSQL 17.11 esperado'
Assert-True ((& $psql17 --version) -match 'PostgreSQL\)\s+17\.') 'El cliente PostgreSQL 17.11 no fue aceptado'

Write-Host 'psql-connection/reconciliation runner tests: PASS'
