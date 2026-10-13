#!/usr/bin/env python3
"""
One-time tidy-up for the notification revamp (2026-10-13).

From now on, approving a DPS re-attempt (or deciding an assessment
re-attempt request) marks its "needs approval" notices as read for everyone
who received one, so the bell's Needs Action tab only ever shows approvals
that are still waiting. Notices sent before this change were never closed,
so this script closes the ones whose approval has already been given (or
whose DPS has since been cleared or moved on):

  - DPS_REATTEMPT_APPROVAL_NEEDED: closed unless that student's DPS is
    still "Awaiting Admin Approval" right now.
  - ASSESSMENT_REATTEMPT_REQUEST_CREATED: closed unless the student still
    has a PENDING request for that assessment.

Only the read flag changes (is_read, read_at). Nothing is deleted, and a
notice for an approval that is still waiting is left unread.

Usage (run from backend/, with the same DATABASE_URL the live backend uses):
    python scripts/close_stale_approval_notices.py --dry-run
    python scripts/close_stale_approval_notices.py --apply
--dry-run is the default.
"""
from __future__ import annotations

import argparse
import os
import sys
from datetime import datetime, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.database import SessionLocal, engine  # noqa: E402
from app.models import AssessmentReattemptApproval, Notification  # noqa: E402
from app.services.dps_chain_state_service import BuildDpsChainIndex  # noqa: E402


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
        # Read-only in a dry run: no timed-out sheet is auto-submitted here.
        Index = BuildDpsChainIndex(db, Heal=False)
        Waiting = {(Concept.student_id, Concept.dps_id) for Concept in Index.awaiting_approval()}
        DpsNotices = db.query(Notification).filter(Notification.type == "DPS_REATTEMPT_APPROVAL_NEEDED", Notification.is_read == False).all()
        DpsStale = [Row for Row in DpsNotices if (Row.student_id, Row.dps_id) not in Waiting]

        Pending = db.query(AssessmentReattemptApproval).filter(AssessmentReattemptApproval.status == "PENDING").all()
        PendingAttempts = {Row.assessment_attempt_id for Row in Pending if Row.assessment_attempt_id}
        PendingAssignments = {(Row.student_id, Row.assessment_assignment_id) for Row in Pending}
        AssessNotices = db.query(Notification).filter(Notification.type == "ASSESSMENT_REATTEMPT_REQUEST_CREATED", Notification.is_read == False).all()
        AssessStale = [
            Row for Row in AssessNotices
            if Row.attempt_id not in PendingAttempts and (Row.student_id, Row.assessment_id) not in PendingAssignments
        ]

        print(f"DPS approvals still waiting: {len(Waiting)}", flush=True)
        print(f"Unread DPS approval notices: {len(DpsNotices)} -> closing {len(DpsStale)}, keeping {len(DpsNotices) - len(DpsStale)}", flush=True)
        print(f"Assessment re-attempt requests still pending: {len(Pending)}", flush=True)
        print(f"Unread assessment request notices: {len(AssessNotices)} -> closing {len(AssessStale)}, keeping {len(AssessNotices) - len(AssessStale)}", flush=True)
        ByRole: dict[str, int] = {}
        for Row in DpsStale + AssessStale:
            ByRole[Row.recipient_role] = ByRole.get(Row.recipient_role, 0) + 1
        print("Closing by recipient: " + (", ".join(f"{Role} {Count}" for Role, Count in sorted(ByRole.items())) or "none"), flush=True)

        if Apply:
            Now = datetime.now(timezone.utc)
            for Row in DpsStale + AssessStale:
                Row.is_read = True
                Row.read_at = Now
            db.commit()
            print(f"Done: {len(DpsStale) + len(AssessStale)} notices marked read.", flush=True)
        else:
            db.rollback()
            print("Dry run finished. Run again with --apply to make these changes.", flush=True)
        return 0
    finally:
        db.close()


if __name__ == "__main__":
    raise SystemExit(Main())
