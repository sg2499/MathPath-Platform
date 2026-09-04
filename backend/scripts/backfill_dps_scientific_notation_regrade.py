#!/usr/bin/env python3
"""
One-time backfill for the scientific-notation correct_answer bug
(2026-09-04, Shailesh). This is a SEPARATE, unrelated bug from the one
backfill_dps_attempt_regrade.py corrects (that one was a save/submit race
condition; its own production dry-run found ZERO affected attempts, which
correctly prompted a deeper investigation instead of concluding no bug
existed).

Root cause (confirmed via a targeted diagnostic against the exact reported
attempt, bfde3bb5-b9da-425d-b214-fc7366f1c7b4, IM-L4 Lesson 5 DPS 3):
_Display() in app/question_engine/im/generator.py (and the byte-identical
copy in app/question_engine/mm/generator.py) converted a small-magnitude
Decimal answer to a Python float before storage. Python's default
str(float) switches to exponential notation for magnitudes below 1e-4
(e.g. "1.61e-05" instead of "0.0000161"), and answers_match() (see
app/services/answer_matching.py) deliberately rejects exponential notation
typed by a student -- entirely correctly, as a safety net -- so a
correct_answer stored that way could never be graded correct by ANY value
a student typed, no matter how many times they retyped the exact right
number. The result page's display formatter then cosmetically re-rendered
both the student's plain-decimal answer and the corrupted correct_answer
into the same plain-decimal string, which is exactly why the review page
showed "identical text, scored wrong".

This affects the "Answer Position" concept family in IM and MM specifically
(the only generators that route a correct_answer through this buggy
_Display()) -- confirmed via code review that every other module
(PM/PM_L2/PM_L3/PM_L4/YLM/BM) computes correct_answer without a float
conversion step and is not affected.

The forward fix (already shipped in this same change) is
app/question_engine/number_format.PlainNumberString(), used at every
generation-time persistence site so this can never happen again. THIS
SCRIPT is the one-time retroactive half: repair existing corrupted
correct_answer/option_value TEXT already sitting in the database, and
re-grade every historical DPS attempt that was scored wrong because of it.

Two-phase design:

  PHASE 1 -- repair corrupted stored text (all question tables). A row is
  "corrupted" iff its correct_answer/option_value text does NOT parse as a
  plain number (answer_matching.is_complete_plain_number says False) but
  DOES match exponential-notation shape (e.g. "1.61e-05", "-2.3E+4") and
  therefore parses as a Decimal. Repair is a pure reformat via
  PlainNumberString -- the exact same function the forward fix uses -- so
  the underlying numeric value can never change, only its text form. This
  runs across every question table in the schema, not just DPS:
    - generated_questions / question_options (DPS -- the only place a
      corrupted correct_answer could ever cause a WRONG SCORE, since DPS
      grading is typed-answer text matching via answers_match()).
    - assessment_questions / assessment_question_options and
      competition_mock_questions / competition_mock_question_options
      (assessments and competition mocks -- these are multiple-choice;
      grading there compares AssessmentQuestionOption.is_correct /
      CompetitionMockQuestionOption.is_correct, a boolean flag set at
      generation time from which option was designated correct, NOT a text
      comparison -- see assessment_engine_service.py line ~2837:
      `Answer.is_correct = bool(Option.is_correct)`. So a corrupted option
      TEXT there is a display/legibility bug only (a student could see
      "1.61e-05" as a multiple-choice label) -- it never caused a wrong
      score. Repaired here anyway for data hygiene and because a future
      change to assessment grading should never inherit corrupted data.

  PHASE 2 -- re-grade DPS attempts (the only tables where PHASE 1 can
  change a stored score). Mirrors backfill_dps_attempt_regrade.py's own
  detection/correction/economy-top-up logic exactly (same
  attempt_service._GradeAttemptAnswers, same upgrade-only / never-auto-
  downgrade decision rule, same benchmark-state and economy-ledger
  handling) -- re-running that exact machinery is correct and safe here
  too, now that PHASE 1 has made the underlying correct_answer text
  readable by answers_match() for the first time. A question is corrected
  ONLY when the fresh recompute says correct while the stored is_correct is
  still False; the reverse is only ever flagged for manual review, never
  auto-applied.

Scope note: PHASE 2 only ever touches DPS Attempt/AttemptAnswer. Assessment
and competition-mock attempts are untouched (and, per the analysis above,
do not need correction -- their grading was never wrong).

Safe by design:
  - Read-only detection/repair unless --apply.
  - PHASE 1 is a lossless text reformat of the SAME value (verified: the
    repaired text always Decimal-equals the original) -- it can never
    change what a question's correct answer IS, only how it is spelled.
  - PHASE 2 never downgrades a stored score -- see backfill_dps_attempt_
    regrade.py's own docstring for the full safety argument, unchanged
    here.
  - Idempotent: a second --apply run finds nothing left to repair or
    upgrade.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_dps_scientific_notation_regrade.py --dry-run
    python scripts/backfill_dps_scientific_notation_regrade.py --apply

--dry-run is the default if neither flag is passed. ALWAYS run --dry-run
first and read the summary before --apply.
"""
from __future__ import annotations

