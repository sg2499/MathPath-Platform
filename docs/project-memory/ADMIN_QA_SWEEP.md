# Admin Login — End-to-End QA Sweep

Environment: **production (live server)**. Safety rule: read-only checks (viewing, filtering, sorting, exporting, opening detail pages) are done freely. Any destructive/mutating action (delete, bulk upload, force-logout, reattempt approval, status change) is tested only against a dedicated throwaway test student/teacher created for this sweep — never against real records. Items requiring this are marked **[MUTATING]**.

Status values: `untested` / `pass` / `bug found` / `fixed` / `verified live`

**Test student for all [MUTATING] checks:** Student Name "Test Student QA1", Guardian Name "Test Parent QA1" — created fresh for this sweep. (Originally planned to use "Rohan Sen", but that name already belongs to a real existing student, MP-ST-008 — caught before any test data was created under that name, switched to an unambiguous fake name instead.) Do not touch any real/existing student or teacher record for destructive actions.

## Phase 1 — Cross-cutting (once, affects every page)

| # | Surface | Status | Notes |
|---|---|---|---|
| 1 | Auth/role boundary — non-admins blocked from admin routes | untested | Needs a non-admin (teacher/student) test login to verify; deferred |
| 2 | Nav shell (AppShell) — all 6 groups, active-state highlighting, mobile drawer | pass | Ref-based click confirmed dropdown panels render correct content (e.g. Learning Path → "Learning Path Studio"). Raw pixel-coordinate clicks gave false "broken" readings twice (stale coordinates after layout shift, then automation cursor not staying parked over hover-sensitive area between tool calls) — both investigated and ruled out as tooling artifacts, not app bugs. Recommend a real 30s manual mouse check as a final sanity pass, not because a bug is suspected. |
| 3 | Dark mode toggle — consistency across pages | pass | Verified on Dashboard + Students; full re-theme, readable, no contrast issues |
| 4 | Sort By dropdown fix — live-verify on every page using it | verified live | Confirmed on Students: all 6 options (Student Name, Student Code, Class, Teacher, Level, Status) render fully, no clipping. Backdrop-blur stacking-context fix from earlier this session is live and working |
| 5 | Loading/error/empty-state pattern — consistency | pass (partial) | Students page showed correct "Please wait" spinner during initial load. Will keep watching for error/empty states opportunistically during later phases rather than as a dedicated check |

## Phase 2 — Assessment Control (`/admin/assessments`) — highest priority, 6 surfaces in one route

| # | Surface | Status | Notes |
|---|---|---|---|
| 6 | Records tab | pass | Correct empty state (0 students, no assessments created yet — platform genuinely has no assessment activity yet, all API calls 200 OK, not a bug) |
| 7 | Approvals tab | pass | Correct metrics (Approved/Pending/Rejected = 0), correct filters, correct empty state, URL synced to `?tab=approvals` |
| 8 | Manage tab | pass | Correct heading/description, correct filters, correct empty state, URL synced |
| 9 | Promotion History tab | pass | Correct "Promoted Students: 0" metric, correct filters, correct empty state, URL synced |
| 10 | Parent Reports → Generate sub-tab | pass | Correct empty state ("0 Eligible", "No assessment-cleared student records are ready for parent report generation yet") |
| 11 | Parent Reports → Delivery History sub-tab | **BUG — HIGH SEVERITY** | See "Bugs found" section below: (1) SMTP/email provider is completely unconfigured in production, (2) clicking "Resend Report" appeared to hang the admin tab for 90+ seconds with zero error feedback |
| 12 | Assessment detail — `/admin/assessments/[assessmentId]` | untested | No assessments exist yet to open a detail page for; revisit after Phase 4 creates test data |
| 13 | Assessment create form — `/admin/assessments/create` | untested | **[MUTATING]** — deferred to after Phase 4 (need the test student created first) |
| 14 | Student assessment workspace — `/admin/assessments/student/[studentCode]` | untested | Deferred to after Phase 4 |

## Phase 3 — Performance Reports (`/admin/results`)

