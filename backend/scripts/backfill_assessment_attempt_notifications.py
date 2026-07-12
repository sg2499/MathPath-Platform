#!/usr/bin/env python3
"""
One-time backfill for assessment attempt completion notifications dropped by
the same lazy-completion notification gap fixed for competition mocks
(round 9) and practice/DPS attempts. See docs/project-memory/OPEN_ISSUES.md.

Background: NotifyAssessmentAttemptSubmitted only ever got called from the
two explicit route handlers (/assessment-attempts/{id}/submit and
.../auto-submit), never from the core grading logic itself
(_SubmitAssessmentAttemptCore). Assessments also had NO server-side fallback
at all for a timer expiring while the student's tab was backgrounded/closed
-- unlike mocks and practice sheets, an assessment attempt would just stay
IN_PROGRESS forever if the frontend's client-side auto-submit call never
reached the server. Both gaps are fixed going forward:
  1. EnsureAssessmentAttemptActiveOrAutoSubmit() now gives assessment
     attempts the same lazy-completion safety net mocks and practice sheets
     already had.
  2. The completion notification now runs from inside
     _SubmitAssessmentAttemptCore() itself (via
     _ProcessAssessmentCompletionNotification), gated by a new
     notification_processed_at column, so it fires exactly once regardless
     of which code path first completes the attempt.

This script is the one-time retroactive half of fix #2: every already-
completed assessment attempt that predates the fix has
notification_processed_at = NULL, which is the same signal this script needs
-- no separate "did this attempt already get notified" check required. Fix
#1 (attempts stuck IN_PROGRESS forever) has no retroactive component by its
nature -- an attempt stuck IN_PROGRESS before this deployed will simply get
picked up and auto-submitted (with its notification sent, exactly once) the
next time anyone loads it after the fix is live; there's nothing to backfill
for attempts that are still sitting IN_PROGRESS versus already completed.

Safe by design:
  - Calls the REAL production notification function
    (assessment_engine_service._ProcessAssessmentCompletionNotification), not
    a reimplementation.
  - Atomic per-attempt: claims notification_processed_at itself, so this
    script is safe to run concurrently with live traffic and safe to re-run.
  - Backdates every notification this creates to the attempt's real
    submitted_at.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_assessment_attempt_notifications.py --dry-run
    python scripts/backfill_assessment_attempt_notifications.py --apply

--dry-run is the default if neither flag is passed.
"""
from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.models.models import AssessmentAttempt, Notification, Student, User  # noqa: E402

# Force every print() to flush immediately -- see backfill_mock_gamification.py
# for why (Windows terminal stdout buffering made a prior script look hung).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "CLEARED", "NEEDS_RE_ATTEMPT"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _notification_processed_at_column_exists() -> bool:
    inspector = inspect(engine)
    if "assessment_attempts" not in inspector.get_table_names():
        return False
    columns = {c["name"] for c in inspector.get_columns("assessment_attempts")}
    return "notification_processed_at" in columns


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    if apply and not _notification_processed_at_column_exists():
        print("!! Cannot run --apply yet: assessment_attempts.notification_processed_at doesn't exist")
        print("   on this database, which means the code+migration for this fix hasn't been deployed")
        print("   here yet. Deliver the backend changes first, then re-run --apply.")
        print("   (--dry-run still works fine without it, if you just want a preview.)")
        sys.exit(1)

    print("=" * 88)
    print(f"ASSESSMENT ATTEMPT NOTIFICATION BACKFILL -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        query = db.query(AssessmentAttempt).filter(AssessmentAttempt.status.in_(COMPLETED_STATUSES))
        if _notification_processed_at_column_exists():
            query = query.filter(AssessmentAttempt.notification_processed_at.is_(None))
        attempts = query.order_by(AssessmentAttempt.student_id.asc(), AssessmentAttempt.submitted_at.asc()).all()

        print(f"Scanning {len(attempts)} completed assessment attempt(s) missing their notification...")

        scanned = 0
        notified = 0
        notifications_created = 0

        for attempt in attempts:
            scanned += 1
            student = db.get(Student, attempt.student_id)
            student_user = db.get(User, student.user_id) if student else None
            label = student_user.full_name if student_user else attempt.student_id
            print(f"  {label} / attempt {attempt.id}: submitted {attempt.submitted_at} -- "
                  f"{'notifying' if apply else 'would notify'}")

            if not apply:
                continue

            from app.services.assessment_engine_service import (  # noqa: E402
                _ProcessAssessmentCompletionNotification,
            )

            mark_time = _now_utc()
            _ProcessAssessmentCompletionNotification(db, attempt)

            new_notifs = (
                db.query(Notification)
                .filter(Notification.attempt_id == attempt.id, Notification.created_at >= mark_time)
                .all()
            )
            for n in new_notifs:
                n.created_at = attempt.submitted_at or mark_time
                notifications_created += 1
            db.commit()
            notified += 1

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"Attempts scanned:              {scanned}")
        if apply:
            print(f"Attempts notified:              {notified}")
            print(f"Notifications created:          {notifications_created}")
        else:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
