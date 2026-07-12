# Cowork Session Handoff

Last updated: 2026-07-13 (repo-hygiene cleanup prepared, awaiting push; unified economy system delivered as PR #312, backfilled and verified; docs-sync fix delivered as PR #313)

Purpose: read this first when starting a new Claude Cowork session on this repo. It captures everything established in the most recent session(s) so no context is lost when switching models/sessions/days.

## 2026-07-13 update: repo-wide cleanup audit — prepared, not yet delivered

Shailesh asked for a full sweep of the entire repo (not just the student portal) for dead/unused files and anything bloating or slowing the platform down. Found: a 946MB duplicate nested clone (`MathPath-Platform/`, tracked as a broken gitlink with no `.gitmodules`, including its own 459MB `node_modules`), 4 unreferenced root files (`original_page.tsx`, `teacher-rules.css`, `trigger_gamification_sync.py`, `trigger_production_sync.py`), 5 pre-git versioning artifacts from an old folder-duplication workflow (3 "STABLE" READMEs, `VERSION.txt`, `STABLE_PACKAGE_DO_NOT_EDIT_DIRECTLY.txt`), and an empty untracked `mathpath.db`. Everything was confirmed unreferenced by any code, docs, or CI config before being flagged — nothing removed blind. Full detail in `OPEN_ISSUES.md`'s matching entry. Also flagged, not a code fix: `frontend/node_modules` (818MB) and `frontend/.next` (2.4GB), while properly gitignored, sit inside the OneDrive-synced folder alongside the nested clone's own `node_modules` — several GB of build cache/packages OneDrive is likely continuously trying to index, a plausible contributor to this session's repeated stale-sync issues. Deletion commands handed to the developer; not yet pushed.

## 2026-07-13 update: line-by-line student-portal audit + unified economy system — delivered as PR #312, backfilled, verified

**tl;dr: all fixes below are live in production (PR #312, squash commit `6145dca`, all 11 CI checks passed), and all three new backfill/correction scripts have been run to completion.** `backfill_practice_dps_economy.py --apply` — 8 historical practice/DPS attempts (Sakshi Agarwal x4, Shailesh Gupta x1, Meera Chatterjee x3, the same set from the PR #311 notification backfill), 210 XP / 7 coins awarded total. Hand-verified against the formula: each attempt was a 300s (5-min) DPS at weight 1.0, so base XP = `GAMIFICATION_MINUTE_RATE × 5 × 1.0 ≈ 27.78`, and every attempt's award matched its accuracy band exactly (e.g. 90% accuracy → 2.0x → round(55.56) = 56 XP / 3 coins; 40% accuracy → 0.5x → 14 XP / 0 coins). `backfill_assessment_economy.py --apply` and `fix_assessment_auto_submitted_timestamps.py --apply` both found 0 attempts affected — no assessment completions exist historically yet, consistent with PR #311's finding.

**Also this round — a docs-sync bug was found and fixed (PR #313).** After PR #312 merged, `CLAUDE_CODE_STATUS.md` and `OPEN_ISSUES.md` were discovered to still carry stale "prepared, not yet delivered" content on `main` itself (not just a locally-stale read) — confirmed via `git reset --hard origin/main` pulling in the old snapshot. Root cause: a gap between when Cowork's Edit-tool writes land on the OneDrive-synced disk and when the developer's terminal's `git add` captures those bytes for a commit — the actual committed PR #312 content for these two files was an intermediate, pre-delivery snapshot, not the final one. Corrected via a small docs-only PR #313 (squash commit `9871632`). **Lesson for future sessions:** don't trust a memory doc's self-reported status at face value if there's any doubt — cross-check against `git log`/PR history, since the doc can lag what's actually committed.

Shailesh asked for an exhaustive, literal line-by-line audit of the entire student portal (beyond the pattern-level audit earlier the same day) -- every frontend page, every backend route, every calculation, notification, achievement, and leaderboard, "nothing left out." Collector's Vault stayed explicitly deferred. Findings were reported in full before any code changed. Summary of what was found, and what's now built in response:

**Finding 1 (critical) — the economy system didn't do what the product told students it did.** `EconomyService.award_xp_and_coins()` was only ever called from mock exam completion. Practice/DPS and assessment completions awarded zero XP/coins, despite the dashboard's "Daily Objective" card explicitly promising "Complete your assigned DPS Sheets to build speed, accuracy, and earn MathCoins." Achievements were unaffected -- all 27 badges are consistently and intentionally mock-exam-scoped by design (every badge description says "Mock Exam").

**Finding 2 (high) — assessments had the same AUTO_SUBMITTED timing bug round 10 fixed for mocks, just never patched here.** `_SubmitAssessmentAttemptCore()` always stamped `submitted_at = now()` and derived `time_taken_seconds` from raw elapsed wall-clock time, auto or manual, so a late-detected lazy auto-submit could report a longer time-taken than the assessment's own `duration_seconds` allowed and mis-date the completion.

**Finding 3 (low, latent)** — `attempt_service.py`'s `submit_attempt()` hardcoded 1 mark per question, ignoring `DPS.marks_per_question`. Not live-exploitable (every DPS is seeded at 1, no admin path changes it) but a future trap.

**Findings 4-6 (dead code, cleanup)** — `recalculate_streaks.py` referenced a column (`CompetitionMockResultSummary.submitted_at`) that doesn't exist on the model and would crash if ever run; `NotifyPracticeReattemptUnlocked()` was fully built and never called anywhere; `GET /student/notifications` was a ~70-line synthesized endpoint nothing in the frontend calls (the real panel uses `GET /api/notifications`).

Shailesh's decision on the economy gap: all three activities (DPS, assessments, mocks) need to earn XP and coins, under one system that's fair and dynamic across every module/level combination (durations vary per DPS/assessment/mock, admin-configured), robust against ever paying a "buggy" amount, and applied both retroactively and going forward.

**The design landed on, and what's now built:**

One shared formula -- `EconomyService.evaluate_activity_performance()` -- used by DPS, assessment, and mock completion alike: `XP = round(GAMIFICATION_MINUTE_RATE x (allotted duration_seconds / 60) x accuracy_multiplier x ACTIVITY_WEIGHTS[type])`, coins = 5% of XP (unchanged ratio from the original mock formula), zero coins below 50% accuracy. The accuracy multiplier is the exact curve already live for mocks (0.5x/1.0x/1.5x/2.0x/2.5x), extracted into a shared `_accuracy_multiplier()` helper so "how much better performance pays" is decided in exactly one place for all three activity types. `ACTIVITY_WEIGHTS = {"DPS": 1.0, "ASSESSMENT": 1.3, "MOCK": 1.5}`, calibrated so a standard 60-minute mock at the 1.0x band lands close to the pre-existing 500 XP baseline -- no existing student's mock-earned trajectory changes.

Deliberately keyed on the activity's **allotted** `duration_seconds` (fixed, admin-configured, correct from the moment an attempt starts), not `time_taken_seconds` (derived after submission, and exactly the field with the timing bug found in this audit). Two reasons this matters: paying off a field that can itself be wrong would let that bug corrupt payouts too, and this program explicitly rewards speed -- paying by time *taken* would mean a fast, accurate student earns less than a slow one for identical accuracy, which is backwards. Clamped to 1-180 minutes so a misconfigured (zero, negative, or absurd) duration can never produce a broken payout. Because every module/level configures its own duration per activity, this never needs manual re-tuning as new content is added.

Loot-pack drops (Alpha Pack / Elite Chest) stay mock-exclusive for now -- Collector's Vault, where a dropped pack would actually be seen, isn't built out for DPS/assessment content yet.

**New idempotency guard, mirroring the exact pattern already proven three times this week:** a `gamification_processed_at` column on `Attempt` and `AssessmentAttempt` (mirroring `CompetitionMockAttempt`'s existing one), claimed atomically (`UPDATE ... WHERE IS NULL`), so the economy award runs exactly once per attempt regardless of which completion path fires it -- deliberately a *separate* column from `notification_processed_at` (added last round) so the two guards can never block or race each other. Two new Alembic migrations (`c2f7a9d3e451` for `attempts`, `d4a1b8e6f723` for `assessment_attempts`, chained off last round's head `a1e6838c5ea3`) plus matching `schema_migration.py` self-heal functions, wired into `main.py`'s startup.

**Files changed this round:**
- `backend/app/services/economy_service.py` -- `_accuracy_multiplier()` extracted; new `evaluate_activity_performance()`; old `evaluate_assignment_performance()` kept (not deleted) since `backfill_mock_gamification.py`, already run to completion, still references it.
- `backend/app/services/attempt_service.py` -- `marks_per_question` fix in `submit_attempt()`; new `_process_attempt_gamification_side_effects()`, called alongside the existing notification side-effects call.
- `backend/app/services/assessment_engine_service.py` -- AUTO_SUBMITTED timestamp fix in `_SubmitAssessmentAttemptCore()` (mirrors round 10 exactly); new `_ProcessAssessmentGamificationSideEffects()`.
- `backend/app/services/competition_mock_attempt_service.py` -- economy hook switched from the old flat `evaluate_assignment_performance(base_xp=500)` to the shared `evaluate_activity_performance(activity_type="MOCK")`.
- `backend/app/models/models.py` -- `gamification_processed_at` on `Attempt` and `AssessmentAttempt`.
- `backend/alembic/versions/c2f7a9d3e451_*.py`, `d4a1b8e6f723_*.py` -- new migrations.
- `backend/app/services/schema_migration.py`, `backend/app/main.py` -- two new self-heal functions + startup wiring.
- `backend/app/services/recalculate_streaks.py` -- fixed the nonexistent-column reference (kept as a manual reconciliation tool, not deleted).
- `backend/app/services/practice_notification_service.py` -- deleted `NotifyPracticeReattemptUnlocked()` (dead, unused, would have duplicated `NotifyPracticeFreshPracticeAssigned()` if ever wired in).
- `backend/app/api/routes_student.py` -- deleted the dead synthesized `GET /notifications` route.
- `backend/scripts/backfill_practice_dps_economy.py`, `backend/scripts/backfill_assessment_economy.py` -- new, one-time historical XP/coin backfill (not yet run), calling the real production gamification functions.
- `backend/scripts/fix_assessment_auto_submitted_timestamps.py` -- new, one-time retroactive correction (not yet run). Note: assessments have no stored auto-vs-manual flag the way mocks do (`ResultStatus()` only ever sets CLEARED/NEEDS_RE_ATTEMPT, never a literal AUTO_SUBMITTED status), so this script detects affected rows via the mathematically reliable signal instead: `time_taken_seconds > duration_seconds`, which is physically impossible except as a symptom of this exact bug.

**Verification status:** same confirmed sandbox bash-mount staleness as every round this week -- `py_compile` on the 5 brand-new files (2 migrations + 3 scripts) passed clean, but the same command against pre-existing edited files threw a phantom `SyntaxError` at `models.py:1028`, a line nowhere near any edit made this round; manually re-read via the Read tool and confirmed correct (`created_at = Column(DateTime(timezone=True), server_default=func.now())`, properly closed). Every edited file was manually re-read end-to-end after editing. Real verification then ran in the developer's own terminal before push: `pytest tests/ -q` — 20 passed; `npm run typecheck && npm run build` — clean, 41/41 routes. Shipped as PR #312, confirmed deployed on both Vercel and Render, all three backfill scripts run to completion (see tl;dr above).

## 2026-07-13 update (earlier the same day): full student-portal audit, five fixes — delivered as PR #311, backfilled, verified

**tl;dr: all five fixes below are live in production (PR #311, commit `434f357`, all 11 CI checks passed, merged cleanly), both backfill scripts have been run to completion, and there's nothing pending from this thread.** `pytest tests/ -q`: 20 passed. `npm run typecheck && npm run build`: clean. Delivered from the developer's own terminal in two grouped pushes (verify+commit+push+PR, then watch CI+merge) per Shailesh's request to minimize back-and-forth.

Backfill results: `backfill_practice_attempt_notifications.py --apply` found and notified 8 historical attempts missing their notification — Sakshi Agarwal (4), Shailesh Gupta (1), Meera Chatterjee (3) — creating 30 notifications total (student/teacher/admin per attempt). `backfill_assessment_attempt_notifications.py --apply` found 0 attempts affected — no historical gap existed for assessments (consistent with #2 below being a safety net for a failure mode, not a bug that had already fired historically).

## 2026-07-13 original findings: full student-portal audit, five fixes — prepared, not yet delivered (superseded by the delivery summary above)

After round 10 shipped, Shailesh asked for a from-scratch audit of the entire student side of the platform ("every single detail... nothing should be left out") given students were actively attempting exams that day, specifically to catch any other instance of the bug class round 9/10 had just surfaced. Full findings were reported first (auth, notification commit patterns, mock/practice/assessment attempt lifecycles, frontend guards) with no code changes, then Shailesh approved fixing everything found except Collector's Vault (explicitly deferred — still needs real backend work, tackled separately once the rest of the portal is confirmed solid).

**1. Practice/DPS lazy-auto-submit notification gap (critical, same bug class as pre-round-9 mocks).** `attempt_service.py`'s `ensure_active_or_auto_submit()` — the lazy fallback triggered by a plain GET once a practice/DPS attempt's timer has expired server-side — called `submit_attempt()` directly, which graded the attempt correctly but never notified anyone: `NotifyPracticeAttemptSubmitted()` (and the retry-assignment notification) only ever lived in the two explicit route handlers (`/attempts/{id}/submit`, `/attempts/{id}/auto-submit`), never inside `submit_attempt()` itself. Fixed by moving both notifications into a new `_process_attempt_notification_side_effects()` called from inside `submit_attempt()`, gated by a new `notification_processed_at` column (migration `bfa28b9fc380`) claimed atomically, so every completion path gets identical treatment exactly once. Route handlers simplified to just call `submit_attempt()` and return — no more duplicate notification logic.

**2. Assessments had no server-side safety net at all (high).** Unlike mocks and practice sheets, `GetAssessmentAttemptForStudent()` had no lazy-completion fallback whatsoever — an assessment whose client-side timer-driven auto-submit call never reached the server (tab closed at time-up, crash, dropped network) would stay `IN_PROGRESS` forever, no scheduled sweep anywhere to catch it. (One partial, narrower version of this check already existed inline in `SaveAssessmentAnswer` — removed as redundant once the centralized fix covers every path uniformly.) Fixed: split `SubmitAssessmentAttempt` into a thin ownership-verifying wrapper and a new `_SubmitAssessmentAttemptCore()` that operates directly on an attempt object (avoiding recursion through `GetAssessmentAttemptForStudent`); added `EnsureAssessmentAttemptActiveOrAutoSubmit()`, the same shape as the mock/practice fallbacks, wired into `GetAssessmentAttemptForStudent()`. Notification moved into `_SubmitAssessmentAttemptCore()` via `_ProcessAssessmentCompletionNotification()`, gated by a new `notification_processed_at` column on `assessment_attempts` (migration `a1e6838c5ea3`).

**3. `get_current_student()` had no defensive `is_active` check (medium, hardening not an active exploit).** `get_current_teacher()` already independently checks `teacher.is_active`; the student equivalent didn't, relying solely on `user.is_active`. Every current admin endpoint that deactivates a student does keep `student.is_active` and `user.is_active` in sync, so this wasn't live-exploitable, but added the same defensive second check to `get_current_student()` (`dependencies.py`) so a future desync (bulk import, data-repair script, new admin feature) can never silently leave a "deactivated" student with working login.

**4. Sliding JWT session refresh (Shailesh's explicit ask, "fix it once and for all," not a band-aid bump of the expiry number).** `get_current_user()` now checks remaining token lifetime on every authenticated request; once a token is more than halfway through its life, a fresh one is transparently issued via an `X-New-Access-Token` response header (added to CORS `expose_headers`, since custom headers are invisible to frontend JS cross-origin otherwise). Frontend's axios response interceptor (`lib/api.ts`) reads that header and swaps the stored token via a new `updateStoredToken()` helper (`lib/auth.ts`) — silent to the student. Net effect: a genuinely active session (answering questions, timer polls) renews itself continuously and can never hit a hard expiry wall mid-exam; a truly idle session still expires on schedule.

**5. Two new backfill scripts** (`backend/scripts/backfill_practice_attempt_notifications.py`, `backend/scripts/backfill_assessment_attempt_notifications.py`) close the historical gap for #1 and #2 — both find every completed attempt with `notification_processed_at IS NULL` (which, conveniently, is every pre-fix attempt, since the column and the gating didn't exist yet) and call the REAL production notification function directly (not a reimplementation, to avoid the class of bug found in the round-9 backfill script's own dedup logic), backdating created notifications to the attempt's real `submitted_at`. Not yet run — needs the code deployed first, same order as every prior backfill.

**Verification status:** same sandbox-staleness pattern as every round this week — confirmed again this session (dependencies.py and schema_migration.py both showed phantom truncation/syntax errors in the bash mount that don't reproduce against the real file via the file-edit tools). Not run via pytest/build in this sandbox; verified via full manual re-read of every edited file. **qa-reviewer must run real pytest + typecheck + build before this ships.**

**Files changed this session:**
- `backend/app/dependencies.py` — student `is_active` check, sliding JWT refresh.
- `backend/app/main.py` — CORS `expose_headers`, two new startup self-heal calls.
- `backend/app/models/models.py` — `notification_processed_at` on `Attempt` and `AssessmentAttempt`.
- `backend/app/services/schema_migration.py` — two new self-heal functions.
- `backend/app/services/attempt_service.py` — notification moved into `submit_attempt()`.
- `backend/app/services/assessment_engine_service.py` — lazy-completion fallback + notification moved into core grading.
- `backend/app/api/routes_student.py` — route handlers simplified, unused imports removed.
- `backend/alembic/versions/bfa28b9fc380_*.py`, `a1e6838c5ea3_*.py` — new migrations.
- `backend/scripts/backfill_practice_attempt_notifications.py`, `backend/scripts/backfill_assessment_attempt_notifications.py` — new, not yet run.
- `frontend/lib/api.ts`, `frontend/lib/auth.ts` — sliding-refresh interceptor + token-swap helper.

**Explicitly out of scope:** Collector's Vault (`frontend/app/student/achievements/vault/`) — still hardcoded dummy data with no backend and no `useProtectedPage` guard, deferred per Shailesh's instruction until the rest of the portal is confirmed solid.

## 2026-07-12 update: round 10 + heatmap tier-color fix + badge-notification commit-bug fix — delivered as PR #310, backfilled, verified

**tl;dr: all three fixes below are live in production (PR #310, commit `c2ebec6`, confirmed deployed on Vercel and Render), both one-time backfills have been run to completion, and there's nothing pending from this thread.** Delivered from the developer's own terminal with real verification this time (`pytest tests/ -q`: 20 passed; `npm run typecheck && npm run build`: clean, 41/41 routes) — Cowork's sandbox had a confirmed-stale repo mount this session (see the verification-caveat note further down) so those checks were deliberately skipped in Cowork and re-run for real before push.

Backfill results: `fix_auto_submitted_timestamps.py --apply` corrected 12 of 13 AUTO_SUBMITTED attempts (drift ranged seconds to ~8 minutes), their result summaries, and 36 notification timestamps. `backfill_missing_badge_notifications.py --apply` found and fixed exactly 1 missing notification platform-wide (Nishant Gantayet's "The High Achiever" badge — the one that surfaced the bug in the first place), out of 65 badges scanned across every student.

One process note worth keeping for next time: the first `--dry-run` attempt failed with `no such column: gamification_processed_at` because `DATABASE_URL` wasn't set in the terminal session, so the script silently ran against the local unmigrated SQLite dev DB instead of production. Fixed by setting `$env:DATABASE_URL` to the Render **External** Postgres URL (Internal only resolves from inside Render's network) before re-running — same gotcha as round 9's backfill hit.

## 2026-07-12 update (superseded by the entry above — kept for the investigation detail): round 10 (AUTO_SUBMITTED submitted_at fix + retro-correction script) + heatmap tier bar color/contrast fix — prepared, not yet delivered

Two independent fixes this session, both additive, no new migrations beyond what round 9 already shipped.

**1. Round 10 — the decision flagged at the end of round 9.** `backend/app/services/competition_mock_attempt_service.py`'s `SubmitCompetitionMockAttempt` now computes `submitted_at` for the auto (timer-expiry) path as `started_at + duration_seconds` (capped at "now" as a clock-skew guard) instead of `_now_utc()`. The old behavior stamped whatever moment the system happened to *detect* the expiry (a lazy GET, the defensive result-page repair) rather than the true exam-end time — wrong on its own, and also a risk to streak/heatmap day-bucketing since `recalculate_streaks.py` sorts on this column. `time_taken_seconds`/`time_utilization_percentage` were left unchanged — those were already correct for the auto path (100% time utilization is accurate for a timer-expiry submission; that part of the original report wasn't actually a bug).

Shailesh's call on the second open question: retroactively correct the attempts already backfilled under the old values. New one-time script `backend/scripts/fix_auto_submitted_timestamps.py` (`--dry-run`/`--apply`, same conventions as the round-9 backfill script — force-flushed prints, idempotent, safe to re-run). For every AUTO_SUBMITTED attempt whose stored `submitted_at` drifted from the recomputed correct value, it fixes three things together so nothing goes chronologically inconsistent: the attempt's own `submitted_at`, the matching `CompetitionMockResultSummary.completed_at`, and any `Notification.created_at` that was backdated to the old (wrong) value for that attempt. **Not yet run against production** — needs the round-10 code deployed first (same deploy-then-backfill order as round 9), then `--dry-run` to preview, then `--apply`.

**2. Heatmap tier bar colors — contrast fix**, following up on Shailesh reporting bars "meshing in with the background" during live student submissions. Computed actual WCAG contrast ratios for every tier color against the real card background (`bg-white/95` light / `bg-black/85` dark) rather than eyeballing it. The round-3 palette (PR #305) turned out to be tuned for dark mode only: S-TIER's gradient top (`yellow-300`) was ~1.3:1 against the white card (effectively invisible at the top of tall bars — the tier a student who submits well and fast earns most, matching what was observed), A-TIER (`emerald-500`, ~2.5:1) and B-TIER (`sky-500`, ~2.8:1) were both below the 3:1 minimum for graphical UI, and the REST/no-activity color (`slate-300` light / `white/10` dark) failed on both themes (~1.5:1 light, ~1:1 dark — genuinely invisible). All five tier colors passed comfortably in dark mode (5.7-15.9:1), so this was a light-mode-specific gap plus a dark-mode REST gap, not a uniform bug.

Replaced with a palette chosen for relative luminance ~0.13-0.28, the band that clears 3:1 contrast against BOTH white and black cards with the *same* color — no `dark:` variant needed on the base fill. `frontend/app/student/dashboard/page.tsx`: S-TIER `yellow-700→amber-600` gradient (gold), A-TIER `emerald-600`, B-TIER `sky-600`, C-TIER `violet-600` (moved off `amber-600` so it doesn't collide with the new S-TIER gold), D-TIER `rose-600`, REST `slate-500`. All six (5 tiers + rest) are now distinct hues, each passing contrast in both themes.

**Verification status — read before assuming this is done.** Same sandbox-staleness pattern documented in prior rounds recurred: this session's bash mount of the OneDrive-synced repo lagged behind the live file-edit-tool view — confirmed directly this time (not just inferred from mtimes) by finding `competition_mock_attempt_service.py` truncated mid-function in the bash mount (1267 lines vs. the true 1272) and `dashboard/page.tsx` throwing phantom "unterminated string literal" / unclosed-JSX-tag errors from `tsc` that don't exist when the same lines are read through the file tools. Running `pytest`/`npm run typecheck` from this sandbox would have tested a stale/corrupted snapshot, not today's actual changes, so those results were discarded rather than trusted. Verified instead by full manual re-read of both edited files end-to-end after editing (correct syntax, no naming collisions, `timedelta`/`_aware` already imported/defined in the backend file, single call site for the tier-color constants in the frontend file). New script (`fix_auto_submitted_timestamps.py`) syntax-checked clean with `py_compile` since it's a new file and synced correctly. **qa-reviewer must run real `pytest` + `npm run typecheck && npm run build`, and independently re-check the diff, before sre-devops delivers** — per this repo's standard split-workflow, same gate every prior round has gone through.

**3. Badge-unlock notifications silently dropped — a real bug inside round 9's own fix.** Shailesh reported that a student's "The High Achiever" badge showed correctly in the Trophy Room and the dashboard's "Latest Unlock" widget, but no "New Badge Unlocked" notification ever appeared in the notification panel — even though round 9 was supposed to be the permanent, universal fix for exactly this category of bug.

Root cause: `CreateNotification()` (`notification_service.py`) only does `db.add()` + `db.flush()` — it never commits, by design, so callers can batch several notifications into one transaction. Every OTHER side-effect in `_ProcessMockCompletionSideEffects()` has its own explicit `db.commit()` (the student/teacher/admin submission-notification block, the `gamification_processed_at` claim, `AchievementEngine.evaluate_mock_exam_submission()` internally), but the badge-notification loop (added in round 9) never did. Neither `SubmitCompetitionMockAttemptForStudent()` nor the route handler that calls it commits afterward either, and `get_db()` closes the DB session with no implicit commit. So every badge-unlock notification created through the live hook since round 9 shipped (2026-07-11 ~20:41 UTC) was created, flushed into the open transaction, then silently discarded the moment the request ended. The badge itself always persisted correctly (`evaluate_mock_exam_submission` commits its own writes *before* the notification loop even runs), which is exactly why Trophy Room and the "Latest Unlock" widget were right while the notification panel was empty — two different data sources, only one of which was actually being persisted.

Confirmed this wasn't specific to that one badge/student: traced the exact commit chain (`main.py`'s `get_db()` → route handler → `SubmitCompetitionMockAttemptForStudent` → `_ProcessMockCompletionSideEffects`) and found no commit anywhere after the badge loop, for any badge, for any student, since round 9 deployed. Also checked the only other three places `AchievementEngine.evaluate_mock_exam_submission` gets called (`routes_admin.py`, `schema_migration.py`'s dead/uncalled `ensure_mock_gamification_rewards_retroactive`, and the scripts under `backend/scripts/`) — all either commit correctly already or are unused, so this was isolated to the one live hook.

Fix: `competition_mock_attempt_service.py`'s badge-notification loop now calls `db.commit()` (with a matching `db.rollback()` in its except branch) right after each `CreateNotification()` call, mirroring the pattern the round-9 backfill script already used. New one-time script `backend/scripts/backfill_missing_badge_notifications.py` (`--dry-run`/`--apply`) closes the historical gap: for every `StudentBadge` a student has ever unlocked, it checks whether a matching `BADGE_UNLOCKED` notification exists (same title-match dedup convention used elsewhere in this codebase) and creates one backdated to `StudentBadge.unlocked_at` if it doesn't. Deliberately scoped to a student's entire badge history rather than just the round-9-to-now window, since checking existence is cheap and directly answers the question — no need to compute a precise time boundary. Not yet run against production.

**Not yet delivered** — Cowork has no route to push/PR/merge (see the 2026-07-10 entry below). Files changed this session:
- `backend/app/services/competition_mock_attempt_service.py` — `submitted_at` fix for the AUTO_SUBMITTED path, and the badge-notification missing-commit fix.
- `backend/scripts/fix_auto_submitted_timestamps.py` — new, one-time retro-correction script for round 10 (not yet run).
- `backend/scripts/backfill_missing_badge_notifications.py` — new, one-time backfill for dropped badge-unlock notifications (not yet run).
- `frontend/app/student/dashboard/page.tsx` — tier bar color palette (`TIER_BAR_CLASSES`/`REST_BAR_CLASSES`).

## 2026-07-11 update (rounds 6-9): mock-completion gamification bug — root-caused, fixed, delivered, backfilled, verified clean platform-wide

**tl;dr for tomorrow: there is nothing pending from this thread.** Rounds 6-9 are live in production (PR #309, commit `cd0a816`, confirmed deployed on both Vercel and Render). The historical data-repair backfill has been run to completion and independently re-verified with a full platform sweep — zero gaps remain. The only unresolved thread is a **product decision**, not code: see "Open decision for round 10" below. If nothing new has happened since this was written, there is no code work to resume — check with Shailesh whether he has a new task before doing anything.

### How this started

A second live batch of students (Pragya Ghosh, Sampreeti Mohapatra, Tanay Gupta, Sayantan Biswas) completed mock exams and got none of: XP/coins, badges, submission notifications (to themselves, their teacher, or admins). The developer also flagged that a prior round's leaderboard "time taken" numbers looked wrong. Explicitly instructed: this must be a **permanent, universal fix** covering every existing student and every student added in the future — not a one-off patch for the four named students.

### Root cause and fix (the permanent part — this is why nothing needs to be re-run for future students)

`backend/app/services/competition_mock_attempt_service.py` had two code paths that could grade/complete a mock attempt without ever running its notification/economy/achievement side-effects, because those side-effects only lived in a separate wrapper function that both paths bypassed entirely:
1. `EnsureCompetitionAttemptActiveOrSubmit()` — hit by any GET to load an attempt once the timer's already expired server-side (tab backgrounded, network dropped, student reopens the page after time's up).
2. The defensive result-summary repair inside `_result_payload()`.

Fixed by relocating the notification/economy/achievement side-effects into the core grading function itself (new `_ProcessMockCompletionSideEffects`, called from `SubmitCompetitionMockAttempt`), gated by a new `gamification_processed_at` timestamp column on `competition_mock_attempts` (Alembic migration `a1c9de3f7b21` + matching `schema_migration.py` self-heal entry) claimed atomically via `UPDATE ... WHERE gamification_processed_at IS NULL`. Every completion path now gets identical treatment exactly once, regardless of which one fires first, for every student past and future. **This is the core reason the fix is permanent and needed no per-student configuration.**

Also retired two fragile startup jobs (`ensure_mock_student_notifications_retroactive`, `recalculate_all_gamification_stats`) that used to run on every backend restart trying to paper over this same bug — the second did a full destructive wipe-and-rebuild of every student's badges on every deploy. Also fixed, same investigation: the dashboard's XP/coins wallet widget was never wired to the real economy ledger (fake local formula) — added `GET /student/economy` and wired `StudentWallet` to it. Also fixed: leaderboard `timeTakenSeconds` was fabricated from a hardcoded 60-minute assumption instead of reading the real column — pure read-path bug, no backfill needed.

### Delivery

Delivered via raw `git`/`gh` commands run directly in the developer's own terminal (not the AI-orchestrated qa-reviewer/sre-devops squad — same pattern as prior rounds, usage-cost driven). Manual verification substituted for qa-reviewer: `python -m pytest tests/ -q` (20 passed) and `npm run typecheck && npm run build` (clean, 62/62 routes) both confirmed green before push. One hiccup worth remembering: this repo has a server-side "MathPath safety guard" blocking direct pushes to `main` — the first push attempt was rejected; correctly redone as a feature branch (`fix/round-6-9-mock-gamification`) + PR, with local `main` reset back to `origin/main` afterward so it stayed clean. Merged as **PR #309** (commit `cd0a816`) after `gh pr checks --watch` passed CI. Confirmed live via direct Vercel and Render dashboard screenshots (both showing `cd0a816` deployed) before any data backfill was attempted.

### Backfill (historical data repair — this part is genuinely one-time, not recurring)

`backend/scripts/diagnose_mock_gamification.py` (read-only, safe anytime, takes names or `--all`) and `backend/scripts/backfill_mock_gamification.py` (`--dry-run`/`--apply`) were built and run from the developer's local terminal against production, guided step-by-step through several real terminal/environment issues along the way (missing `sqlalchemy` module, PowerShell paste/quoting, Render Internal-vs-External DB URL, a migration-not-yet-deployed column on a pre-migration schema — all resolved).

`--apply` was run twice. First run: 54 historical attempts scanned across 9 students, awarded missing XP/coins (6000 XP / 285 coins total), created missing notifications, and did a full badge/stat recompute (64 badges unlocked — see note below on why that number is much bigger than "notifications created"). A genuine bug was then found and fixed **in my own backfill script**: its notification-dedup logic gated ALL notification creation (student+teacher+admin) on one boolean ("does the student's MOCK_SUBMITTED notif exist"), which silently missed a real historical partial state — Meera Chatterjee's `MM_17` attempt had student+teacher notified but its admin notification was missing. Fixed the script to check student, teacher, and each individual active admin independently; re-ran `--apply`, closed that exact gap. **Final full-platform sweep via `diagnose_mock_gamification.py --all` (not scoped to named students) confirms zero remaining gaps across all 9 students and all 54 completed mock attempts** — every attempt shows OK for XP/coins, student notif, teacher notif, and admin notifs.

Why "badges newly unlocked" (64) was so much bigger than "notifications created" (a handful): the badge recompute does a full wipe-and-rebuild of `student_badges` every run, so it re-detects every badge a student has ever earned, not just new ones. But the now-retired startup job had already been organically notifying students about badges on every restart for months — so most of those 64 "newly unlocked" badges already had a notification sent long ago, correctly deduped against the `Notification` table (which the wipe never touches). Only genuinely first-time unlocks got a fresh notification. Confirmed by checking the retired job's source — identical title format and dedup logic to the new backfill script.

Two script-quality bugs were also found and fixed while running the backfill (bugs in my tooling, not the product): the dry-run summary undercounted notifications (fixed a counting bug where the counter only incremented in `--apply` mode), and the script went completely silent for minutes during the badge recompute with zero way to tell "working" from "hung" — root cause was Windows terminal stdout buffering plus `logging.info()` calls with no `logging.basicConfig()` ever configured, so nothing printed. Fixed by forcing `print(..., flush=True)` globally in the script and adding per-student progress lines.

### Open decision for round 10 (flagged, not actioned — needs Shailesh's call)

While investigating why the developer thought the backfilled notification timestamps "didn't look accurate," found a real, distinct, pre-existing bug: for `AUTO_SUBMITTED` (timer-expiry) attempts, `submitted_at` is set to `_now_utc()` — whenever the system happens to *detect* the expiry, not the true exam-end time — and `time_taken_seconds` is hardcoded to the full duration rather than measured (this is why every auto-submitted attempt shows exactly 100% time utilization). Correct fix would be `submitted_at = attempt.started_at + attempt.duration_seconds` for the auto path. **Two things need Shailesh's decision before any code changes:** (1) whether to fix this now as round 10, and (2) whether to retroactively correct the timestamps on the 8 attempts already backfilled under the old, inaccurate values. See `OPEN_ISSUES.md`'s "Active" section for the full technical writeup — full details also live in this thread's transcript if more context is needed.

### Rounds 6-8 (also delivered in the same PR #309, see `OPEN_ISSUES.md` for full per-round detail)

- Round 8: admin Live Radar widget + heartbeat were both silently 404ing due to a nonexistent `NEXT_PUBLIC_API_URL` env var (correct one is `NEXT_PUBLIC_API_BASE_URL`) — fixed by routing both through the shared `api` client.
- Round 7: admin Manage-tab pending-practice button bug, Trophy Room missing auth guard, Leaderboard missing auth guard — all fixed. Collector's Vault hardcoded-data finding remains unaddressed, needs a product decision (build real backend vs. hide the nav entry).
- Round 6: mock section renumbering extended to cover the live Attempt/Result pages (not just Instructions/Admin), heatmap timezone day-bucketing bug fixed.

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
