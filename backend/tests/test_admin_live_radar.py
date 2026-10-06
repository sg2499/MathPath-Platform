"""Regression coverage for the admin Live Radar fix (2026-10-06, Shailesh):
"that shows 331 mins ago as last seen instead of the accurate value ... it
should only show the live students who are actually active at any point of
time not when they were active last."

Two faults, both in GET /admin/live-students:
  - last_active_at lives in a plain TIMESTAMP column, so it reads back with
    no timezone; sent as-is, the browser took it for India time and every
    student looked 330 minutes stale. It must go out with its UTC offset.
  - the "live" window was five minutes; it is now LIVE_STUDENT_WINDOW_SECONDS
    (150), fed by a 60-second page heartbeat that is always recorded.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.routes_admin import LIVE_STUDENT_WINDOW_SECONDS, get_live_students
from app.database import Base
from app.dependencies import ACTIVITY_WRITE_DEBOUNCE_SECONDS
from app.models.models import Student, User


def _session():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()


def _student(db, code, seconds_ago):
    # Stored the way production stores it: UTC wall-clock time, no tzinfo.
    stamp = None if seconds_ago is None else (datetime.now(timezone.utc) - timedelta(seconds=seconds_ago)).replace(tzinfo=None)
    user = User(full_name=f"Student {code}", email=f"{code.lower()}@test.local", password_hash="x", role="STUDENT", last_active_at=stamp)
    db.add(user)
    db.flush()
    db.add(Student(user_id=user.id, student_code=code))
    db.commit()


def test_only_students_inside_the_live_window_are_listed_newest_first():
    db = _session()
    _student(db, "MP-ST-NOW", 20)
    _student(db, "MP-ST-MINUTE", 100)
    _student(db, "MP-ST-EDGE", LIVE_STUDENT_WINDOW_SECONDS - 10)
    _student(db, "MP-ST-LEFT", LIVE_STUDENT_WINDOW_SECONDS + 30)   # left a little over the window ago
    _student(db, "MP-ST-FIVE", 290)                                # the old 5-minute window would have listed this one
    _student(db, "MP-ST-NEVER", None)

    payload = get_live_students(db=db, user=None)

    assert [row["student_code"] for row in payload["live_students"]] == ["MP-ST-NOW", "MP-ST-MINUTE", "MP-ST-EDGE"]
    assert payload["count"] == 3
    assert payload["window_seconds"] == LIVE_STUDENT_WINDOW_SECONDS == 150


def test_last_active_time_is_sent_with_its_utc_offset():
    db = _session()
    _student(db, "MP-ST-NOW", 45)

    row = get_live_students(db=db, user=None)["live_students"][0]

    stamp = datetime.fromisoformat(row["last_active_at"])
    assert stamp.tzinfo is not None and stamp.utcoffset() == timedelta(0)
    # Read as the instant it is, the student was active under a minute ago --
    # not five and a half hours ago.
    assert 0 <= (datetime.now(timezone.utc) - stamp).total_seconds() < 60


def test_every_heartbeat_is_recorded_and_the_window_survives_one_missed_ping():
    heartbeat_seconds = 60  # frontend/hooks/useHeartbeat.ts
    assert ACTIVITY_WRITE_DEBOUNCE_SECONDS < heartbeat_seconds
    assert 2 * heartbeat_seconds < LIVE_STUDENT_WINDOW_SECONDS <= 3 * heartbeat_seconds
