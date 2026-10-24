# Initial engineering audit

Audit window: 2026-10-24/25, Asia/Kolkata. Application code/configuration was not changed. Earlier SQLite-repair edits were preserved. No real messages, calls or billable model inference was initiated.

Read in this order:

1. [Architecture and scope](ARCHITECTURE_AUDIT.md)
2. [34 verified defects/control gaps](ERROR_REPORT.md)
3. [Feature verification matrix](FEATURE_STATUS.md)
4. [Measured baselines and performance plan](PERFORMANCE_REPORT.md)
5. [Prioritized implementation batches and data acquisition instructions](IMPLEMENTATION_PLAN.md)
6. [Honest demo rehearsal checklist](DEMO_READINESS_CHECKLIST.md)

## Evidence

- `evidence/tests.json`: each existing backend/agent script result and elapsed time; corresponding logs are alongside it.
- `evidence/backend-probes.json`: isolated synthetic reproductions and 30-request in-process API measurements. Reproduce with `backend/.venv/Scripts/python.exe docs/audit/reproduce_backend.py` from repository root. This audit-only harness uses a temporary database and mocks provider actions.
- `evidence/npm-audit.json`: completed registry scan, including affected dependency paths and advisories. Exit status 1 means vulnerabilities found, not a failed final scan.
- `evidence/migration-drift.json`: fresh Alembic-only schema comparison, without startup repair.
- `evidence/browser-stores.json`: one local production browser observation and explicit measurement limits.
- `evidence/inventory.json`, `tracked-file-review-index.json`, `syntax-and-source-integrity.json`: source inventory, coverage index and final application-change check.

## Decision

Not ready for a public real-user demonstration yet. Preserve the working stack; fix the P0 identity, review/dispatch boundaries, fabricated outcomes and dependency exposure first. All 11 backend scripts pass, but isolated negative probes reveal missing coverage. The agent spawn test fails twice. Live voice/OCR/message/call behavior remains unverified; configured keys are not a successful integration test.

Implementation waits for approval of the batches. Recommended initial scope: 1A/1B plus P0 review/dispatch safety changes from batches 2/4, with all external actions still mocked. Official data exports and provider permissions can be collected independently using the exact instructions in the plan.
