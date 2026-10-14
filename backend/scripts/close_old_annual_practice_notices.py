#!/usr/bin/env python3
"""
One-time tidy-up for the daily annual practice notice (Phase 2, 2026-10-14).

Admin and teachers used to get one "<Student> Submitted A Practice Paper"
notice per Annual Competition practice paper (1,685 unread for admin on
14 Oct). From now on they get one notice per day listing every paper
(app/services/annual_practice_digest_service.py). This marks the old
per-paper notices as read so the bell starts clean.

Only the read flag changes (is_read, read_at). Nothing is deleted, the
notices stay in each person's notification history, and the students' own
"Practice Paper Submitted" notices are not touched.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/close_old_annual_practice_notices.py --dry-run
    python scripts/close_old_annual_practice_notices.py --apply
--dry-run is the default.
"""
from __future__ import annotations

import argparse
import os
import sys
from collections import Counter
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine  # noqa: E402
from app.models import Notification, User  # noqa: E402

OLD_TYPE = "ANNUAL_PRACTICE_SUBMITTED_BY_STUDENT"
STAFF_ROLES = ("ADMIN", "SUPER_ADMIN", "TEACHER")


def Main() -> int:
    Parser = argparse.ArgumentParser()
    Parser.add_argument("--apply", action="store_true")
    Parser.add_argument("--dry-run", action="store_true")
    Args = Parser.parse_args()
    Apply = bool(Args.apply) and not Args.dry_run
    print(f"Database: {engine.url.render_as_string(hide_password=True)}", flush=True)
    print("Mode: APPLY" if Apply else "Mode: DRY RUN (nothing is changed)", flush=True)

    db = SessionLocal()
    try:
        Rows = (
            db.query(Notification)
            .filter(
                Notification.type == OLD_TYPE,
                Notification.recipient_role.in_(STAFF_ROLES),
                Notification.is_read == False,  # noqa: E712
            )
            .all()
        )
        ByRecipient = Counter(Row.recipient_user_id for Row in Rows)
        Names = {UserRow.id: (UserRow.full_name, UserRow.role) for UserRow in db.query(User).filter(User.id.in_(list(ByRecipient) or ["-"])).all()}
        print(f"\nUnread per-paper notices to mark read: {len(Rows)}", flush=True)
        for UserId, Count in ByRecipient.most_common():
            Name, Role = Names.get(UserId, ("(unknown)", "?"))
            print(f"  {Name:<30} {Role:<12} {Count}", flush=True)

        if not Apply:
            print("\nDry run only. Run again with --apply to mark them read.", flush=True)
            return 0

        Now = datetime.now(timezone.utc)
        for Row in Rows:
            Row.is_read = True
            Row.read_at = Now
        db.commit()
        print(f"\nDone: {len(Rows)} notices marked read.", flush=True)
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(Main())
