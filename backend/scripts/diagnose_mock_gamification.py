#!/usr/bin/env python3
"""
Diagnose mock-exam gamification gaps (XP/coins, badges, notifications) for
specific students, by name.

Read-only. This script never calls db.add/db.commit/db.delete -- it only
queries and prints. Safe to run against production at any time, including
while students are actively taking exams.

Background: a bug in competition_mock_attempt_service.py meant that whenever
a mock attempt got graded via a "lazy" auto-submit (the timer expired while
the student's tab was backgrounded / offline / closed, and the next GET
request to load the attempt completed it server-side) or the defensive
result-page repair, the attempt was scored correctly but never ran the
notification / XP+coin / badge-evaluation side-effects -- because those only
lived in a separate wrapper function that those two paths bypassed. This has
been fixed (see gamification_processed_at on CompetitionMockAttempt and
_ProcessMockCompletionSideEffects in competition_mock_attempt_service.py),
and backfill_mock_gamification.py catches up historical attempts. This
script is the "look before you backfill" step: point it at real student
names and see exactly what's missing before running the backfill for real.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/diagnose_mock_gamification.py "Pragya Ghosh" "Sampreeti Mohapatra" "Tanay Gupta" "Sayantan Biswas"

    # or with no names, to scan every student who has ever completed a mock:
    python scripts/diagnose_mock_gamification.py --all
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Allow running as `python scripts/diagnose_mock_gamification.py` from backend/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy.orm import defer  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    CompetitionMockAttempt,
    CompetitionMockExam,
    CompetitionMockResultSummary,
    EconomyTransaction,
    Notification,
    Student,
    StudentAchievementStat,
    StudentBadge,
    User,
)

COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED", "EXPIRED", "LOCKED"}


def _fmt(dt) -> str:
    return dt.isoformat() if dt else "—"


def diagnose_student(db, user: User, student: Student) -> None:
    print("=" * 88)
    print(f"{user.full_name}  (student_code={student.student_code}, user_id={user.id})")
    print("=" * 88)

    # gamification_processed_at is deferred (never selected) here on purpose:
    # this script is meant to be runnable against production *before* the
    # round-9 migration has actually been deployed (delivery is deliberately
    # held), so the column may not exist on the live table yet. Deferring it
    # means the query below won't reference a column Postgres doesn't have.
    attempts = (
        db.query(CompetitionMockAttempt)
        .options(defer(CompetitionMockAttempt.gamification_processed_at))
        .filter(
            CompetitionMockAttempt.student_id == student.id,
            CompetitionMockAttempt.status.in_(COMPLETED_STATUSES),
        )
        .order_by(CompetitionMockAttempt.submitted_at.asc())
        .all()
    )

    if not attempts:
        print("  No completed mock attempts found for this student.\n")
        return

    for attempt in attempts:
        exam = db.get(CompetitionMockExam, attempt.mock_exam_id)
        exam_label = exam.title or exam.mock_code if exam else attempt.mock_exam_id

        print(f"\n  Attempt {attempt.id}")
        print(f"    Exam:               {exam_label}")
        print(f"    Status:             {attempt.status}")
        print(f"    Submitted at:       {_fmt(attempt.submitted_at)}")
        print(f"    Score:              {attempt.total_score}/{attempt.max_score} ({attempt.percentage}%)")
        print(f"    Time taken:         {attempt.time_taken_seconds}s (util {attempt.time_utilization_percentage}%)")
        print("    gamification_processed_at: (not queried -- migration not deployed to this database yet)")

        # Economy
        econ_tx = (
            db.query(EconomyTransaction)
            .filter(
                EconomyTransaction.user_id == user.id,
                EconomyTransaction.source_action == "ASSIGNMENT_COMPLETION",
                EconomyTransaction.reference_id == attempt.mock_assignment_id,
            )
            .first()
        )
        if econ_tx:
            print(f"    XP/coins:           OK -- awarded {econ_tx.amount_xp} XP, {econ_tx.amount_coins} coins on {_fmt(econ_tx.created_at)}")
        else:
            print("    XP/coins:           MISSING -- no EconomyTransaction found for this assignment")

        # Student-facing notification (either the primary type or the old
        # retroactive-job's type, so we don't double-count something that
        # already has some acknowledgement)
        mock_submitted_notif = (
            db.query(Notification)
            .filter(
                Notification.recipient_user_id == user.id,
                Notification.attempt_id == attempt.id,
                Notification.type == "MOCK_SUBMITTED",
            )
            .first()
        )
        mock_completed_notif = (
            db.query(Notification)
            .filter(
                Notification.recipient_user_id == user.id,
                Notification.attempt_id == attempt.id,
                Notification.type == "MOCK_EXAM_COMPLETED",
            )
            .first()
        )
        if mock_submitted_notif:
            print(f"    Student notif:      OK -- MOCK_SUBMITTED sent {_fmt(mock_submitted_notif.created_at)}")
        elif mock_completed_notif:
            print(f"    Student notif:      PARTIAL -- only the legacy retroactive MOCK_EXAM_COMPLETED exists ({_fmt(mock_completed_notif.created_at)}), not the real MOCK_SUBMITTED")
        else:
            print("    Student notif:      MISSING -- no submission notification of any kind")

        # Teacher/admin notifications (STUDENT_MOCK_SUBMITTED) tied to this attempt
        staff_notifs = (
            db.query(Notification)
            .filter(
                Notification.attempt_id == attempt.id,
                Notification.type == "STUDENT_MOCK_SUBMITTED",
            )
            .all()
        )
        teacher_count = sum(1 for n in staff_notifs if n.recipient_role == "TEACHER")
        admin_count = sum(1 for n in staff_notifs if n.recipient_role == "ADMIN")
        print(f"    Teacher notif:      {'OK' if teacher_count else 'MISSING (or no teacher assigned)'} -- {teacher_count} sent")
        print(f"    Admin notifs:       {'OK' if admin_count else 'MISSING'} -- {admin_count} sent")

    # Badge / stat snapshot for the student overall (not per-attempt, since
    # badges are cumulative across all of a student's mock history)
    badge_count = db.query(StudentBadge).filter(StudentBadge.student_id == student.id).count()
    stats = db.query(StudentAchievementStat).filter(StudentAchievementStat.student_id == student.id).all()
    print(f"\n  Current badges unlocked: {badge_count}")
    if stats:
        print("  Current achievement stat counters:")
        for s in sorted(stats, key=lambda x: x.stat_name):
            print(f"    {s.stat_name}: {s.stat_value}")
    else:
        print("  Current achievement stat counters: none recorded")
    print()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("names", nargs="*", help="Full name(s) of students to diagnose, exactly as they appear in the platform.")
    parser.add_argument("--all", action="store_true", help="Scan every student who has ever completed a mock attempt, instead of specific names.")
    args = parser.parse_args()

    if not args.names and not args.all:
        parser.print_help()
        sys.exit(1)

    db = SessionLocal()
    try:
        if args.all:
            student_ids = {
                row[0]
                for row in db.query(CompetitionMockResultSummary.student_id).distinct().all()
            }
            students = db.query(Student).filter(Student.id.in_(student_ids)).all()
            pairs = []
            for st in students:
                u = db.get(User, st.user_id)
                if u:
                    pairs.append((u, st))
            pairs.sort(key=lambda p: p[0].full_name or "")
        else:
            pairs = []
            for name in args.names:
                user = db.query(User).filter(User.full_name.ilike(name.strip())).first()
                if not user:
                    print(f"!! No user found with full_name matching '{name}' -- skipping.\n")
                    continue
                student = db.query(Student).filter(Student.user_id == user.id).first()
                if not student:
                    print(f"!! User '{name}' found but has no linked Student record -- skipping.\n")
                    continue
                pairs.append((user, student))

        if not pairs:
            print("No matching students found.")
            return

        for user, student in pairs:
            diagnose_student(db, user, student)

        print("=" * 88)
        print(f"Diagnosed {len(pairs)} student(s). This script made no changes.")
        print("If you're satisfied this matches what you're seeing in the product, run")
        print("backfill_mock_gamification.py --dry-run first, then --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
