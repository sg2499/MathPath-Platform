# Annual Competition — Requirements (source of truth)

Status as of 2026-09-05: **All 8 packages of the build (data model,
assignment engine, admin studio, section-timer/pause engine, student
attempt UI, scoring + results, teacher/admin monitoring, certificates/
leaderboard), plus Package 6b (admin "technical issue" retry override,
item 6 below), are COMPLETE** — see `.mathpath/STATE.yaml` and
`.mathpath/packages/pkg-0{1..8}-*.md` / `pkg-06b-retry-override.md` for
exact build status; this file stays the requirements source of truth, not
the build-progress tracker. Package 9 (rehearsal + full regression) and
Package 10 (go-live checklist) remain, per the original plan's own
sequencing — not started, awaiting explicit go-ahead.
Seven items were originally open; the client has now answered all seven,
including a 2026-09-05 follow-up that resolved the one item (1+2) that
needed a more precise answer (see that section below for the full
resolution and the resulting Package 2 fix). This file
exists so that any future session working in this repo — this thread or a
brand new one — has full context without needing it re-explained. If you
are a Claude session picking this up cold, read this file plus the source
documents in this same folder before doing anything else on "competition"
work.

## Source documents (kept verbatim in this folder)

1. `2026-09-01_internal-dev-spec-mock-practice.docx` — **"Annual Competition
   Mock Practice" internal development spec**, dated 1 September 2026,
   marked "Ready for implementation." This is almost certainly the spec
   that the already-built, already-shipped **Competition Mock** feature
   (`competition-mock-practice-plan.md` epic, `.mathpath/STATE.yaml` shows
   it `COMPLETED`) was built from — its own requirement #7 ("every attempt
   must create a fresh randomised paper") matches how the live Competition
   Mock generation services behave today.
2. `2026-09-03_client-completed-questionnaire-response.docx` — **MathPath's
   completed response to a developer questionnaire about the real,
   scheduled Annual Competition** (the actual one-time graded event, not
   practice for it). This is the document Packages 1-4 were built from.
3. `2026-09-04_client-response-outstanding-items.pdf` — **MathPath's
   answers to the 7 outstanding confirmation items** raised by document 2
   (the PDF questionnaire Claude generated and sent for exactly this
   purpose). See "Seven outstanding confirmations" below for the verbatim
   answers and what each one means for the build.

## What already exists today (built, shipped, unrelated to this doc's new asks)

"Competition Mock" is an always-available *practice* exam styled like the
competition, assignable by admins, attemptable unlimited times, randomized
per attempt. Backend: `competition_mock_generation_service.py` (MM/IM) plus
dedicated `bm_/pm_/ylm_competition_mock_generation_service.py` engines,
`CompetitionMockExam`/`Question`/`Assignment`/`Attempt`/`ResultSummary`
models. Frontend: `frontend/app/{admin,teacher,student}/competition/*`
(mock-studio, mock-tracker, mock-exams, mock-attempt, mock-result,
leaderboard, progress). There is **no** existing model or scheduling concept
for a single dated event, no group→level auto-assignment, no frozen
identical-paper-per-level mechanism, and no certificate/ranking persistence
— all genuinely new.

## Document 1 — Internal dev spec: "Annual Competition Mock Practice" (2026-09-01)

Defines the **level-wise paper structure** each mock/competition paper must
reproduce: section count, Abacus vs. Visual mode, concepts/number formats
(digit-and-row notation, e.g. "2D 3R" = three rows of 2-digit numbers),
sum count, and per-section time limit — for "Level 1" through "Level 8" and
"MM1"/"MM2". Full tables are in the source docx (Sections 3, 5, 6); summary
of total sums/time per level:

| Level | Total sums | Total time |
|---|---|---|
| Level 1 | 50 | 10 min |
| Level 2 | 100 | 10 min |
| Level 3 | 100 | 10 min |
| Level 4 | 200 | 20 min |
| Level 5 | 300 | 20 min |
| Level 6 | 300 | 20 min |
| Level 7 | 300 | 20 min |
| Level 8 | 350 | 25 min |
| MM1 | 400 | 30 min |
| MM2 | 400 | 30 min |

Key rules (Section 7, full numbered list in the source doc): independent
per-section timers that don't carry over unused time; auto-submit at zero;
pre-section instructions must show mode/concepts/sum-count/time; strict
question-pool control (only approved concepts for that level); balanced
distribution across formats within a section, remainder rotated across
future mocks; a "combined section count" is a total, not per-concept; **every
attempt gets a fresh randomised paper** (practice behavior); clear
ABACUS/VISUAL labels; mock and final formats must match exactly in
structure; Division-with-Estimation rounds to 2 decimals per MathPath's
existing rule.

