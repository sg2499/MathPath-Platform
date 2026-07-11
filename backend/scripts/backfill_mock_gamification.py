#!/usr/bin/env python3
"""
One-time, platform-wide backfill for the mock-exam gamification bug.

Background: competition_mock_attempt_service.py had two code paths that
could complete a mock attempt (grade it, mark it submitted) without ever
running the notification / XP+coin / badge-evaluation side-effects, because
those side-effects used to live only in a separate wrapper function that
those two paths bypassed:

  1. EnsureCompetitionAttemptActiveOrSubmit() -- runs on every GET to load an
     attempt; if the timer had already expired server-side (student's tab
     backgrounded, network dropped, or they just revisited after time was
     up), it silently graded the attempt with no hooks.
  2. The defensive result-summary repair inside _result_payload().

This has been fixed going forward: side-effects now run exactly once, from
inside the core grading function itself, gated by an atomic
gamification_processed_at claim so every completion path gets identical
treatment. This script catches up every historical attempt that completed
before that fix existed and never got its side-effects.

Safe by design:
  - Economy (XP/coins) is only awarded for an attempt if no matching
    EconomyTransaction already exists for its assignment_id. EconomyService
    is NOT idempotent on its own (it always awards on every call), so this
    script never calls it twice for the same attempt.
  - Notifications (student MOCK_SUBMITTED + teacher/admin STUDENT_MOCK_SUBMITTED)
    are only created for an attempt if no MOCK_SUBMITTED notification already
    exists for it. They are backdated to the attempt's real submitted_at so
    a student's notification history stays chronologically honest instead of
    old submissions suddenly appearing to happen "just now".
  - Badges/achievement stats are recomputed with a full, deterministic
    wipe-and-rebuild across EVERY student's entire mock history in
    chronological order (this is the same approach
    recalculate_all_gamification_stats() used to take automatically on every
    backend restart -- that automatic job has been retired now that the real
    fix exists, and this script is its one-time, deliberate replacement).
    Badge-unlock notifications are deduped by title so re-running this
    script never creates duplicates.
  - gamification_processed_at is set (backdated to submitted_at) on every
    completed attempt this script looks at, so the new real-time hooks never
    reprocess anything this script already handled.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_mock_gamification.py --dry-run   # preview only, no writes
    python scripts/backfill_mock_gamification.py --apply     # actually writes

--dry-run is the default if neither flag is passed. Run it, read the
summary, then run diagnose_mock_gamification.py against a few named students
to sanity check, before ever passing --apply.

Note on badges specifically: because AchievementEngine.evaluate_mock_exam_submission()
commits internally and isn't safe to simulate without writing, --dry-run
does NOT execute the badge recompute -- it only previews the economy and
notification changes it can safely preview read-only. Badge state is best
checked before/after with diagnose_mock_gamification.py.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import inspect, text  # noqa: E402
from sqlalchemy.orm import defer, joinedload  # noqa: E402

from app.database import SessionLocal, engine  # noqa: E402
from app.models.models import (  # noqa: E402
    CompetitionMockAssignment,
    CompetitionMockAttempt,
    CompetitionMockExam,
    CompetitionMockResultSummary,
    EconomyTransaction,
    Level,
    Module,
    Notification,
    Student,
    Teacher,
    User,
)
from app.services.achievements import AchievementEngine
from app.services.economy_service import EconomyService
from app.services.notification_service import CreateNotification

COMPLETED_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED", "EXPIRED", "LOCKED"}


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _preview_economy(accuracy_percent: float, base_xp: int = 500) -> tuple[int, int]:
    """Mirrors EconomyService.evaluate_assignment_performance()'s math without writing anything."""
    multiplier = 1.0
    if accuracy_percent == 100.0:
        multiplier = 2.5
    elif accuracy_percent >= 90.0:
        multiplier = 2.0
    elif accuracy_percent >= 75.0:
        multiplier = 1.5
    elif accuracy_percent < 50.0:
        multiplier = 0.5
    final_xp = int(base_xp * multiplier)
    final_coins = int(25 * multiplier) if accuracy_percent >= 50.0 else 0
    return final_xp, final_coins


