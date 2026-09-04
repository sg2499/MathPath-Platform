#!/usr/bin/env python3
"""
One-time backfill: correct historical DPS attempts scored wrong by the
save/submit race condition (2026-09-04, Shailesh -- see
attempt_service._lock_attempt_for_update()'s docstring for the full root
cause). Reported by a parent/teacher from an IM-L4 Lesson 5 DPS 3 attempt
where the review page showed the EXACT SAME text for "Student Answer" and
"Correct Answer" on multiple questions, yet those questions were scored
wrong -- the student should have scored 18/20 and was shown a lower score
instead. Confirmed as a real, systemic bug (not a math/formatting bug in
answers_match(), which was verified correct in isolation): save_answer()
(the 450ms-debounced typed-answer autosave) and submit_attempt() (grading)
are two independent HTTP requests that could genuinely race for the same
attempt with no locking between them, so a correct answer's write could
land in the database (visible on the review page) *after* grading had
already read a stale/incomplete snapshot and permanently recorded it wrong.
That race is now closed (row-level locking in both functions). This script
is the one-time retroactive half: find every historical attempt that was
shortchanged this way, across every module/level/lesson/DPS, and restore
the score the student actually earned.

Detection signature (deliberately narrow, so this can never mark a
genuinely wrong answer as correct): for every completed DPS attempt
(status SUBMITTED/AUTO_SUBMITTED), re-run the exact same grading function
production uses (attempt_service._GradeAttemptAnswers -- not a
reimplementation, the literal function submit_attempt() itself calls)
against each question's CURRENT, fully-saved AttemptAnswer.selected_value.
A question is flagged ONLY when that fresh recompute says correct
(answers_match() agrees the current stored text matches the question's
correct_answer) while the stored AttemptAnswer.is_correct is still False --
exactly the "answers match on screen but scored wrong" symptom from the
report, and the only direction this specific race can ever produce (a save
that lands late can only add a missing/updated correct answer to the DB
after grading ran off an older snapshot; grading itself always ran exactly
once per attempt, so there is no path that could make an already-correct
answer look wrong later). As a safety net this script ALSO checks for the
reverse (recompute says wrong, stored says correct) and, if it ever finds
one, never touches that question -- only reports it for manual review,
since automatically lowering a student's already-recorded score is not
something a backfill should ever decide on its own.

Scope: only the DPS Attempt/AttemptAnswer tables (backend/app/models/models.py's
Attempt, dps_id-scoped) -- the shared grading path every module/level/lesson/
DPS sheet goes through. Assessments (AssessmentAttempt) and mock exams
(CompetitionMockAttempt) are entirely separate models with their own
grading code, untouched by the save/submit race this backfill corrects, and
out of scope here.

What gets corrected, per affected attempt:
  - AttemptAnswer.is_correct / marks_awarded for each flagged question.
  - Attempt.correct_count / wrong_count / unanswered_count / attempted_count
    / total_score / max_score / accuracy_percentage -- recomputed from the
    corrected per-question results (never reimplemented; same aggregation
    submit_attempt() itself does).
  - Attempt.benchmark_status / cleared_at_attempt / requires_manual_intervention
    via the real attempt_chain_service.UpdateSubmittedAttemptBenchmarkState().
    If this flips a failing status to CLEARED, the run log calls it out
    explicitly (see FLIPPED BENCHMARK STATUS in the summary) -- a
    now-unnecessary auto-retry Assignment may already exist for that
    student from the original (wrong) grading. This script deliberately
    does NOT touch Assignment rows itself (a student may already be
    partway through that retry); it only surfaces the case so a human can
    decide what to do with it.
  - XP/coins, ONLY for attempts where gamification_processed_at shows an
    award already happened at the original (lower, wrong) accuracy:
    the original award is read back from EconomyTransaction's immutable
    ledger (source_action="DPS_COMPLETION", reference_id=attempt.id), the
    correct award is computed via the real, pure
    EconomyService.compute_activity_reward() at the corrected accuracy, and
    only the (always non-negative) DIFFERENCE is paid via the real
    EconomyService.award_xp_and_coins(), tagged
    source_action="DPS_COMPLETION_CORRECTION" so the ledger stays a
    complete, auditable history rather than rewriting the original entry.
    This can never claw back XP/coins a student already has -- the race can
    only ever have under-counted a correct answer, never over-counted one,
    so every corrected accuracy is >= the original.

What this script deliberately does NOT do (do these as separate, already-
established steps, in this order, after this script's --apply finishes):
  1. Re-run backfill_dps_badges.py --apply -- DPS badges are cumulative,
     order-dependent counters (streaks, "previous attempt" comparisons,
     week-epoch guards); re-evaluating a single corrected attempt in
     isolation would double-count against stats already advanced by its
     first (unaffected) evaluation. That script's own wipe-and-replay of
     every DPS-scoped stat/badge from the full (now-corrected) attempt
     history in chronological order is the only safe way to reconcile
     badges, and it's already built, tested, and idempotent -- no need to
     duplicate it here.
  2. Re-run backfill_practice_dps_economy.py --apply -- covers attempts
     that never got an economy award at all (gamification_processed_at
     IS NULL), a separate historical gap from the one this script closes.
     Running it after this script is safe and will naturally use each
     attempt's now-corrected accuracy.

Safe by design:
  - Read-only detection query, never mutates anything unless --apply.
  - Never downgrades a score -- see the "safety net" paragraph above.
  - Re-running --apply is idempotent: a question already corrected has
    stored is_correct=True, so the detection signature (recompute True,
    stored False) no longer matches it on a second pass.
  - Economy correction is strictly additive (a new ledger entry, never an
    edit to an existing one) and only ever pays a non-negative delta.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_dps_attempt_regrade.py --dry-run
    python scripts/backfill_dps_attempt_regrade.py --apply

--dry-run is the default if neither flag is passed. ALWAYS run --dry-run
first and read the summary before --apply -- see db_backup.py for taking a
database backup first if you want one on hand regardless (this script's own
corrections are additive/idempotent as described above, so a backup is a
belt-and-suspenders precaution, not a requirement for safety).
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    Attempt,
    AttemptAnswer,
    EconomyTransaction,
    Student,
    User,
)
from app.services.attempt_chain_service import (  # noqa: E402
    BENCHMARK_STATUS_CLEARED,
    UpdateSubmittedAttemptBenchmarkState,
)
from app.services.attempt_service import BENCHMARK_PERCENTAGE, _GradeAttemptAnswers  # noqa: E402
from app.services.economy_service import EconomyService  # noqa: E402

# Force every print() to flush immediately -- same reasoning as the other
# backfill scripts in this directory (Windows terminal stdout buffering made
# a prior script look hung mid-run).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


COMPLETED_STATUSES = ("SUBMITTED", "AUTO_SUBMITTED")


def _decide_corrections(attempt: Attempt, answers_by_question: dict, grading: dict):
    """Compares the fresh recompute (grading) against what's currently
    stored on each AttemptAnswer, and decides, per question, whether it's
    an upgrade (apply), unchanged (leave alone), or a review-only downgrade
    candidate (never applied). Returns (upgrades, review_flags, decided_totals)
    where decided_totals is the full corrected Attempt aggregate, computed
    from upgrades-applied-on-top-of-stored -- i.e. never silently trusting
    a fresh recompute for a question this function has decided not to touch.
    """
    upgrades = []  # list of (question_id, AttemptAnswer, new_is_correct, new_marks)
    review_flags = []  # list of (question_id, recompute_is_correct, stored_is_correct)

    correct_count = wrong_count = unanswered_count = 0
    total_score = 0.0

    for question_id, result in grading["per_question"].items():
        ans = answers_by_question.get(question_id)
        stored_is_correct = bool(ans.is_correct) if ans is not None else False
        stored_marks = float(ans.marks_awarded or 0) if ans is not None else 0.0
        recompute_is_correct = result["is_correct"]
        has_answer = result["has_answer_row"]

        if not has_answer:
            # Genuinely never saved -- unaffected by the race either way.
            unanswered_count += 1
            continue

        if recompute_is_correct and not stored_is_correct:
            # The exact race signature: apply the correction.
            upgrades.append((question_id, ans, True, result["marks_awarded"]))
            correct_count += 1
            total_score += result["marks_awarded"]
        elif (not recompute_is_correct) and stored_is_correct:
            # Never auto-downgrade -- flag for a human instead, keep the
            # stored (more favorable to the student) result as-is.
            review_flags.append((question_id, recompute_is_correct, stored_is_correct))
            correct_count += 1
            total_score += stored_marks
        else:
            # Recompute agrees with what's stored -- no change needed.
            if stored_is_correct:
                correct_count += 1
                total_score += stored_marks
            else:
                wrong_count += 1

    max_score = grading["max_score"]
    decided_totals = {
        "correct_count": correct_count,
        "wrong_count": wrong_count,
        "unanswered_count": unanswered_count,
        "attempted_count": correct_count + wrong_count,
        "total_score": total_score,
        "max_score": max_score,
        "accuracy_percentage": round((total_score / max_score) * 100) if max_score else 0,
    }
    return upgrades, review_flags, decided_totals


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write corrections. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"DPS ATTEMPT REGRADE BACKFILL -- mode: {'APPLY (writing corrections)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        attempts = (
            db.query(Attempt)
            .filter(Attempt.dps_id.isnot(None), Attempt.status.in_(COMPLETED_STATUSES))
            .order_by(Attempt.student_id.asc(), Attempt.submitted_at.asc())
            .all()
        )
        print(f"Scanning {len(attempts)} completed DPS attempt(s) across every module/level/lesson/DPS...")

        scanned = 0
        attempts_affected = 0
        questions_corrected = 0
        review_only_attempts = 0
        benchmark_flips_to_cleared = 0
        economy_corrected_attempts = 0
        total_delta_xp = 0
        total_delta_coins = 0

        for attempt in attempts:
            scanned += 1
            answers_by_question = {
                a.question_id: a
                for a in db.query(AttemptAnswer).filter(AttemptAnswer.attempt_id == attempt.id).all()
            }
            grading = _GradeAttemptAnswers(db, attempt)
            upgrades, review_flags, decided = _decide_corrections(attempt, answers_by_question, grading)

            if review_flags:
                review_only_attempts += 1
                student = db.get(Student, attempt.student_id)
                student_user = db.get(User, student.user_id) if student else None
                label = student_user.full_name if student_user else attempt.student_id
                print(f"  [REVIEW NEEDED, NOT TOUCHED] {label} / attempt {attempt.id}: "
                      f"{len(review_flags)} question(s) where the current saved answer no longer "
                      f"matches an already-correct grade -- left exactly as stored.")

            if not upgrades:
                continue

            attempts_affected += 1
            questions_corrected += len(upgrades)
            student = db.get(Student, attempt.student_id)
            student_user = db.get(User, student.user_id) if student else None
            label = student_user.full_name if student_user else attempt.student_id

            old_accuracy = float(attempt.accuracy_percentage or 0)
            old_benchmark_status = attempt.benchmark_status
            new_accuracy = decided["accuracy_percentage"]

            print(f"  [AFFECTED] {label} / attempt {attempt.id}: {len(upgrades)} question(s) were "
                  f"correctly answered but scored wrong -- score {old_accuracy}% -> {new_accuracy}% "
                  f"({decided['total_score']}/{decided['max_score']} marks, was "
                  f"{attempt.total_score}/{attempt.max_score})")

            if not apply:
                if old_benchmark_status != BENCHMARK_STATUS_CLEARED and new_accuracy >= BENCHMARK_PERCENTAGE:
                    benchmark_flips_to_cleared += 1
                    print(f"    -> would flip benchmark_status {old_benchmark_status} -> CLEARED "
                          f"(check for a now-unnecessary auto-retry assignment)")
                if attempt.gamification_processed_at is not None:
                    original_tx = (
                        db.query(EconomyTransaction)
                        .filter(EconomyTransaction.reference_id == attempt.id, EconomyTransaction.source_action == "DPS_COMPLETION")
                        .all()
                    )
                    original_xp = sum(t.amount_xp for t in original_tx)
                    original_coins = sum(t.amount_coins for t in original_tx)
                    corrected_reward = EconomyService.compute_activity_reward(
                        accuracy_percent=new_accuracy,
                        activity_type="DPS",
                        duration_seconds=attempt.duration_seconds,
                        time_taken_seconds=attempt.time_taken_seconds,
                        punctuality_status=attempt.punctuality_status or "NOT_SCHEDULED",
                    )
                    delta_xp = max(0, corrected_reward["awarded_xp"] - original_xp)
                    delta_coins = max(0, corrected_reward["awarded_coins"] - original_coins)
                    if delta_xp or delta_coins:
                        print(f"    -> would top up economy: +{delta_xp} XP, +{delta_coins} coins "
                              f"(originally awarded {original_xp} XP / {original_coins} coins)")
                continue

            # --- apply mode: write the corrections for real ---
            for question_id, ans, new_is_correct, new_marks in upgrades:
                ans.is_correct = new_is_correct
                ans.marks_awarded = new_marks

            attempt.correct_count = decided["correct_count"]
            attempt.wrong_count = decided["wrong_count"]
            attempt.unanswered_count = decided["unanswered_count"]
            attempt.attempted_count = decided["attempted_count"]
            attempt.total_score = decided["total_score"]
            attempt.max_score = decided["max_score"]
            attempt.accuracy_percentage = decided["accuracy_percentage"]
            UpdateSubmittedAttemptBenchmarkState(attempt, BENCHMARK_PERCENTAGE)
            db.commit()
            db.refresh(attempt)

            if old_benchmark_status != BENCHMARK_STATUS_CLEARED and attempt.benchmark_status == BENCHMARK_STATUS_CLEARED:
                benchmark_flips_to_cleared += 1
                print(f"    -> benchmark_status flipped {old_benchmark_status} -> CLEARED "
                      f"(check for a now-unnecessary auto-retry assignment for this student)")

            if attempt.gamification_processed_at is not None and student_user is not None:
                original_tx = (
                    db.query(EconomyTransaction)
                    .filter(EconomyTransaction.reference_id == attempt.id, EconomyTransaction.source_action == "DPS_COMPLETION")
                    .all()
                )
                original_xp = sum(t.amount_xp for t in original_tx)
                original_coins = sum(t.amount_coins for t in original_tx)
                if not original_tx:
                    print(f"    -> gamification_processed_at is set but no DPS_COMPLETION ledger entry was "
                          f"found for this attempt -- skipping economy correction (can't safely determine "
                          f"the original award).")
                else:
                    corrected_reward = EconomyService.compute_activity_reward(
                        accuracy_percent=attempt.accuracy_percentage,
                        activity_type="DPS",
                        duration_seconds=attempt.duration_seconds,
                        time_taken_seconds=attempt.time_taken_seconds,
                        punctuality_status=attempt.punctuality_status or "NOT_SCHEDULED",
                    )
                    delta_xp = max(0, corrected_reward["awarded_xp"] - original_xp)
                    delta_coins = max(0, corrected_reward["awarded_coins"] - original_coins)
                    if delta_xp or delta_coins:
                        EconomyService.award_xp_and_coins(
                            db, student_user.id, delta_xp, delta_coins,
                            source_action="DPS_COMPLETION_CORRECTION", reference_id=attempt.id,
                        )
                        economy_corrected_attempts += 1
                        total_delta_xp += delta_xp
                        total_delta_coins += delta_coins
                        print(f"    -> topped up economy: +{delta_xp} XP, +{delta_coins} coins "
                              f"(originally awarded {original_xp} XP / {original_coins} coins)")

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"Attempts scanned:                        {scanned}")
        print(f"Attempts affected by the race bug:        {attempts_affected}")
        print(f"Questions corrected (wrong -> correct):   {questions_corrected}")
        print(f"Attempts flagged for manual review only:  {review_only_attempts}")
        print(f"Benchmark status flipped to CLEARED:      {benchmark_flips_to_cleared}")
        if apply:
            print(f"Attempts with economy top-up applied:     {economy_corrected_attempts}")
            print(f"Total XP topped up:                       {total_delta_xp}")
            print(f"Total coins topped up:                    {total_delta_coins}")
            print("\nNext steps: re-run backfill_dps_badges.py --apply, then "
                  "backfill_practice_dps_economy.py --apply (see this script's own "
                  "docstring for why, and why the order matters).")
        else:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