**Open question this file flags for whoever implements next:** doc 1's
"Level 1"–"Level 8" / "MM1"/"MM2" naming does not literally appear in the
codebase's `IM_COMPETITION_LEVEL_REGISTRY` / `BM_COMPETITION_LEVEL_REGISTRY`
/ `PM_COMPETITION_LEVEL_REGISTRY` / `YLM_COMPETITION_LEVEL_REGISTRY`, which
key off the platform's real module/level codes instead (e.g. `IM-1`,
`PM-L1`). The numeric mapping between doc 1's generic "Level N" labels and
the platform's actual level codes was not re-verified line-by-line against
the live registries — do that before assuming the existing Competition Mock
config already matches doc 1's tables exactly.

## Document 2 — Client's completed questionnaire response: the real Annual Competition (2026-09-03)

This describes the actual scheduled event, distinct from practice.

**Core principle:** across Preparatory and Intermediate Modules, students
compete **one level below** their current enrolled level. The point of
practice is to let each student repeatedly beat their own previous score.

**Auto-assignment rule (Section 1):**

| Current group | Competition level | Rule |
|---|---|---|
| YLP-2, YLP-3 | YLM | Young Learner category |
| PL-1 | YLM | Entry-level YLM category |
| PL-2 | PL-1 | One level below |
| PL-3 | PL-2 | One level below |
| PL-4 | PL-3 | One level below |
| IM-1 | PL-4 | One level below, across module boundary |
| IM-2 | IM-1 | One level below |
| IM-3 | IM-2 | One level below |
| IM-4 | IM-3 | One level below |

Bridge Module placement by lesson milestone: Lesson 15 → PL-1, Lesson 25 →
PL-2, Lesson 35 → PL-3, full Bridge → PL-4. Master Module placement: below
Lesson 16 → IM-4, Lesson 16+ but not completed → MM-1, full Master Module
→ MM-2. **Bridge "between milestones" is now confirmed** (see answered item
3 below): floor to the highest milestone cleared, matching what Package 2
already implements. **The YLM/PL-1 paper-split question (item 1+2) has been
answered by the client but is not yet precise enough to implement — see the
"Client's answers" section below.**

**Schedule:** Sunday 11 October 2026, single day, fixed start times (not an
open window):

| Mode | Slot | Students | Where |
|---|---|---|---|
| Offline | 12:00–12:30 PM | YLP, PL-1, PL-2, PL-3 | MathPath centres |
| Offline | 1:00–1:30 PM | PL-4, IM-1, IM-2, IM-3 | MathPath centres |
| Offline | 2:00–2:30 PM | IM-4, MM-1, MM-2 | MathPath centres |
| Online (India) | 7:00–7:30 PM | Outside West Bengal | Home, supervised |
| Online (Intl) | 8:00–8:30 PM | International | Home, supervised |

**⚠ Known scheduling conflict the client's own document flags:** the
2:00–2:30 PM slot (and its online equivalents) is 30 minutes, but IM-4
needs 35 minutes and MM-2 needs 40 minutes per the section-timer table
below. **Answered (item 7, 2026-09-04):** the published slot time is only a
shared login/entry anchor, not a hard cutoff — "each level has its own time
limit set the children will do till the time allotted... same entry time,
rest will follow as per the level time limits as in the platform." No
schedule edit needed; this confirms `SlotsWithInsufficientDuration`
(Package 3) is correctly a non-blocking advisory check, not something that
needed to gate anything.

**Section timers per competition level (Section 3.4 of the source doc):**

| Level | Sections | Total |
|---|---|---|
| YLP / PL-1 | 20 min continuous | 20 min |
| PL-2 | Abacus 15, Visual 15 | 30 min |
| PL-3 | Abacus 10, Visual 10, Multiplication 10 | 30 min |
| PL-4 | Abacus 10, Visual 10, Mixed Mult/Div 10 | 30 min |
| IM-1 | Abacus 10, Visual 10, Mult/Div 10 | 30 min |
| IM-2 | Abacus 10, Visual 10, Mult/Div 10 | 30 min |
| IM-3 | Abacus 8, Visual 8, Mult 7, Div 7 | 30 min |
| IM-4 | Abacus 8, Visual 8, Mult 7, Div 7, Squares 5 | 35 min |
| MM-1 | Abacus 5, Visual 5, Mult 5, Div 5, Squares 5, Percentage 5 | 30 min |
| MM-2 | Abacus 5, Visual 5, Mult 5, Div 5, Squares&Cubes 5, Percentage 5, Sq/Cube Roots 10 | 40 min |

