"""Daily annual practice notice for admin and teachers (2026-10-14)."""

import json
from datetime import datetime, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Notification, User
from app.services.annual_practice_digest_service import AddToDailyPracticeDigest, DigestId


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    session.add(User(id="admin", full_name="Admin", email="a@x.test", password_hash="x", role="ADMIN", is_active=True))
    session.commit()
    yield session
    session.close()


def _entry(attempt, student, name, accuracy=80):
    return {"attemptId": attempt, "studentId": student, "studentCode": f"MP-{student}", "studentName": name,
            "levelCode": "PM-L2", "levelLabel": "PM Level 2", "paperLabel": "Practice Paper 4",
            "score": "40/50", "accuracy": accuracy, "submittedAt": None}


def _add(db, attempt, student, name, when, is_demo=False):
    AddToDailyPracticeDigest(db, recipient_user_id="admin", recipient_role="ADMIN", entry=_entry(attempt, student, name),
                             submitted_at=when, is_demo=is_demo, target_route="/admin/competition/annual-studio")
    db.commit()


def test_one_notice_per_day_listing_every_paper(db):
    morning = datetime(2026, 10, 14, 4, 0, tzinfo=timezone.utc)   # 9:30 IST
    _add(db, "t1", "s1", "Aarav Shah", morning)
    _add(db, "t2", "s1", "Aarav Shah", morning)
    _add(db, "t3", "s2", "Diya Mehta", morning)
    _add(db, "t3", "s2", "Diya Mehta", morning)  # the same paper again is listed once

    rows = db.query(Notification).all()
    assert len(rows) == 1
    assert rows[0].id == DigestId("admin", "2026-10-14", False)
    assert rows[0].title == "Annual Practice: 2 Students, 3 Papers (14 Oct)"
    assert rows[0].student_id is None
    entries = json.loads(rows[0].metadata_json)["entries"]
    assert [entry["attemptId"] for entry in entries] == ["t1", "t2", "t3"]


def test_a_new_paper_brings_a_read_notice_back_unread(db):
    when = datetime(2026, 10, 14, 6, 0, tzinfo=timezone.utc)
    _add(db, "t1", "s1", "Aarav Shah", when)
    row = db.query(Notification).one()
    row.is_read = True
    db.commit()
    _add(db, "t2", "s2", "Diya Mehta", when)
    row = db.query(Notification).one()
    assert row.is_read is False
    assert "Diya Mehta" in row.message


def test_days_follow_india_time_and_demo_accounts_get_their_own_notice(db):
    late_night_ist = datetime(2026, 10, 14, 19, 0, tzinfo=timezone.utc)   # 15 Oct, 00:30 IST
    _add(db, "t1", "s1", "Aarav Shah", late_night_ist)
    _add(db, "t2", "demo1", "Demo Kid", late_night_ist, is_demo=True)
    ids = sorted(row.id for row in db.query(Notification).all())
    assert ids == sorted([DigestId("admin", "2026-10-15", False), DigestId("admin", "2026-10-15", True)])
    demo_notice = db.get(Notification, DigestId("admin", "2026-10-15", True))
    # Named after a demo account, so "Show Demo Accounts" decides whether it shows.
    assert demo_notice.student_id == "demo1"
