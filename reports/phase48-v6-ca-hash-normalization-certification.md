# Phase 48 diagnostic CA hash and final health certification

Decision: **VALIDACIÓN DE CA CERTIFICADA — REQUIERE NUEVA AUTORIZACIÓN DE UNA CONEXIÓN**.

Work was performed locally on `fix/phase48-v6-ca-hash-normalization`, based on `13bde88a2c58034884089cfe60d285da4d18ca7e`. No production health request, `.env` read, PostgreSQL production connection, Phase 48 execution, DDL, DML, or `nextval` occurred.

## Corrections

The diagnostic parser canonicalized the supplied `ca-sha256` to lowercase, while the TLS path compared it as case-sensitive text against an uppercase pin. The diagnostic stopped with `CERTIFICATE_SHA256_INVALID` before creating a Client. The existing STOPPED receipt remains unchanged: `reports/phase48-diagnostic-d99121e4-fc90-47ac-bdff-cf88a368c98e.receipt.json`, 2,264 bytes, SHA-256 `bfd53e8f918e10181b3c3d3cb58bf7445caba0f8d6ff415222cf5df961d0471f`.

The shared SHA-256 helper now accepts exactly 64 ASCII hex characters, canonicalizes to lowercase, decodes each input to 32 bytes, and compares with `timingSafeEqual`. The stored CA pin remains unchanged: `700723581420DD1AC98FD7E9AC529F0EF210EADCAF87FC868A3AD7D114C2F3B7`. The actual authorized CA file was read locally only; it was 1,367 bytes and its digest matched. No certificate details were added to receipts.

The launcher now attempts one final Node health GET whenever the initial GET was attempted, from its outer `finally`, after the instrument has completed its rollback and close path. It skips the final GET when offline precheck fails. Initial and final health results and errors are recorded separately; a final health error cannot replace the original error. The orchestration remains capped at one PostgreSQL Client.

## Local verification

- Diagnostic launcher, certificate normalization, TLS runtime, authorization TLS contract: 52/52 tests passed.
- Local harness: PostgreSQL 17.11, TLS 1.3, 164 reads, 740 candidates, 17 digests, explicit ROLLBACK, Client close, and atomic receipt passed. Local cluster used port 55338 and postmaster PID 30012; it was stopped and its owned temporary directory removed.
- V6 parser: 7/7 passed.
- PostgreSQL diagnostic fixture: 4/4 passed.
- V6, mutator regressions, receipt atomicity, seals/windows and idempotency: 148/148 passed.
- Backend typecheck, backend build, FrontendNuevo build, and `git diff --check`: passed.
- Local CA SHA check: 1,367 bytes; SHA-256 matches the fixed pin. No `.env` file was read.

## Preserved and generated evidence

- Prior STOPPED receipt `reports/phase48-diagnostic-d99121e4-fc90-47ac-bdff-cf88a368c98e.receipt.json`: 2,264 bytes, SHA-256 `bfd53e8f918e10181b3c3d3cb58bf7445caba0f8d6ff415222cf5df961d0471f`; preserved byte-for-byte.
- Prior STOPPED receipt `reports/phase48-diagnostic-cb2fe336-7a88-4ac0-bd01-0021a224288f.receipt.json`: 1,341 bytes, SHA-256 `6dbec67ff2bdf74dc48493f63894b352fdbae1793c9d617ecf09051f446dca89`; preserved byte-for-byte.
- Local certificate `reports/phase48-v6-read-query-certificate-20261015T185332917Z-ea24a39cb3904b4a8335f19ba54ea31d.local.json`: 2,499 bytes, SHA-256 `38b659acab9cc8817b826031c16672f69bf063be379ab97cf8a08db195c40b05`.
- Local receipt `reports/phase48-v6-read-query-20261015T185332917Z-ea24a39cb3904b4a8335f19ba54ea31d.receipt.json`: 34,378 bytes, SHA-256 `de98af4b8e4a0dbdfaa2eb791a5066024047ddf0acc18f553942d9cec33ceb8e`.

## Pins

- `diagnostic_launcher_commit`: final HEAD on `fix/phase48-v6-ca-hash-normalization` after the pin/evidence commit.
- `diagnostic_runner_commit`: `d28a60cbee6e20b458f0e6b61cfe2c20b68988e9`.
- `readonly_runner_commit`: `d28a60cbee6e20b458f0e6b61cfe2c20b68988e9`.
- `mutator_commit`: `58a187cbf7f0f6fe4fa0ed7b6abd3416a6996911` (unchanged).

For a future attempt, launcher pin `13bde88a2c58034884089cfe60d285da4d18ca7e` and runner pins `4a0fa3c19c1a101fc7378efeaad9c52a5859a77c` are revoked. No merge or deployment is included.
