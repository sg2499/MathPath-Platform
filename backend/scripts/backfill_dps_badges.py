#!/usr/bin/env python3
"""
One-time backfill for the DPS badge detection gap (see OPEN_ISSUES.md,
2026-08-03b/c entries): AchievementEngine.evaluate_dps_attempt_submission()
only evaluates NEW attempts going forward. It's wired into
attempt_service.py's _process_attempt_gamification_side_effects(), which is
gated by Attempt.gamification_processed_at -- and every historical DPS
attempt already claimed that same column for its economy (XP/coins) award
long before badge detection existed (2026-08-02), so the real-time hook can
never fire for those attempts again. Any student who did qualifying DPS work
before that date was never evaluated for these badges at all.

--apply calls the REAL evaluate_dps_attempt_submission() directly -- the
exact function attempt_service.py calls in production -- against every
completed historical DPS attempt, in chronological order per student. It is
NOT a reimplementation, so there is zero drift risk between what this
backfill awards and what live evaluation would have produced at the time.

IMPORTANT correction from this script's first draft: evaluate_dps_attempt_
submission() calls db.commit() internally at the end of every single
invocation (see achievements.py). That means it is NOT safe to "simulate
and roll back" the way this docstring originally claimed -- a caught bug
during testing (it silently wrote real StudentBadge/Notification rows
during what was supposed to be a --dry-run, confirmed via a throwaway test
DB, never run against production). This is the exact same constraint
backfill_mock_gamification.py's badge pass already documents for
evaluate_mock_exam_submission(). So:

  --dry-run:  READ-ONLY. Reuses diagnose_dps_badge_backfill.py's
              compute_qualified_tiers() (a separate, independent
              reimplementation of the same 10 families' logic, already
              logic-tested against synthetic data) to preview what would be
              awarded, without calling the real evaluator or writing
              anything. Because it's a second, independent implementation
              rather than the live code path, treat its numbers as a
              close preview, not a byte-exact guarantee -- --apply is the
              authority.
  --apply:    Writes for real via the actual evaluate_dps_attempt_submission(),
              which commits as it goes (matching production behavior
              exactly). Wipes DPS-scoped stats/badges first for a clean,
              deterministic replay.

Safe by design:
  - Only ever touches DPS-scoped rows: student_achievement_stats rows whose
    stat_name starts with "dps_", and student_badges rows whose badge code
    starts with "dps_". Never touches Level Mastery or mock-exam stats or
    badges -- same .like('dps\\_%', escape='\\') filter used everywhere else
    in this codebase for the same distinction (see routes_student.py's
    leaderboard filter).
  - --apply wipes just those DPS-scoped rows first, then replays every
    student's full DPS attempt history from scratch in chronological
    order, so re-running this script is always safe and idempotent.
  - Does NOT re-award economy (XP/coins). That already happened at each
    attempt's original submission time via the same gamification_processed_at
    claim; this only backfills the badge layer that shipped without
    detection logic.
  - Badge-unlock notifications are backdated to the attempt's real
    submitted_at (same convention backfill_mock_gamification.py uses for
    mock exams), so a student's notification history stays chronologically
    honest instead of months-old work suddenly appearing to unlock "just
    now". Deduped by (recipient, badge name) so re-running never creates
    duplicate notifications. Tagged "backfilled": true in metadata.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/backfill_dps_badges.py --dry-run   # default; read-only preview
    python scripts/backfill_dps_badges.py --apply     # actually writes

Run --dry-run first, read the summary, then --apply when ready.
"""
from __future__ import annotations

import argparse
import logging
import sys
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models.models import (  # noqa: E402
    AchievementBadge,
    Attempt,
    Notification,
    Student,
    StudentAchievementStat,
    StudentBadge,
)
from app.services.achievements import AchievementEngine, _DPS_COMPLETED_STATUSES  # noqa: E402
from app.services.notification_service import CreateNotification  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
from diagnose_dps_badge_backfill import compute_qualified_tiers, TIER_NAMES  # noqa: E402


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def preview_dry_run(db) -> dict:
    """Read-only. Never writes. Uses the independent reimplementation in
    diagnose_dps_badge_backfill.py, not the real (internally-committing)
    evaluator -- see module docstring for why."""
    stats = {
        "students_scanned": 0,
        "students_with_dps_history": 0,
        "attempts_replayed": 0,
        "badges_that_would_unlock": 0,
    }
    tier_rank = {name: i for i, name in enumerate(TIER_NAMES)}

    already_awarded: dict[str, set[tuple[str, str]]] = {}
    for sb, badge in (
        db.query(StudentBadge, AchievementBadge)
        .join(AchievementBadge, StudentBadge.badge_id == AchievementBadge.id)
        .filter(AchievementBadge.code.like("dps\\_%", escape="\\"))
        .all()
    ):
        already_awarded.setdefault(sb.student_id, set()).add((badge.code, badge.tier))

    students = db.query(Student).all()
    for student in students:
        stats["students_scanned"] += 1
        attempts = (
            db.query(Attempt)
            .filter(
                Attempt.student_id == student.id,
                Attempt.dps_id.isnot(None),
                Attempt.status.in_(_DPS_COMPLETED_STATUSES),
            )
            .order_by(Attempt.submitted_at.asc())
            .all()
        )
        if not attempts:
            continue
        stats["students_with_dps_history"] += 1
        stats["attempts_replayed"] += len(attempts)

        qualified = compute_qualified_tiers(attempts)
        for family, highest_tier in qualified.items():
            target_rank = tier_rank[highest_tier]
            for tier_name, rank in tier_rank.items():
                if rank <= target_rank and (family, tier_name) not in already_awarded.get(student.id, set()):
                    stats["badges_that_would_unlock"] += 1
                    print(f"  [would unlock] student={student.id} {tier_name} {family}")

    return stats


