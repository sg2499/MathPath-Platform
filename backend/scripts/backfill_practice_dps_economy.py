#!/usr/bin/env python3
"""
One-time backfill: award XP and coins for historical practice/DPS attempts
that completed before the economy system covered DPS sheets at all.

Background: EconomyService.award_xp_and_coins() used to be called from
exactly one place -- competition mock exam completion. Practice/DPS sheets
and assessments never awarded any XP or coins, despite the student
dashboard's own "Daily Objective" copy explicitly promising MathCoins for
completing DPS sheets. Found during the full student-portal audit; fixed
going forward by wiring EconomyService.evaluate_activity_performance() (one
formula, shared by DPS/assessment/mock, based on each attempt's own
allotted duration_seconds x accuracy multiplier x activity weight) into
submit_attempt(), gated by the new gamification_processed_at column.

This script is the one-time retroactive half: every already-completed
practice/DPS attempt that predates the fix has gamification_processed_at =
NULL (the column didn't exist and nothing was gating it yet), which is
exactly the signal this script needs.

Safe by design:
  - Calls the REAL production function
    (attempt_service._process_attempt_gamification_side_effects), not a
    reimplementation -- backfilled awards are computed by the exact same
    formula a live completion would use, so historical and future amounts
    can never drift apart.
  - Atomic per-attempt: the real function claims gamification_processed_at
    itself (UPDATE ... WHERE IS NULL), so this script is safe to run
    concurrently with live traffic and safe to re-run -- an attempt already
    claimed (by this script or by a live request) is a no-op on a second
    pass.
  - Independent of the notification backfill already run for these same
    attempts -- gamification_processed_at and notification_processed_at are
    separate columns/claims, so running this script cannot re-notify anyone
    or double-process anything already handled by that earlier backfill.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_practice_dps_economy.py --dry-run
    python scripts/backfill_practice_dps_economy.py --apply

--dry-run is the default if neither flag is passed.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.models.models import Attempt, Student, User  # noqa: E402

# Force every print() to flush immediately -- see backfill_mock_gamification.py
# for why (Windows terminal stdout buffering made a prior script look hung).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED"}


def _gamification_processed_at_column_exists() -> bool:
    inspector = inspect(engine)
    if "attempts" not in inspector.get_table_names():
        return False
    columns = {c["name"] for c in inspector.get_columns("attempts")}
    return "gamification_processed_at" in columns


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    if apply and not _gamification_processed_at_column_exists():
        print("!! Cannot run --apply yet: attempts.gamification_processed_at doesn't exist on this")
        print("   database, which means the code+migration for this fix hasn't been deployed here yet.")
        print("   Deliver the backend changes first, then re-run --apply.")
        print("   (--dry-run still works fine without it, if you just want a preview.)")
        sys.exit(1)

    print("=" * 88)
    print(f"PRACTICE/DPS ECONOMY BACKFILL -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        query = db.query(Attempt).filter(Attempt.status.in_(COMPLETED_STATUSES))
        if _gamification_processed_at_column_exists():
            query = query.filter(Attempt.gamification_processed_at.is_(None))
        attempts = query.order_by(Attempt.student_id.asc(), Attempt.submitted_at.asc()).all()

        print(f"Scanning {len(attempts)} completed practice/DPS attempt(s) missing their economy award...")

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
                print(f"  {label} / attempt {attempt.id}: accuracy {attempt.accuracy_percentage}%, "
                      f"duration {attempt.duration_seconds}s -- would award")
                continue

            from app.services.attempt_service import _process_attempt_gamification_side_effects  # noqa: E402

            result = _process_attempt_gamification_side_effects(db, attempt)
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
