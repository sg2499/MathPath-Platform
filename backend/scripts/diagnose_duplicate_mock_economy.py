#!/usr/bin/env python3
"""
READ-ONLY diagnostic. Finds duplicate mock-completion EconomyTransaction rows
created by the 2026-07-29 accidental re-run of backfill_mock_gamification.py.

Root cause: backfill_mock_gamification.py's "already paid?" check filters on
EconomyTransaction.source_action == "ASSIGNMENT_COMPLETION" -- and when it
DOES decide an attempt "needs" an award, it pays it via the OLDER
EconomyService.evaluate_assignment_performance(), which itself tags the new
transaction row source_action == "ASSIGNMENT_COMPLETION".

The live mock-submission path was since refactored to a newer formula,
EconomyService.evaluate_activity_performance(), which tags real mock payouts
source_action == "MOCK_COMPLETION" instead.

So a genuine duplicate looks like: one "MOCK_COMPLETION" row (the real,
original payment from when the student actually submitted) PLUS one
"ASSIGNMENT_COMPLETION" row (the erroneous backfill payment created today),
both sharing the same user_id + reference_id (reference_id is the mock
assignment id in both cases). A first pass of this script checked for
duplicates *within* a single source_action tag and found none -- that was
wrong, because it never compared across the two tags, which is where the
actual duplication would show up.

This script does NOT write anything. It groups EconomyTransaction rows by
(user_id, reference_id) across BOTH source_action values and prints every
group with more than one row.

Usage:
    python scripts/diagnose_duplicate_mock_economy.py
"""
from __future__ import annotations
import sys, os
sys.path.insert(0, os.getcwd())

from collections import defaultdict
from app.database import SessionLocal
from app.models.models import EconomyTransaction, User

def main():
    db = SessionLocal()
    try:
        rows = (
            db.query(EconomyTransaction)
            .filter(EconomyTransaction.source_action.in_(["MOCK_COMPLETION", "ASSIGNMENT_COMPLETION"]))
            .order_by(EconomyTransaction.user_id, EconomyTransaction.reference_id, EconomyTransaction.created_at)
            .all()
        )
        groups = defaultdict(list)
        for r in rows:
            groups[(r.user_id, r.reference_id)].append(r)

        dup_groups = {k: v for k, v in groups.items() if len(v) > 1}

        print("=" * 88)
        print(f"Total MOCK_COMPLETION + ASSIGNMENT_COMPLETION transactions: {len(rows)}")
        by_tag = defaultdict(int)
        for r in rows:
            by_tag[r.source_action] += 1
        for tag, count in by_tag.items():
            print(f"  {tag}: {count}")
        print(f"Distinct (user, reference_id) groups: {len(groups)}")
        print(f"Groups with MORE THAN ONE transaction (candidates): {len(dup_groups)}")
        print("=" * 88)

        total_dup_xp = 0
        total_dup_coins = 0
        affected_users = set()

        for (user_id, reference_id), txs in sorted(dup_groups.items(), key=lambda kv: kv[1][0].created_at):
            user = db.get(User, user_id)
            name = user.full_name if user else user_id
            affected_users.add(name)
            print(f"\n{name} (user_id={user_id})  reference_id={reference_id}  -- {len(txs)} transactions:")
            for t in txs:
                print(f"    id={t.id}  tag={t.source_action}  created_at={t.created_at}  xp={t.amount_xp}  coins={t.amount_coins}")
            # Assume the earliest is the legitimate original; sum the rest as duplicates.
            for extra in txs[1:]:
                total_dup_xp += extra.amount_xp or 0
                total_dup_coins += extra.amount_coins or 0

        print("\n" + "=" * 88)
        print("SUMMARY (assuming earliest transaction per group is the legitimate one)")
        print("=" * 88)
        print(f"Affected students: {len(affected_users)}")
        print(f"Duplicate transactions to reverse: {sum(len(v) - 1 for v in dup_groups.values())}")
        print(f"Total XP to claw back:    {total_dup_xp}")
        print(f"Total coins to claw back: {total_dup_coins}")
        print("\nNo changes written. Review this output before running a reversal.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