import argparse
import re
import sys
from decimal import Decimal, InvalidOperation
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    AssessmentQuestion,
    AssessmentQuestionOption,
    Attempt,
    AttemptAnswer,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    EconomyTransaction,
    GeneratedQuestion,
    QuestionOption,
    Student,
    User,
)
from app.services.answer_matching import is_complete_plain_number  # noqa: E402
from app.services.attempt_chain_service import (  # noqa: E402
    BENCHMARK_STATUS_CLEARED,
    UpdateSubmittedAttemptBenchmarkState,
)
from app.services.attempt_service import BENCHMARK_PERCENTAGE, _GradeAttemptAnswers  # noqa: E402
from app.services.economy_service import EconomyService  # noqa: E402
from app.question_engine.number_format import PlainNumberString  # noqa: E402

# Force every print() to flush immediately -- same reasoning as the other
# backfill scripts in this directory (Windows terminal stdout buffering made
# a prior script look hung mid-run).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


COMPLETED_STATUSES = ("SUBMITTED", "AUTO_SUBMITTED")

# Deliberately narrower than "contains e/E": must actually be
# digits-dot-digits-e-sign-digits shape, so this can never misfire on some
# unrelated non-numeric text that merely contains the letter e/E.
_EXPONENTIAL_NOTATION_RE = re.compile(r"^-?\d+(\.\d+)?[eE][+-]?\d+$")


def _is_corrupted_scientific_notation(text) -> bool:
    if text is None:
        return False
    candidate = str(text).strip()
    if not candidate or not _EXPONENTIAL_NOTATION_RE.match(candidate):
        return False
    if is_complete_plain_number(candidate):
        return False  # already plain, nothing to do (defensive, shouldn't happen given the regex above)
    try:
        Decimal(candidate)
    except (InvalidOperation, ValueError):
        return False
    return True


def _repair_text_column(db, model, column_name: str) -> list[tuple[str, str, str]]:
    """Scans every row of model for a corrupted value in column_name and
    edits the in-memory ORM object either way (the caller flushes but only
    commits when --apply is set -- see main()'s rollback-if-dry-run at the
    end, and _phase1_repair_question_text's own flush call, which is what
    lets PHASE 2's regrade see the corrected text even during a dry run,
    without ever risking a permanent write). Returns [(row_id, old_text,
    new_text), ...] for every row found corrupted."""
    column = getattr(model, column_name)
    found: list[tuple[str, str, str]] = []
    rows = db.query(model).filter(column.isnot(None)).all()
    for row in rows:
        old_text = getattr(row, column_name)
        if not _is_corrupted_scientific_notation(old_text):
            continue
        new_text = PlainNumberString(old_text)
        assert Decimal(new_text) == Decimal(old_text), (
            f"PlainNumberString changed the numeric value of {model.__name__}.{column_name} "
            f"row {row.id}: {old_text!r} -> {new_text!r} -- refusing to apply, this must never happen"
        )
        found.append((row.id, old_text, new_text))
        setattr(row, column_name, new_text)
    return found


