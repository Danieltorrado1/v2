# Managed dependency audit — final local certification

Branch: `fix/phase48-managed-dependency-audit-entry`. Original base: `d740cd902888cbe45bc60c22a2fd3f8ec9625b70`.
Scope: independent catalog-only audit of the two compiled extensions functions and their invoking event triggers. No production, productive health/credentials, full Phase 48, 540-query diagnostic, live mutator, merge or deployment ran.

## Certified graph

Serialization: `phase48-managed-dependency-graph-v1`.

| Field | Value |
| --- | --- |
| node_count | 10 |
| edge_count | 13 |
| dependency_nodes_digest | `2d3055156f153f95f0663e997fde0a3a0b12a8dbc67711b69b681eb27870bc73` |
| dependency_edges_digest | `e0663c4c107efc27ded410794f1e77a69fc800904dcec4e3b0ffc48419739d0f` |
| query_manifest_digest | `5a61d17be65a21b552bf3451ff0cd35cccf0498af2f47652b6ba3d6ad0d3ff1e` |
| extensions.pgrst_ddl_watch root | `bb2adad04de8a9826b1c5e5cc424cfe318d259c9d54a12807dce465bc9091f68` |
| extensions.pgrst_drop_watch root | `bd8731e2dadaab8ae955e2df86e4e3c34deff10dce65b83bd7715b8f334fc5b6` |

The executed module generates both global digests before rollback and validates its inventory and optional expected evidence. They are not injected into the report. The independent post-publication validator reconstructs both digests from the certificate inventory, compares the summary receipt and verifies all 14 source hashes. The receipt contains no nodes/edges or pg_locks match count. Local detailed evidence contains no session OIDs. Repeated reachability observations are no longer separate edges; duplicate durable nodes/edges are rejected.

## Artifacts

Final successor: `reports/phase48-managed-dependency-audit-local-8d0a839df8e94af7b2558c1394bdba97.json`.
SHA-256: `f6eb861096a53a72b467009b9b214908760c08b09697989606b4248f7c7ded99`.

Atomic summary receipt: `reports/phase48-managed-dependency-audit-receipts/phase48-managed-audit-ad8f674e1f244ae99d94eca6940cbd5d/phase48-064bc35c-86d1-44f1-b7d5-a290f406dbc0.receipt.json`, 6663 bytes.
SHA-256: `d14f32f3d3e1e275fcd8d68d04efb336fab56de3bbbe00ffbbb9234ce3116c8d`.

The final successor links the preserved bf984 candidate (`dee0ccaa696ab4e03edaef2868a7ba7900cb25bdb3a97836b0812ddeab4946de`), whose missing global fields caused the previous stop. That historical candidate links bf22 (`426b4de155a4eb9013c8facb96d4f4564e8780108c962e54fd750c3089bf38c8`). No certificate was overwritten. The intermediate 76d5 certificate is also preserved.

`reports/phase48-managed-dependency-audit-final-manifest.json` records source, vector, certificate, receipt, report, log and Git-fixture evidence hashes. Text source pins explicitly normalize CRLF to LF; artifact hashes use exact bytes. Prior reports and inventories, including `tmp/final-enoent-result.md` and the original stopped cluster, remain intact.

## Validation

| Check | Result |
| --- | --- |
| Focused canonical vectors and digest contracts | PASS; included in expanded suite |
| Expanded suite including serialization and static barriers | 128 tests: 127 PASS, 0 FAIL, 1 SKIP |
| V6, authorization, runner, mutator protocol doubles and receipt regressions | 70 PASS, 0 FAIL, 0 SKIP |
| Explicit PostgreSQL 17.11/TLS 1.3 certification | 9 PASS, 0 FAIL, 0 SKIP |
| Independent published certificate/summary/source validation | PASS |
| Typecheck, backend build, frontend build | PASS |
| git diff --check | PASS |

The one ordinary-suite skip is `real local PG can execute fixed graph audit and closes after explicit rollback`; it requires `PHASE48_MANAGED_AUDIT_LOCAL=true`. That same test was explicitly enabled in the separate 9/9 PostgreSQL run, including real aggregate count/type validation, one connection, REPEATABLE READ READ ONLY, PID, virtualxid, snapshot, inventory/digests, ROLLBACK and closure. No mandatory requirement remains skipped. Frontend emits only its existing bundle-size warning.

The isolated TLS run used loopback port 50496 and postmaster PID 32888. Its own cluster was stopped and removed after path/ownership validation. Certificate evidence retains the transient identity. No earlier cluster or unrelated process was changed.

Fixed byte/SHA vectors cover empty and Unicode self-edge graphs. Tests also cover order invariance; each durable node/edge field; additions/removals; null versus empty/absent; Unicode preservation; session-metadata independence; duplicate/conflicting identities; incomplete endpoints; invalid SHA; incorrect version; expected-evidence mismatch with cleanup. Static checks retain the strict timing-safe helper, reject textual SHA comparisons, audit serializer purity and reject business capture/mutator imports.

The V6 fixture verifies all 1582 base tracked names and blobs in a local clone without hardlinks. Its exact UTF-8 XLSX blob remains `54d429496874d9462f69d3449ceaf065a56b59d4`. Branch, dirty-tree, HEAD and remote-contract cases remain separate. The V6 production guard was not modified.

## Reproduction and limits

The local commands and their full outputs remain in `tmp/graph-digests-contracts.log`, `tmp/graph-digests-expanded.log`, `tmp/graph-digests-regressions.log`, `tmp/graph-digests-postgres-final.log` and `tmp/graph-digests-final-*.log`. The certifier is `tmp/certify-phase48-managed-audit-local.ps1`. Post-publication validation is `tmp/verify-managed-graph-final.ts` with output in `tmp/graph-digests-final-validation.json`.

This is local fixture certification. Health adapters are controlled fixtures; it establishes no authorization to connect to or deploy against production. Existing contract pins and revocation guards remain effective.
