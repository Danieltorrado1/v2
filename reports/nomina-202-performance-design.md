# Corrector 202/192: native local performance contract

Scope: offline certification against a fresh PostgreSQL 17.11 restoration, not a production executor or authorization. The native connector accepts only a verified disposable workspace cluster, loopback, a new nonstandard port and one checked-out PoolClient. No environment credentials or application services are imported.

## Sequence and rollback classification

PostgreSQL does not reclaim a `nextval()` value when its transaction aborts, including values evaluated before an `INSERT ... ON CONFLICT` takes its update path. Gaps do not prove persisted rows, created audits or corruption. See [PostgreSQL 17 sequence documentation](https://www.postgresql.org/docs/17/functions-sequence.html).

The induced-failure rollback contract requires identical counts and SHA-256 digests for all 262 data tables and zero new persisted rows. Only `auditoria_id_seq`, `auditoria_eventos_id_seq` and `nomina_revision_operativa_id_seq` may advance monotonically in this failure test. Every other sequence change blocks certification. A second ALREADY_APPLIED execution must leave all 213 sequences unchanged. No sequence compensation, restart, decrement or ID reuse is performed.

The exact dump normally contains 213 SEQUENCE SET instructions. To honor the prohibition on calling the resetting sequence function, the restore omits those instructions, restores every application/auth/storage data table, and reaches the original 213 states using monotonic `nextval()` calls on the newly created sequences. Exact `last_value` and `is_called` equality with the dump is checked before simulation. The ten existing managed-vault exclusions remain unchanged; no historical/audit table is projected, replaced or truncated.

## Evidence for the previous 744 client statements

| Work | Statements |
|---|---:|
| Transaction preflight and lock gates | 12 |
| Initial full public capture (catalog + 224 tables) | 225 |
| Three explicit economic UPDATEs | 3 |
| Both audit repositories, four rows each | 8 |
| Individual canonical history INSERTs | 42 |
| Two subsequent full public captures | 450 |
| Restricted role and transaction timestamp | 2 |
| COMMIT | 1 |
| Lock-test instrumentation | 1 |
| Global comparison of 262 tables inside those 744 | 0 |
| **Total** | **744** |

The old counters did not include server-internal payroll-trigger or foreign-key queries as separate statements; their time was included in the parent DML. Their historical individual counts/times cannot be recovered from those counters. The new run records nested statements with `pg_stat_statements.track=all` and a sanitized delta around application.

The old 1,013.4 MiB figure came from `process.memoryUsage().rss` in one Node process combining executor and certification runner. It excluded PostgreSQL and other processes. Full public snapshots, parsed historical JSON and temporary canonical strings were materialized in that process. Exact historical allocation attribution was not recorded. The new executor runs in a separate Node process; its RSS/heap and OS resource high-water mark are reported separately from the certification runner and the PostgreSQL process tree. Summed PostgreSQL working sets may double-count shared pages.

## Functional protection and optimization

The original embedded executor remains available unchanged in behavior on the previous branch. Shared ticket, canonical diff, snapshot, audit verification and after-state functions are reused by the new local executor. Differential tests compare the new bulk payloads to the original writer field for field, including encrypted document provenance and every history row.

Inside SERIALIZABLE and advisory lock (202,192), the native executor retains the four target row locks, trigger definition/function/enabled hash, trigger/rule allowlist, technical actor, tenant, period, rates, novelty/turn linkage, duplicate account/detail/movement gates, immutable observed baseline and document evidence. Scope also includes the protected employee/IBC, linkage and person. Bounded result sets detect extra matching rows. A frozen scoped manifest links the full 262-table certification baseline digest into audit metadata.

Three fixed economic UPDATE statements retain the original trigger and SQL guards. Three set-based INSERT statements replace 50 per-row audit/history calls. INSERT RETURNING supplies the actual persisted audit rows for canonical verification; the auditoria/historial corpus is never loaded into Node. Idempotency checks retrieve only this operation's bounded records and reject missing, inconsistent or extra records.

The dump has no suitable action/motive indexes on the legacy audit/history tables. A single bounded-result operation-identity gate must inspect those tables in SQL. This is necessary to reject an existing/incomplete/foreign operation anywhere in those repositories; moving it outside the advisory lock would weaken that gate. No local-only index is added to conceal the cost. EXPLAIN ANALYZE and actual server timings document it. This is a constant number of integrity scans, not a client N+1 or full historical materialization. Mandatory per-row foreign-key checks remain enabled and are classified separately from client calls.

Outside the mutating transaction, SQL-ordered digests compare all 262 tables in fixed-size query batches. The other 255 tables must be identical. Digests excluding each of the four target identities protect every other row in those four authorized tables. SQL digests up to the original audit high-water IDs prove the full original corpora unchanged. Canonical verification covers all new rows. Full comparisons also verify idempotency, document failure/recovery and induced rollback.

Document generation remains local and occurs only after COMMIT. It uses a new immutable key/hash, preserves the exact historical PDF, leaves the account PENDIENTE and supports retry after an induced publication failure without reapplying the economy. Publication is a local lifecycle port, not a DB/Storage production adapter.

## Reproduction

Run `npm run build`, `npm run typecheck`, `npm run test:nomina-202:performance` and `npm run certify:nomina-202:native-local` from the performance branch. The integration runner requires the exact supplied local backup and installed native PostgreSQL 17.11 binaries. It creates and stops only its own cluster; inspect the resulting sanitized report, then run the accompanying scoped cleanup script to remove those stopped disposable files and verify absence of owned processes/listeners.

Certification is withheld on any functional, write-set, corpus, idempotency, sequence-contract, process-measurement or test failure. No production correction, payroll recalculation, institution mutation, merge or deployment is enabled by this work.
