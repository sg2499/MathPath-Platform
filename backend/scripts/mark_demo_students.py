#!/usr/bin/env python3
"""
Mark demo / test student accounts (Phase 2, 2026-10-14).

A demo account keeps working (it can sign in and practise). For admin and
teachers it is left out of every count, tracker, readiness view,
leaderboard, mock list, notification and payments screen unless they turn
on "Show Demo Accounts" in the top bar -- see app/services/demo_students.py.

By default this marks MP-ST-001 to MP-ST-009, the demo accounts created in
May and June. It also marks as read the unread notices that admin and
teachers already received about these accounts. Nothing is deleted:
practice, results and any invoices stay in the database.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/mark_demo_students.py --dry-run
    python scripts/mark_demo_students.py --apply
    python scripts/mark_demo_students.py --codes MP-ST-010 --apply   # other accounts
    python scripts/mark_demo_students.py --codes MP-ST-004 --undo --apply  # make real again
--dry-run is the default.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine  # noqa: E402
from app.models import Notification, Student, User  # noqa: E402

DEFAULT_CODES = [f"MP-ST-{Number:03d}" for Number in range(1, 10)]
STAFF_ROLES = ("ADMIN", "SUPER_ADMIN", "TEACHER")


def Main() -> int:
    Parser = argparse.ArgumentParser()
    Parser.add_argument("--apply", action="store_true")
    Parser.add_argument("--dry-run", action="store_true")
    Parser.add_argument("--undo", action="store_true", help="make the accounts real (not demo) again")
    Parser.add_argument("--codes", nargs="+", help="student codes (default: MP-ST-001 to MP-ST-009)")
    Args = Parser.parse_args()
    Apply = bool(Args.apply) and not Args.dry_run
    Codes = [Code.strip().upper() for Code in (Args.codes or DEFAULT_CODES)]
    MakeDemo = not Args.undo

    print(f"Database: {engine.url.render_as_string(hide_password=True)}", flush=True)
    print("Mode: APPLY" if Apply else "Mode: DRY RUN (nothing is changed)", flush=True)
    print(f"Action: mark as {'DEMO' if MakeDemo else 'REAL (not demo)'}", flush=True)

    db = SessionLocal()
    try:
        Rows = (
            db.query(Student, User)
            .join(User, Student.user_id == User.id)
            .filter(Student.student_code.in_(Codes))
            .order_by(Student.student_code.asc())
            .all()
        )
        Found = {StudentRow.student_code for StudentRow, _ in Rows}
        Missing = [Code for Code in Codes if Code not in Found]

        print(f"\nAccounts ({len(Rows)} found):", flush=True)
        for StudentRow, UserRow in Rows:
            Teacher = StudentRow.teacher or "-"
            State = "already demo" if StudentRow.is_demo else "real"
            Active = "active" if StudentRow.is_active and UserRow.is_active else "inactive"
            print(f"  {StudentRow.student_code:<11} {UserRow.full_name:<28} teacher: {Teacher:<22} {Active:<8} now: {State}", flush=True)
        for Code in Missing:
            print(f"  {Code:<11} NOT FOUND (skipped)", flush=True)

        Changing = [StudentRow for StudentRow, _ in Rows if bool(StudentRow.is_demo) != MakeDemo]
        Ids = [StudentRow.id for StudentRow, _ in Rows]
        Notices = []
        if MakeDemo and Ids:
            Notices = (
                db.query(Notification)
                .filter(
                    Notification.student_id.in_(Ids),
                    Notification.recipient_role.in_(STAFF_ROLES),
                    Notification.is_read == False,  # noqa: E712
                )
                .all()
            )

        print(f"\nTo change: {len(Changing)} account(s)", flush=True)
        if MakeDemo:
            print(f"Unread admin/teacher notices about them to mark read: {len(Notices)}", flush=True)

        if not Apply:
            print("\nDry run only. Run again with --apply to make these changes.", flush=True)
            return 0

        for StudentRow in Changing:
            StudentRow.is_demo = MakeDemo
        Now = datetime.now(timezone.utc)
        for Row in Notices:
            Row.is_read = True
            Row.read_at = Now
        db.commit()
        print(f"\nDone: {len(Changing)} account(s) updated, {len(Notices)} notices marked read.", flush=True)
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(Main())
