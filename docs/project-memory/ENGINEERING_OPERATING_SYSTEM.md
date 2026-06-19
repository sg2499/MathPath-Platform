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

Package 1 does not skip tests. Change classification is informational until Package 2 introduces conservative smart test selection.

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
