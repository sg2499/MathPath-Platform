# MathPath Platform — Deep QA Sweep (Round 2), 2026-07-23

Follow-up to the same-day initial sweep, going deeper: both teacher accounts (Ashalatha Gupta and Smita Singh, covering all 29 students), the full Learning Path content-publishing status across all three modules, platform-wide Practice Control, Assessment Studio, Competition Mock Studio, and Performance Reports on the Admin side. Live, read-only, no test data created or changed.

This document supersedes one item from the earlier report (noted below) and adds several new, more consequential findings — most importantly, a root-cause explanation for why nearly every student on the platform shows "0% progress."

---

## The headline finding: most MM and IM practice content isn't published yet — this is the real reason almost everyone shows 0% progress

This is not a code bug, but it's the single most important thing to understand before treating any "0% / not started" number elsewhere in the platform as broken.

In Admin → Learning Path Studio, DPS sheets are checked into the system in two states, `DRAFT` and `PUBLISHED`, and only `PUBLISHED` sheets are real, attemptable practice content. Sampling across the curriculum:

- **MM-L1** (Master Module Level 1, 30 lessons × 5 DPS = 150 total): Lesson 1 has 1 of 5 DPS published; Lessons 2 and 10 (sampled) have **0 of 5** published. At most a handful of MM-L1's 150 DPS sheets are live.
- **IM-L1** (Intermediate Module Level 1): Lesson 1 — **0 of 5** published.
- **IM-L4** (Intermediate Module Level 4): Lesson 1 — 2 of 5 published (better than the others, but still mostly draft).
- **YLM-L1** (Young Learners Level 1): Lesson 1 — **5 of 5 published**. Lesson 16 (the last one sampled) — **0 of 5** published. So YLM's publishing has progressed further than MM/IM, but even there it runs out partway through the level.

This lines up exactly with what every other page shows: the only students with any real practice history are the ones in early YLM lessons (Sakshi Agarwal, Tanaya Patra, Aarav Mukherjee, Shailesh Gupta), while every MM-L1 and IM student — 20+ students including Rohan Sen and all of Ashalatha Gupta's MM-L1 roster — sits at 0% not because of a tracking bug, but because there's essentially nothing published yet for them to complete. Confirmed via Admin's platform-wide Practice Control page: only **10 of 29 students** have any DPS assignment at all, and every one of the "0% progress" readiness cards elsewhere is consistent with this.

**Recommendation:** before doing any further QA or bug-fixing on practice-completion metrics, get a clear picture from whoever owns curriculum authoring of how far MM/IM publishing has actually progressed, and treat that as the real blocker — most of the "nothing is happening" signal on this platform is a content-rollout gap, not a software defect.

---

## New confirmed bugs from this round

### 9. Performance Reports (Admin) doesn't reset the Module/Level filter when you switch students — silently shows an all-zero report for the wrong module
In Admin → Performance Reports → Student History, the page loaded with **Shailesh Gupta (YLM)** selected by default. Switching the Student dropdown to **Rohan Sen (an MM-L1 student)** did *not* reset the Module filter — it stayed on "YLM - Young Learners Module." With that stale filter, Rohan Sen's report showed every stat at zero (0% progress, 0 DPS cleared, 0 attempts) with no warning that the module scope didn't match the student. Manually reselecting Module → MM immediately surfaced his real (still-zero, but *correctly* zero, and this time with the real "0 of 150 DPS" context) data. An admin comparing two students in different modules in quick succession would very plausibly draw a wrong conclusion ("this student has done literally nothing") from what's actually a stale-filter artifact. Should auto-reset Module/Level (or clearly flag the mismatch) whenever the selected student changes.

