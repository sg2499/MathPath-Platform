#!/usr/bin/env python3
"""
Reverses duplicate mock-completion EconomyTransaction rows found by
diagnose_duplicate_mock_economy.py (2026-07-29 incident).

Two distinct clusters exist in the data, reported separately below:
  - "TODAY'S RUN" (created_at 2026-07-29): caused by backfill_mock_gamification.py's
    stale "already paid?" check (looks for source_action=="ASSIGNMENT_COMPLETION",
    but real mock payouts are now tagged "MOCK_COMPLETION"), which re-paid every
    already-paid attempt.
  - "OLDER" (created_at before 2026-07-29, both rows same source_action, same
    day, minutes apart): an earlier, separately-discovered duplicate-run
    incident that predates this session.

For each (user_id, reference_id) group with more than one transaction, the
EARLIEST transaction is treated as legitimate; every later transaction in
that group is reversed.

Reversal does NOT delete the erroneous row -- it adds a compensating REFUND
transaction (negative xp/coins) referencing the bad transaction's id, so the
ledger keeps a complete, honest record of both the mistake and the fix. It
then subtracts the same amount from the student's real UserEconomy balance
(current_xp, coin_balance, lifetime_coins_earned) and recomputes rank_tier
from the corrected XP total, in case the duplicate falsely triggered a rank-up.

Safe to re-run: a transaction is only reversed once (guarded by checking for
an existing REFUND row whose reference_id points at it).

Usage:
    python scripts/reverse_duplicate_mock_economy.py --dry-run   # preview only (default)
    python scripts/reverse_duplicate_mock_economy.py --apply     # actually writes
    python scripts/reverse_duplicate_mock_economy.py --apply --only-today   # just the 2026-07-29 cluster
"""
from __future__ import annotations
import sys, os, argparse
sys.path.insert(0, os.getcwd())

from collections import defaultdict
from datetime import datetime, timezone
from app.database import SessionLocal
from app.models.models import EconomyTransaction, User, UserEconomy
from app.services.economy_service import calculate_rank_from_xp

TODAY_UTC = datetime(2026, 7, 29, tzinfo=timezone.utc).date()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--only-today", action="store_true", help="Only reverse the 2026-07-29 cluster, leave the older (pre-existing) duplicates untouched.")
    args = parser.parse_args()
    apply = bool(args.apply and not args.dry_run)

    db = SessionLocal()
    try:
        rows = (
            db.query(EconomyTransaction)
            .filter(EconomyTransaction.source_action.in_(["MOCK_COMPLETION", "ASSIGNMENT_COMPLETION"]))
            .order_by(EconomyTransaction.user_id, EconomyTransaction.reference_id, EconomyTransaction.created_at)
            .all()
        )
        # Existing reversals, so re-runs are idempotent.
        already_reversed_refs = {
            r.reference_id for r in db.query(EconomyTransaction).filter(EconomyTransaction.transaction_type == "REFUND").all()
        }

        groups = defaultdict(list)
        for r in rows:
            groups[(r.user_id, r.reference_id)].append(r)
        dup_groups = {k: v for k, v in groups.items() if len(v) > 1}

        today_count = older_count = 0
        today_xp = today_coins = older_xp = older_coins = 0
        skipped_already_reversed = 0
        by_user_delta = defaultdict(lambda: [0, 0])  # user_id -> [xp_delta, coin_delta]

        print("=" * 88)
        print(f"MOCK ECONOMY DUPLICATE REVERSAL -- mode: {'APPLY' if apply else 'DRY RUN'}"
              f"{' (today-only)' if args.only_today else ''}")
        print("=" * 88)

        for (user_id, reference_id), txs in sorted(dup_groups.items(), key=lambda kv: kv[1][0].created_at):
            legit = txs[0]
            duplicates = txs[1:]
            for dup in duplicates:
                if dup.id in already_reversed_refs:
                    skipped_already_reversed += 1
                    continue
                is_today = dup.created_at.date() == TODAY_UTC
                if args.only_today and not is_today:
                    continue

                if is_today:
                    today_count += 1
                    today_xp += dup.amount_xp or 0
                    today_coins += dup.amount_coins or 0
                else:
                    older_count += 1
                    older_xp += dup.amount_xp or 0
                    older_coins += dup.amount_coins or 0

                by_user_delta[user_id][0] -= (dup.amount_xp or 0)
                by_user_delta[user_id][1] -= (dup.amount_coins or 0)

                user = db.get(User, user_id)
                name = user.full_name if user else user_id
                print(f"  [{'today' if is_today else 'older'}] {name}: reversing tx {dup.id} "
                      f"(xp={dup.amount_xp}, coins={dup.amount_coins}, created_at={dup.created_at}) "
                      f"-- keeping {legit.id} ({legit.created_at})")

                if apply:
                    refund = EconomyTransaction(
                        user_id=user_id,
                        transaction_type="REFUND",
                        amount_xp=-(dup.amount_xp or 0),
                        amount_coins=-(dup.amount_coins or 0),
                        source_action="DUPLICATE_REVERSAL_2026-07-29",
                        reference_id=dup.id,
                    )
                    db.add(refund)

        if apply:
            db.commit()
            # Now apply the net balance corrections per user.
            for user_id, (xp_delta, coin_delta) in by_user_delta.items():
                econ = db.query(UserEconomy).filter(UserEconomy.user_id == user_id).first()
                if not econ:
                    continue
                econ.current_xp = max(0, econ.current_xp + xp_delta)
                econ.coin_balance = max(0, econ.coin_balance + coin_delta)
                econ.lifetime_coins_earned = max(0, econ.lifetime_coins_earned + coin_delta)
                old_rank = econ.current_rank_tier
                econ.current_rank_tier = calculate_rank_from_xp(econ.current_xp)
                if econ.current_rank_tier != old_rank:
                    user = db.get(User, user_id)
                    print(f"  [rank correction] {user.full_name if user else user_id}: "
                          f"{old_rank} -> {econ.current_rank_tier} (was falsely elevated by the duplicate)")
            db.commit()

        print("\n" + "=" * 88)
        print("SUMMARY")
        print("=" * 88)
        print(f"Today's-run duplicates {'reversed' if apply else 'that would be reversed'}: {today_count}  (xp={today_xp}, coins={today_coins})")
        if not args.only_today:
            print(f"Older (pre-existing) duplicates {'reversed' if apply else 'that would be reversed'}: {older_count}  (xp={older_xp}, coins={older_coins})")
        if skipped_already_reversed:
            print(f"Already reversed in a prior run, skipped: {skipped_already_reversed}")
        print(f"Students affected: {len(by_user_delta)}")
        if not apply:
            print("\nNo changes written. Re-run with --apply once you've reviewed this.")
    finally:
        db.close()

if __name__ == "__main__":
    main()
