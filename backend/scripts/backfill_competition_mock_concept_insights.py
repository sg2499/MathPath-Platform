#!/usr/bin/env python3
"""
One-time, platform-wide backfill for the competition-mock Strengths/Weak
Areas + concept-fragmentation bug (2026-07-19, Shailesh).

Background: CompetitionMockResultSummary.concept_strengths_json,
concept_weaknesses_json, and concept_performance_json are computed once in
SubmitCompetitionMockAttempt() (competition_mock_attempt_service.py) at the
moment a student submits, then persisted -- they are not recalculated on
every read. Two real bugs were found and fixed in that function's source:

  1. Threshold dead zone: strengths required >=75% and weaknesses required
     <60%, while every UI label ("Strengths >= 70% Accuracy" / "Areas to
     Improve < 70% Accuracy") advertises a single 70% cutoff. A concept or
     section scoring 60-74% fell into neither list -- invisible on the
     admin, teacher, AND student result pages, and silently missing from
     the "Focus Next" coaching message.
  2. Synthetic/verbose concept names: a handful of competition-only
     sub-generators tag their questions with an internal, verbose label
     instead of the one real concept name a student would recognize from
     regular DPS practice -- e.g. "BODMAS Competition Challenge" and "BODMAS
     Square Root Decimal Percentage Challenge" are both just BODMAS
     underneath; there's no such thing as two different "BODMAS" concepts in
     the curriculum. _canonical_competition_concept_name() maps that small,
     confirmed set of synthetic labels back to the one real concept name.
     Every other concept_tag (digit-pattern multiplication/division
     variants, Add/Less variants, Squares, Cubes, Percentage, etc.) is
     already a real, individually distinct DPS-recognized concept and is
     left alone -- concepts are grouped at that individual level, not rolled
     up into a broader section, so a student can see exactly which specific
     concept they're weak in without reviewing every question.

Both are fixed going forward in SubmitCompetitionMockAttempt(). This script
recomputes concept_performance_json / concept_strengths_json /
concept_weaknesses_json for every EXISTING CompetitionMockResultSummary row
using the corrected logic, so mocks completed before this fix show accurate
data too -- across all three logins, since admin/teacher/student all read
from the same stored summary (directly, or via the per-attempt result page's
fresh recompute, which self-heals immediately without this script; this
script's job is specifically the STORED json used by the Mock Performance
Insights / Mock Tracker aggregate views).

Safe by design:
  - Read-only until --apply is passed; --dry-run (or no flag) only prints
    what would change.
  - Recomputes from the attempt's actual persisted questions + answers, the
    same source of truth SubmitCompetitionMockAttempt() itself uses -- never
    invents data.
  - Idempotent: re-running --apply after it already ran is a no-op (the
    recomputed values will already match what's stored).
  - Only touches concept_performance_json / concept_strengths_json /
    concept_weaknesses_json on CompetitionMockResultSummary. Does not touch
    score, percentage, correct/wrong counts, or any gamification data.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_competition_mock_concept_insights.py --dry-run   # preview only
    python scripts/backfill_competition_mock_concept_insights.py --apply     # actually writes

--dry-run is the default if neither flag is passed.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    CompetitionMockAttempt,
    CompetitionMockAttemptAnswer,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    CompetitionMockResultSummary,
)
from app.services.competition_mock_attempt_service import _canonical_competition_concept_name  # noqa: E402

STRENGTH_CUTOFF = 70


def _recompute_concept_data(db, attempt_id: str) -> tuple[list[dict], list[dict], list[dict]] | None:
    """Mirrors the concept_totals loop in SubmitCompetitionMockAttempt(),
    using the corrected section-title grouping and 70% cutoff. Returns
    (concept_performance, strengths, weaknesses), or None if the attempt's
    questions can no longer be found (defensive; should not happen for a
    completed attempt with a result summary).
    """
    questions = (
        db.query(CompetitionMockQuestion)
        .filter(CompetitionMockQuestion.mock_exam_id == (
            db.query(CompetitionMockAttempt.mock_exam_id)
            .filter(CompetitionMockAttempt.id == attempt_id)
            .scalar()
        ))
        .order_by(CompetitionMockQuestion.question_number.asc())
        .all()
    )
    if not questions:
        return None

    answers = {
        answer.mock_question_id: answer
        for answer in db.query(CompetitionMockAttemptAnswer)
        .filter(CompetitionMockAttemptAnswer.mock_attempt_id == attempt_id)
        .all()
    }
    option_by_id = {
        option.id: option
        for option in db.query(CompetitionMockQuestionOption)
        .filter(CompetitionMockQuestionOption.mock_question_id.in_([q.id for q in questions]))
        .all()
    }

    concept_totals: dict[str, dict[str, int]] = {}
    for question in questions:
        concept_key = _canonical_competition_concept_name(question)
        stats = concept_totals.setdefault(concept_key, {"correct": 0, "total": 0})
        stats["total"] += 1
        answer = answers.get(question.id)
        if not answer or not answer.selected_option_id:
            continue
        option = option_by_id.get(answer.selected_option_id)
        if option and option.is_correct:
            stats["correct"] += 1

    concept_performance: list[dict] = []
    strengths: list[dict] = []
    weaknesses: list[dict] = []
    for concept, stats in concept_totals.items():
        total = int(stats["total"])
        correct = int(stats["correct"])
        percentage = round((correct / total) * 100) if total else 0.0
        payload = {"concept": concept, "correct": correct, "total": total, "percentage": percentage}
        concept_performance.append(payload)
        if percentage >= STRENGTH_CUTOFF:
            strengths.append(payload)
        else:
            weaknesses.append(payload)

    return concept_performance, strengths, weaknesses


def backfill(db, apply: bool) -> dict:
    stats = {"summaries_scanned": 0, "summaries_changed": 0, "summaries_skipped_no_questions": 0}

    summaries = db.query(CompetitionMockResultSummary).order_by(CompetitionMockResultSummary.id.asc()).all()
    for summary in summaries:
        stats["summaries_scanned"] += 1
        recomputed = _recompute_concept_data(db, summary.mock_attempt_id)
        if recomputed is None:
            stats["summaries_skipped_no_questions"] += 1
            continue
        concept_performance, strengths, weaknesses = recomputed

        new_performance_json = json.dumps(concept_performance)
        new_strengths_json = json.dumps(strengths)
        new_weaknesses_json = json.dumps(weaknesses)

        changed = (
            (summary.concept_performance_json or "") != new_performance_json
            or (summary.concept_strengths_json or "") != new_strengths_json
            or (summary.concept_weaknesses_json or "") != new_weaknesses_json
        )
        if not changed:
            continue

        stats["summaries_changed"] += 1
        print(
            f"  [summary {summary.id}] attempt {summary.mock_attempt_id}: "
            f"{'would update' if not apply else 'updating'} "
            f"{len(concept_performance)} concept(s), "
            f"{len(strengths)} strength(s), {len(weaknesses)} weak area(s)"
        )
        if apply:
            summary.concept_performance_json = new_performance_json
            summary.concept_strengths_json = new_strengths_json
            summary.concept_weaknesses_json = new_weaknesses_json

    if apply:
        db.commit()

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()

    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"COMPETITION MOCK CONCEPT INSIGHTS BACKFILL -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        stats = backfill(db, apply=apply)

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"Result summaries scanned:               {stats['summaries_scanned']}")
        print(f"Result summaries {'updated' if apply else 'that would be updated'}:{'':<10}{stats['summaries_changed']}")
        print(f"Skipped (questions no longer found):    {stats['summaries_skipped_no_questions']}")

        if not apply:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
