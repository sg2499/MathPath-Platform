#!/usr/bin/env python3
"""
Read-only diagnostic for the 2026-07-19 backfill script reporting
"Skipped (questions no longer found): 13" for all 13 result summaries.

Prints, for every CompetitionMockResultSummary row, its mock_attempt_id,
the attempt's own mock_exam_id, whether that CompetitionMockExam row still
exists, and how many CompetitionMockQuestion rows currently exist for that
mock_exam_id -- to pin down exactly why the backfill can't find questions
for any of them (deleted exam? orphaned attempt? something else?).

Usage (from backend/, same DATABASE_URL as the live backend):
    python scripts/diagnose_backfill_skip.py
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    CompetitionMockAttempt,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockResultSummary,
)


def main() -> None:
    db = SessionLocal()
    try:
        summaries = db.query(CompetitionMockResultSummary).order_by(CompetitionMockResultSummary.id.asc()).all()
        print(f"Found {len(summaries)} CompetitionMockResultSummary rows.\n")

        for summary in summaries:
            attempt = db.get(CompetitionMockAttempt, summary.mock_attempt_id)
            if attempt is None:
                print(
                    f"[summary {summary.id}] mock_attempt_id={summary.mock_attempt_id!r} "
                    f"-- ATTEMPT ROW ITSELF IS MISSING"
                )
                continue

            exam_id = attempt.mock_exam_id
            exam = db.get(CompetitionMockExam, exam_id) if exam_id else None
            question_count = (
                db.query(CompetitionMockQuestion)
                .filter(CompetitionMockQuestion.mock_exam_id == exam_id)
                .count()
                if exam_id
                else 0
            )

            print(
                f"[summary {summary.id}] attempt={attempt.id} "
                f"attempt.mock_exam_id={exam_id!r} "
                f"exam_row_exists={exam is not None} "
                f"exam.title={(exam.title if exam else None)!r} "
                f"exam.is_active={(exam.is_active if exam else None)!r} "
                f"questions_for_this_exam_id={question_count} "
                f"summary.mock_exam_id={summary.mock_exam_id!r} "
                f"(matches attempt? {summary.mock_exam_id == exam_id})"
            )
    finally:
        db.close()


if __name__ == "__main__":
    main()