def backfill_economy_and_notifications(db, apply: bool) -> dict:
    """Pass 1: per-attempt, gated economy award + submission notifications."""
    stats = {
        "attempts_scanned": 0,
        "economy_awarded": 0,
        "economy_xp_total": 0,
        "economy_coins_total": 0,
        "notifications_created": 0,
        "attempts_marked_processed": 0,
    }

    # gamification_processed_at is deferred so this still works (in --dry-run)
    # against a database where the round-9 migration hasn't been deployed
    # yet. See _column_exists_check() in main() for the --apply-time guard.
    attempts = (
        db.query(CompetitionMockAttempt)
        .options(defer(CompetitionMockAttempt.gamification_processed_at))
        .filter(CompetitionMockAttempt.status.in_(COMPLETED_STATUSES))
        .order_by(CompetitionMockAttempt.student_id.asc(), CompetitionMockAttempt.submitted_at.asc())
        .all()
    )

    for attempt in attempts:
        stats["attempts_scanned"] += 1
        student = db.get(Student, attempt.student_id)
        if not student:
            continue
        student_user = db.get(User, student.user_id)
        if not student_user:
            continue

        needs_economy = (
            db.query(EconomyTransaction)
            .filter(
                EconomyTransaction.user_id == student_user.id,
                EconomyTransaction.source_action == "ASSIGNMENT_COMPLETION",
                EconomyTransaction.reference_id == attempt.mock_assignment_id,
            )
            .first()
            is None
        )
        needs_notifications = (
            db.query(Notification)
            .filter(
                Notification.recipient_user_id == student_user.id,
                Notification.attempt_id == attempt.id,
                Notification.type == "MOCK_SUBMITTED",
            )
            .first()
            is None
        )

        if needs_economy:
            preview_xp, preview_coins = _preview_economy(attempt.percentage or 0.0)
            print(f"  [economy] {student_user.full_name} / attempt {attempt.id}: "
                  f"{'would award' if not apply else 'awarding'} ~{preview_xp} XP, ~{preview_coins} coins")
            if apply:
                result = EconomyService.evaluate_assignment_performance(
                    db=db,
                    user_id=student.user_id,
                    accuracy_percent=attempt.percentage or 0.0,
                    base_xp=500,
                    assignment_id=attempt.mock_assignment_id or "MOCK",
                )
                stats["economy_xp_total"] += result.get("awarded_xp", 0)
                stats["economy_coins_total"] += result.get("awarded_coins", 0)
            else:
                stats["economy_xp_total"] += preview_xp
                stats["economy_coins_total"] += preview_coins
            stats["economy_awarded"] += 1

        if needs_notifications:
            exam = db.get(CompetitionMockExam, attempt.mock_exam_id)
            module = db.get(Module, exam.module_id) if exam else None
            level = db.get(Level, exam.level_id) if exam else None
            assignment = db.get(CompetitionMockAssignment, attempt.mock_assignment_id)
            created_count = 0
            if exam and assignment:
                safe_teacher_id = student.teacher_id if student.teacher_id else None
                admin_count = db.query(User).filter(User.role.in_(["ADMIN", "SUPER_ADMIN"]), User.is_active == True).count()
                preview_count = 1 + (1 if safe_teacher_id else 0) + admin_count
                print(f"  [notif]   {student_user.full_name} / attempt {attempt.id}: "
                      f"{'would create' if not apply else 'creating'} MOCK_SUBMITTED"
                      f"{' + teacher notif' if safe_teacher_id else ''} + {admin_count} admin notif(s), "
                      f"backdated to {attempt.submitted_at}")
                if not apply:
                    # Dry-run: nothing is written, but count what --apply would
                    # actually create so the summary total isn't stuck at 0.
                    created_count = preview_count
                if apply:
                    n = CreateNotification(
                        db,
                        recipient_user_id=student_user.id,
                        recipient_role="STUDENT",
                        type="MOCK_SUBMITTED",
                        category="COMPETITION_MOCK",
                        title="Mock Exam Submitted",
                        message=f"You successfully submitted {exam.title or exam.mock_code}. Score: {int(round(attempt.total_score or 0))}/{int(round(attempt.max_score or 0))} ({int(round(attempt.percentage or 0))}%)",
                        actor_user_id=student_user.id,
                        actor_role="STUDENT",
                        student_id=student.id,
                        teacher_id=safe_teacher_id,
                        attempt_id=attempt.id,
                        color_variant="indigo",
                        metadata={
                            "event": "MOCK_SUBMITTED",
                            "moduleCode": module.module_code if module else None,
                            "levelCode": level.level_code if level else None,
                            "backfilled": True,
                        },
                    )
                    n.created_at = attempt.submitted_at
                    created_count += 1

                    teacher_name = "No Teacher"
                    if safe_teacher_id:
                        teacher_record = db.get(Teacher, safe_teacher_id)
                        teacher_user = db.get(User, teacher_record.user_id) if teacher_record else None
                        if teacher_user and teacher_record:
                            teacher_name = teacher_user.full_name
                            tn = CreateNotification(
                                db,
                                recipient_user_id=teacher_user.id,
                                recipient_role="TEACHER",
                                type="STUDENT_MOCK_SUBMITTED",
                                category="COMPETITION_MOCK",
                                title="Student Mock Submitted",
                                message=f"{student_user.full_name} submitted {exam.title or exam.mock_code}. Score: {int(round(attempt.total_score or 0))}/{int(round(attempt.max_score or 0))} ({int(round(attempt.percentage or 0))}%)",
                                actor_user_id=student_user.id,
                                actor_role="STUDENT",
                                student_id=student.id,
                                teacher_id=safe_teacher_id,
                                attempt_id=attempt.id,
                                color_variant="purple",
                                metadata={
                                    "event": "STUDENT_MOCK_SUBMITTED",
                                    "moduleCode": module.module_code if module else None,
                                    "levelCode": level.level_code if level else None,
                                    "backfilled": True,
                                },
                            )
                            tn.created_at = attempt.submitted_at
                            created_count += 1

                    admins = db.query(User).filter(User.role.in_(["ADMIN", "SUPER_ADMIN"]), User.is_active == True).all()
                    for admin in admins:
                        an = CreateNotification(
                            db,
                            recipient_user_id=admin.id,
                            recipient_role="ADMIN",
                            type="STUDENT_MOCK_SUBMITTED",
                            category="COMPETITION_MOCK",
                            title="Student Mock Submitted",
                            message=f"{student_user.full_name} (Teacher: {teacher_name}) submitted {exam.title or exam.mock_code}. Score: {int(round(attempt.total_score or 0))}/{int(round(attempt.max_score or 0))} ({int(round(attempt.percentage or 0))}%)",
                            actor_user_id=student_user.id,
                            actor_role="STUDENT",
                            student_id=student.id,
                            teacher_id=safe_teacher_id,
                            attempt_id=attempt.id,
                            color_variant="indigo",
                            metadata={
                                "event": "STUDENT_MOCK_SUBMITTED",
                                "moduleCode": module.module_code if module else None,
                                "levelCode": level.level_code if level else None,
                                "backfilled": True,
                            },
                        )
                        an.created_at = attempt.submitted_at
                        created_count += 1
                    db.commit()
            stats["notifications_created"] += created_count

        if apply:
            attempt.gamification_processed_at = attempt.submitted_at or _now_utc()
            db.commit()
            stats["attempts_marked_processed"] += 1

    return stats


