$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'psql-connection.ps1')

function Assert-Equal([object]$actual, [object]$expected, [string]$message) {
  if ($actual -ne $expected) { throw "$message. Actual: $actual" }
}

$encoded = Get-PsqlConnectionParameters -ConnectionString 'postgresql://pooler.user:p%40ss%3Aword%21@aws-1-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require' -ExpectedProjectRef 'pooler.user'
Assert-Equal $encoded.User 'pooler.user' 'Usuario compuesto no preservado'
Assert-Equal $encoded.Password 'p@ss:word!' 'Contraseña percent-encoded no decodificada correctamente'
Assert-Equal $encoded.Database 'postgres' 'Database no preservada'
Assert-Equal $encoded.Port 6543 'Puerto no preservado'
Assert-Equal $encoded.SslMode 'require' 'SSL no forzado'

try { Get-PsqlConnectionParameters -ConnectionString 'postgresql://u:p@127.0.0.1:5432/test' -ExpectedProjectRef 'test' | Out-Null; throw 'Debió rechazar localhost productivo' } catch { if ($_.Exception.Message -notmatch 'locales') { throw } }
try { Get-PsqlConnectionParameters -ConnectionString 'postgresql://u:p@pooler.example:6543/postgres' -ExpectedProjectRef 'expected-ref' | Out-Null; throw 'Debió rechazar project ref' } catch { if ($_.Exception.Message -notmatch 'project ref') { throw } }
$source = Get-Content (Join-Path $PSScriptRoot 'apply-integracion-phase56-57.ps1') -Raw
$postflight = Get-Content (Join-Path $PSScriptRoot 'postflight-integracion-phase52.sql') -Raw
if ($source -match '--dbname=\$databaseUrl') { throw 'El runner todavía pasa la URI completa a psql' }
if ($source -notmatch 'PGPASSWORD' -or $source -notmatch 'finally') { throw 'Falta limpieza de PGPASSWORD' }
if ($source -notmatch 'PostgreSQL' -or $source -notmatch '17\\.') { throw 'Falta guardia de cliente PostgreSQL 17' }
if ($source -notmatch 'PHASE_57_WINDOW_PRECONDITION_MISMATCH') { throw 'Falta guardia de conteos productivos' }
if ($postflight -match 'PHASE_52_EVENTS_NOT_EMPTY|PHASE_52_IMPACTS_NOT_EMPTY') { throw 'El postflight conserva la precondición de tablas vacías' }
foreach ($code in @('PHASE_52_INVALID_EVENT_STATE','PHASE_52_IMPACT_EVENT_ORPHAN','PHASE_52_IMPACT_PERIOD_ORPHAN','PHASE_52_IDEMPOTENCY_DUPLICATE','PHASE_52_IMPACT_SCOPE_INCOHERENT','PHASE_52_FIXTURE_MARKER')) {
  if ($postflight -notmatch $code) { throw "Falta validación $code" }
}
if ($source -match 'Write-Host[^\r\n]*Password|Write-Host[^\r\n]*ConnectionString') { throw 'Secreto potencial en logs' }
Write-Host 'psql-connection tests: PASS'
