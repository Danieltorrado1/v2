function Get-PsqlConnectionParameters {
  param(
    [Parameter(Mandatory = $true)][string]$ConnectionString,
    [Parameter(Mandatory = $true)][string]$ExpectedProjectRef,
    [switch]$AllowLocalValidation
  )

  if ([string]::IsNullOrWhiteSpace($ConnectionString)) { throw 'La conexión PostgreSQL es obligatoria.' }
  try { $uri = [Uri]$ConnectionString } catch { throw 'La conexión PostgreSQL no es una URI válida.' }
  if ($uri.Scheme -notin @('postgres', 'postgresql')) { throw 'La conexión debe usar postgres/postgresql.' }
  if (-not $AllowLocalValidation -and $ConnectionString -notmatch [Regex]::Escape($ExpectedProjectRef)) { throw 'La conexión no corresponde al project ref permitido.' }
  if ($AllowLocalValidation) {
    if ($uri.Host -notmatch '(^|\.)localhost$|^127\.0\.0\.1$|^::1$') { throw 'La validación local sólo acepta localhost.' }
  } elseif ($uri.Host -match '(^|\.)localhost$|^127\.0\.0\.1$|^::1$') { throw 'El runner productivo rechaza conexiones locales.' }

  $userInfo = $uri.UserInfo
  $separator = $userInfo.IndexOf(':')
  if ($separator -lt 1) { throw 'La conexión no contiene usuario y contraseña PostgreSQL válidos.' }
  $user = [Uri]::UnescapeDataString($userInfo.Substring(0, $separator))
  $password = [Uri]::UnescapeDataString($userInfo.Substring($separator + 1))
  $database = [Uri]::UnescapeDataString($uri.AbsolutePath.TrimStart('/'))
  if ([string]::IsNullOrWhiteSpace($user) -or [string]::IsNullOrWhiteSpace($database)) { throw 'La conexión no contiene usuario o database explícitos.' }

  [pscustomobject]@{
    Host = $uri.Host
    Port = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
    Database = $database
    User = $user
    Password = $password
    SslMode = 'require'
    ConnectTimeout = 15
  }
}

function Get-SanitizedPsqlValue {
  param([AllowNull()][string]$Value)
  if ([string]::IsNullOrEmpty($Value)) { return '<empty>' }
  if ($Value.Length -le 4) { return ('*' * $Value.Length) }
  return $Value.Substring(0, 2) + ('*' * ([Math]::Max(1, $Value.Length - 4))) + $Value.Substring($Value.Length - 2)
}
