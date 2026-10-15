# Phase 48 diagnostic launcher metadata certification

Decision: **METADATA LOCALLY CERTIFIED — NEW ONE-CONNECTION DIAGNOSTIC AUTHORIZATION REQUIRED**.

This certification was performed only on `fix/phase48-v6-diagnostic-metadata`, based on `baa964a638df93bc7775f5e7e331f88219dfbd15`. No production health request, credential read, PostgreSQL production connection, authorization, nonce, or Phase 48 execution was performed.

## Corrections

The launcher previously pinned `reports/phase48-v6-read-query-certificate-20261015T162859144Z-3ecc13c737384db89363cbbe05b3485f.local.json` to the 63-character value `24688bf41e0751f223defd72afd9c0f2b1275485bd44b3cb9ec00edaa389a1d`. The file's actual SHA-256 is 64 characters and does not match that malformed pin. The launcher now pins the current certified fixture at `reports/phase48-v6-read-query-certificate-20261015T165906922Z-6b9eadce573b42fd84a265387903cf37.local.json`, SHA-256 `24a8d02a55ce9096df2696cbe50d23a242c940f1d0723624fad6a53a47ee566e`.

SHA-256 pins are now required to be exactly 64 hexadecimal characters. The expected pin is canonical lowercase; actual hex is normalized before comparison. The digest comparison uses `timingSafeEqual` after validating both 32-byte values.

Every launcher receipt now requires this exact historical status:

```json
{
  "status": "NOT_AVAILABLE",
  "blocking": false,
  "expected_sha256": [
    "e5a71ee01913b1ef778a80854a4ba8d2ac46189f81c1ac87dc25d2adeb26d9a4",
    "b6368989c72dd8b21ecd48e52b0495d066fd51e22dce98dfbe986761c73b481a"
  ]
}
```

This records expected historical identifiers only. It does not claim that the files were found or verified, and it does not load or use their bytes.

## Local verification

- Diagnostic launcher and local health tests: 16/16 passed, including SHA pin format/mismatch, required historical field validation, STOPPED and CAPTURED receipt publication, valid JSON, final LF, and collision rejection.
- Local PostgreSQL 17.11/TLS 1.3: 164 queries (159 SELECTs), 740 candidates, 17 digests, explicit ROLLBACK and client close passed. The four query-error/timeout/collision cases passed.
- V6 parser and runner, read-query instrument, window/seal tests, atomic receipts, and unchanged-mutator regression suite: 148/148 passed.
- Typecheck, backend build, FrontendNuevo build, and `git diff --check`: passed.
- Temporary PostgreSQL cluster: port 51009, postmaster PID 17384. The owned cluster was stopped; its process, listener, and temporary data directory were confirmed absent afterward.
- The local diagnostic fixture used synthetic local credentials only. No production credential or connection was accessed.

## Local evidence

- Certificate: `reports/phase48-v6-read-query-certificate-20261015T172112962Z-74c6cf3fd77f4f168f67436e3d304c60.local.json`, 2499 bytes, SHA-256 `4c9698e9c521031f0f4608f7abd0451aa56b313b8a1eef394772c1959b21c437`.
- Instrument receipt: `reports/phase48-v6-read-query-20261015T172112962Z-74c6cf3fd77f4f168f67436e3d304c60.receipt.json`, 34378 bytes, SHA-256 `1bce3e9f2bf98391c4bfca68c635876316d9369bdd280c5f39d88f16bf85b00c`.
- Invalid historical diagnostic artifact remains byte-identical: 1402 bytes, SHA-256 `ca2688f45c0c7da7717c277163a45488a24ee0e8f7ba7c0cdbd4f704a6f5c2bb`.
- The two historical STOPPED receipts remain `NOT_AVAILABLE`; they were not searched for, recreated, or treated as verified.

## Pins

The launcher commit on this branch is the new `diagnostic_launcher_commit`. The diagnostic/read-only runner source remains pinned to `38f5242ddb283ab8af03d0ea5dca1aae5fe44922`; the unchanged mutator source remains `58a187cbf7f0f6fe4fa0ed7b6abd3416a6996911` and its local regression tests passed. Previous launcher pins are superseded for future diagnostic attempts by the branch commit carrying this metadata correction. No merge or deployment is included.
