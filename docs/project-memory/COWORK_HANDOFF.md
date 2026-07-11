# Cowork Session Handoff

Last updated: 2026-07-11 (written by Claude Cowork, Sonnet 5 session, round 2 same day)

Purpose: read this first when starting a new Claude Cowork session on this repo. It captures everything established in the 2026-07-10 session(s) so no context is lost when switching models/sessions.

## 2026-07-11 update (round 2): heatmap ghost-bar CSS bug + dynamic pace weighting + info icon — prepared, not yet delivered

Round 1 (below) shipped to main as PR #303 and was confirmed live by the developer via screenshots: tooltip data now correctly showed the two real mock exam completions (accuracy/time matched production records exactly), proving the multi-source data-pooling fix works. But the live screenshots also surfaced two things nobody had caught yet:

1. **Ghost bars.** The tooltip showed correct data on hover, but no visible colored bar rendered underneath it — a "ghost plot." Root cause: the heatmap row (`frontend/app/student/dashboard/page.tsx`) uses `items-end` on its flex container, which stops each day-column from stretching to the row's fixed height — each column's own height became auto/content-based instead. The bar inside is styled with `height: {percentage}%`, and a CSS percentage height cannot resolve against an auto-height parent, so it silently computed to zero. Pre-existing bug, not introduced by round 1 (round 1 never touched this render block) — this is very likely the exact thing `OPEN_ISSUES.md`'s long-standing "browser-QA the heatmap tooltip stack" item was warning about, just never confirmed until today. Fixed by giving each bar an explicit-height track (`h-20`) to size against, instead of an ambiguous auto-height parent.

2. **Tier didn't match intuition: 97% accuracy scored a lower tier than 92%.** Not a bug — a formula design issue, confirmed by the numbers: the pre-existing `flowState` formula (`accuracy × 0.7 + min(speed × 6, 30)`) uses a flat "5 questions/minute" threshold for the speed bonus. The 97%-accuracy day was a 60-minute mock exam (~1.7 q/min → small bonus); the 92%-accuracy day was a 30-minute mock of similar size (~3.3 q/min → much bigger bonus) — enough to flip the ranking. Discussed the tradeoff with the developer directly: speed is intentionally a major factor in this abacus program (not something to water down), but it needs to be judged relative to what each specific task was designed to take, not one flat number applied to a 5-minute drill and an hour-long exam alike. Resolution: score pace per attempt as `expectedDurationSeconds ÷ actualTimeTakenSeconds` (capped at 1.5×), averaged across a day's attempts, feeding the same ~30-point ceiling the speed bonus always had — the weighting balance is unchanged, only what "fast" is measured against changed.

Changes made this round (all additive):
- `backend/app/api/routes_student.py`: `/student/results` rows now include `expectedDurationSeconds` (from `DPS.default_duration_seconds`).
- `backend/app/services/competition_mock_attempt_service.py`: mock `attemptHistory` entries now include `expectedDurationSeconds` (from `CompetitionMockAttempt.duration_seconds`, already stored per-attempt).
- `backend/app/services/assessment_engine_service.py`: assessment `attemptHistory` entries now include `expectedDurationSeconds` (from `AssessmentAttempt.duration_seconds`).
- `frontend/types/assignment.ts`, `frontend/lib/api/student.ts`: added `expectedDurationSeconds` to the corresponding types.
- `frontend/app/student/dashboard/page.tsx`: bar-track CSS fix; `combinedActivityEvents` now carries `expectedDurationSeconds` through for all three sources; `grindData`'s speed calculation replaced with per-attempt pace-ratio math (falls back to a neutral 1.0 ratio when expected duration is unknown, rather than skewing the score); added an info-icon popover on the heatmap heading explaining what it tracks and what drives the tier, since students had no way to know before.

Verification status: same sandbox-staleness caveat as round 1 — this session's bash mount of the OneDrive-synced repo does not reflect live edits, so `pytest`/`npm run build` could not be run here. Verified by full manual re-read of every changed block after editing. qa-reviewer must run real verification before this ships, same as round 1.