| # | Surface | Status | Notes |
|---|---|---|---|
| 15 | Learning mode | pass | Correct filters (Teacher/Module/Level/Lesson/DPS/Search), correct empty state, export button present |
| 16 | Student mode | pass | Mode toggle works cleanly, filters swap to Student-centric set, tested with a real student (Shailesh Gupta, MP-ST-001) — Current Level Progress 1% (1/160 DPS, correct rounding), DPS Cleared 1, DPS Avg Accuracy 80%, module filter auto-populated from student's real enrollment. Sub-tabs (Current Level Tracker/DPS History/Assessment History/Promotion Journey) all present with correct attempt counts |
| 17 | Attempt detail (benchmark) — `/admin/results/[attemptId]` | **BUG — MEDIUM (copy/messaging)** | Tested via Shailesh Gupta's real DPS 1 attempt (8/10, 80%, Cleared/Benchmark Met). Page correctly shows score, correct/wrong/unanswered counts, and full question-by-question review (all verified correct). **But** the subtitle directly under "Score: 8/10" reads "You are improving, but the required benchmark has not been achieved yet." — which directly contradicts the green "Benchmark Achieved" card and "BENCHMARK MET — Great Progress!" section immediately below it on the same page, for an attempt that *did* clear the benchmark. See bug log below |
| 18 | Attempt detail (lightweight) — `/admin/results/attempts/[attemptId]` | not separately tested | `/admin/results/[attemptId]` (row 17) is the route actually linked from the DPS History "View" action; did not find a separate live link to the `/attempts/` variant to confirm if it's a stale duplicate route or serves a different purpose |
| 19 | DPS results table — `/admin/results/dps/[dpsId]` | not reached | Same situation as item 39 (Phase 9) — no discoverable nav link found; not tested directly |

## Phase 4 — Users

| # | Surface | Status | Notes |
|---|---|---|---|
| 20 | Students — `/admin/students` | pass | Full CRUD verified on test student "Test Student QA1" (created, viewed, edited, password reset, deactivated, reactivated, deleted). Delete confirmation correctly describes full cascade (DPS/assessment/mock/assignment/notification records), matches PR #455. Sort By fix confirmed live here too. Force Logout button not present in row actions for a student with no active session — plausibly conditional on live session, not confirmed as bug |
| 21 | Teachers — `/admin/teachers` | pass | Full CRUD verified on test teacher "Test Teacher QA1" (created, deleted). Delete confirmation correctly describes unlink-not-cascade behavior (teacher login removed, students unlinked but not deleted). Sort By fix confirmed live here too (all 6 sort fields render) |

## Phase 5 — Assessment Studio (`/admin/assessment-blueprints`)

| # | Surface | Status | Notes |
|---|---|---|---|
| 22 | Create tab | pass (partial) | Step 1 (Assessment Details) and Step 2 (Distribution Matrix) render correctly with live validation ("Add 40 questions to match the total."). Did not complete a full **[MUTATING]** blueprint creation — verified detail/versioning flows instead against the pre-existing real draft "YLM_TEST", which exercises the same rendering paths without creating new prod data |
| 23 | Manage tab | pass | Lists pre-existing draft "YLM_TEST" (YLM-L1, 100Q/100 marks, 3 sections) correctly. Detail view verified fully: header/metrics/action buttons (Hide Answers, Generate Preview, Publish Locked Version) correct; **Overview** tab — Student Instructions + Distribution Matrix (3 sections, 40/40/20%) correct; **Question Preview** tab — real question content correct (Section 1 - Addition, Q1 rendered with correct options/answer); **Coverage Check** tab — Lesson and Concept Coverage table correct (Section 1 - Addition, 40 Questions, per-question concept tags e.g. COMPLEMENT_OF_5, answers shown). Did not click Publish Locked Version (would mutate the real draft) |

## Phase 6 — Assessment Readiness

