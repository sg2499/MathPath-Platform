"""Phase 2 part 2 (2026-10-14): one Average Accuracy rule everywhere
("Rule A": every submitted try counts once, 0% included), averages rounded
half up like the browser, whole-number readiness progress, and the student's
practice cards carrying the shared DPS state."""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.rounding import round_half_up
from app.database import Base
from app.models import DPS, Assignment, Attempt, Lesson, Level, Module, Student, User

T0 = datetime(2026, 10, 1, 10, 0, tzinfo=timezone.utc)


@pytest.fixture()
def db():
    engine = create_engine("sqlite://", future=True, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    yield session
    session.close()


@pytest.fixture()
def world(db):
    db.add(Module(id="m", module_code="IM", module_name="Intermediate"))
    db.flush()
    db.add(Level(id="l", module_id="m", level_code="IM-L1", level_name="IM L1"))
    db.flush()
    db.add(Lesson(id="ls", level_id="l", lesson_number=1, lesson_title="Lesson 1"))
    db.flush()
    for n in range(1, 4):
        db.add(DPS(id=f"d{n}", lesson_id="ls", dps_number=n, dps_title=f"DPS {n}"))
    db.add(User(id="u1", full_name="Student One", email="s1@x.test", password_hash="x", role="STUDENT", is_active=True))
    db.flush()
    db.add(Student(id="s1", user_id="u1", student_code="MP-S1", is_active=True, current_level_id="l", current_module_id="m"))
    db.flush()
    # DPS 1: 40% then 90% (two assignments); DPS 2: 0% (blank, auto-submitted);
    # DPS 3: 80% on a longer sheet. Every try: (40+90+0+80)/4 = 52.5 -> 53.
    tries = [("a1", "d1", 40.0, 10, "SUBMITTED"), ("a2", "d1", 90.0, 10, "SUBMITTED"), ("a3", "d2", 0.0, 10, "AUTO_SUBMITTED"), ("a4", "d3", 80.0, 30, "SUBMITTED")]
    for index, (assignment_id, dps_id, accuracy, questions, status) in enumerate(tries):
        db.add(Assignment(id=assignment_id, assignment_type="PRACTICE", dps_id=dps_id, assigned_to_type="STUDENT", assigned_to_id="s1",
                          title=assignment_id, retry_attempt_number=(1 if assignment_id == "a2" else 0), is_active=True,
                          attempt_group_id="a1" if assignment_id in ("a1", "a2") else assignment_id, created_at=T0 + timedelta(minutes=index)))
        db.flush()
        db.add(Attempt(id=f"t{index}", assignment_id=assignment_id, dps_id=dps_id, student_id="s1", mode="PRACTICE", status=status,
                       attempt_group_id="a1" if assignment_id in ("a1", "a2") else assignment_id, attempt_number=(1 if assignment_id == "a2" else 0),
                       started_at=T0 + timedelta(hours=index), submitted_at=T0 + timedelta(hours=index, minutes=9),
                       expires_at=T0 + timedelta(hours=index, minutes=15), duration_seconds=900, accuracy_percentage=accuracy,
                       total_questions=questions, correct_count=int(questions * accuracy / 100)))
    db.commit()
    return db


def test_round_half_up_matches_the_browser():
    assert round(42.5) == 42  # Python's own rounding, the cause of the 42% / 43% split
    assert round_half_up(42.5) == 43
    assert round_half_up(43.5) == 44
    assert round_half_up(42.49) == 42
    assert round_half_up(None) == 0


def test_dps_leaderboard_accuracy_is_the_every_try_average(world):
    from app.services.leaderboard_service import rank_dps_specific_level

    board = rank_dps_specific_level(world, "l", with_badges=False)
    assert len(board) == 1
    # Pooled correct/questions would be (4+9+0+24)/60 = 61.7%; Rule A is 53%.
    assert board[0]["accuracy"] == 53
    assert board[0]["percentage"] == 53


def test_level_progress_accuracy_counts_every_try_including_zero():
    from types import SimpleNamespace

    from app.api.routes_student import level_progress_accuracy

    tries = [SimpleNamespace(accuracy_percentage=value) for value in (40, 90, 0, 80)]
    assert level_progress_accuracy(tries) == 53
    assert level_progress_accuracy([]) == 0


def test_readiness_progress_is_a_whole_number(world):
    from app.services.assessment_eligibility_service import assessment_eligibility_payload

    payload = assessment_eligibility_payload(world, world.get(Student, "s1"), "l")
    # 2 of 3 sheets passed (d1 at 90%, d3 at 80%): 66.67% -> 67.
    assert payload["passedDpsCount"] == 2
    assert payload["progressPercentage"] == 67
    assert isinstance(payload["progressPercentage"], int)


def test_student_practice_cards_carry_the_shared_dps_state(world):
    from app.api import routes_student

    student = world.get(Student, "s1")
    reply = routes_student.assignments(db=world, student=student)
    cards = {card["assignmentId"]: card for card in reply["assignments"]}
    assert set(cards) == {"a1", "a2", "a3", "a4"}
    for card in cards.values():
        assert "dpsChain" in card and "chainRowLabel" in card and "isCurrentChainRow" in card
    # DPS 1 cleared on its re-attempt: the re-attempt is the current row.
    assert cards["a2"]["isCurrentChainRow"] is True
    assert cards["a1"]["isCurrentChainRow"] is False
    assert cards["a2"]["retryAttemptNumber"] == 1