Delivery process note: for round 1, the developer explicitly asked to bypass the AI-orchestrated qa-reviewer → sre-devops squad pipeline for the actual push/merge, citing Claude usage-limit cost concerns (subagent calls alone burned ~100k+ tokens for one delivery). Cowork gave raw `git`/`gh` commands to run directly in the developer's own terminal instead — same CI/branch-protection gates apply either way, just without the AI-agent ceremony wrapped around it. Expect the same request for round 2; the commands template is already established (see the developer's terminal history from round 1).

## 2026-07-11 update (round 1): Grind heatmap multi-source/multi-attempt fix — delivered as PR #303

Root cause (confirmed by reading the actual code, not assumed): `frontend/app/student/dashboard/page.tsx`'s `grindData` calculation only ever read `Results` (practice-sheet attempts from `/student/results`). `MockAssignments` and `Assessments` were already being fetched on the same page but never merged into the heatmap's day-bucketing — so mock exam and assessment-engine completions had zero path into the heatmap for any student. Additionally, both the mock-assignment and assessment-assignment backend payloads only ever exposed the *latest* attempt per assignment, so even after wiring them in, same-day multiple attempts on those two types would have collapsed to one.

Changes made this session (all additive, no existing fields removed/renamed):
- `backend/app/services/competition_mock_attempt_service.py`: new `_completed_attempt_history_payload()` helper; added `attemptHistory` field to `_assignment_with_current_attempt_payload()` (used by `/student/competition/mock-assignments`).
- `backend/app/services/assessment_engine_service.py`: new `_CompletedAssessmentAttemptHistoryPayload()` helper; added `attemptHistory` field to `AssessmentAssignmentPayload()` (used by `/student/assessments`).
- `frontend/types/assignment.ts`: new `AttemptHistoryEntry` type, added `attemptHistory?` to `Assignment`.
- `frontend/lib/api/student.ts`: added `attemptHistory?` to `StudentCompetitionMockAssignment`.
- `frontend/app/student/dashboard/page.tsx`: new `combinedActivityEvents` useMemo pools practice + mock + assessment events per calendar day; `grindData` now filters/aggregates from that pool instead of `Results` alone, so count/time/accuracy/flowState/tier are cumulative across every attempt and every activity type on a given day.

Verification status — read carefully before assuming this is done: this Cowork sandbox's mount of the OneDrive-synced repo is stale (confirmed via file mtimes lagging ~19 hours behind the actual edits), so `pytest`/`npm run build` could not be executed from this session against the real current files — running them here would have tested yesterday's snapshot, not today's changes. Verified instead by full manual re-read of every edited file end-to-end after editing (correct syntax, correct indentation, only already-imported symbols used, no existing field touched). Per this repo's own split-workflow (see `CLAUDE.md`), this is exactly the point where local Claude Code takes over: qa-reviewer must actually run pytest + npm build + independently re-check the diff before sre-devops delivers. Do not treat this change as verified until that happens.

Also confirmed while scoping this: only two consumers read the two touched backend endpoints (`/student/competition/mock-assignments` → dashboard + Mock Exams library page; `/student/assessments` → dashboard only), and neither reads beyond fields that already existed, so the new `attemptHistory` field should not affect them.

Known limitation intentionally left unfixed (logged in `OPEN_ISSUES.md`): mock assignments are filtered to the student's *current* level, so a mid-week level promotion would still hide that week's prior-level mock activity from the heatmap. Flagged, not fixed.

Delivered same day: qa-reviewer PASSED WITH NOTES (pytest 20/20, npm build clean, confirmed additive-only) via local Claude Code. Live-student pre-flight check couldn't reach production DB from that shell; developer explicitly authorized skipping it for this delivery (informed override — diff was read-only/additive and the developer confirmed no other students were realistically active). sre-devops hit a trust-boundary block (wouldn't accept a relayed authorization secondhand, by design) and a related Claude usage-limit concern from the developer led to finishing delivery via raw `git`/`gh` commands run directly in the developer's own terminal instead of the full AI-orchestrated pipeline. Merged as **PR #303**. Confirmed live by the developer's own screenshots: tooltip accuracy/time data matched real production mock exam records exactly.

## 2026-07-10 update: Apex Squad rebuilt as real subagents + delivery gate fixed

