# Classification before edits to implementation or tests

Baseline: `d740cd902888cbe45bc60c22a2fd3f8ec9625b70`, branch `fix/phase48-managed-dependency-audit-entry`.
Each failing test was reproduced independently. Logs are retained in `tmp/classification-failure-{1,2,3}.log`; exact input probe is `tmp/classify-three-failures.ts`, output `tmp/classification-inputs.log`. No production adapters were invoked.

## Missing exception — functional regression in certificate boundary

File: `src/tests/phase48.authorization-tls-contract.test.ts`, test `strict phrase rejects missing/wrong/duplicate/unknown certificate, whitespace and ambiguous values`, line 18.
The probe enumerates all 11 negative inputs. Only index 7 is accepted: the otherwise valid authorization phrase with the pinned certificate represented entirely in lowercase (`700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`). `parseAuthorizationPhrase` calls `validateAuthorizationFields`, then `validateCertificateHash`. Expected: reject the noncanonical certificate serialization. Observed: successful parsed fields, containing the lowercase certificate.

Versioned evidence: commit `182177a77ddf71e740fd91d5c876c7ce8fdd1b6a` replaced `exactEqual(hash, CERTIFICATE_SHA256)` with `sha256HexEqual(hash, CERTIFICATE_SHA256)` in `validateCertificateHash`. Its parent requires the uppercase pinned representation. The authorization serialization and its negative test were not changed by that commit. The helper's case normalization is valid for digest identity, but accidentally widened this public serialized certificate contract. This is a boundary regression, not an obsolete negative test. Restore uppercase ASCII representation at this boundary with a format guard, retaining the normalized timing-safe helper for identity. Keep all 11 original negative inputs.

## Error code — functional regression in certificate boundary

Same file, test `bad certificate stops both read lifecycle and TLS config before connection or credential callback`, line 49. First input `certificateSha: undefined` reaches `runReadOnlyLifecycle` → `validateReadOptions` → `validateCertificateHash` → `sha256HexEqual` → `normalizeSha256Hex`. Expected public error: `CERTIFICATE_SHA256_INVALID`. Observed internal error: `SHA256_FORMAT_INVALID`. The trailing-space certificate also leaks that error; a well-formed wrong digest already produces the contractual error. The same commit introduced this leak. Translate only `SHA256_FORMAT_INVALID` inside `validateCertificateHash`; leave other SHA fields and unexpected errors untouched. Add direct boundary/helper coverage.

## Static import barrier — outdated certified dependency list

File: `src/tests/phase48.readonly-runner.test.ts`, test `static dependency barrier: no imports or dispatch to mutation modules`, line 23. Input is the real static import `./phase48-sha256` in a readonly module. Its AST visitor rejects it as `Forbidden dependency ./phase48-sha256` because the older allowlist omits the new helper introduced by the SHA migration.

The helper is 14 lines: one `node:crypto` import (`timingSafeEqual`), one literal regular expression, and two exported functions. It has no database, filesystem, network, environment, runner/mutator imports, initialization calls, or other side effects. Its functions validate exactly 64 ASCII hexadecimal characters, normalize case, construct two 32-byte Buffers, and use `timingSafeEqual`. Preserve it unchanged. Add only the literal exception `name === './phase48-sha256'` to the runner visitor. Enforce an independent source pin and AST shape audit for this pure helper, with negative fixtures for equivalent paths, traversal, alias, extensions, new imports, and injected side effects. No broader path pattern is authorized.

## Validation plan

Re-run the same three test names independently, then the expanded related suite and offline V6/authorization/runner/mutator protocol-double/receipt suites. No production runner, live mutator, full Phase 48, diagnostic query run, or production health/credential adapter may execute. Repeat the isolated PostgreSQL 17.11/TLS fixture and builds. Preserve previous certificates and publish a successor only after successful checks.
