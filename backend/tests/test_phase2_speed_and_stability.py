"""Phase 2 part 1 (2026-10-14): the big list screens read their rows in a
few batched queries instead of one set per row, and must return exactly
what they returned before. Also the two server-log fixes: the startup
schema lock and the thread-safe online-user cache."""

import threading
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import DPS, Assignment, AssignmentReattemptPermission, Attempt, Lesson, Level, Module, Student, User
from app.services import request_cache
from app.services.assessment_eligibility_service import assessment_eligibility_payload, eligibility_for_students

T0 = datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc)


@pytest.fixture()
def engine():
    item = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(item)
    return item


@pytest.fixture()
def db(engine):
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    yield session
    session.close()


@pytest.fixture()
def world(db):
    db.add(User(id="admin", full_name="Admin", email="a@x.test", password_hash="x", role="ADMIN", is_active=True))
    db.add(Module(id="m", module_code="IM", module_name="Intermediate"))
    db.flush()
    for level_number in (1, 2):
        db.add(Level(id=f"l{level_number}", module_id="m", level_code=f"IM-L{level_number}", level_name=f"IM L{level_number}"))
        db.flush()
        for lesson_number in (1, 2):
            lesson_id = f"l{level_number}-ls{lesson_number}"
            db.add(Lesson(id=lesson_id, level_id=f"l{level_number}", lesson_number=lesson_number, lesson_title=f"Lesson {lesson_number}"))
            db.flush()
            for dps_number in (1, 2, 3):
                db.add(DPS(id=f"{lesson_id}-d{dps_number}", lesson_id=lesson_id, dps_number=dps_number, dps_title=f"DPS {dps_number}"))
    for index, level_id in enumerate(["l1", "l1", "l2", "l2", "l1"]):
        sid = f"s{index}"
        db.add(User(id=f"u-{sid}", full_name=f"Student {sid}", email=f"{sid}@x.test", password_hash="x", role="STUDENT", is_active=True))
        db.flush()
        db.add(Student(id=sid, user_id=f"u-{sid}", student_code=f"MP-{sid}", is_active=True, current_level_id=level_id, current_module_id="m"))
    db.flush()

    counter = 0
    for index in range(5):
        sid = f"s{index}"
        level_id = "l1" if index in (0, 1, 4) else "l2"
        for dps_index, dps_id in enumerate([f"{level_id}-ls1-d1", f"{level_id}-ls1-d2", f"{level_id}-ls2-d1"]):
            counter += 1
            assignment = Assignment(
                id=f"a{counter}", assignment_type="PRACTICE", dps_id=dps_id, assigned_to_type="STUDENT", assigned_to_id=sid,
                assigned_by_user_id="admin", title=f"{dps_id}", retry_attempt_number=0, is_active=True,
                created_at=T0 + timedelta(minutes=counter),
            )
            db.add(assignment)
            db.flush()
            # Two tries on some sheets, different accuracies, one below 70.
            for try_number, accuracy in enumerate([55.0, 82.0][: 1 + (index + dps_index) % 2]):
                counter += 1
                db.add(Attempt(
                    id=f"t{counter:03d}", assignment_id=assignment.id, dps_id=dps_id, student_id=sid, mode="PRACTICE",
                    status="SUBMITTED", attempt_group_id=assignment.id, attempt_number=try_number,
                    started_at=T0 + timedelta(hours=counter), submitted_at=T0 + timedelta(hours=counter, minutes=9),
                    expires_at=T0 + timedelta(hours=counter, minutes=15), duration_seconds=900, accuracy_percentage=accuracy,
                    total_score=accuracy / 10, max_score=10,
                ))
            if index == 1 and dps_index == 0:
                db.add(AssignmentReattemptPermission(
                    id="perm-late", assignment_id=assignment.id, dps_id=dps_id, student_id=sid, status="APPROVED",
                    allowed_at=T0 + timedelta(days=2), used_at=None,
                ))
                db.add(AssignmentReattemptPermission(
                    id="perm-early", assignment_id=assignment.id, dps_id=dps_id, student_id=sid, status="APPROVED",
                    allowed_at=T0 + timedelta(days=1), used_at=None,
                ))
    db.commit()
    return db


class QueryCounter:
    def __init__(self, engine):
        self.count = 0
        event.listen(engine, "before_cursor_execute", self._hit)
        self.engine = engine

    def _hit(self, *_args, **_kwargs):
        self.count += 1

    def close(self):
        event.remove(self.engine, "before_cursor_execute", self._hit)


def test_batched_readiness_matches_the_one_by_one_payload(world, engine):
    db = world
    students = db.query(Student).order_by(Student.student_code).all()
    one_by_one = [assessment_eligibility_payload(db, student, student.current_level_id) for student in students]
    # The single-student reply still carries the per-sheet lists.
    assert all("missingDps" in row and "belowBenchmarkDps" in row for row in one_by_one)

    counter = QueryCounter(engine)
    try:
        batched = eligibility_for_students(db, students)
    finally:
        counter.close()

    expected = [{key: value for key, value in row.items() if key not in {"missingDps", "belowBenchmarkDps"}} for row in one_by_one]
    assert batched == expected
    # A few per level plus one attempt query, not one per student per sheet (30+ here).
    assert counter.count <= 12