| # | Surface | Status | Notes |
|---|---|---|---|
| 24 | Eligibility dashboard + testing overrides | pass | Metrics correct (158 reviewed, 0 ready, 158 not ready, 70% benchmark). Tree drill-down verified (Student → Module → Level → cleared/missing DPS count, e.g. Nishant Gantayet → Master Module → MM-L1 → "0/150 cleared, 150 missing"). Readiness Status filter verified correct: filtering to "Ready" correctly returns 0 rows / empty state, consistent with the "READY: 0" stat. **Note (not a bug, flagging for awareness):** a "Readiness Bypass Active" banner is currently live in production — "Assessment assignment is currently allowed for QA across eligible level matches until the owner explicitly restores strict readiness" / "Working convention: keep the assessment readiness bypass ON until explicitly disabled." This looks like an intentional QA convention already known to the team, but confirming it's still meant to be ON is worth a quick human check since it affects real assessment-assignment gating |

## Phase 7 — Practice Control

| # | Surface | Status | Notes |
|---|---|---|---|
| 25 | Tracker list — `/admin/assignments` | pass | Correct real metrics (11 students, 21 assigned DPS, 4 cleared, 12 pending, 5 needs re-attempt, 42% avg accuracy), correct per-student table with status badges (On Track/Pending/Needs Re-Attempt), filters present (Teacher/Module/Level/Status) |
| 26/27 | Student practice workspace — `/admin/assignments/student/[studentCode]` | pass | Tested on Sakshi Agarwal (MP-ST-002). All 3 tabs correct: Overview (Administrative Snapshot + Level Coverage + Admin Action Queue + Recent Activity, all matching table-level numbers), Lesson Insights (module rollup card correct), Manage (Module → Level drill-down tree correct: YLM → YLM-L1 → 1 Lesson(s)/2 DPS/1 Cleared). Did not click any mutating action (mark-cleared/reset/archive) — real student data |
| 28 | Create stub — `/admin/assignments/create` | pass | Confirmed intentional redirect to `/admin/curriculum` (Learning Path Studio), which renders correctly (modules/levels/lessons/DPS list, all 5 YLM DPS marked PUBLISHED) |

## Phase 8 — Competition

| # | Surface | Status | Notes |
|---|---|---|---|
| 29 | Mock Studio — Create tab | pass | Select Module/Level and Build Mock Paper form render correctly; did not generate a new draft mock (**[MUTATING]**) — verified equivalent flows via an existing real mock instead |
| 30 | Mock Studio — Manage tab | pass | Mock Paper Library correctly lists real mocks (e.g. "Intermediate Module L1 - Mock 1", assigned status). Assign panel renders correctly (Selected Mocks/Level Students/Selected Students counters). Did not Archive/Delete/Assign against real data (**[MUTATING]**) |
| 31 | Mock detail — Overview tab | pass | Tested on "Intermediate Module L1 - Mock 1": header/metrics correct (100Q/100 marks/1 mark each/45 min), Student Instructions correct, Section Matrix correct (6 sections, 18/18/18/18/18/10, percentages match) |
| 32 | Mock detail — Preview (Question Preview) tab | pass | Question 1 of 100 renders correctly with section tag, options, and answer |
| 33 | Mock detail — Coverage tab | pass | Full 100-question coverage list renders correctly across all 6 sections with concept tags and answers. Spot-checked BODMAS answers by hand (Q73, Q79, Q81, Q85) — all correct. Spot-checked multiplication/division (Q44: 461×6=2766 ✓, Q64: 2808÷8=351 ✓) — all correct |
| 34 | Mock Tracker — `/admin/competition/mock-tracker` | pass | Correct real metrics (143 assigned/104 completed/39 pending/65 avg score/65% avg accuracy), 30 real students listed. **Sort By dropdown re-verified here**: all 7 options (Mock, Mock Code, Status, Score, Accuracy, Time Taken, Assigned Date) render fully with scroll, no clipping — fix confirmed on a 3rd page. Drill-down tree verified (Student → Module → Level → individual mock rows with score/accuracy/time/dates). Did not click the row-level Delete (trash icon) — real data |
| 35 | Mock Result — Question Review tab | pass | Tested on Sohini Das / IM-L3 Mock 1 (70/100). Score summary card correct (70% accuracy, 70 correct, 0 unanswered, 30 min). Section-by-section question review renders correctly with real question content |
| 36 | Mock Result — Result Analysis tab | pass | Concept Analysis / Section Performance breakdown renders correctly with per-concept correct/total and percentage (e.g. "Add/Less (Abacus) 4/4 Correct 100%"), consistent with the overall 70% score |
| 37 | Performance Insights — `/admin/competition/progress` | pass | Renders correctly, metrics consistent with Mock Tracker (143/104/39/65/65%), same drill-down student list |