def backfill_achievements(db, apply: bool) -> dict:
    """Pass 2: deterministic full recompute of badges/stats (see module docstring)."""
    stats = {"students_evaluated": 0, "badges_newly_unlocked": 0, "badge_notifications_created": 0}

    if not apply:
        print("  [badges]  skipped in dry-run (evaluate_mock_exam_submission commits internally; "
              "not safe to simulate read-only). Use diagnose_mock_gamification.py before/after --apply "
              "to compare badge state.")
        return stats

    logging.info("Starting one-time deterministic badge/stat recompute...")
    AchievementEngine.seed_badges(db)

    db.execute(text("DELETE FROM student_achievement_stats"))
    db.execute(text("DELETE FROM student_badges"))
    db.commit()

    students = db.query(Student).all()
    for student in students:
        if not student.user_id:
            continue
        results = (
            db.query(CompetitionMockResultSummary)
            .options(joinedload(CompetitionMockResultSummary.mock_assignment))
            .filter(CompetitionMockResultSummary.student_id == student.id)
            .order_by(CompetitionMockResultSummary.completed_at.asc())
            .all()
        )
        if not results:
            continue
        stats["students_evaluated"] += 1

        for r in results:
            try:
                newly_unlocked = AchievementEngine.evaluate_mock_exam_submission(db, student.id, r)
                stats["badges_newly_unlocked"] += len(newly_unlocked)
                for b in newly_unlocked:
                    try:
                        existing_notif = (
                            db.query(Notification)
                            .filter(
                                Notification.recipient_user_id == student.user_id,
                                Notification.type == "BADGE_UNLOCKED",
                                Notification.title.ilike(f"%{b.get('name')}%"),
                            )
                            .first()
                        )
                        if not existing_notif:
                            n = CreateNotification(
                                db,
                                recipient_user_id=student.user_id,
                                recipient_role="STUDENT",
                                type="BADGE_UNLOCKED",
                                category="GAMIFICATION",
                                title=f"New Badge Unlocked: {b.get('name')}",
                                message=f"You unlocked the {b.get('tier')} tier '{b.get('name')}' badge for: {b.get('description')}!",
                                target_route=f"/student/achievements?badge={b.get('code')}_{b.get('tier')}",
                                color_variant="PURPLE",
                                metadata={"badgeId": b.get("id"), "tier": b.get("tier"), "code": b.get("code"), "icon": b.get("icon_name"), "backfilled": True},
                            )
                            n.created_at = r.completed_at or _now_utc()
                            db.commit()
                            stats["badge_notifications_created"] += 1
                    except Exception as ne:
                        db.rollback()
                        logging.error(f"Failed badge notif backfill for {b.get('name')}: {ne}")
            except Exception as eval_e:
                db.rollback()
                logging.error(f"Failed to evaluate mock {r.id} for student {student.id}: {eval_e}")

    logging.info("Badge/stat recompute complete.")
    return stats


