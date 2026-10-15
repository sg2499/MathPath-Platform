#!/usr/bin/env python3
"""
Bring the old platform's newer payments across (Phase 2 part 6, 2026-10-15,
Shailesh): the old platform keeps taking payments until the end of October,
the new platform starts in November. Safe to run again: it only adds what
is not here yet.

What it brings across (details in app/services/payments/history_topup.py):
  - receipts the old platform recorded after the last run (back-dated ones
    too), with the old numbers, dates, method split, references and
    Razorpay ids, set against the invoices the old report names;
  - old invoices that are new since the last run, with the old numbers;
  - old invoices the old platform no longer shows as due (and that were
    not paid) are cancelled, reason "Removed on the old platform";
  - invoice and receipt numbering moves past the old platform's highest.
Money only: students' active/inactive status is not changed.

It stops without writing anything if any student's old-platform balance
here would differ from the old platform's Dues report, if the Dues file does
not add up to --expected-due, or if an old student with money is not on
this site.

The data folder is NEVER put in the repository:
    old-collections.csv   the old Collections report (covering everything
                          since the last run; a full-year report is fine)
    old-dues.csv          the old Dues report, as it stands now
    old-students.csv      the old Student Details lists (active + inactive)
    old-invoices.csv      only if the dry run asks for it

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/topup_old_payments.py --data /home/ubuntu/old-payments-topup --expected-due 59200
    python scripts/topup_old_payments.py --data /home/ubuntu/old-payments-topup --expected-due 59200 --apply

--expected-due is the old Dues report's TOTAL DUE less its two test records
(Dummy Rs 1,100 and ST5 Rs 2). A dry run is the default: it does everything
inside a transaction, prints the result and the checks, and rolls back.
--apply commits, and only if every check passed. Take a database backup
first.
"""
from __future__ import annotations

import argparse
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal, engine  # noqa: E402
from app.services.payments.history_import import ImportProblem  # noqa: E402
from app.services.payments.history_topup import LoadTopupData, RunTopup  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data", required=True, help="Folder with the old platform's CSV files.")
    parser.add_argument("--expected-due", required=True, help="The old Dues report's TOTAL DUE in rupees, less its two test records (Rs 1,102).")
    parser.add_argument("--apply", action="store_true", help="Write the changes. Without this, a dry run that changes nothing.")
    args = parser.parse_args()
    ExpectedDue = int(Decimal(args.expected_due.replace(",", "")) * 100)

    print("=" * 88)
    print(f"OLD PLATFORM TOP-UP -- mode: {'APPLY (writing)' if args.apply else 'DRY RUN (nothing will be written)'}")
    print(f"Database: {engine.url.render_as_string(hide_password=True)}")
    print(f"Data folder: {Path(args.data).resolve()}")
    print("=" * 88)

    db = SessionLocal()
    try:
        try:
            Data = LoadTopupData(Path(args.data))
            Result = RunTopup(db, Data, ExpectedDuePaise=ExpectedDue)
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
            print("\nThis was a DRY RUN. Nothing was written. Re-run with --apply to bring these across.")
            return 0
        db.commit()
        print("\nDone. Running this again with the same files changes nothing.")
        return 0
    except Exception:
        db.rollback()
        print("\nSomething went wrong; nothing was written. Send this output to Claude.")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(main())
