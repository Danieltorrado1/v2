# Phase 48 managed dependency audit

This dedicated audit reads only the fixed PostgreSQL catalog query manifest in `phase48-managed-dependency-audit.ts`. It is isolated from candidate capture, business repositories, the Phase 48 runner, and the mutator. Root identities are compiled constants: `extensions.pgrst_ddl_watch` and `extensions.pgrst_drop_watch`.

The only permitted `pg_catalog.pg_locks` access is the sealed `session.virtual_transaction` aggregate. Its fixed predicate is `pid = pg_backend_pid()`, `locktype = 'virtualxid'`, `virtualxid IS NOT NULL`, and `granted = true`. It selects `count(*)::integer AS match_count` and `min(virtualxid::text) AS virtualxid`, with no LIMIT, OFFSET or arguments. Exactly one aggregate row and exactly one match are required. Only virtualxid is retained in durable output. The query ID, normalized template SHA-256, relation set, purpose, row limit, and READ_ONLY classification are included in the manifest digest.

The referenced dependency walk is cycle-aware and bounded to 12 levels, 256 nodes and 512 returned inventory rows. Reachability is separate from collection: each reachable object is emitted once, and each physical `pg_depend` row is emitted once. This avoids counting alternate traversal paths as separate dependencies. Duplicate durable identities or edges are rejected, never silently removed by the serializer. The certified fixture has 10 nodes and 13 edges; the earlier 24-edge output included repeated traversal observations. OIDs stay in collection memory only.

The entry boundary is dependency-injected. Local certification uses no productive credentials or HTTP health request. Future adapters must supply offline checks, initial health, credential retrieval, one TLS-verified Client, a REPEATABLE READ READ ONLY transaction, rollback, close, final health and one atomic receipt. This work certifies the instrument locally, not a production adapter or deployment.

## Canonical graph v1

`phase48-managed-dependency-graph.ts` is a pure module importing only Node crypto and the strict SHA helper. `graph_serialization_version` is `phase48-managed-dependency-graph-v1`. Node fields, in fixed key order, are catalog_class, namespace, object_type, structural_identity, extension_identity, owner_class, owner_sha256 and normalized_definition_sha256. Catalog class is fully qualified. Nullable fields require explicit null; missing values fail. Owner class and hash are both present or both null. SHA input is strictly validated and normalized by the certified helper.

Edges contain the complete durable source and destination nodes, deptype, direction, and a relation with catalog, source_subobject and target_subobject structural identities. Endpoint identities must occur in the node inventory. The byte comparator orders every durable field by UTF-8 bytes with null before strings. Unicode is preserved without normalization. No locale comparison, session OID/PID, time, query order, depth or cycle diagnostic enters either payload.

Canonical JSON has fixed keys, sorted arrays and no optional whitespace. Hash input is UTF-8 of `phase48-managed-dependency-graph-v1:dependency_nodes_digest`, NUL, then the nodes JSON; edges use the distinct `phase48-managed-dependency-graph-v1:dependency_edges_digest` domain. Both JSON payloads include the serialization version. Fixed vectors include exact UTF-8 bytes and independently computed SHA values.

`validateGraphEvidence` requires version, both global digests, counts, both existing root digests and query-manifest digest. Expected evidence is compared using the strict timing-safe SHA helper. `validateGraphInventory` reconstructs the global digests from detailed evidence and validates the summary. Invalid formats, changed values, incomplete identities, unknown versions and duplicates fail closed.

Successful module output contains the complete local inventory and summary. The entrypoint removes nodes/edges from its durable receipt and returns them separately as `localEvidence`. The local certificate retains that sanitized inventory and is parsed and independently checked after publication. A STOPPED run before capture does not invent graph digests.

## Local verification

Run `node --import tsx --test src/tests/phase48.managed-dependency-graph.test.ts` for canonicalization and evidence comparison tests. Run `./tmp/certify-phase48-managed-audit-local.ps1` from the documented workspace for the opt-in PostgreSQL 17.11/TLS 1.3 test. The helper creates a new loopback cluster, enables `PHASE48_MANAGED_AUDIT_LOCAL=true`, preserves atomic receipts under reports and deletes only its own path-validated cluster after stopping it. The ordinary suite deliberately skips this same database test without the opt-in; the mandatory run is certified separately with zero skips.

V6 ENOENT regressions use a local Git clone with `--local --no-hardlinks`, explicit isolated checkout of the fixed historical commit, exact contractual branch, clean NUL status and matching local remote reference. Complete NUL-delimited names and blob IDs are compared before invoking the unchanged launcher. Manifest/hash evidence is retained under `tmp/phase48-v6-cli-fixtures`; only successful test clones are removed. No source-workspace checkout, filename conversion or V6 guard relaxation occurs.

The final certificate and test results are linked from `reports/phase48-managed-dependency-audit-final.md`. All predecessor certificates and interruption evidence remain preserved.

## Limits

The graph query uses PostgreSQL catalog identity helpers for stable structural names. Function definitions are hashed separately. A local certification must verify how definitions, ownership, extension membership, and all reachable object classes are represented before declaring equivalence with a production graph. The tool is an audit instrument only; it does not invoke event trigger functions or mutate database objects.
