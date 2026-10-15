# Local PostgreSQL READ ONLY runner recertification

Date: 2026-10-15 (America/Bogota)\
Code commit: `6ea616b5442c0654e2f3cc88ddf28dea381c4370`\
Corrector commit: `95fc6bb6879409d37a088e451fb64f2edafacb5f`\
Report: `report.json` (SHA-256 `81b031d7bdac02487ea67f01ca2ec0137a2d9cd00d79ea4490853b1363bd7177`)

## Scope and isolation

The runner is a separate PostgreSQL `pg.Client` implementation and has no import path to either corrector adapter. Offline validation pins the branch/head, corrector ancestry, dump, historical PDF, evidence report, CA, target host, port and health URL before calling the credential provider. This certification used only a new local PostgreSQL 17.11 cluster on loopback port 63873, a generated one-day local TLS certificate, a loopback health endpoint, the verified local backup and synthetic credentials. No production credentials, `.env`, `DATABASE_URL`, or production CA file were read; no production connection or write was made.

Two fresh Client objects opened sequentially. Both negotiated TLS 1.3 with hostname verification and the generated CA, began `REPEATABLE READ READ ONLY`, confirmed `transaction_read_only=on`, calculated the same canonical digests, issued explicit `ROLLBACK`, and closed. The result was only `PENDING_USER_CONFIRMATION` with `synthetic=true`. It did not generate a run ID or nonce, activate authorization, or invoke the mutator.

## Local before-state and digests

The restored case matched movement 192 (PENDIENTE, quantity 1, unit/calculated/total 97,800, social-security false), turn 202 (2026-09-08 through 2026-09-09, two inclusive days), detail 220 (active, 97,800), account 77 (active, PENDIENTE, 97,800), and revision 20114 (REVISADO/v30). Actor 12 had the expected active role and company/contract scope. Waiting locks and DDL activity were both zero; no duplicate, prior correction, or payment-lifecycle blocker was found. The historical PDF was 3,051 bytes with the pinned SHA-256.

Both snapshots produced identical digests:

| Digest | SHA-256 |
|---|---|
| Critical schema and trigger | `7dbedce501f61b4195e0dea7573f37d7fe4b8159b5383532f40c728eb0dd1f3d` |
| Sources and authorization | `f1311c3825573ad017899740b7d6c8f8315a2b76dfabffb3142c873e19689963` |
| Movement 192 | `bd48d5f3fce2c69361a36ab906affc1eafa35793da2fc8ac2d2a769d3aef015f` |
| Detail 220 | `d2a34f142c3eff4e3a6883fe22a5393dae0cc423ed34ac058495bae4cc8ce01a` |
| Account 77 | `c51a5542d18c8822b81212752f6ba671d15f215f506bf36aec87d2e3537e137d` |
| Revision 20114 | `4a11d6150197d297bce1c9d800bf5046bc4a88189960985ac54e18faa3f33302` |
| Related audits | `1e1e668d297a40b2b1c603bb00bd156af545d66910603a1c706e09de64643af6` |
| Related history | `cc2643e26a9dcf944a552f9f82d3b97fd28c10c1e8ffa4c0135a95054e5dbeba` |
| Historical PDF metadata | `16113cd2141c950ac82ad380ef9d13fecb5152a245d0fb12ca9fa0f918322954` |
| Protected tables | `091aa63a5b2e12b60b48f5fd95a8c9fdd15eae6448e02e2489f313cba7e8ea04` |
| Write-set before-state | `95bfe3a5b6b57f4bdc7f7f3386673a83975866e96ce2c15c2ecec068359d1dc9` |
| Four-sequence baseline | `a9f0c7a20b6c9debcb01a4cfe65c65aafdd76ad37bc5c8e10cda97a3acbf7986` |

## Read-only and failure-path evidence

The successful two-snapshot preflight took 531.7 ms and issued 28 PostgreSQL queries: 22 capture queries and 6 transaction-control/session-verification queries. This is 11 capture queries plus BEGIN, read-only/isolation verification and ROLLBACK per snapshot; no N+1 loop or full-history materialization is used. Related audit/history reads are scope-limited and capped; overflow stops the preflight.

PostgreSQL rejected DDL, DML and `nextval()` in read-only transactions with SQLSTATE `25006`; the tested sequence value remained unchanged. Local negative cases all returned STOPPED for HTTP 503, SYNC true, hostname mismatch, untrusted CA, connection refusal, PDF drift, and digest/snapshot drift. Receipt tests verify separate baseline/PENDING/STOPPED paths, atomic no-replace publication, and rejection of status/path mismatches. Offline contract failure was verified to occur before the credential callback.

## Corrector regression

The full local restore recertified the separate corrector: 7 authorized tables changed and 255 tables remained intact. Economic values were 195,600; the account remained PENDIENTE with the old reference invalidated; revision became REQUIERE_REVISION/v31; 4 records were added to each audit repository and exactly 42 canonical history rows were added. The historical PDF remained intact; local versioned document creation and recovery passed without replaying the economic operation.

The four allowed sequence COMMIT advances were exact: `auditoria_id_seq +4`, `auditoria_eventos_id_seq +4`, `nomina_revision_operativa_id_seq +1`, and `historial_cambios_id_seq +42`. ALREADY_APPLIED changed no rows and advanced none of the 213 sequences. The induced rollback preserved all table data and persisted no rows; observed monotonic gaps were +4, +4, +1, and +1 respectively, within the approved maxima. No sequence was reset, rewound, or reused.

The mutator took 61.4 ms in this local run. Full 262-table digest comparisons took 2.709 s before and 2.666 s after the mutation, outside the mutator transaction. Sanitized plans and table digests are in this directory. The whole entry-preflight certification phase (including deliberately failing negative cases) took 2.914 s. PostgreSQL reported zero waiting locks and zero active DDL during the successful preflight. The certificate runner's process RSS was 67,878,912 bytes; PostgreSQL was a separate process.

## Validation and cleanup

The native certification reported PASS, restored all 262 tables from the exact dump with only the certified local exclusions, and stopped its disposable cluster (master PID 33960). The full `test:nomina-202:performance` suite passed 72/72; backend typecheck/build, frontend build, and `git diff --check` passed. The frontend build emitted its existing large-chunk advisory. No merge or deploy was performed.

This evidence certifies only local code and the READ ONLY mechanism. A real preflight, any authorization, the economic correction, and document publication still require their separate explicit authorization.