Diagnosed why #290–301 happened: `.github/workflows/mathpath-ci.yml` and the `MathPath Main Protection` branch ruleset (see `docs/project-memory/ENGINEERING_OPERATING_SYSTEM.md`) were already solid, but `.agents/apex_deliver.py` created the PR and immediately ran `gh pr merge --squash --admin` — bypassing branch protection and never waiting for CI to even finish. The "Apex Squad" in `.agents/AGENTS.md` was also self-contradictory with `.antigravity/instructions.md` (one said ship immediately with no approval, the other said wait for explicit approval).

Changes made this session:
- **`.claude/agents/*.md`**: 7 real Claude Code subagents (`frontend-architect`, `backend-architect`, `qa-reviewer`, `sre-devops`, `vfx-3d`, `data-telemetry`, `principal-designer`), each with scoped tool access and a concrete checklist instead of hype language. `qa-reviewer` is read-only (no Edit) so it can't rubber-stamp its own fixes. Only `sre-devops` runs git/PR/merge/deploy commands.
- **`.agents/apex_deliver.py`**: rewritten. No longer merges blind — waits for `gh pr checks --watch` before merging, merges without `--admin` by default (respects branch protection), and only bypasses via an explicit `--emergency-bypass` flag that requires typed interactive confirmation. Tags every successful delivery (`prod-YYYYMMDD-HHMMSS`) and pushes the tag.
- **`.agents/rollback.py`** (new): one-command rollback to any `prod-*` tag via a proper revert PR, so a bad deploy gets undone in one step instead of chased with forward-fix hotfixes.
- **Live-student safety check**: previously queried local SQLite (via default `DATABASE_URL`) and always silently reported "passed" — it could never see real production students. Now honestly reports UNVERIFIED and requires human override unless `PROD_DATABASE_URL` (a real prod connection string) is explicitly set.
- **`.agents/AGENTS.md`** and **`.antigravity/instructions.md`**: reconciled. Single operating mode now: low-risk UI/copy changes may go autopilot straight to qa-reviewer → sre-devops; anything touching schema/auth/payments/gamification state requires the Implementation Plan + explicit developer approval before any edit.
- **Memory doc fragmentation**: `CURRENT_STATUS.md`, `docs/project-memory/PROJECT_STATE.md`, `docs/project-memory/DAILY_HANDOFF.md`, and `.antigravity/session_status.md` were all stale and each prescribed a different "read this first" order (none of them even referenced this file). Added supersession banners to all four pointing here, and updated `docs/project-memory/README.md`'s canonical read order to lead with this file.

Not yet done (deliberately left for the developer): none of the above was committed/pushed. `PROD_DATABASE_URL` is not configured anywhere yet — the live-student check will report UNVERIFIED until Shailesh decides whether to wire it up. GitHub branch protection / required-status-checks were not verified from this sandbox (no `gh` CLI available here) — worth confirming the `MathPath Main Protection` ruleset is still active before relying on it as the real gate.

## 2026-07-10 update: squad expanded to 10 personas

Added on request:
- **`model-router`**: recommends Haiku/Sonnet/Opus/Fable per task against a concrete rubric (`.claude/agents/model-router.md`); the session's selected model never changes silently — a non-default recommendation requires developer approval before a specific task is delegated to a subagent running that model. Wired into `.antigravity/instructions.md` §6.
- **`browser-qa`**: closes a real, previously-unowned gap — nothing in the squad could drive a browser. Uses the Claude-in-Chrome tools to verify responsive/theme/tooltip behavior on the live site or a preview, targeting the still-open items in `OPEN_ISSUES.md` (heatmap tooltips, login responsiveness).
- **`scribe`**: owns end-of-session updates to `docs/project-memory/` (the exact upkeep that failed and produced the stale-doc mess fixed earlier this session). Accuracy-over-completeness, corrects in place rather than appending contradictions.