def test_assignment_rows_are_identical_with_the_request_cache(world, engine):
    from app.api.routes_admin import assignment_payload

    db = world
    assignments = db.query(Assignment).order_by(Assignment.id).all()
    plain = [assignment_payload(db, item) for item in assignments]

    db.info.pop("mp_request_cache", None)
    request_cache.EnableRequestCache(db)
    request_cache.PinRows(db, DPS, Lesson, Level, Module, Student, User)
    request_cache.PrimeAssignmentAttempts(db, [item.id for item in assignments])
    counter = QueryCounter(engine)
    try:
        cached = [assignment_payload(db, item) for item in assignments]
    finally:
        counter.close()
    assert cached == plain
    # Only the one grouped DPS-count query (plus any teacher lookups) remain.
    assert counter.count <= 3


def test_teacher_tracker_helpers_match_their_queries(world):
    from app.api import routes_teacher

    db = world
    pairs = [(item.id, item.assigned_to_id) for item in db.query(Assignment).all()]
    plain_latest = {pair: routes_teacher.latest_attempt_for_assignment(db, *pair) for pair in pairs}
    plain_history = {pair: [row.id for row in routes_teacher.all_attempts_for_assignment_student(db, *pair)] for pair in pairs}
    plain_permission = {pair: routes_teacher.active_reattempt_permission_for_assignment(db, *pair) for pair in pairs}
    assert any(value is not None for value in plain_permission.values())

    request_cache.EnableRequestCache(db)
    request_cache.PrimeAssignmentAttempts(db, [pair[0] for pair in pairs])
    request_cache.PrimeOpenReattemptPermissions(db, [pair[0] for pair in pairs])
    for pair in pairs:
        assert routes_teacher.latest_attempt_for_assignment(db, *pair) is plain_latest[pair]
        assert [row.id for row in routes_teacher.all_attempts_for_assignment_student(db, *pair)] == plain_history[pair]
        assert routes_teacher.active_reattempt_permission_for_assignment(db, *pair) is plain_permission[pair]
    # The oldest open approval wins, as in the query.
    assert "perm-early" in {getattr(value, "id", None) for value in plain_permission.values()}


def test_latest_attempt_follows_postgres_null_ordering(db):
    """ORDER BY started_at DESC puts a NULL start first in Postgres."""
    rows = [
        SimpleNamespace(id="x1", student_id="s", started_at=T0),
        SimpleNamespace(id="x2", student_id="s", started_at=None),
        SimpleNamespace(id="x3", student_id="s", started_at=T0 + timedelta(hours=1)),
    ]
    request_cache.EnableRequestCache(db)["attempts_by_assignment"] = {"a": rows}
    assert request_cache.LatestAttemptForAssignmentStudent(db, "a", "s") == (True, rows[1])
    rows[1].started_at = T0 - timedelta(days=1)
    assert request_cache.LatestAttemptForAssignmentStudent(db, "a", "s") == (True, rows[2])
    assert request_cache.LatestAttemptForAssignmentStudent(db, "a", "other") == (True, None)
    assert request_cache.LatestAttemptForAssignmentStudent(db, "missing", "s") == (False, None)


def test_helpers_fall_back_when_the_cache_is_off(world):
    db = world
    assert request_cache.RequestCache(db) is None
    assert request_cache.LevelDpsCount(db, "l1") is None
    assert request_cache.AttemptsForAssignment(db, "a1") is None
    assert request_cache.OpenReattemptPermission(db, "a1", "s0") == (False, None)
    request_cache.EnableRequestCache(db)
    assert request_cache.LevelDpsCount(db, "l1") == 6
    assert request_cache.LevelDpsCount(db, None) == 0


def test_online_user_cache_is_safe_under_parallel_requests(monkeypatch):
    from cachetools import TTLCache

    from app import dependencies

    monkeypatch.setattr(dependencies, "active_users_cache", TTLCache(maxsize=10000, ttl=60))
    results = []
    errors = []

    def hit():
        try:
            results.append(dependencies._should_record_activity("user-1"))
        except Exception as error:  # pragma: no cover - the bug this guards against
            errors.append(error)

    threads = [threading.Thread(target=hit) for _ in range(32)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()
    assert errors == []
    # One background write per debounce window, however many arrive at once.
    assert results.count(True) == 1


def test_startup_schema_lock_is_a_no_op_off_postgres(monkeypatch):
    from app import main

    fake_engine = SimpleNamespace(dialect=SimpleNamespace(name="sqlite"))
    monkeypatch.setattr(main, "engine", fake_engine)
    with main._StartupSchemaLock() as lock:
        assert lock._connection is None