Note: this level-timer table (client's real-event doc) does **not** line up
numerically with doc 1's Level-1..8/MM1/MM2 timer table above (e.g. doc 1's
"Level 4" = 20 min across 3 sections; doc 2's PL-4 = 30 min across 3
sections) — they are not simply the same table under different names.
Reconcile carefully, don't assume equivalence.

**One sitting, pause only on genuine disconnect:** all applicable sections
back-to-back; a real technical disconnection pauses the active section
timer and resumes it from the exact remaining time on reconnect (same
save-state discipline as the existing DPS attempt-resume flow).

**Paper fairness:** every student on the same competition paper gets the
**exact same questions in the exact same order** — no per-student
randomization for the final competition (this is the opposite of practice
mocks' "fresh randomised paper every attempt" rule above; a frozen,
shared-paper generation path is new work). **Answered but not yet precise
(item 1+2, 2026-09-04):** YLM does need a paper split, and it appears to be
by student age rather than by the YLP-2/YLP-3-vs-PL-1-current label our
platform actually tracks — see "Client's answers" below for the exact
wording and the open execution questions this still leaves.

**Results, ranking, certificates:** **Answered (item 4, 2026-09-04):**
scoring is accuracy % and completion time; tie-break is "who made a mistake
first" — the student whose first wrong answer came *later* in the sequence
wins the tie; an unanswered sum earns zero marks. **Answered (item 5,
2026-09-04):** results stay fully undisclosed until the formal announcement
date (wording didn't distinguish "hidden from other students" from "hidden
from the student themselves too" — read it as full lock-down until proven
otherwise). Certificate fields still TBD. Results are not final immediately
on submission — formal Results & Prize Distribution is Sunday 1 November
2026, 3–6 PM, NKDA Community Hall, Action Area IIC, Newtown; exact
portal-release timing TBD.

**Attempts:** practice mocks stay unlimited-attempt. **Answered (item 6,
2026-09-04):** the real competition is a single attempt; a retake is
admin-only and only for a genuine technical issue on MathPath's end — no
self-serve retake. Package 4 already enforces the single-attempt part; the
admin-retry-override path does not exist yet (see below).

**Technical interruption:** timer stops immediately, submitted answers +
current section + remaining time are saved, resume exactly on reconnect.

**Location/supervision:** offline = physical supervision at MathPath
centres; online (both India-outside-Bengal and international) = home,
supervised by MathPath.

**Percentage/Squares/Cubes/Roots:** same question format and rules as
already used in the Master Module — no new format needed there.

**Competition-format practice:** yes, practice mocks should already mirror
section sequence/timers/instructions of the real event (this is what
Document 1 already covers) and remain unlimited-attempt, private-per-student.

## Seven outstanding confirmations — client's answers (2026-09-04)

MathPath sent `2026-09-04_client-response-outstanding-items.pdf` (Claude's
own PDF questionnaire, answered and returned) alongside this file. Verbatim
answers below, plus what each one means for the packages already built
(1-4, all complete as of 2026-09-04) versus packages not yet started.