def run_apply(db) -> dict:
    """Writes for real via the actual evaluate_dps_attempt_submission()."""
    stats = {
        "students_scanned": 0,
        "students_with_dps_history": 0,
        "attempts_replayed": 0,
        "badges_newly_unlocked": 0,
        "badge_notifications_created": 0,
    }

    logging.info("Wiping existing DPS-scoped stats/badges for a clean deterministic replay...")
    db.query(StudentAchievementStat).filter(
        StudentAchievementStat.stat_name.like("dps\\_%", escape="\\")
    ).delete(synchronize_session=False)

    dps_badge_ids = [
        b.id
        for b in db.query(AchievementBadge.id)
        .filter(AchievementBadge.code.like("dps\\_%", escape="\\"))
        .all()
    ]
    if dps_badge_ids:
        db.query(StudentBadge).filter(
            StudentBadge.badge_id.in_(dps_badge_ids)
        ).delete(synchronize_session=False)
    db.commit()

    students = db.query(Student).all()
    for student in students:
        stats["students_scanned"] += 1
        attempts = (
            db.query(Attempt)
            .filter(
                Attempt.student_id == student.id,
                Attempt.dps_id.isnot(None),
                Attempt.status.in_(_DPS_COMPLETED_STATUSES),
            )
            .order_by(Attempt.submitted_at.asc())
            .all()
        )
        if not attempts:
            continue
        stats["students_with_dps_history"] += 1

        for attempt in attempts:
            stats["attempts_replayed"] += 1
            try:
                newly_unlocked = AchievementEngine.evaluate_dps_attempt_submission(db, student.id, attempt)
            except Exception as e:
                db.rollback()
                logging.error(f"Failed to evaluate DPS attempt {attempt.id} for student {student.id}: {e}")
                continue

            stats["badges_newly_unlocked"] += len(newly_unlocked)
            for b in newly_unlocked:
                print(
                    f"  [badge] {student.id} -- {b.get('tier')} '{b.get('name')}' "
                    f"({b.get('code')}), earned as of attempt {attempt.id} "
                    f"({attempt.submitted_at})"
                )
                existing_notif = (
                    db.query(Notification)
                    .filter(
                        Notification.recipient_user_id == student.user_id,
                        Notification.type == "BADGE_UNLOCKED",
                        Notification.title.ilike(f"%{b.get('name')}%"),
                    )
                    .first()
                )
                if existing_notif:
                    continue
                try:
                    n = CreateNotification(
                        db,
                        recipient_user_id=student.user_id,
                        recipient_role="STUDENT",
                        type="BADGE_UNLOCKED",
                        category="GAMIFICATION",
                        title=f"New Badge Unlocked: {b.get('name')}",
                        message=f"You unlocked the {b.get('tier')} tier '{b.get('name')}' badge for: {b.get('description')}!",
                        target_route=f"/student/achievements?tab=dps&badge={b.get('code')}_{b.get('tier')}",
                        color_variant="PURPLE",
                        metadata={
                            "badgeId": b.get("id"),
                            "tier": b.get("tier"),
                            "code": b.get("code"),
                            "icon": b.get("icon_name", "Target"),
                            "backfilled": True,
                        },
                    )
                    n.created_at = attempt.submitted_at or _now_utc()
                    db.commit()
                    stats["badge_notifications_created"] += 1
                except Exception as ne:
                    db.rollback()
                    logging.error(f"Failed to create backfill notification for {b.get('name')}: {ne}")

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument(
        "--apply", action="store_true",
        help="Actually write changes via the real evaluator. Without this, runs a read-only preview.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Explicit read-only preview (default behavior if --apply is omitted).",
    )
    args = parser.parse_args()

    apply = bool(args.apply and not args.dry_run)

    print("=" * 88)
    print(f"DPS BADGE BACKFILL -- mode: {'APPLY (writing changes)' if apply else 'DRY RUN (read-only preview, nothing written)'}")
    print("=" * 88)

    db = SessionLocal()
    try:
        if apply:
            result = run_apply(db)
            print("\n" + "=" * 88)
            print("SUMMARY")
            print("=" * 88)
            print(f"Students scanned:                  {result['students_scanned']}")
            print(f"Students with DPS attempt history:  {result['students_with_dps_history']}")
            print(f"DPS attempts replayed:              {result['attempts_replayed']}")
            print(f"Badges unlocked:                    {result['badges_newly_unlocked']}")
            print(f"Badge notifications created:        {result['badge_notifications_created']}")
        else:
            result = preview_dry_run(db)
            print("\n" + "=" * 88)
            print("SUMMARY (read-only preview)")
            print("=" * 88)
            print(f"Students scanned:                  {result['students_scanned']}")
            print(f"Students with DPS attempt history:  {result['students_with_dps_history']}")
            print(f"DPS attempts scanned:               {result['attempts_replayed']}")
            print(f"Badges that would be unlocked:      {result['badges_that_would_unlock']}")
            print("\nThis was a DRY RUN -- read-only, nothing was written. Re-run with --apply when ready.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