def _gamification_processed_at_column_exists() -> bool:
    inspector = inspect(engine)
    if "competition_mock_attempts" not in inspector.get_table_names():
        return False
    columns = {c["name"] for c in inspector.get_columns("competition_mock_attempts")}
    return "gamification_processed_at" in columns


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Actually write changes. Without this, runs as a dry-run preview.")
    parser.add_argument("--dry-run", action="store_true", help="Explicit dry-run (default behavior if --apply is omitted).")
    args = parser.parse_args()

    apply = bool(args.apply and not args.dry_run)

    if apply and not _gamification_processed_at_column_exists():
        print("!! Cannot run --apply yet: the competition_mock_attempts.gamification_processed_at")
        print("   column doesn't exist on this database, which means the round-9 migration/deploy")
        print("   hasn't happened here yet. Deliver the backend changes first, then re-run --apply.")
        print("   (--dry-run still works fine without it, if you just want a preview.)")
        sys.exit(1)

    print("=" * 88)
    print(f"MOCK GAMIFICATION BACKFILL -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (no changes will be written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        econ_stats = backfill_economy_and_notifications(db, apply=apply)
        badge_stats = backfill_achievements(db, apply=apply)

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"Attempts scanned:                 {econ_stats['attempts_scanned']}")
        print(f"Attempts needing economy award:   {econ_stats['economy_awarded']}")
        print(f"  -> total XP {'awarded' if apply else 'that would be awarded'}:    {econ_stats['economy_xp_total']}")
        print(f"  -> total coins {'awarded' if apply else 'that would be awarded'}: {econ_stats['economy_coins_total']}")
        print(f"Notifications {'created' if apply else 'that would be created'}:     {econ_stats['notifications_created']}")
        if apply:
            print(f"Attempts marked gamification_processed_at: {econ_stats['attempts_marked_processed']}")
            print(f"Students re-evaluated for badges: {badge_stats['students_evaluated']}")
            print(f"Badges newly unlocked:            {badge_stats['badges_newly_unlocked']}")
            print(f"Badge notifications created:      {badge_stats['badge_notifications_created']}")
        else:
            print("Badge recompute: not simulated in dry-run (see note above). Re-run with --apply to execute for real.")

        if not apply:
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
