#!/usr/bin/env python3
"""
One-time backfill for badge-unlock notifications silently dropped by a
missing-commit bug in the round-9 live gamification hook.

Background: _ProcessMockCompletionSideEffects() in
competition_mock_attempt_service.py creates a BADGE_UNLOCKED Notification for
every newly-unlocked badge via CreateNotification(), but CreateNotification()
only db.add()s + db.flush()es -- it never commits, by design, so callers can
batch several notifications into one transaction. Every OTHER side-effect in
that function has its own explicit db.commit() (the student/teacher/admin
submission-notification block, the gamification_processed_at claim,
AchievementEngine.evaluate_mock_exam_submission() internally), but the
badge-notification loop never did, and neither SubmitCompetitionMockAttemptFor
Student() nor the route handler that calls it commits afterward either. Since
get_db() closes the session with no implicit commit, every badge-unlock
notification created through the live hook since round 9 shipped
(2026-07-11 ~20:41 UTC) was silently created, flushed into the open
transaction, then discarded when the request ended. The badge itself
persisted fine (evaluate_mock_exam_submission commits its own writes before
the notification loop even starts), so Trophy Room / the dashboard's "Latest
Unlock" widget showed it correctly -- only the notification vanished. This
was caught when a student's "The High Achiever" badge showed as unlocked
everywhere except the notification panel.

The code bug is fixed (db.commit() added after each CreateNotification() call
in that loop). This script is the one-time retroactive half: for every badge
a student has ever unlocked (StudentBadge), check whether a BADGE_UNLOCKED
notification for it actually exists, and create one -- backdated to
StudentBadge.unlocked_at -- if it doesn't.

This intentionally covers ALL of a student's badge history, not just the
live-bug window, because the exact same "notification exists but was never
committed" failure mode could apply to any badge unlocked through any code
path that shares this bug (not just live mock submission), and because
checking existence is idempotent and cheap -- there's no reason to try to
compute a precise window when "does the notification exist" already answers
the question directly. Badges that already have a notification (e.g. from
the round-9 backfill's badge-recompute pass, or from the retired startup job
while it was still running) are left untouched.

Dedup: matched by (recipient_user_id, type=BADGE_UNLOCKED, title ILIKE
'%{badge name}%'), the same convention used by backfill_mock_gamification.py
and the retired retroactive jobs, so re-running this script is safe.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_missing_badge_notifications.py --dry-run
    python scripts/backfill_missing_badge_notifications.py --apply
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    AchievementBadge,
    Notification,
    Student,
    StudentBadge,
    User,
)
from app.services.notification_service import CreateNotification  # noqa: E402

# Force every print() to flush immediately -- see backfill_mock_gamification.py
# for why (Windows terminal stdout buffering made a prior script look hung).
import builtins as _builtins  # noqa: E402

_real_print = _builtins.print


def print(*args, **kwargs):  # noqa: A001
    kwargs.setdefault("flush", True)
    _real_print(*args, **kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"MISSING BADGE-UNLOCK NOTIFICATION BACKFILL -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        student_badges = db.query(StudentBadge).order_by(StudentBadge.unlocked_at.asc()).all()
        print(f"Scanning {len(student_badges)} unlocked badge(s) across all students...")

        scanned = 0
        missing = 0
        created = 0

        for sb in student_badges:
            scanned += 1
            badge = db.get(AchievementBadge, sb.badge_id)
            student = db.get(Student, sb.student_id)
            if not badge or not student or not student.user_id:
                continue
            user = db.get(User, student.user_id)
            if not user:
                continue

            existing = (
                db.query(Notification)
                .filter(
                    Notification.recipient_user_id == user.id,
                    Notification.type == "BADGE_UNLOCKED",
                    Notification.title.ilike(f"%{badge.name}%"),
                )
                .first()
            )
            if existing:
                continue

            missing += 1
            print(
                f"  {user.full_name}: missing notification for '{badge.name}' "
                f"({badge.tier}), unlocked {sb.unlocked_at} -- "
                f"{'creating' if apply else 'would create'}"
            )

            if not apply:
                continue

            n = CreateNotification(
                db,
                recipient_user_id=user.id,
                recipient_role="STUDENT",
                type="BADGE_UNLOCKED",
                category="GAMIFICATION",
                title=f"New Badge Unlocked: {badge.name}",
                message=f"You unlocked the {badge.tier} tier '{badge.name}' badge for: {badge.description}!",
                target_route=f"/student/achievements?badge={badge.code}_{badge.tier}",
                color_variant="PURPLE",
                metadata={"badgeId": badge.id, "tier": badge.tier, "code": badge.code, "icon": badge.icon_name, "backfilled": True},
            )
            n.created_at = sb.unlocked_at
            db.commit()
            created += 1

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"Badges scanned:                    {scanned}")
        print(f"Badges missing a notification:      {missing}")
        if apply:
            print(f"Notifications created:              {created}")
        else:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
