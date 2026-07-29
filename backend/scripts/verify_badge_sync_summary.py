#!/usr/bin/env python3
"""
READ-ONLY sanity check after sync_badges.py. Summarizes how many students
hold each badge (grouped by family/tier), and separately reports how many
StudentAchievementStat rows exist for the 5 new Phase 2 stat names, so a
zero-badge family can be told apart from "the stat exists but nobody has
crossed BASE yet" vs "nothing ever got recorded at all".

Usage:
    python scripts/verify_badge_sync_summary.py
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.getcwd())

from collections import defaultdict
from app.database import SessionLocal
from app.models.models import StudentBadge, AchievementBadge, StudentAchievementStat

NEW_PHASE2_CODES = ["marathoner", "iron_wall", "veteran", "last_minute_hero", "section_specialist"]
NEW_PHASE2_STATS = [
    "marathoner_seconds",
    "iron_wall_streak_base", "iron_wall_streak_super", "iron_wall_streak_legendary", "iron_wall_streak_mythic",
    "veteran_questions",
    "last_minute_hero_mocks",
    "section_specialist_mocks",
]

def main():
    db = SessionLocal()
    try:
        counts = defaultdict(int)
        rows = (
            db.query(AchievementBadge.code, AchievementBadge.tier, AchievementBadge.name)
            .join(StudentBadge, StudentBadge.badge_id == AchievementBadge.id)
            .all()
        )
        for code, tier, name in rows:
            counts[(code, tier, name)] += 1

        print("=" * 88)
        print("Badge unlock counts, Phase 2 families only")
        print("=" * 88)
        for code in NEW_PHASE2_CODES:
            family_rows = [(t, n, c) for (cd, t, n), c in counts.items() if cd == code]
            if not family_rows:
                print(f"  {code}: 0 unlocks across all tiers")
                continue
            for tier, name, c in sorted(family_rows, key=lambda r: ["BASE", "SUPER", "LEGENDARY", "MYTHIC"].index(r[0])):
                print(f"  {code} / {tier} ({name}): {c} student(s)")

        print("\n" + "=" * 88)
        print("StudentAchievementStat rows, Phase 2 stat names only")
        print("=" * 88)
        for stat_name in NEW_PHASE2_STATS:
            n = db.query(StudentAchievementStat).filter(StudentAchievementStat.stat_name == stat_name).count()
            max_val = db.query(StudentAchievementStat.stat_value).filter(StudentAchievementStat.stat_name == stat_name).order_by(StudentAchievementStat.stat_value.desc()).first()
            print(f"  {stat_name}: {n} student(s) have this stat tracked, max value = {max_val[0] if max_val else 'N/A'}")

        total_badges = db.query(StudentBadge).count()
        print(f"\nTotal StudentBadge rows (all families): {total_badges}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
