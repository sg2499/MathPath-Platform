# MathPath Engineering Operating System

Last updated: 2026-06-19

## Objective

Build world-class engineering safeguards around the currently stable MathPath platform without changing its runtime behaviour, curriculum behaviour, database, authentication, permissions, Vercel configuration, or Render configuration.

## Package 1 boundary

Package 1 is infrastructure-only.

Changed surfaces:

- GitHub Actions CI
- repository governance templates
- report-only configuration drift detection
- report-only repository exposure detection
- repository ruleset configurator
- redacted diagnostic collection
- engineering documentation

Explicitly unchanged surfaces:

- `frontend/`
- `backend/`
- database schema and production data
- curriculum generators and renderers
- `render.yaml`
- Vercel and Render dashboard settings
- login, roles, permissions, practice, assessments, competition, and reports


## Engineering Package 2 boundary

Engineering Package 2 introduces conservative smart CI test selection without changing any application runtime surface.

Changed surfaces:

- changed-file classification and test-plan generation
- GitHub Actions orchestration for heavy backend, generator, typecheck, and build steps
- classifier regression tests
- engineering documentation

Explicitly unchanged surfaces:

- `frontend/` product code
- `backend/` product code
- database schema and production data
- curriculum generators and renderers
- authentication and permissions
- `render.yaml`
- Vercel and Render dashboard settings
- protected check names and the `MathPath Main Protection` ruleset

## Conservative smart test-selection policy

Every protected check context continues to run and complete. When a heavy suite is not required, that job records an explicit successful no-op result instead of disappearing or becoming skipped.

Selection rules:

- documentation-only changes run no heavy runtime suite;
- ordinary frontend-only changes run frontend typecheck and production build;
- ordinary backend-only changes run the backend test suite;
- generator or curriculum-engine changes run backend tests and focused generator validation;
- CI, governance, delivery-console, dependency, deployment, shared-component, data-model, authentication, permission, migration, mixed-surface, high-risk, and unknown changes run the complete suite;
- manual workflow dispatch always runs the complete suite;
- if classification or governance planning is unavailable, every heavy suite runs as a fail-safe.

The always-on checks remain governance audit, repository safety, delivery-console lint, and the final CI summary.

## Delivery lifecycle

```text
Business objective
→ confirmed root cause and exact scope
→ structured change package
→ isolated worktree
→ exact file and checksum validation
→ local validation profile
→ backup branch
→ feature branch and pull request
→ independent GitHub CI
→ explicit merge approval where required
→ post-merge CI
→ deployment verification where required
→ recorded rollback point
```

## Main-branch governance

The `MathPath Main Protection` ruleset is applied separately after Package 1 merges. It requires pull requests and the complete MathPath CI check set, requires the branch to be current, blocks force pushes and deletion, permits squash merges only, and retains a pull-request-only owner recovery path.

The ruleset configurator:

- performs an audit before applying;
- refuses to change repository visibility;
- refuses to assume enforcement on a private GitHub Free repository;
- saves the previous ruleset locally;
- creates or updates one named ruleset idempotently;
- verifies active rules after applying.

## Governance audit behaviour

Engineering Package 2 activates conservative smart test selection. Classification produces an auditable JSON/Markdown test plan and GitHub job outputs. It never removes a protected check context, and uncertainty always expands to the full suite.

Configuration drift is report-only. In particular, differences between committed `render.yaml`, established operating conventions, and live Render dashboard overrides must be investigated before any correction is proposed.

Repository exposure findings are redacted and report-only. No matching secret value or source line is printed into CI logs or artifacts.

## Evidence retention

GitHub CI uploads short-retention artifacts containing:

- changed-file classification;
- configuration drift report;
- redacted repository exposure report;
- repository safety evidence;
- PowerShell parser results;
- backend test output;
- generator test output;
- frontend typecheck output;
- frontend build output.

## Manual approval remains mandatory for

- runtime merges;
- database migrations or data repairs;
- authentication and permission changes;
- workbook-rule changes;
- destructive deletion behaviour;
- production rollback affecting data;
- repository visibility changes;
- major dependency upgrades.
