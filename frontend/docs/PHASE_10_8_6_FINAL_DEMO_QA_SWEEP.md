# MathPath Phase 10.8.6 — Final Demo QA Sweep

This phase adds a safe, repeatable final demo QA runner.

## Focused QA sweep

Run from the `frontend` folder:

```powershell
npm run verify:demo-qa-sweep
```

This checks:
- frontend typecheck
- Admin Students / onboarding smoke verification
- demo reset preview only
- demo backup only

No reset is executed.

## Full QA sweep

Run from the `frontend` folder:

```powershell
npm run verify:demo-qa-sweep:full
```

This adds:
- assessment workflow regression
- DPS / practice workflow regression
- governance workflow regression
- production readiness regression

## Output

Reports are written to:

```text
frontend/verification-report/phase-10-8-6-final-demo-qa-sweep/
```

Files:
- `qa-summary.json`
- `qa-summary.md`

## Safety

The runner only uses the demo safety tool in preview and backup modes.
It does not call reset and it does not delete records.