1. **Does YLP-1 participate at all?** / **2. Does YLM need separate
   YLP/PL-1 paper variants?** — answered together, client's answer to #2 was
   literally "refer answer given in Q1 and create accordingly". Client's
   answer to #1, verbatim: *"YLP 2 & 3 will have only direct sums and name
   it as Bloomers below 8 years, PL-1 will have all the concepts for
   children above 8 years for students who are in Pl-2 & who have completed
   Lesson 15 in Bridge Module."*
   - **Follow-up sent** asking whether the age split applies only within
     the YLP-2/YLP-3 population or overrides curriculum position entirely
     (i.e. could an 8+-year-old currently at YLM-L1 be bumped to the
     fuller tier, or could a under-8 PM-L1-current student be held back to
     the direct-sums tier). **Client's follow-up answer (2026-09-05),
     verbatim:** *"YLP enrolment is taken for Class 1 & 2 students only so
     they would be below 8 years, and PL1 students have already crossed
     PL1 & would be in level 2 so they have no problem sitting for PL-1."*
   - **Now resolved: no age logic needed in code at all.** The client is
     saying age is a structural *consequence* of enrollment/curriculum
     position, not an independent signal to check at runtime — YLP-2/3
     enrollment is itself gated to Class 1/2 (hence always under 8), and
     anyone currently placed at PM-L1 (client's "PL1... would be in level
     2") has by definition already progressed past the YLP bracket (hence
     never needs the age check to qualify for the fuller PL-1 paper). So
     the split this whole item was about is fully captured by the
     student's *existing* `(module, level)` position alone — exactly the
     shape `DIRECT_LEVEL_MAPPING` already keys on. `Student.dob` is not
     needed for this rule; the earlier note above (this item's "Clear
     part") assumed an age-conditional branch would be required — that
     assumption is now superseded.
   - **The one concrete code change this implies (Package 2 only):**
     `DIRECT_LEVEL_MAPPING[("PM", "PM-L1")]` currently targets `"YLM-L1"`
     (i.e. a PM-L1-current student today gets routed into the same shared
     YLM bracket as YLP-2/3). Per this answer, PM-L1-current students
     should instead sit the fuller "all the concepts" tier, which is the
     already-existing, already-fully-configured `PM-L1` competition level
     (`PM_COMPETITION_LEVEL_REGISTRY["PM-L1"]` in
     `pm_competition_mock_generation_service.py` — same 3-section shape as
     YLM-L1 but with materially richer digit patterns, e.g. "Direct
     Addition (Round Hundreds)"/"Direct Addition (Triple Digit)", already
     absent from YLM-L1's capped range). `PM-L1` is also already present
     in Package 3's `VALID_COMPETITION_LEVEL_CODES` and
     `DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE` in
     `annual_competition_studio_service.py`, so this is a **pure
     redirect** of one existing table row to another already-valid
     target — zero new registry/config work. The `("YLM", "YLM-L1")` row
     (covering actual YLP-2/3-current students) stays unchanged, and
     continues to use the YLM-L1 registry, which becomes the "Bloomers"
     direct-sums-only tier.
   - **Impact on already-built packages: confined entirely to Package 2.**
     Packages 1, 3, 4, and 5 need **zero changes** — Package 3's level
     codes/timers already support `PM-L1`, and Packages 4/5's attempt/timer/
     UI code is level-code-agnostic (it operates on whichever
     `CompetitionEventLevelPaper` the assignment resolved to, regardless of
     which level code that is).
   - **One remaining soft, non-blocking question:** is "Bloomers" purely a
     *display/branding label* for the existing YLM-L1 tier (no code change
     beyond maybe a friendlier name shown to students/parents), or does the
     client expect it to be a materially different, even-more-restricted
     question set than YLM-L1's current registry already provides? Nothing
     in either answer suggests the latter — "direct sums" is already an
     accurate description of YLM-L1's registry — so the working default is
     "display label only, no registry change," but this hasn't been asked
     outright.
   - **Implemented 2026-09-05.** Shailesh gave the go-ahead; the
     `DIRECT_LEVEL_MAPPING[("PM", "PM-L1")]` row now targets `"PM-L1"`
     (previously `"YLM-L1"`). See `annual_competition_assignment_service.py`'s
     own docstring ("PL-1 targets its own level, not the shared
     YLM/"Bloomers" bracket") for the full rationale, and
     `.mathpath/packages/pkg-02-assignment-engine.md` for the change record.
     Full backend suite re-verified green (434 passed) after the change.
     The soft "Bloomers" naming-vs-content question above remains open but
     non-blocking.

2. See item 1 (client's answer to item 2 pointed back to item 1).

3. **Exact Bridge Module lesson-range boundaries.** Client's answer:
   *"yes"* — confirming a student between two milestones is placed at the
   **lower** level until they clear the next one. Matches Package 2's
   existing default exactly. No change needed.

4. **Final scoring formula.** Client's answer, verbatim: *"accuracy and
   completion time, If tie to check who made mistake first the latter will
   win then. If unanswered no marks to be given."* Differs from this repo's
   placeholder default (raw correct-count desc, then time asc) — the real
   rule is accuracy % + completion time, with a "later first mistake wins"
   tie-break, and zero marks for unanswered sums. Note for whoever built
   Package 5 (student attempt UI): "who made a mistake first" as a
   tie-break requires answers to be captured **in order, with per-question
   correctness and timing**, not just a final tally — the answer-capture
   table Package 5 added supports this from the start, not retrofitted
   later. **Implemented 2026-09-05 (Package 6):** the confirmed formula
   above is the actual ranking rule in
   `annual_competition_scoring_service.py`'s `_DefaultRankingSortKey` —
   accuracy% descending, then completion time ascending, then "later first
   mistake wins" derived on demand from `CompetitionEventAttemptAnswer`
   (no new column needed). A student with no mistake at all outranks
   anyone who made one. See `.mathpath/packages/pkg-06-scoring-and-results.md`.

5. **Results/certificate visibility.** Client's answer, verbatim: *"Result
   has to be kept undisclosed till the date of announcement."* Reads as a
   full lock-down (not just "hide from other students, show own result") —
   worth one more precise confirmation before certificate/leaderboard work
   (Package 8) builds anything public-facing, but the schema
   (`CompetitionEventResult.is_released`) already supports either reading
   without a schema change. Certificate fields (name/level/rank/score/date/
   centre) still unanswered. **Implemented 2026-09-05 (Package 6):** the
   full-lockdown reading is what's built — student/parent-facing endpoints
   return `released: false` (never the actual metrics) until an admin
   explicitly releases a level's results; admin can always see everything
   regardless. Certificate/leaderboard display itself remains Package 8,
   unaffected by this.
   - **Package 8 decisions, given directly by Shailesh (2026-09-05), in
     place of a further client round-trip:** leaderboard scope is "own
     result only" — a student sees just their own released result, no
     public/shared leaderboard of other students (the admin side already
     has a full ranked leaderboard, Package 6/7's Results tab). Certificate
     fields are name, level, rank, score, and date (plus MathPath
     branding) — one design, not tiered by rank. Every finalized
     participant is eligible for a certificate, not just rank-holders,
     downloadable from the student's own portal once results are
     released. **Implemented 2026-09-05 (Package 8)** — see
     `.mathpath/packages/pkg-08-certificates-leaderboard.md`.

6. **Attempt count / retakes.** Client's answer: *"Only once unless there
   is a technical issue from our end."* Matches Package 4's already-built
   single-attempt enforcement exactly (`StartCompetitionEventAttempt`
   rejects starting again once `SUBMITTED`). The "technical issue" carve
   -out — an admin-triggered manual retry — is genuinely confirmed as
   needed now, but was deliberately not built in Package 4 (it wasn't on
   that package's checklist). Recommend adding it as a small, self
   -contained addition before go-live; does not require reopening Package
   4's existing logic, just a new admin action.
   - **Implemented 2026-09-05 (Package 6b).** A new admin-only
     `CompetitionEventAttemptRetryGrant` (mirrors the pre-existing DPS
     `AssignmentReattemptPermission`'s APPROVED→USED lifecycle) is checked
     by `StartCompetitionEventAttempt` before it rejects a second start;
     if an unused grant exists for the assignment, a fresh attempt is
     created (next `attempt_number`, same assignment) and the grant is
     consumed in the same transaction. The default single-attempt
     rejection is completely unchanged when no grant exists. Admin action:
     `POST /api/admin/annual-competition/attempts/retry-grants`
     (`attemptId`, `reason` — required, non-blank). See
     `.mathpath/packages/pkg-06b-retry-override.md` for full detail,
     including a genuine pre-existing gap (missing migration/safety-net
     coverage for `competition_event_attempt_answers`) discovered and
     fixed alongside this addition.

7. **The 2:00–2:30 PM slot is too short for IM-4/MM-2.** Client's answer,
   verbatim: *"Each student appearing online will be asked to login 10 mins
   early and then we will start. As each level has its own time limit set
   the children will do till the time alloted. So for joining we will have
   a same entry time mentioned rest will follow as per the level time
   limits as in the platform."* Confirms the published slot window is only
   a shared entry/login anchor, never a hard stop — this is exactly how
   Package 3's `SlotsWithInsufficientDuration` was built (a non-blocking
   advisory warning, nothing enforces the slot's `scheduled_end_at` as a
   cutoff anywhere). No code or data change needed.

**Net effect on packages already built:** items 3, 6, and 7 confirm
existing Package 2-4 behavior is already correct. Items 4 and 5 are new,
precise requirements for Package 6 (not yet started) — captured here so
that package starts from the right default instead of a guess. Items 1+2
are the only ones requiring a change to already-built code (Package 2 and
3), and are intentionally not yet implemented pending one more precise
answer on the exact age-vs-curriculum-position boundary.

## Process note (why this file exists)

Shailesh flagged (2026-09-04) that a prior session's context about this
feature — shared "yesterday" — was not available in a follow-up thread.
This project's actual cross-session memory mechanism is **whatever is
committed to this git repo** (this file, `COWORK_HANDOFF.md`, the
`.mathpath/` epics/state files, `DAILY_LOGS/`) — there is no other channel
a future Claude session can read from. Anything substantive shared in a
session (a requirements doc, a decision, a screenshot-derived diagnosis)
needs to land here to actually survive into the next thread. This file plus
the two source docx files alongside it are that landing for the Annual
Competition requirements specifically; `COWORK_HANDOFF.md` carries a short
pointer entry to here.