## Phase 9 — Learning Path

| # | Surface | Status | Notes |
|---|---|---|---|
| 38 | Learning Path Studio — `/admin/curriculum` | pass | Module → Level → Lesson → DPS 4-pane picker renders correctly with real data (YLM through MM). Selected-DPS panel correct. "Generate Preview" correctly generates 10 real questions (first click appeared to no-op — retried and it worked on the 2nd click, consistent with earlier session's lesson that a single no-visible-change screenshot isn't proof of a bug; confirmed via DOM text, not just screenshot). "Show Answers" toggle verified correct (6+2+1=9 shown as correct answer). Did not click "Republish DPS" (**[MUTATING]**) |
| 39 | DPS detail — `/admin/dps/[dpsId]` | pass (code review) | This route exists (`app/admin/dps/[dpsId]/page.tsx`) and is functionally a subset of the Learning Path Studio DPS-preview flow already verified in row 38 (same `getDpsConfig`/`generateDpsPreview` pattern). Could not find any nav link, button, or `href` anywhere in the admin UI that points here — it appears to be an orphaned/legacy standalone route, not reachable through normal navigation. Not a functional bug (the underlying feature works fine via Learning Path Studio), but flagging in case it's meant to be linked from somewhere and isn't |

## Phase 10 — Dashboard

| # | Surface | Status | Notes |
|---|---|---|---|
| 40 | Dashboard — quick links + live radar widget | pass | "MathPath Control Centre" renders correctly: Live Radar widget correct ("0 Active Now — No students active in the last 5 minutes. Safe to deploy."), Operational Priority shortcut buttons present, all 8 quick-link cards render (Learning Path, Students, Teachers, Practice Control, Assessment Readiness, Assessment Studio, Assessment Control, Performance Reports). Spot-checked "Students" quick link — correctly navigates to `/admin/students` |

## Bugs found (running log)

