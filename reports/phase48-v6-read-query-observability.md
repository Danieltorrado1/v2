# Phase 48 V6 READ_QUERY diagnostic observability

Status: `OPERACIÓN DETENIDA — INSTRUMENTO READ_QUERY NO CERTIFICADO`.

This work is isolated on `fix/phase48-v6-read-query-observability`, based on `4a2e9d94440442809b5b416532a53ca3403ad508`. No production credential was read and no production connection was opened during this task. The original read-query failure remains undetermined.

## Forensic limit of the previous attempt

The failed diagnostic was a temporary script, `tmp/phase48-v6-window-local/read-query-diagnostic.ts`, not the versioned V6 runner. Its terminal catch at line 47 emitted only `error_type` and a generic `SANITIZED` code. It discarded the stack, active phase, current query ID, and resource flags. No diagnostic receipt was written. Therefore the original undefined identifier, originating file/line, whether a Client had connected, and the rollback/close result cannot be recovered from retained evidence. Naming an identifier would be speculation. The attempt is not recoverably auditable.

The failed script was preserved unchanged for this work: 10,170 bytes, SHA-256 `0bc0564d25f4f8dcced9ffa63b43e2aeb5fd6909dbdef0e1e7700e6eb0daaf5f`. Its expected result path `tmp/phase48-v6-window-local/read-query-diagnostic-result.json` is absent. The pre-existing local query catalog remains at `tmp/phase48-v6-window-local/query-diagnostic-905fe806da114aa38a7f06577e1fa3a7/query-catalog-scoped.json` (24,302 bytes); it records 164 successful fixture queries, candidate_count 740, 17 digests, explicit rollback, and closed client.

Protected STOPPED receipts were verified before implementation and remain unchanged:

| Receipt | Bytes | SHA-256 |
|---|---:|---|
| `phase48-0223427b-8d52-4f56-9e67-a474a30b7e53.stopped.json` | 304 | `e5a71ee01913b1ef778a80854a4ba8d2ac46189f81c1ac87dc25d2adeb26d9a4` |
| `phase48-84d12b7b-ddb3-45bf-a59e-452e4b14a262.stopped.json` | 270 | `b6368989c72dd8b21ecd48e52b0495d066fd51e22dce98dfbe986761c73b481a` |

## Instrument added

`src/modules/cobertura/phase48-v6-read-query-diagnostic.ts` is a mutation-independent diagnostic library. It creates at most one injected client, validates an injected TLS evidence record against TLS 1.3, encrypted/authorized state, pinned CA, hostname and servername, wraps every query with a stable phase/category/SQL-hash ID, halts subsequent queries at the first query failure, and omits SQL text, values and rows. An outer catch/finally independently records operation, rollback, close and publication failures. It attempts rollback after any attempted connect and always attempts client end. The receipt uses a unique diagnostic UUID and exclusive same-volume hard-link publication, so a pre-existing final name is never replaced. There is no Pool, mutator import, nonce, authorization, baseline or phrase path.

`src/tests/phase48.v6-read-query-diagnostic.test.ts` covers 19 cases: argument validation; ReferenceError before/after client creation; connect/TLS/begin/SELECT failures with and without SQLSTATE; rollback and close failures; publication errors and collisions; failure injection at lifecycle phases; first-query stop behavior; sanitization; single-client limit; and a 164-query synthetic capture with 740 candidates and 17 digests.

## Validation and remaining blocker

The diagnostic suite passed 19/19. Backend typecheck and build passed; FrontendNuevo build passed with its existing large-chunk advisory; `git diff --check` passed. The combined Phase 48 test run passed 82 tests and failed the launcher offline-validation case because this new branch is not the branch hard-coded in the existing V6 release gate. The remaining local Phase 48 transaction tests also require the guarded local cluster.

The preserved PostgreSQL 17.11 cluster could not be started in this environment: the OS denied binding `127.0.0.1:55470` (`could not create any TCP/IP sockets`), including the escalated local-start attempt. It has been left stopped and intact. Consequently the instrument has not been exercised against the PostgreSQL fixture through its client lifecycle, and the required local full certification is incomplete. The mock 164-query test does not substitute for that certification. No commits or push were made.

## Continuation: dynamic-port probe and branch gate

The port investigation found no listener on 55470 and no Windows excluded-port range covering it. A standalone loopback bind to 55470 succeeded later in the same environment, so the exact underlying source of the PostgreSQL `Permission denied` cannot be established from retained evidence. It was not an occupied port. A fresh filesystem clone of the preserved stopped fixture started successfully on dynamically selected `127.0.0.1:53626` (PostgreSQL 17.11, PID 17452); `pg_isready` succeeded and a local read-only identity/count query returned server 17.11, the clone's data directory, and 740 rows in `cobertura_asignaciones`. That owned clone was then stopped and verified stopped. This probe did not exercise the diagnostic instrument, its 164-query capture, TLS, or 17 digests.

The release branch gate now names exactly `fix/phase48-v6-read-query-observability`; the old branch name is normalized only in the certified source comparison. HEAD and mutator ancestry checks remain in place. The launcher integration test reaches the clean-release gate only after the working tree is committed, so its current pre-commit invocation fails closed with `V6_CLEAN_RELEASE_BRANCH_REQUIRED`. The parser/diagnostic unit invocation otherwise reports 24 passing tests and 2 failures: that clean-tree-dependent launcher test and its associated branch-gate assertion (the latter was corrected after this run). No remote push or commit was made. Full local PostgreSQL certification remains incomplete, so the branch is not certified.

The two protected STOPPED receipts were found under `tmp/phase48-pooler-local/final-readonly-receipts/` (304 and 270 bytes) and rehashed after this work: `phase48-0223427b-8d52-4f56-9e67-a474a30b7e53.stopped.json` remains SHA-256 `e5a71ee01913b1ef778a80854a4ba8d2ac46189f81c1ac87dc25d2adeb26d9a4`; `phase48-84d12b7b-ddb3-45bf-a59e-452e4b14a262.stopped.json` remains SHA-256 `b6368989c72dd8b21ecd48e52b0495d066fd51e22dce98dfbe986761c73b481a`.

The original failure must remain `NO_DETERMINADO` until a future, separately authorized diagnostic run produces a stack/query ID. This report does not authorize or perform that run.
