#!/usr/bin/env python3
"""
One-time backfill: award XP and coins for historical assessment attempts
that completed before the economy system covered assessments at all.

Same background and rationale as backfill_practice_dps_economy.py -- see
that script's docstring for the full history. This is the assessment
equivalent, calling assessment_engine_service._ProcessAssessmentGamificationSideEffects
(the real production function) for every completed assessment attempt with
gamification_processed_at = NULL.

Safe by design: same three guarantees as backfill_practice_dps_economy.py
-- calls the real production function, is atomically claimed per-attempt
(safe to run concurrently with live traffic and safe to re-run), and is
independent of the notification backfill already run for these same
attempts.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_assessment_economy.py --dry-run
    python scripts/backfill_assessment_economy.py --apply

--dry-run is the default if neither flag is passed.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.models.models import AssessmentAttempt, Student, User  # noqa: E402

# Force every print() to flush immediately -- see backfill_mock_gamification.py
# for why (Windows terminal stdout buffering made a prior script look hung).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "CLEARED", "NEEDS_RE_ATTEMPT"}


def _gamification_processed_at_column_exists() -> bool:
    inspector = inspect(engine)
    if "assessment_attempts" not in inspector.get_table_names():
        return False
    columns = {c["name"] for c in inspector.get_columns("assessment_attempts")}
    return "gamification_processed_at" in columns


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    if apply and not _gamification_processed_at_column_exists():
        print("!! Cannot run --apply yet: assessment_attempts.gamification_processed_at doesn't exist on")
        print("   this database, which means the code+migration for this fix hasn't been deployed here yet.")
        print("   Deliver the backend changes first, then re-run --apply.")
        print("   (--dry-run still works fine without it, if you just want a preview.)")
        sys.exit(1)

    print("=" * 88)
    print(f"ASSESSMENT ECONOMY BACKFILL -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        query = db.query(AssessmentAttempt).filter(AssessmentAttempt.status.in_(COMPLETED_STATUSES))
        if _gamification_processed_at_column_exists():
            query = query.filter(AssessmentAttempt.gamification_processed_at.is_(None))
        attempts = query.order_by(AssessmentAttempt.student_id.asc(), AssessmentAttempt.submitted_at.asc()).all()

        print(f"Scanning {len(attempts)} completed assessment attempt(s) missing their economy award...")

        scanned = 0
        awarded = 0
        total_xp = 0
        total_coins = 0

        for attempt in attempts:
            scanned += 1
            student = db.get(Student, attempt.student_id)
            student_user = db.get(User, student.user_id) if student else None
            label = student_user.full_name if student_user else attempt.student_id

            if not apply:
                print(f"  {label} / attempt {attempt.id}: percentage {attempt.percentage}%, "
                      f"duration {attempt.duration_seconds}s -- would award")
                continue

            from app.services.assessment_engine_service import _ProcessAssessmentGamificationSideEffects  # noqa: E402

            result = _ProcessAssessmentGamificationSideEffects(db, attempt)
            if result:
                xp = result.get("awarded_xp", 0)
                coins = result.get("awarded_coins", 0)
                total_xp += xp
                total_coins += coins
                awarded += 1
                print(f"  {label} / attempt {attempt.id}: awarded {xp} XP, {coins} coins")

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"Attempts scanned:              {scanned}")
        if apply:
            print(f"Attempts awarded:               {awarded}")
            print(f"Total XP awarded:               {total_xp}")
            print(f"Total coins awarded:            {total_coins}")
        else:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
