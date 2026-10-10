#!/usr/bin/env python3
"""
One-time import of the old platform's payment history (2026-10-10,
Shailesh): "transfer the payment history from the old site to the new
platform".

What it brings in (details in app/services/payments/history_import.py):
  - every old invoice and payment, with the old numbers, dates, method
    split, references, Razorpay ids and discounts;
  - fee items from the old fee groups;
  - the 12 former students who are not on this site, added INACTIVE after
    the last student code (MP-ST-0155 onwards), in their old order;
  - invoice and receipt numbering set to continue after the old site's.

Everything is marked as old-site history (source LEGACY): nothing is sent to
students, Day Close and the unusual-activity checks leave it alone, and one
line is added to the activity feed.

The data folder holds the old site's files and is NEVER put in the
repository (students.csv carries old login details, which this script drops
as it reads them):
    students.csv, payments.csv, payment_groups.csv,
    old-site-collections-<date>.csv

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/import_old_payments.py --data /home/ubuntu/old-payments --expected-due 102300
    python scripts/import_old_payments.py --data /home/ubuntu/old-payments --expected-due 102300 --apply

A dry run is the default: it does the whole import inside a transaction,
prints the result and the checks, and rolls everything back. --apply
commits, and only if every check passed. Take a database backup first.
Running it a second time after --apply stops at once and changes nothing.
"""
from __future__ import annotations

import argparse
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, engine  # noqa: E402
from app.services.payments.history_import import ImportProblem, LoadOldData, RunImport  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", required=True, help="Folder with the old site's CSV files.")
    parser.add_argument("--expected-due", help="The old site's dues in rupees, without its two test records (10 Oct: Dues report 103402 less 1102 on the test records = 102300). The import must match it.")
    parser.add_argument("--apply", action="store_true", help="Write the history. Without this, a dry run that changes nothing.")
    args = parser.parse_args()
    ExpectedDue = int(Decimal(args.expected_due.replace(",", "")) * 100) if args.expected_due else None

    print("=" * 88)
    print(f"OLD PLATFORM PAYMENT HISTORY -- mode: {'APPLY (writing)' if args.apply else 'DRY RUN (nothing will be written)'}")
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    print(f"Data folder: {Path(args.data).resolve()}")
    print("=" * 88)

    db = SessionLocal()
    try:
        try:
            Data = LoadOldData(Path(args.data))
            Result = RunImport(db, Data, ExpectedDuePaise=ExpectedDue)
        except ImportProblem as Problem:
            db.rollback()
            print(f"\nSTOPPED: {Problem}")
            print("Nothing was written.")
            return 2
        for Line in Result.lines:
            print(Line)
        print("-" * 88)
        if Result.problems:
            print(f"CHECKS FAILED ({len(Result.problems)}):")
            for Problem in Result.problems:
                print(f"  - {Problem}")
            db.rollback()
            print("\nNothing was written. Send this output to Claude.")
            return 1
        print("All checks passed.")
        if not args.apply:
            db.rollback()
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply to bring the history in.")
            return 0
        db.commit()
        print("\nDone. The old payment history is in. Running this again will stop without changing anything.")
        return 0
    except Exception:
        db.rollback()
        print("\nSomething went wrong; nothing was written. Send this output to Claude.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