### 10. The "cleared DPS gets miscounted as re-attempt sheet" bug (round-1 finding #7) is confirmed platform-wide, not a one-off
Round 1 found this on Sakshi Agarwal's Assessment Readiness card (Teacher view). This round found the **identical pattern on a second, unrelated student under the other teacher**: Meera Chatterjee's (Smita Singh's student) readiness card headlines "1/150 cleared" and "CLEARED DPS: 1," while the sheet-level detail on the same page shows her only submitted DPS is actually marked `Needs Re-Attempt` (13% score), and the filter-chip counts on the same card read "Cleared (0) / Needs Re-Attempt (1)." Two independent students, two different teachers, same exact contradiction. This confirms the bug is in the shared readiness-summary component/calculation, not specific to one record — worth prioritizing since it's the most reproducible bug found across both rounds.

### 11. Teacher "Average Accuracy" dilution bug (round-1 finding #6) confirmed on both teacher accounts
Smita Singh's "My Students" page shows "Average Accuracy: 18%" for her 5 students. Same root cause as Ashalatha Gupta's "8%" in round 1: the calculation divides by all students (including the 2 who have zero completed attempts, counted as 0) rather than only students with actual accuracy data. The students who've actually attempted something average considerably higher (77%, 4%, 7% — genuinely mixed, but nowhere near an 18% "average" once the two no-data students are correctly excluded). Confirmed as a systemic pattern, not isolated. Notably, **Admin's own platform-wide Practice Control page computes this correctly** — its "Average Accuracy: 28%" for 10 assigned students divides only by the 10 who have assignments, matching a manual recalculation exactly. So the correct logic already exists in the codebase; the Teacher "My Students" page just isn't using it.

### 12. Transient wrong numbers observed once on Smita Singh's "My Students" page, not reproduced on reload
On first load after switching teacher accounts, the page briefly showed Meera Chatterjee at "4 assigned / 3 cleared / 1 pending / 4% accuracy" and Ishan Banerjee at "2 assigned / 1 cleared / 1 pending / 7% accuracy" — internally implausible combinations (cleared=3 with 4% average accuracy doesn't add up). A reload moments later showed the correct, self-consistent numbers (Meera: 1/0/1, Ishan: 1/0/1), which also matched the Practice Tracker exactly. This looks like a race condition where the table briefly renders before the teacher-scoped data fetch finishes — worth a look if support tickets ever mention "the numbers looked wrong for a second," but not re-confirmed as persistent, so treat this one as lower-confidence than the others.

---

## Correction to the round-1 report

**Round 1's finding #5 ("Teacher roster miscategorizes Anaisha Agrawal's DPS status") should be treated as a false positive, not a bug.** Re-examined this round with a clean-room comparison: the "My Students" page's "Pending" column consistently equals Practice Tracker's `Pending + Needs Re-Attempt` combined (verified on Anaisha Agrawal, and again on every student in Smita Singh's roster). That's a deliberate simplification — "My Students" shows one combined "still has outstanding work" number and flags the urgent ones separately via the "Needs Re-Attempt" tag in the Attention column, while Practice Tracker breaks the same total into two precise buckets. Different granularity, not conflicting data. Apologies for the noise on that one — flagging the correction explicitly rather than quietly dropping it.

---

## Everything else checked this round, and what it showed

- **Both teacher accounts' Assessment Tracker show 0 assigned assessments**, consistent with Admin's platform-wide Assessment Control (0). No assessments are assigned to any student on the platform right now — this seems to be an actual current-state fact (only one assessment blueprint, "IM L4," exists in Assessment Studio at all, and it hasn't been assigned to any real student yet), not a bug.
- **Teacher-to-student mapping (Users → Students → Teachers) is fully consistent**: 2 teachers (Ashalatha Gupta: 24 students, Smita Singh: 5 students) sum to the platform's 29 total students, matching the Student Directory exactly.
- **Competition Mock Studio has a substantial, populated library** (IM-L1/L3/L4 mocks, MM-L1 "Mock 1" through "Mock 10" plus 5 "Pre Mock" papers, all in `ASSIGNED` status) — nothing structurally wrong found here on inspection, though not every single mock paper's question content was individually opened.
- **Rohan Sen's mock exam numbers (8 assigned / 6 completed / 2 pending / 81% avg) are identical across three independent views**: his own student-side pages, Smita Singh's teacher-side Competition Mock Tracker, and Admin's platform-wide tracker. This is the strongest, cleanest cross-login consistency result of the whole audit — whatever else needs fixing, mock-exam data flows correctly end to end.
- **Assessment Studio only has one real blueprint** (IM L4, 84 questions, published, 8 sections) — already deep-checked in round 1 (division digit-pattern variety confirmed present, consistent with the fix already having landed).

---

## Updated priority list (combining both rounds)

Highest-impact items, roughly in order:

1. Get a real answer on MM/IM Learning Path publishing status — this is blocking real usage for the majority of enrolled students and isn't something QA can fix.
2. The Assessment Readiness "cleared" double-count (now confirmed on 2 students/2 teachers) — likely a small, well-isolated fix given how reproducible it is.
3. The student Assessments page hard error (round 1, finding #1) — nobody can view assessment status as a student right now.
4. The mock leaderboard's "0%/0 for everyone below top 3" (round 1, finding #2).
5. The Trophy Room badge-count-off-by-one (round 1, finding #3), which may be linked to finding #4 (the average-score mismatch) — worth investigating together, possibly an orphaned attempt record.
6. Teacher "Average Accuracy" dilution (now confirmed on both teacher accounts) — the correct calculation already exists in Admin's Practice Control page and could likely be reused.
7. Performance Reports' stale Module filter on student switch (new, this round).

Not urgent, but worth a look when convenient: the failed parent-report delivery, the ambiguous date format on "Last Activity," and the transient-numbers observation on Smita Singh's roster (finding #12 above).
