# Annual Competition — Requirements (source of truth)

Status as of 2026-09-04: **requirements captured from two client-provided
documents (below). No code has been written for the real, scheduled Annual
Competition yet.** This file exists so that any future session working in
this repo — this thread or a brand new one — has full context without
needing it re-explained. If you are a Claude session picking this up cold,
read this file plus the two source documents in this same folder before
doing anything else on "competition" work.

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
   practice for it). This is the newer, more directly actionable document —
   it describes work that does **not** exist in the codebase yet.

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
ABACUS/VISUAL labels; mock and final papers must match exactly in
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
→ MM-2. **YLP-1 eligibility and the exact Bridge lesson-range boundaries are
explicitly unconfirmed** (see open items below).

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
below. This must be resolved (slot extended or split) before that slot can
actually be built/scheduled — do not silently pick a resolution in code.

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
shared-paper generation path is new work). Open: whether YLM needs separate
YLP vs. PL-1 paper variants, since YLP is direct-sums-only and PL-1 adds
Small Boss/Big Boss concepts.

**Results, ranking, certificates — mostly unconfirmed:** scoring formula
and tie-break rule TBD; practice performance must stay private (student/
parent see only their own results) but competition leaderboard/winner
visibility TBD; automatic certificate/scorecard TBD; results are not final
immediately on submission — formal Results & Prize Distribution is Sunday 1
November 2026, 3–6 PM, NKDA Community Hall, Action Area IIC, Newtown; exact
portal-release timing TBD.

**Attempts:** practice mocks stay unlimited-attempt. Final competition
attempt count and any retake-exception process: TBD.

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

## Seven outstanding confirmations (client's own doc calls these out — do not silently resolve them)

1. Does YLP-1 participate at all?
2. Does YLM need separate YLP/PL-1 paper variants, or one shared paper limited to common concepts?
3. Exact Bridge Module lesson-range boundaries for auto-assignment.
4. Final scoring formula: correct answers only / accuracy % / completion time / a combination — plus tie-break rule and treatment of unanswered sums.
5. Competition visibility: Top 3 / Top 10 / full leaderboard, parent vs. student visibility, and certificate fields.
6. Final competition attempt count, and any admin-approved retake exception.
7. The 2:00–2:30 PM offline slot (and online equivalents) is too short for IM-4 (35 min) and MM-2 (40 min) — needs extending or splitting.

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