def _decide_corrections(attempt: Attempt, answers_by_question: dict, grading: dict):
    """Identical decision rule to backfill_dps_attempt_regrade.py's own
    _decide_corrections -- deliberately duplicated rather than imported
    (these one-time scripts are each self-contained by convention in this
    repo) so this script has no fragile coupling to another script's
    internals. See that script's docstring for the full safety argument."""
    upgrades = []
    review_flags = []

    correct_count = wrong_count = unanswered_count = 0
    total_score = 0.0

    for question_id, result in grading["per_question"].items():
        ans = answers_by_question.get(question_id)
        stored_is_correct = bool(ans.is_correct) if ans is not None else False
        stored_marks = float(ans.marks_awarded or 0) if ans is not None else 0.0
        recompute_is_correct = result["is_correct"]
        has_answer = result["has_answer_row"]

        if not has_answer:
            unanswered_count += 1
            continue

        if recompute_is_correct and not stored_is_correct:
            upgrades.append((question_id, ans, True, result["marks_awarded"]))
            correct_count += 1
            total_score += result["marks_awarded"]
        elif (not recompute_is_correct) and stored_is_correct:
            review_flags.append((question_id, recompute_is_correct, stored_is_correct))
            correct_count += 1
            total_score += stored_marks
        else:
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


def _phase1_repair_question_text(db, apply: bool) -> dict:
    targets = [
        (GeneratedQuestion, "correct_answer", "DPS question"),
        (QuestionOption, "option_value", "DPS question option"),
        (AssessmentQuestion, "correct_answer", "assessment question"),
        (AssessmentQuestionOption, "option_value", "assessment question option"),
        (CompetitionMockQuestion, "correct_answer", "competition mock question"),
        (CompetitionMockQuestionOption, "option_value", "competition mock question option"),
    ]
    summary = {}
    print("-" * 88)
    print("PHASE 1: repairing corrupted scientific-notation text across every question table")
    print("-" * 88)
    for model, column_name, label in targets:
        found = _repair_text_column(db, model, column_name)
        summary[(model.__name__, column_name)] = found
        print(f"  {label} ({model.__tablename__}.{column_name}): {len(found)} corrupted row(s) found")
        for row_id, old_text, new_text in found[:10]:
            print(f"    {row_id}: {old_text!r} -> {new_text!r}")
        if len(found) > 10:
            print(f"    ... and {len(found) - 10} more")
    # Flush (not commit) unconditionally: this makes the corrected text
    # visible to PHASE 2's queries within this same transaction/session --
    # including during a dry run, so the preview is accurate -- without
    # writing anything permanent. main() rolls the whole transaction back
    # at the end when --apply was not given.
    db.flush()
    if apply:
        db.commit()
        print("PHASE 1 complete: corrections committed.")
    else:
        print("PHASE 1 complete (dry run): nothing written (changes flushed in-transaction "
              "only, so PHASE 2 below can preview accurately; rolled back before exit).")
    return summary


def _phase2_regrade_dps_attempts(db, apply: bool, any_dps_question_repaired: bool) -> None:
    print("\n" + "-" * 88)
    print("PHASE 2: re-grading DPS attempts against the repaired correct_answer text")
    print("-" * 88)
    if not any_dps_question_repaired:
        print("No DPS question's correct_answer needed repair -- nothing to re-grade. Skipping.")
        return

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
    print("PHASE 2 SUMMARY")
    print("=" * 88)
    print(f"Attempts scanned:                        {scanned}")
    print(f"Attempts affected by the bug:             {attempts_affected}")
    print(f"Questions corrected (wrong -> correct):   {questions_corrected}")
    print(f"Attempts flagged for manual review only:  {review_only_attempts}")
    print(f"Benchmark status flipped to CLEARED:      {benchmark_flips_to_cleared}")
    if apply:
        print(f"Attempts with economy top-up applied:     {economy_corrected_attempts}")
        print(f"Total XP topped up:                       {total_delta_xp}")
        print(f"Total coins topped up:                    {total_delta_coins}")
        print("\nNext steps: re-run backfill_dps_badges.py --apply, then "
              "backfill_practice_dps_economy.py --apply (same reasoning as "
              "backfill_dps_attempt_regrade.py's own docstring).")
    else:
        print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write corrections. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"DPS SCIENTIFIC-NOTATION ANSWER REGRADE BACKFILL -- mode: "
          f"{'APPLY (writing corrections)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        phase1_summary = _phase1_repair_question_text(db, apply)
        any_dps_question_repaired = bool(phase1_summary.get((GeneratedQuestion.__name__, "correct_answer")))
        _phase2_regrade_dps_attempts(db, apply, any_dps_question_repaired)
        if not apply:
            # Discard the in-transaction-only PHASE 1 edits that were
            # flushed (but never committed) so PHASE 2 could preview
            # accurately. Nothing from this run is permanent.
            db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    main()
