#!/usr/bin/env python3
"""
One-time backfill for practice/DPS attempt completion notifications dropped
by the lazy-auto-submit notification gap (see docs/project-memory/OPEN_ISSUES.md
and COWORK_HANDOFF.md's entry on the full student-portal audit).

Background: submit_attempt() in attempt_service.py grades and completes a
practice/DPS attempt from three different callers -- the explicit
/attempts/{id}/submit and /attempts/{id}/auto-submit routes, and
ensure_active_or_auto_submit() (a lazy fallback triggered by a plain GET once
the timer's already expired server-side). The completion notification
(NotifyPracticeAttemptSubmitted) only ever lived in the two explicit route
handlers, never inside submit_attempt() itself -- so any attempt completed
via the lazy path got graded correctly but the student, teacher, and admin
were never notified, and a resulting auto-retry assignment (which DOES get
created correctly, since that logic already lives inside submit_attempt())
never got its own notification either. Same bug class as the pre-round-9
competition mock exam bug and the round-9 badge-notification commit bug.

This has been fixed going forward: the notification now runs from inside
submit_attempt() itself (via _process_attempt_notification_side_effects),
gated by a new notification_processed_at column so it fires exactly once
regardless of which code path first completes the attempt. This script is
the one-time retroactive half: every already-completed attempt that predates
the fix has notification_processed_at = NULL (it was never set, because the
column didn't exist and the notification logic wasn't gated by it yet), which
is exactly the same signal this script needs -- no separate "did this attempt
already get notified" check required.

Safe by design:
  - Calls the REAL production notification function
    (attempt_service._process_attempt_notification_side_effects), not a
    reimplementation -- guarantees backfilled notifications are identical in
    content/metadata to what a real-time notification would contain. A prior
    backfill script (backfill_mock_gamification.py) had its own dedup bug
    found and fixed the same day it was written; reusing the real code path
    instead of parallel-implementing it avoids that whole class of risk.
  - Atomic per-attempt: _process_attempt_notification_side_effects claims
    notification_processed_at itself (UPDATE ... WHERE IS NULL), so this
    script is safe to run concurrently with live traffic and safe to re-run
    -- an attempt already claimed (by this script or by a live request) is
    a no-op on a second pass.
  - Backdates every notification this creates to the attempt's real
    submitted_at, so a student's/teacher's notification history stays
    chronologically honest instead of an old submission suddenly appearing
    to happen "just now".

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_practice_attempt_notifications.py --dry-run
    python scripts/backfill_practice_attempt_notifications.py --apply

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
from app.models.models import Attempt, Notification, Student, User  # noqa: E402

# Force every print() to flush immediately -- see backfill_mock_gamification.py
# for why (Windows terminal stdout buffering made a prior script look hung).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _notification_processed_at_column_exists() -> bool:
    inspector = inspect(engine)
    if "attempts" not in inspector.get_table_names():
        return False
    columns = {c["name"] for c in inspector.get_columns("attempts")}
    return "notification_processed_at" in columns


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    if apply and not _notification_processed_at_column_exists():
        print("!! Cannot run --apply yet: attempts.notification_processed_at doesn't exist on this")
        print("   database, which means the code+migration for this fix hasn't been deployed here yet.")
        print("   Deliver the backend changes first, then re-run --apply.")
        print("   (--dry-run still works fine without it, if you just want a preview.)")
        sys.exit(1)

    print("=" * 88)
    print(f"PRACTICE/DPS ATTEMPT NOTIFICATION BACKFILL -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        query = db.query(Attempt).filter(Attempt.status.in_(COMPLETED_STATUSES))
        if _notification_processed_at_column_exists():
            query = query.filter(Attempt.notification_processed_at.is_(None))
        attempts = query.order_by(Attempt.student_id.asc(), Attempt.submitted_at.asc()).all()

        print(f"Scanning {len(attempts)} completed practice/DPS attempt(s) missing their notification...")

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

            from app.services.attempt_service import (  # noqa: E402
                _process_attempt_notification_side_effects,
                latest_retry_assignment_for_attempt,
            )

            retry_assignment = latest_retry_assignment_for_attempt(db, attempt)
            mark_time = _now_utc()
            _process_attempt_notification_side_effects(db, attempt, retry_assignment)

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
