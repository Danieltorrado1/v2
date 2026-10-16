# Hermetic V6 ENOENT regression

Before editing the test, its single failing name was reproduced in `tmp/final-enoent-before.log`.

The test intends to show that a fully parsed `PreflightOnly` invocation reaches offline evidence verification and reports native `ENOENT` for the first missing backup item, `full.dump`. `verifyV6Evidence` calls `v6ReadFile`, whose first `lstatSync` on that exact file must fail. No executable is intended to be missing.

Order in the real launcher: parse arguments → build host → `preflightV6` invokes `host.offline` → `v6Release` checks Git → `verifyV6Evidence` reads `full.dump` → private path/CA/credential validation → health → connections. A fixture must stop at evidence, before credentials, health or any SQL.

The unchanged release gate requires the literal branch `fix/phase48-v6-sha-comparison-unification`, a completely clean `git status --porcelain=v1`, a valid pinned commit, HEAD descending from both `V6_BASE` and `V6_MUTATOR_COMMIT`, and normalized certified source equivalence against the pinned tree. It does not validate a remote. The separate diagnostic launcher has exact HEAD/parent/remote equality checks; its existing injectable state validator is the correct place to verify divergent remote rejection, without inventing a new V6 policy.

The old test read the developer's real active branch and selected one of two expectations with an incomplete four-branch list. It also used fixed workspace paths. It was repository-coupled, not hermetic. On the independent managed audit branch it selected ENOENT even though the real branch gate necessarily rejected earlier.

Correction: run the unchanged current launcher in an isolated child process whose cwd is a temporary Git fixture. Use the fixed certified base HEAD `d740cd902888cbe45bc60c22a2fd3f8ec9625b70`, the exact allowed V6 branch, and its complete archived tracked tree and index. Git objects are read through a fixture-local alternate to the immutable local object store; there is no network and no dependency on the developer's HEAD, branch or dirty files. Create the backup directory and other input sentinels outside the fixture repository, omitting exactly `full.dump`. No global mocks, process.chdir or release-gate changes are needed. Each fixture is removed only after resolving its path under its own temporary parent.

Cases must independently assert: valid context → ENOENT for full.dump; invalid branch → V6_CLEAN_RELEASE_BRANCH_REQUIRED; dirty tree → same release rejection before evidence; HEAD at V6_BASE (not descending from the mutator pin) → native failed merge-base before evidence; the diagnostic state API → reject divergent remote. A regression case verifies that fixtures never query the developer's active branch and that the valid fixture HEAD is always the fixed certified base.

## Final implementation

The archived-tree plan above was superseded after the recorded Windows TAR filename failure. The final helper uses only `git clone --local --no-hardlinks --no-checkout` and an explicit Git checkout inside its own clone under `tmp/phase48-v6-cli-fixtures`. It compares the full source commit's NUL-delimited tree names and mode/blob/path records against `ls-files -z` and `ls-files --stage -z`, verifies empty porcelain-v2 NUL status and exact HEAD/branch/local remote reference, and verifies the physical UTF-8 XLSX name and working-file blob. The valid base has 1582 identical entries; the XLSX blob is `54d429496874d9462f69d3449ceaf065a56b59d4`. All six individual cases and the full 70-test regression selection pass. Only verified successful clones are removed; manifests and raw NUL evidence remain locally. The source workspace and its origin are unchanged.
