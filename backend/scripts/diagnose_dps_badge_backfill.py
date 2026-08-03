"""
Read-only diagnostic: for every student, replay their FULL historical DPS
(daily practice sheet) attempt record against all 10 DPS badge families'
exact detection logic (mirrored from achievements.py's _evaluate_dps_*
methods) and report which tiers they would already qualify for -- compared
against which DPS badges they've actually been awarded in student_badges.

WHY THIS EXISTS: the DPS badge detection logic (achievements.py) only runs
as a post-submit hook on NEW attempts (see attempt_service.py). It does not
retroactively score a student's pre-existing attempt history the first time
it runs for them. Cumulative-count families (tome, quill, sage, midnight,
compass, anvil, phoenix) use an incremented stat that starts at 0 the
instant this code first executes for a student -- it does NOT reflect
qualifying work done before this code shipped. Streak families
(discipline, chain) are even more order-sensitive. dps_crystal is the one
exception: it recomputes live from full history every time, so it
self-corrects on a student's next DPS submission -- but even that student
gets nothing until they submit at least one more DPS attempt.

This script does NOT write anything. It is a SELECT-only report, safe to
run against production. It exists to answer one question before any
backfill/award script is written: how many students, and how many badge
tiers, are actually affected right now.

Usage:
    python backend/scripts/diagnose_dps_badge_backfill.py

Run this against the REAL database (set DATABASE_URL accordingly) -- a
local/empty dev SQLite DB will trivially report zero everywhere.
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from collections import defaultdict
from datetime import timedelta, timezone
from app.database import SessionLocal
from app.models.models import Attempt, Student, StudentBadge, AchievementBadge

_DPS_COMPLETED_STATUSES = ("SUBMITTED", "AUTO_SUBMITTED")

# family -> (BASE, SUPER, LEGENDARY, MYTHIC) thresholds, mirrored from
# achievements.py's seed_badges() DPS block -- keep in sync with that file.
TIER_THRESHOLDS = {
    "dps_discipline": (1, 4, 12, 36),      # consecutive qualifying weeks
    "dps_crystal": (5, 25, 75, 200),       # distinct 100%-accuracy sheets
    "dps_tome": (25, 100, 350, 500),       # lifetime completed sheets
    "dps_quill": (5, 25, 75, 150),         # lifetime "speed" qualifiers
    "dps_sage": (5, 20, 50, 100),          # lifetime "sage" qualifiers
    "dps_chain": (10, 50, 120, 250),       # consecutive no-skip sheets
    "dps_phoenix": (1, 5, 15, 30),         # lifetime comeback qualifiers
    "dps_anvil": (1, 10, 30, 60),          # lifetime retry-100 qualifiers
    "dps_midnight": (5, 25, 75, 150),      # lifetime weekend sheets
    "dps_compass": (10, 40, 100, 250),     # lifetime first-try >90% sheets
}
TIER_NAMES = ("BASE", "SUPER", "LEGENDARY", "MYTHIC")


def _make_aware(dt):
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _dps_week_start(dt):
    start = dt - timedelta(days=dt.weekday())
    return start.replace(hour=0, minute=0, second=0, microsecond=0)


def _tier_for_count(family: str, count: int) -> str | None:
    thresholds = TIER_THRESHOLDS[family]
    tier = None
    for name, need in zip(TIER_NAMES, thresholds):
        if count >= need:
            tier = name
    return tier


def compute_qualified_tiers(attempts: list[Attempt]) -> dict[str, str]:
    """attempts: one student's completed DPS attempts, already sorted by
    submitted_at ascending. Returns {family: highest_qualifying_tier}."""
    result: dict[str, str | None] = {f: None for f in TIER_THRESHOLDS}

    # -- dps_tome: lifetime completed count --
    result["dps_tome"] = _tier_for_count("dps_tome", len(attempts))

    # -- dps_crystal: distinct dps_id with 100% accuracy --
    crystal_seen = set()
    for a in attempts:
        if float(a.accuracy_percentage or 0) == 100:
            crystal_seen.add(a.dps_id)
    result["dps_crystal"] = _tier_for_count("dps_crystal", len(crystal_seen))

    # -- dps_quill: <50% of allocated time AND >90% accuracy, lifetime count --
    quill_count = 0
    for a in attempts:
        allocated = float(a.duration_seconds or 0)
        if allocated <= 0:
            continue
        taken = float(a.time_taken_seconds or 0)
        if (taken / allocated) < 0.5 and float(a.accuracy_percentage or 0) > 90:
            quill_count += 1
    result["dps_quill"] = _tier_for_count("dps_quill", quill_count)

    # -- dps_sage: >=95% of allocated time AND ==100% accuracy, lifetime count --
    sage_count = 0
    for a in attempts:
        allocated = float(a.duration_seconds or 0)
        if allocated <= 0:
            continue
        taken = float(a.time_taken_seconds or 0)
        if (taken / allocated) >= 0.95 and float(a.accuracy_percentage or 0) == 100:
            sage_count += 1
    result["dps_sage"] = _tier_for_count("dps_sage", sage_count)

    # -- dps_midnight: weekend (Sat/Sun UTC) submissions, lifetime count --
    midnight_count = 0
    for a in attempts:
        submitted = _make_aware(a.submitted_at)
        if submitted and submitted.weekday() >= 5:
            midnight_count += 1
    result["dps_midnight"] = _tier_for_count("dps_midnight", midnight_count)

    # -- dps_compass: attempt_number==0 AND accuracy>90, lifetime count --
    compass_count = 0
    for a in attempts:
        if int(a.attempt_number or 0) == 0 and float(a.accuracy_percentage or 0) > 90:
            compass_count += 1
    result["dps_compass"] = _tier_for_count("dps_compass", compass_count)

    # -- dps_phoenix: accuracy>90 AND immediately-previous submission <50%,
    # lifetime count of qualifying moments (chronological single pass) --
    phoenix_count = 0
    for i, a in enumerate(attempts):
        if i == 0:
            continue
        if float(a.accuracy_percentage or 0) <= 90:
            continue
        prev = attempts[i - 1]
        if float(prev.accuracy_percentage or 0) < 50:
            phoenix_count += 1
    result["dps_phoenix"] = _tier_for_count("dps_phoenix", phoenix_count)

    # -- dps_anvil: same attempt_group_id, attempt_number-1 row failed
    # (benchmark_status != CLEARED), this row scores 100% -- lifetime count.
    # NOTE: requires grouping by attempt_group_id + attempt_number, which
    # needs the full unfiltered attempt set for correctness (a failed
    # attempt_number-1 row might not itself be in "completed" statuses in
    # unusual data). This diagnostic approximates using only completed
    # attempts sorted by attempt_number within each group -- flagged as a
    # best-effort approximation, not a guarantee, in the printed report.
    by_group: dict[str, dict[int, Attempt]] = defaultdict(dict)
    for a in attempts:
        if a.attempt_group_id:
            by_group[a.attempt_group_id][int(a.attempt_number or 0)] = a
    anvil_count = 0
    for group in by_group.values():
        for num, a in group.items():
            if num <= 0 or float(a.accuracy_percentage or 0) != 100:
                continue
            prev = group.get(num - 1)
            if prev is not None and prev.benchmark_status != "CLEARED":
                anvil_count += 1
    result["dps_anvil"] = _tier_for_count("dps_anvil", anvil_count)

    # -- dps_chain: consecutive (chronological) completed attempts with
    # zero unanswered questions; any attempt with unanswered>0 resets the
    # streak. Reports the MAX streak ever reached historically. --
    chain_streak = 0
    chain_max = 0
    for a in attempts:
        if (a.unanswered_count or 0) == 0:
            chain_streak += 1
            chain_max = max(chain_max, chain_streak)
        else:
            chain_streak = 0
    result["dps_chain"] = _tier_for_count("dps_chain", chain_max)

    # -- dps_discipline: consecutive Mon-Sun weeks with >=5 distinct dps_id
    # completed. Reports the MAX streak ever reached historically. --
    by_week: dict[int, set] = defaultdict(set)
    for a in attempts:
        submitted = _make_aware(a.submitted_at)
        if not submitted:
            continue
        week_epoch = int(_dps_week_start(submitted).timestamp())
        by_week[week_epoch].add(a.dps_id)
    qualifying_weeks = sorted(
        epoch for epoch, sheets in by_week.items() if len(sheets) >= 5
    )
    streak = 0
    max_streak = 0
    prev_epoch = None
    for epoch in qualifying_weeks:
        if prev_epoch is not None and epoch == prev_epoch + 7 * 86400:
            streak += 1
        else:
            streak = 1
        max_streak = max(max_streak, streak)
        prev_epoch = epoch
    result["dps_discipline"] = _tier_for_count("dps_discipline", max_streak)

    return {k: v for k, v in result.items() if v is not None}


def main():
    db = SessionLocal()
    try:
        students = db.query(Student).all()
        print(f"Students in DB: {len(students)}")

        existing_badge_rows = (
            db.query(StudentBadge, AchievementBadge)
            .join(AchievementBadge, StudentBadge.badge_id == AchievementBadge.id)
            .filter(AchievementBadge.code.like("dps\\_%", escape="\\"))
            .all()
        )
        already_awarded: dict[str, set[tuple[str, str]]] = defaultdict(set)
        for sb, badge in existing_badge_rows:
            already_awarded[sb.student_id].add((badge.code, badge.tier))
        print(f"Existing DPS StudentBadge rows (any tier, any student): {len(existing_badge_rows)}")

        tier_rank = {name: i for i, name in enumerate(TIER_NAMES)}
        missing_count = 0
        affected_students = 0
        family_missing_totals: dict[str, int] = defaultdict(int)

        for student in students:
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

            qualified = compute_qualified_tiers(attempts)
            student_missing = []
            for family, highest_tier in qualified.items():
                target_rank = tier_rank[highest_tier]
                for tier_name, rank in tier_rank.items():
                    if rank <= target_rank and (family, tier_name) not in already_awarded.get(student.id, set()):
                        student_missing.append((family, tier_name))
                        family_missing_totals[family] += 1
                        missing_count += 1

            if student_missing:
                affected_students += 1
                print(f"student_id={student.id}: {len(attempts)} completed DPS attempts, "
                      f"missing {len(student_missing)} badge(s): {sorted(student_missing)}")

        print("\n--- SUMMARY ---")
        print(f"Students with >=1 completed DPS attempt: {sum(1 for s in students if True)} checked")
        print(f"Students missing at least one qualifying DPS badge: {affected_students}")
        print(f"Total missing badge-awards across all students/tiers: {missing_count}")
        for family, count in sorted(family_missing_totals.items()):
            print(f"  {family}: {count} missing awards")

        print("\nNote: dps_anvil is a best-effort approximation (grouped by "
              "attempt_group_id/attempt_number over COMPLETED attempts only -- "
              "a failed prior attempt that never reached a completed status "
              "would not be visible to this query). dps_discipline and "
              "dps_chain report the MAX streak ever historically reached, "
              "which is what the live detector would also converge to given "
              "the same history replayed in order.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
