# Phase 48 READ_QUERY diagnostic launcher — local certification

Date: 2026-10-15 (America/Bogota)

Recertified pins for a future authorized diagnostic:

- `diagnostic_runner_commit`: `38f5242ddb283ab8af03d0ea5dca1aae5fe44922`
- `readonly_runner_commit`: `38f5242ddb283ab8af03d0ea5dca1aae5fe44922`
- `mutator_commit`: `58a187cbf7f0f6fe4fa0ed7b6abd3416a6996911` (same logic and commit; regression suite passed)

Previous diagnostic and read-only runner pins `0160238c317637196bb38c8abde1ced5e4737339` and `154dbdaf01d75685c6306a81a92bf7ab11a69585` are revoked for future diagnostic launch.

## Forensic findings

The previous `NullReferenceException` was raised by PowerShell's `Invoke-WebRequest` command. The captured PowerShell error identifies that cmdlet (`FullyQualifiedErrorId: Invoke-WebRequest`); no Node launcher or versioned READ_QUERY code was on that HTTP path. The available exception does not identify a deeper PowerShell runtime defect, so the internal cause remains unproven.

The preserved invalid receipt is 1,402 bytes and retains SHA-256 `ca2688f45c0c7da7717c277163a45488a24ee0e8f7ba7c0cdbd4f704a6f5c2bb`. Its final five bytes are `0D 0A 7D 60 6E`: CRLF, `}`, then the literal PowerShell grave-accent and `n` characters. The file-writing command concatenated a single-quoted ``'`n'`` to PowerShell's CRLF-formatted `ConvertTo-Json` output. The literal suffix remains after the JSON root, making `JSON.parse` fail. The versioned instrument did not produce these bytes; its previous and current Node publishers serialize with `JSON.stringify` and a real LF. The artifact was not modified, renamed, or removed.

## Implementation

The versioned Node health client pins `https://api.empiriasuite.com/api/health`, issues GET only, disables redirects, enforces a timeout and byte limit, validates JSON content type and strict UTF-8, rejects BOMs and duplicate keys, and checks the exact health flag types. Health errors are reduced to stable codes.

The diagnostic launcher performs offline pin, branch, worktree, CA and preserved-artifact checks before health. It reads the credential only after health passes, caps the connection factory at one client, and invokes only the READ_QUERY instrument. The Phase 48 production entry continues to reject this diagnostic branch. The launcher records precheck, health, credential, TLS, transaction, query, rollback and close state, and never creates authorization material.

Both launcher and instrument publish through the repository's exclusive `publishAtomicReceipt` path. The serialized bytes are parsed before publication, written to an exclusive temporary file, flushed, closed and renamed without replacement; the final file is re-read and checked for schema, LF, size, hash and valid JSON.

## Local verification

- Health/client and launcher tests: 14 tests passed, including local HTTP and HTTPS with the repository's test-only TLS fixture, redirects, 500/503, timeout, malformed/duplicate JSON, excessive body, wrong types, BOM, invalid UTF-8 and simulated `ReferenceError`.
- READ_QUERY instrument tests: 19 tests passed, including first-query stop, SQLSTATE, rollback/close failures, one-client cap and sanitized receipts.
- PostgreSQL 17.11 local certification: 164 queries (159 SELECTs), 740 fixture candidates, 17 digests, TLS 1.3, READ ONLY / REPEATABLE READ, explicit ROLLBACK, `Client.end()`, and atomic receipt all passed. Induced missing-column, missing-relation, permission and timeout errors also passed.
- V6 local PostgreSQL/window/receipt/mutator regression harness: 148 tests passed, including complete 740-row operation, rollback points, digest drift, sequence locks, seal expiry, receipt collisions, restart recovery and idempotency. The 121-second slow-gate case passed; latency profiles measured the existing 100,000 ms internal TTL within its 120,000 ms hard limit.
- V6 parser, READ ONLY runner, atomic receipt, TLS and mutator protocol regressions: 52 tests passed.
- Backend typecheck/build, FrontendNuevo build and `git diff --check`: passed.

The successful local certificate is `phase48-v6-read-query-certificate-20261015T165906922Z-6b9eadce573b42fd84a265387903cf37.local.json` (2,499 bytes; SHA-256 `24a8d02a55ce9096df2696cbe50d23a242c940f1d0723624fad6a53a47ee566e`). Its paired receipt is `phase48-v6-read-query-20261015T165906922Z-6b9eadce573b42fd84a265387903cf37.receipt.json` (34,378 bytes; SHA-256 `74544cadb7a3386c229669c2627a5b8b32c71e518bcac3be16f861e152843511`). The temporary PostgreSQL clone used port 56301 and PID 15224; it was stopped and its unique data directory removed. No listener or process for that clone remained.

No production health request, credential read, connection, or write was made during this certification. No merge or deployment occurred.
