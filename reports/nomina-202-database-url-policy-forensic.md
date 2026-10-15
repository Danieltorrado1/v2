# Nómina 202 DATABASE_URL policy reconciliation

This report records the local, offline reconciliation. No production connection was made and no credential value is included.

The certified database identity comes from `reports/territorial-contract-24-pre-migration.json` (SHA-256 `7a1ab4f084f3cda412d955d8566d24dafa0f24212096d36d121e980a5fd1dec2`). The historical `current_database()` value and the canonical URL segment both hash to `a942b37ccfaf5a813b1432caa209a43b9d144e47ad0de1549c289c253e556cd5`.

Canonical derivation is defined as: take the WHATWG URL pathname; require exactly one absolute path segment; remove exactly its first structural `/`; percent-decode exactly once; reject empty values, additional or encoded separators, backslashes, NUL, `.`/`..`, residual percent escapes, and strings not already in Unicode NFC; encode the resulting segment as UTF-8; calculate SHA-256 over those bytes. Compare the 32-byte digest with the pinned digest using a constant-time comparison. The segment text is used only in memory for the PostgreSQL client's `database` option and is never added to the target pin or receipt.

Observed comparison:

- Raw pathname: 9 bytes, SHA-256 `785e1a1c92c18d28e9fbe94035166acb707391755c650223b90ae9946722a148`.
- Canonical segment: 8 characters, SHA-256 `a942b37ccfaf5a813b1432caa209a43b9d144e47ad0de1549c289c253e556cd5`.
- Historical database identity SHA-256: `a942b37ccfaf5a813b1432caa209a43b9d144e47ad0de1549c289c253e556cd5`.
- The earlier `1df7f5dd31451211b193d082e4e779cdc7b5bac4cac577e72e41e7ed492652f4` value has no defined canonical derivation in the pinned evidence and is classified `STALE_OR_UNDEFINED_DATABASE_HASH_DERIVATION`; it is not used as a pin or blocking condition.

The launcher accepts only the `postgres:` and `postgresql:` schemes and classifies both as `POSTGRESQL`. The installed `pg-connection-string` parser produced identical sanitized host, port, database and username configuration for synthetic URLs using either scheme. The launcher separately rejects every other scheme.

TLS is `EXTERNAL_STRICT_TLS`: the runner does not pass a connection URL to `pg`; it builds the client configuration from separately validated fields and installs the pinned CA, `rejectUnauthorized: true`, explicit servername and certificate identity callback, and TLS 1.3 min/max. The URL may omit `sslmode`; `require` and `verify-full` are also accepted. Duplicate SSL modes, weakening modes, other query parameters, and TLS override attempts are rejected. A missing CA pin or TLS config fails before connection.
