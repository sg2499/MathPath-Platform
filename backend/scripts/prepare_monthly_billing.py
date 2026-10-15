#!/usr/bin/env python3
"""
Get monthly billing ready for the first month billed on the new platform
(Phase 2 part 6, 2026-10-15). Details in
app/services/payments/billing_readiness.py:
  - chooses the India and International monthly fees where none is chosen;
  - sets students to International billing when their latest monthly
    invoice is the international fee (a mode chosen by hand is never
    overwritten);
  - lists what needs a decision (active students the old platform did not
    bill in its latest month).
Run it after the old-platform top-up, before the 1st of the month.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/prepare_monthly_billing.py            # dry run
    python scripts/prepare_monthly_billing.py --apply
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, engine  # noqa: E402
from app.services.payments.billing_readiness import PrepareMonthlyBilling  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="Save the changes. Without this, a dry run that changes nothing.")
    args = parser.parse_args()
    print("=" * 88)
    print(f"MONTHLY BILLING READINESS -- mode: {'APPLY (writing)' if args.apply else 'DRY RUN (nothing will be written)'}")
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    print("=" * 88)
    db = SessionLocal()
    try:
        Result = PrepareMonthlyBilling(db)
        for Line in Result.lines:
            print(Line)
        if Result.to_decide:
            print("-" * 88)
            print("FOR SHAILESH TO DECIDE (nothing is changed for these):")
            for Line in Result.to_decide:
                print(f"  - {Line}")
        print("-" * 88)
        if not args.apply:
            db.rollback()
            print("This was a DRY RUN. Nothing was written. Re-run with --apply to save.")
            return 0
        db.commit()
        print("Done.")
        return 0
    except Exception:
        db.rollback()
        print("\nSomething went wrong; nothing was written. Send this output to Claude.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