Also sharpened existing personas rather than further proliferating the roster: `qa-reviewer` now has an explicit security-review dimension and extra scrutiny for one-off data-repair scripts (the #292–299 failure category); `backend-architect` has the same data-script guardrail; `sre-devops` now explicitly owns running the pre-existing but previously unowned `load-testing/k6-load-test.js`.

## 2026-07-10 update: Cowork cannot push to GitHub — delivery moved to local Claude Code

Tested directly rather than assumed: this Cowork session has no route to `github.com`/`api.github.com` (proxy returns 403), and the repo's git credential helper is configured to call `C:/Program Files/GitHub CLI/gh.exe` — a Windows binary that only exists on the developer's actual machine, not in the Cowork sandbox. No GitHub connector is available in Cowork's MCP registry either. This means `sre-devops` cannot execute git push/PR/merge from within Cowork, full stop — no amount of process cleanup changes that.

Decision: delivery moves to **Claude Code running locally** on the developer's machine, where `gh.exe` is already authenticated and there's no network sandbox. Cowork sessions do implementation, review, and preparation; a local Claude Code session does verification + delivery (`qa-reviewer` → `sre-devops` → `apex_deliver.py`/`rollback.py`).

Set up to make this seamless:
- **New `CLAUDE.md`** at repo root — read automatically by Claude Code at session start. Points to this file, `git log`, `OPEN_ISSUES.md`, `.antigravity/instructions.md`, `.agents/AGENTS.md`, and explains the Cowork/local-delivery split. The `.claude/agents/` squad is picked up automatically by Claude Code — no extra setup needed there.
- `sre-devops.md` and `.antigravity/instructions.md` §5 both now state explicitly: don't attempt push/PR/merge from Cowork; hand off to local Claude Code instead.

Not yet done: nothing has actually been delivered via this new local path yet — it's configured but unexercised. First real Claude Code session on this repo should be treated as a dry run of the full pipeline, same as the Cowork squad itself was never exercised end-to-end this session.

## 2026-07-10 update: first real dry run caught two genuine Windows bugs

Ran the actual pipeline (qa-reviewer → sre-devops) on this session's own uncommitted rework via local Claude Code, exactly as planned. qa-reviewer correctly returned FAIL and blocked delivery — both bugs were real, both were artifacts of writing/testing these scripts in the Cowork Linux sandbox without accounting for Windows execution:

1. `.agents/rollback.py:74` — `git rm -rf --ignore-unmatch . > /dev/null` under `shell=True` on Windows runs through cmd.exe, not bash; `/dev/null` isn't a Windows path and was creating a stray `C:\dev\null` file instead of discarding output. Fixed: redirection removed entirely (unnecessary — `capture_output=True` already suppresses it).
2. `.agents/apex_deliver.py` (`check_live_students`, 4 call sites) and `.agents/rollback.py` (1 call site) — `print()` statements used emoji (⚠️, ❌) and an em-dash, which crash with `UnicodeEncodeError` on Windows' default cp1252 console encoding. Fixed: replaced with plain ASCII (`WARNING:`, `FAILED:`, `-`) in both files. Verified via a full non-ASCII scan of every `print()` line in both scripts — clean.

Both fixes applied directly from Cowork (same mounted repo), verified with `python -m py_compile`, not yet re-reviewed by qa-reviewer or delivered.

Non-blocking notes qa-reviewer also raised (acknowledged, not fixed yet — follow-up, not a gate): unescaped f-string interpolation of commit messages/tags into `shell=True` commands is a latent shell-injection risk (low real-world severity since this is a locally-invoked developer tool, not exposed to untrusted input); and inferring merge success purely from `gh pr merge --auto`'s return code has a theoretical race-condition edge case worth hardening later.

## 2026-07-10 update: live-status bridge between Cowork and local Claude Code

There's no session-bridging API between Cowork and Claude Code — confirmed when the developer asked whether Cowork could directly monitor a local Claude Code terminal. Closest real option (computer-use screenshots of VS Code) is view-only for IDEs/terminals and not continuous, so not a real substitute. Instead, added a lightweight shared-file bridge:

- **New `docs/project-memory/CLAUDE_CODE_STATUS.md`**: a snapshot (overwritten, not appended) that the *orchestrator* of a local Claude Code session updates at each milestone — task started, subagent verdict, blocked, completed. Deliberately not `scribe`'s job (scribe does full end-of-session consolidation; this is a live ticker).
- `CLAUDE.md` now instructs Claude Code to keep it current.
- `docs/project-memory/README.md`'s canonical read order now includes it as read #2, right after this file.

Not yet exercised — created empty/idle. First real use will be the next task given to the local Claude Code session.

## Who / What

- Shailesh is running MathPath as a freelance client project. Prefers concise, direct communication.
- MathPath: role-based abacus/mental-math platform. Admin, Teacher, Student portals.
- Stack: Next.js + TS + Tailwind + React Query + Sentry + react-three-fiber (frontend, Vercel), FastAPI + SQLAlchemy 2 + Alembic + Postgres (backend, Render).
- Live: https://math-path-platform.vercel.app/ (verified up 2026-07-10), https://mathpath-backend.onrender.com (/health returned ok, v1.0.0, production, 2026-07-10).
- GitHub: https://github.com/sg2499/MathPath-Platform

## Repo state as of 2026-07-10

- HEAD: `42fefd4` (2026-07-10, PR #301). NOTE: `PROJECT_STATE.md` / `DAILY_HANDOFF.md` are STALE — last updated 2026-07-07 at `dd9938e`, 93 commits behind.
- PRs #290–#301 (July 8–10): a 12-commit hotfix chain around a gamification retro-reset / master reset script (falsely awarded "unstoppable streak" badges, chronological streak recalculation, retro badge awarding). Multiple commits fixed crashes the previous commit introduced (ModuleNotFoundError server startup crash, import errors, SQL syntax, `submitted_at` AttributeError). All merged straight to production.
- Local worktree shows ~200 modified files vs git — likely OneDrive/line-ending noise, not real edits. Verify before assuming.
- There is a NESTED duplicate repo at `MathPath-Platform/` inside the root folder. Housekeeping candidate.

## Previous workflow (Antigravity) — assessment done 2026-07-10

- Workflow: agent edits code → `python .agents/apex_deliver.py "<msg>"` → branch, commit, `git push -f`, PR, `gh pr merge --squash --admin` (bypasses branch protections) → Vercel/Render auto-deploy → `python .antigravity/scripts/monitor_deploy.py` polls health.
- Key files: `.agents/AGENTS.md` (Apex Squad personas), `.antigravity/instructions.md` (engineering protocol — good discipline on paper), `.antigravity/session_status.md` (STALE: last updated 2026-06-12).
- Known weaknesses identified: `check_live_students()` in apex_deliver.py queries LOCAL SQLite, not production Postgres (safety check is ineffective); merges bypass branch protection; code was repeatedly shipped without being run first (see #290–#301); memory files not maintained.

## Agreed working principles for Cowork sessions

1. VERIFY BEFORE PUSH: run typecheck / pytest / build locally (or in sandbox) before any commit reaches main. The #290–#301 chain was preventable.
2. Keep this file + project-memory docs updated at end of every session.
3. Model strategy: Sonnet as default driver for routine fixes/UI work; Fable/Opus only for hard debugging, migrations, architecture. Haiku never for code changes.
4. First-session TODO: verify git push / gh auth works from the Cowork environment before claiming the full auto-deploy loop.

## Top open work (from OPEN_ISSUES.md 2026-07-07 + session findings)

1. Browser-QA on live site (Claude Cowork has Chrome tools — Antigravity could not do this; Playwright was blocked locally with spawn EPERM):
   - Student dashboard grind-heatmap tooltips (`ec9d041`..`dd9938e`): Sun–Sat week alignment, empty future days, readability, both themes.
   - Login responsiveness after `4ecd510`: 320px width, landscape, tablet, zoom.
2. Verify the July 8–10 gamification reset actually produced correct badge/streak state in production.
3. Fix `check_live_students()` to check production (API/health or prod DB) instead of local SQLite.
4. Confirm backend security-column migration `7f92d7d` executed in production.
5. Build warnings: move Sentry init to `instrumentation.ts`, set `metadataBase`.
6. `npm run typecheck` fails on clean checkout before `.next/types` exists (build-first requirement) — fix or document.
7. `flowState` tooltip metric estimates 5 questions/sheet when `totalQuestions` absent — decide if payload-backed count is needed.
8. Refresh stale memory docs (PROJECT_STATE.md, DAILY_HANDOFF.md, session_status.md) to reflect #290–#301.

## Read order for a fresh session

1. This file
2. `CURRENT_STATUS.md`
3. `git log --oneline -30` (trust git over the memory docs until they're refreshed)
4. `docs/project-memory/OPEN_ISSUES.md`
5. `.antigravity/instructions.md` (engineering guardrails — still worth honoring: surgical edits, workbook compliance, plan-before-code)
