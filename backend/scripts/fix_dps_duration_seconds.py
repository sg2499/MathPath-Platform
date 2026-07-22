#!/usr/bin/env python3
"""
One-time correction: bump every DPS (Daily Practice Sheet) template's default
time limit from 5 minutes (300s) to 10 minutes (600s) -- 2026-07-22 request.

Background: DPS.default_duration_seconds is the single source of truth for a
sheet's time limit. It's read fresh by start_attempt() (attempt_service.py)
the moment a student actually begins a sheet, and frozen into that attempt's
own duration_seconds at that point -- so it can never be changed retroactively
for an attempt that's already in progress or submitted (by design; nothing to
do there, same as the user confirmed).

For assigned-but-not-yet-started sheets (including auto-created re-attempts,
which reference the same dps_id) and for newly published sheets, this single
table is what matters. The seed scripts (seed_intermediate_module.py,
seed_master_module.py, seed_ylm_phase1.py) and the SQLAlchemy column default
in models.py were updated in the same change to 10*60/600, so future/reseeded
rows already come out right -- this script is only for rows that already
exist in the live database with the old 300s value.

Scope, deliberately narrow: only backend/app/models/models.py's DPS table
(daily practice sheets). Assessments (AssessmentAssignment) and competition
mocks (CompetitionMockAssignment) have entirely separate duration
configuration and are NOT touched by this script or by any of the seed-script
changes that accompanied it.

Safe by design:
  - Idempotent: re-running after --apply finds nothing left at 300s (already
    corrected) and is a no-op.
  - Read-only unless --apply is passed.
  - Only touches DPS rows currently at exactly 300 seconds -- if a row was
    ever deliberately set to something else, this script leaves it alone
    rather than overwriting it.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/fix_dps_duration_seconds.py --dry-run   # preview only
    python scripts/fix_dps_duration_seconds.py --apply     # actually writes

--dry-run is the default if neither flag is passed.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import DPS, Lesson, Level, Module  # noqa: E402

# Force every print() to flush immediately -- see backfill_mock_gamification.py
# for why (Windows terminal stdout buffering made a prior script look hung).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


OLD_SECONDS = 300
NEW_SECONDS = 600


def _label_for(db, dps: DPS) -> str:
    lesson = db.get(Lesson, dps.lesson_id)
    level = db.get(Level, lesson.level_id) if lesson else None
    module = db.get(Module, level.module_id) if level else None
    parts = [p for p in [
        module.module_code if module else None,
        level.level_code if level else None,
        f"Lesson {lesson.lesson_number}" if lesson else None,
        f"DPS {dps.dps_number}",
    ] if p]
    return " / ".join(parts)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"DPS DURATION FIX (300s -> 600s) -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        rows = (
            db.query(DPS)
            .filter(DPS.default_duration_seconds == OLD_SECONDS)
            .order_by(DPS.lesson_id.asc(), DPS.dps_number.asc())
            .all()
        )
        print(f"Found {len(rows)} DPS row(s) currently at {OLD_SECONDS}s (5 min).")

        for dps in rows:
            label = _label_for(db, dps)
            print(f"  {label}: {OLD_SECONDS}s -> {NEW_SECONDS}s (status={dps.publication_status}, active={dps.is_active})")
            if apply:
                dps.default_duration_seconds = NEW_SECONDS

        if apply:
            db.commit()

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"DPS rows found at {OLD_SECONDS}s:  {len(rows)}")
        if apply:
            print(f"DPS rows updated to {NEW_SECONDS}s: {len(rows)}")
        else:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
