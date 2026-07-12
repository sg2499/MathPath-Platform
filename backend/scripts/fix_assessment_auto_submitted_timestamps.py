#!/usr/bin/env python3
"""
One-time, targeted correction for the assessment AUTO_SUBMITTED timestamp bug
found during the full student-portal audit (see docs/project-memory/OPEN_ISSUES.md).

Background: _SubmitAssessmentAttemptCore() in assessment_engine_service.py
used to stamp submitted_at with NowUtc() unconditionally, whether the
attempt was submitted manually or completed via the lazy auto-submit
fallback (EnsureAssessmentAttemptActiveOrAutoSubmit(), triggered by a plain
GET once the timer had already expired server-side). time_taken_seconds was
then derived from that same wrong submitted_at. This is the exact bug class
round 10 fixed for competition mock exams -- it just never got applied to
assessments. Fixed going forward: on the auto path, submitted_at is now
computed as started_at + duration_seconds (capped at "now").

Unlike mocks, assessment attempts have no stored flag distinguishing an
auto-completed attempt from a manually-submitted one after the fact --
Attempt.status is set to CLEARED or NEEDS_RE_ATTEMPT either way (see
ResultStatus()), never a literal "AUTO_SUBMITTED" value. So this script
can't filter on status the way fix_auto_submitted_timestamps.py (the mock
version) does. Instead it uses a mathematically reliable signal: a
genuinely manual submission can only happen while status is still
IN_PROGRESS, which by construction means time_taken_seconds <=
duration_seconds. A stored time_taken_seconds GREATER than duration_seconds
is physically impossible unless this exact bug produced it (a late-detected
auto-completion where the detection delay leaked into the recorded time).
That impossible condition is exactly what this script searches for -- it is
a more conservative filter than "every AUTO_SUBMITTED row" would be, since
it only touches attempts with a provably wrong value, not every attempt
that happened to be auto-completed quickly (which would have had little or
no drift to begin with).

For every attempt this finds, it corrects:
  1. AssessmentAttempt.submitted_at -> started_at + duration_seconds.
  2. AssessmentAttempt.time_taken_seconds -> duration_seconds (capped, no
     longer able to exceed the allotted time).
  3. AssessmentResult.completion_date, if it matches the old (wrong)
     submitted_at.
  4. Notification.created_at for any notification tied to this attempt_id
     that was backdated to the old (wrong) submitted_at.

percentage / score / status are NOT touched -- those were computed
correctly regardless of this bug; only the timestamp and derived duration
were wrong.

Safe by design:
  - Idempotent: after --apply, time_taken_seconds no longer exceeds
    duration_seconds, so a second run finds nothing left to correct.
  - Read-only unless --apply is passed.
  - Only rewrites Notification.created_at rows within 1 second of the OLD
    submitted_at value, so it never touches an unrelated notification that
    merely happens to share a timestamp.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/fix_assessment_auto_submitted_timestamps.py --dry-run   # preview only
    python scripts/fix_assessment_auto_submitted_timestamps.py --apply     # actually writes

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
    AssessmentAttempt,
    AssessmentResult,
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


COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "CLEARED", "NEEDS_RE_ATTEMPT"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def _correct_submitted_at(attempt: AssessmentAttempt) -> datetime | None:
    started = _aware(attempt.started_at)
    if not started or not attempt.duration_seconds:
        return None
    return started + timedelta(seconds=attempt.duration_seconds)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"ASSESSMENT AUTO_SUBMITTED TIMESTAMP FIX -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        candidates = (
            db.query(AssessmentAttempt)
            .filter(AssessmentAttempt.status.in_(COMPLETED_STATUSES))
            .order_by(AssessmentAttempt.student_id.asc(), AssessmentAttempt.submitted_at.asc())
            .all()
        )
        print(f"Scanning {len(candidates)} completed assessment attempt(s) for impossible time_taken_seconds...")

        scanned = 0
        drifted = 0
        results_updated = 0
        notifications_updated = 0

        for attempt in candidates:
            scanned += 1
            taken = attempt.time_taken_seconds
            duration = attempt.duration_seconds
            if taken is None or not duration or taken <= duration:
                continue  # not affected by this bug

            correct = _correct_submitted_at(attempt)
            if correct is None:
                continue

            drifted += 1
            old_submitted_at = _aware(attempt.submitted_at)
            old_taken = taken
            student = db.get(Student, attempt.student_id)
            student_user = db.get(User, student.user_id) if student else None
            label = student_user.full_name if student_user else attempt.student_id
            overshoot_minutes = (old_taken - duration) / 60.0
            print(
                f"  {label} / attempt {attempt.id}: "
                f"time_taken_seconds {old_taken}s > duration_seconds {duration}s "
                f"(overshot by {overshoot_minutes:.1f} min) -- "
                f"submitted_at {old_submitted_at} -> {correct}"
            )

            if not apply:
                continue

            # 1 & 2. The attempt itself.
            attempt.submitted_at = correct
            attempt.time_taken_seconds = duration

            # 3. The result row, if its completion_date matches the old value.
            result = (
                db.query(AssessmentResult)
                .filter(AssessmentResult.assessment_attempt_id == attempt.id)
                .first()
            )
            if result and result.completion_date and old_submitted_at and abs(
                (_aware(result.completion_date) - old_submitted_at).total_seconds()
            ) <= 1:
                result.completion_date = correct
                results_updated += 1

            # 4. Notifications backdated to the old (wrong) submitted_at for
            #    this exact attempt.
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
        print(f"Assessment attempts scanned:              {scanned}")
        print(f"Attempts with impossible time_taken:      {drifted}")
        if apply:
            print(f"Result rows corrected:                     {results_updated}")
            print(f"Notifications re-timestamped:               {notifications_updated}")
        else:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