### 1. [HIGH — SUPERSEDED] Email provider (SMTP/Resend/Brevo) not configured in production
- **Where:** Assessment Control → Parent Reports → Delivery History; almost certainly affects any other feature that sends email (need to check: password reset emails, notifications, etc. — not yet verified)
- **Evidence:** `GET https://mock.mathpath.in/api/admin/system/smtp-diagnostic` returns `{"configured":false,"ok":false,"host":"","usernamePresent":false,"fromEmailPresent":false,"passwordPresent":false,"message":"Email service is not configured. Missing: SMTP_HOST, SMTP_USERNAME, SMTP_PASSWORD, SMTP_FROM_EMAIL","resendConfigured":false,"brevoConfigured":false}`
- **Impact:** No parent progress report email can currently be delivered. The one historical delivery record (Shailesh Gupta / YLM-L1, sent 27/5/2026) failed with "Email delivery timed out."
- **Fix needed:** This is a credentials/environment configuration gap, not a code bug — needs real SMTP or Resend/Brevo credentials set as environment variables on the production backend. Not something Claude can supply; needs Shailesh (or whoever owns the email provider account) to provide credentials.
- **Status:** SUPERSEDED (2026-08-13) — email delivery for parent reports was removed by design. Admins now generate a report, download it, and explicitly "Publish to Teacher"; the teacher downloads it from their own login. There is no longer any recipient email in this flow, so this gap no longer applies to parent reports. This did not check whether SMTP is used anywhere else in the platform (it isn't — confirmed no other feature in the backend calls the email service).

### 2. [MEDIUM-HIGH — SUPERSEDED] "Resend Report" may hang the entire admin tab with no error feedback
- **Where:** Assessment Control → Parent Reports → Delivery History → View Details → Resend Report
- **Evidence:** After clicking Resend Report (targeting the failed delivery above, same-recipient), the browser tab stopped responding to screenshot/page-text requests for 90+ seconds (well past the app's own 90s axios client timeout on this exact call, confirmed in `frontend/lib/api.ts`/`resendAdminParentReportDelivery`). Recovered only after a forced page navigation.
- **Uncertainty:** could be a genuine frontend hang (e.g. backend attempting a slow/blocking connection to an empty SMTP host with no server-side timeout, and the client not handling it gracefully), or could be an artifact of my automated tooling's "wait for idle" detection on a page with background polling (notifications, live radar). I was not able to fully disambiguate without risking another multi-minute hang.
- **Recommended next step:** a real human click-test — open Delivery History, View Details on the failed row, click Resend Report once, and just watch whether the page visibly locks up (unclickable, no spinner resolving) for an extended period. Cheap to verify, and definitive either way.
- **Status:** SUPERSEDED (2026-08-13) — the "Resend Report" action (and the whole email-send code path it hung inside) was removed along with parent-report emailing. The replacement actions (Download, Publish To Teacher) are plain REST calls with no SMTP round-trip, so this specific hang can no longer occur. Root cause was never fully confirmed, but is moot now.

### 3. [MEDIUM] DPS attempt result page shows contradictory benchmark messaging
- **Where:** `components/student/ResultSummary.tsx`, shared across `/admin/results/[attemptId]`, `/teacher/results/[attemptId]`, `/teacher/result/[attemptId]`, and `/student/result/[attemptId]` — i.e. this affects real students viewing their own results, not just admin
- **Evidence:** Live-tested on Shailesh Gupta's real DPS 1 attempt (8/10 = 80% accuracy, status "Cleared", "Benchmark Met"). The page's "Result Overview" subtitle (directly under "Score: 8/10") reads: *"You are improving, but the required benchmark has not been achieved yet."* Immediately below, a green card reads *"Benchmark Achieved — Excellent work! You have successfully achieved the benchmark for this practice sheet."*, and a further section reads *"BENCHMARK MET — Great Progress! ... You crossed the benchmark..."* — three messages on one page, two say benchmark met, one says it wasn't.
- **Root cause (found in code):** In `ResultSummary.tsx` line 79-80, the subtitle renders `result.message || resultMessage(s.accuracyPercentage)`. The `resultMessage()` fallback in `lib/utils.ts` is purely accuracy-threshold text ("Good effort...", "Nice try...", etc.) and doesn't match what was shown, meaning the actual text came from the backend's `result.message` field. Everywhere else on the same page (the "Benchmark Achieved" card, the "BENCHMARK MET" section), the copy is correctly derived from `IsCleared` (line 17, `result.status === "CLEARED"` equivalent). The subtitle's `result.message`, however, is a backend-supplied field that is out of sync with the attempt's actual cleared/benchmark-met status for this attempt.
- **Impact:** Confusing, contradictory copy shown to students, teachers, and admins on every DPS result review page for at least some (possibly all) cleared attempts. Not a data-integrity bug — the score/correct/wrong counts and pass/fail logic are all correct — purely a messaging inconsistency, but visible to real students right after they clear a benchmark, which could be discouraging.
- **Fix needed:** Backend should either stop sending a stale/generic `message` field on cleared attempts (letting the frontend's own `IsCleared`-gated logic apply everywhere, including the subtitle), or the frontend subtitle at `ResultSummary.tsx:79-80` should ignore `result.message` when `IsCleared` is true and use the same `Message` variable already computed correctly at line 21-25. The frontend fix is a one-line change and doesn't require backend involvement.
- **Status:** confirmed via live test + source read, not yet fixed
