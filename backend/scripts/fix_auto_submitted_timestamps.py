#!/usr/bin/env python3
"""
One-time, targeted correction for the AUTO_SUBMITTED submitted_at bug
(round 10 -- see docs/project-memory/OPEN_ISSUES.md).

Background: for AUTO_SUBMITTED (timer-expiry) mock attempts,
competition_mock_attempt_service.py used to stamp submitted_at with
_now_utc() -- i.e. whenever the system happened to *detect* the expiry (a
lazy GET, or the defensive result-page repair), not the true exam-end time.
This has been fixed going forward: submitted_at for the auto path is now
computed as started_at + duration_seconds (capped at "now" for safety).

This script is the one-time retroactive half of that fix: it walks every
existing AUTO_SUBMITTED attempt, recomputes what submitted_at *should* have
been, and -- only where it actually drifted from the stored value -- corrects
it and every value that was derived from the wrong timestamp:

  1. CompetitionMockAttempt.submitted_at itself.
  2. CompetitionMockResultSummary.completed_at (set from attempt.submitted_at
     at result-build time -- see _result_payload()).
  3. Notification.created_at for any notification tied to this attempt_id
     whose created_at was backdated to the OLD (wrong) submitted_at during
     the round-9 backfill or the live hook, so a student's/teacher's/admin's
     notification history stays chronologically honest instead of silently
     disagreeing with the corrected attempt record.

time_taken_seconds / time_utilization_percentage are NOT touched: for the
auto path those were already correctly set to the full duration_seconds /
100% (that part of the original bug report was actually correct behavior,
not a bug -- an auto-submitted attempt by definition used its full allotted
time). Only the *timestamp* was wrong.

Safe by design:
  - Idempotent: re-running after --apply finds nothing left to correct
    (recomputed value already matches stored value) and is a no-op.
  - Read-only unless --apply is passed.
  - Only touches attempts whose recomputed submitted_at differs from the
    stored one by more than 1 second (avoids false positives from float/us
    rounding).
  - Only rewrites Notification.created_at rows that are (a) tied to this
    exact attempt_id and (b) within 1 second of the OLD submitted_at value,
    so it never touches an unrelated notification that merely happens to
    share a timestamp.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/fix_auto_submitted_timestamps.py --dry-run   # preview only
    python scripts/fix_auto_submitted_timestamps.py --apply     # actually writes

--dry-run is the default if neither flag is passed.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    CompetitionMockAttempt,
    CompetitionMockResultSummary,
    Notification,
    Student,
    User,
)

# Force every print() to flush immediately -- see backfill_mock_gamification.py
# for why (Windows terminal stdout buffering made a prior script look hung).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _correct_submitted_at(attempt: CompetitionMockAttempt) -> datetime | None:
    started = _aware(attempt.started_at)
    if not started or not attempt.duration_seconds:
        return None
    return min(started + timedelta(seconds=attempt.duration_seconds), _now_utc())


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"AUTO_SUBMITTED TIMESTAMP FIX -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        attempts = (
            db.query(CompetitionMockAttempt)
            .filter(CompetitionMockAttempt.status == "AUTO_SUBMITTED")
            .order_by(CompetitionMockAttempt.student_id.asc(), CompetitionMockAttempt.submitted_at.asc())
            .all()
        )
        print(f"Scanning {len(attempts)} AUTO_SUBMITTED attempt(s)...")

        scanned = 0
        drifted = 0
        summaries_updated = 0
        notifications_updated = 0
        skipped_no_started_at = 0

        for attempt in attempts:
            scanned += 1
            correct = _correct_submitted_at(attempt)
            if correct is None:
                skipped_no_started_at += 1
                continue

            old_submitted_at = _aware(attempt.submitted_at)
            if old_submitted_at and abs((correct - old_submitted_at).total_seconds()) <= 1:
                continue  # already correct (or already fixed by round-10 code), nothing to do

            drifted += 1
            student = db.get(Student, attempt.student_id)
            student_user = db.get(User, student.user_id) if student else None
            label = student_user.full_name if student_user else attempt.student_id
            delta_minutes = (
                (correct - old_submitted_at).total_seconds() / 60.0 if old_submitted_at else None
            )
            print(
                f"  {label} / attempt {attempt.id}: "
                f"submitted_at {old_submitted_at} -> {correct}"
                + (f" (was off by {delta_minutes:.1f} min)" if delta_minutes is not None else " (was NULL)")
            )

            if not apply:
                continue

            # 1. The attempt itself.
            attempt.submitted_at = correct

            # 2. The denormalized result summary, if one exists.
            summary = (
                db.query(CompetitionMockResultSummary)
                .filter(CompetitionMockResultSummary.mock_attempt_id == attempt.id)
                .first()
            )
            if summary and summary.completed_at and old_submitted_at and abs(
                (_aware(summary.completed_at) - old_submitted_at).total_seconds()
            ) <= 1:
                summary.completed_at = correct
                summaries_updated += 1

            # 3. Notifications backdated to the old (wrong) submitted_at for
            #    this exact attempt -- student MOCK_SUBMITTED, teacher/admin
            #    STUDENT_MOCK_SUBMITTED, all share attempt_id.
            if old_submitted_at:
                related_notifs = (
                    db.query(Notification)
                    .filter(Notification.attempt_id == attempt.id)
                    .all()
                )
                for n in related_notifs:
                    n_created = _aware(n.created_at)
                    if n_created and abs((n_created - old_submitted_at).total_seconds()) <= 1:
                        n.created_at = correct
                        notifications_updated += 1

            db.commit()

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"AUTO_SUBMITTED attempts scanned:         {scanned}")
        print(f"Skipped (no started_at/duration_seconds): {skipped_no_started_at}")
        print(f"Attempts with drifted submitted_at:       {drifted}")
        if apply:
            print(f"Result summaries corrected:               {summaries_updated}")
            print(f"Notifications re-timestamped:              {notifications_updated}")
        else:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
