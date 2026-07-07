# Daily Handoff

Last updated: 2026-07-07

## Resume First

Read:

1. `CURRENT_STATUS.md`
2. `.mathpath/STATE.yaml`
3. `.mathpath/rules/global.md`
4. `docs/project-memory/PROJECT_STATE.md`
5. `docs/project-memory/DEPLOYMENT_LOG.md`
6. `docs/project-memory/OPEN_ISSUES.md`
7. Latest daily log under `docs/project-memory/DAILY_LOGS/`

## Latest Completed Work

Current branch alignment:

- `main` and `origin/main` both point to `dd9938e` (`Fixed tooltip text color inheritance and increased tooltip dimensions`) dated 2026-07-07.
- The repo advanced by three frontend dashboard commits after the prior handoff.

Recent shipped work now reflected in repo history:

- 2026-06-30 to 2026-07-01: the mock leaderboard/library premium UI sequence remains shipped through `f179099`.
- 2026-07-04 student dashboard and login hardening sequence still stands through `4ecd510`.
- 2026-07-07 student dashboard grind-heatmap tooltip sequence:
  - `ec9d041` added derived daily `flowState` scoring, tier labels, richer tooltip content, and a provisional speed calculation that falls back to `5` questions per sheet when `totalQuestions` is absent.
  - `7e4212b` changed the heatmap from a rolling last-7-days window to the current Sunday-to-Saturday week and enlarged the tooltip layout.
  - `dd9938e` fixed tooltip text color inheritance and further increased tooltip dimensions for readability.

This audit refreshes project-memory to match the current repository and verification state.

## Current Repository State

`main` is synchronized with `origin/main` at `dd9938e`. The worktree was clean before this handoff refresh, and this audit found no unrelated local product-code changes to reconcile.

## Verification Snapshot

Recorded evidence currently available in repo memory:

- 2026-07-07 local frontend typecheck passed from `frontend/`: `npm.cmd run typecheck`.
- 2026-07-07 local frontend production build passed from `frontend/`: `npm.cmd run build`.
- 2026-07-05 local responsive login verification was attempted against a local `next start`, but all 60 Playwright cases failed before page execution because Chromium/Firefox/WebKit launches were blocked in this environment with `spawn EPERM`.
- Build warnings observed during the successful 2026-07-07 build:
  - Sentry Next.js setup still warns that `sentry.server.config.ts` and `sentry.edge.config.ts` should move into `instrumentation.ts`.
  - Next.js warns that `metadataBase` is not set for social image resolution.
- No browser-QA, live-preview verification, or CI evidence is recorded yet for the 2026-07-07 tooltip/heatmap stack.
- Earlier MM/backend verification evidence from 2026-06-18 remains the latest detailed curriculum/generator baseline.

## Next Recommended Work

1. Browser-QA the 2026-07-07 student dashboard tooltip stack on live or preview in both themes, specifically checking current-week Sunday-to-Saturday alignment, empty future-day states, tooltip readability, and hover/focus behavior on the grind heatmap.
2. Decide whether the new `flowState` metric should keep estimating `5` questions per sheet when `totalQuestions` is missing, or switch to a payload-backed count before relying on tier/rank messaging.
3. Re-run `npm.cmd run verify:student-login-responsive` in GitHub Actions or another environment that can launch Playwright browsers, then archive the artifact output as deployment evidence for the broader July 4 to July 7 frontend stack.
4. Decide whether to make `npm.cmd run typecheck` standalone on a clean checkout, or formally document the current build-first expectation when `.next/types` is missing.
5. Decide whether to clean the current Sentry/`metadataBase` build warnings now, and keep the 2026-06-29 backend auth migration (`7f92d7d`) on the watch list until deployed-environment confirmation is recorded.
