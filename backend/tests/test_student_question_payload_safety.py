"""No answer leaks to an open paper (2026-10-11, Shailesh).

Question metadata carries the generator's notes, and for some question kinds
those notes hold the answer (a remainder question's quotient and remainder, a
square root's root...). The in-progress payloads of practice sheets and level
assessments now send only the question's text and section from metadata, plus
answerFormat ("QUOTIENT_REMAINDER" for a division with a remainder, which the
answer box needs and which says nothing about the value).

Checked on every practice sheet of PM-L4 (remainder divisions) and MM-L1
(roots, financial, percentages): no metadata key outside the allowed set, and
no metadata value equal to the correct answer.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Attempt, DPS, GeneratedQuestion, Lesson, Level, Student, User
from app.seed.seed_master_module import seed as seed_master_module
from app.seed.seed_preparatory_module_l4 import seed as seed_pm_l4
from app.services.attempt_service import safe_questions_payload
from app.services.generation_service import persist_question_set
from app.services.student_question_safety import STUDENT_SAFE_METADATA_KEYS, answer_format, student_safe_metadata


NUMBER_KEYS = {"section_number", "sectionNumber", "dps_total_sections", "dpsTotalSections", "assessmentSectionNumber"}


@pytest.fixture(scope="module")
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    seed_master_module(session)
    seed_pm_l4(session)
    session.commit()
    user = User(full_name="Safety Student", email="safety@test.local", password_hash="x", role="STUDENT")
    session.add(user)
    session.flush()
    session.add(Student(user_id=user.id, student_code="MP-ST-SAFE"))
    session.commit()
    try:
        yield session
    finally:
        session.close()


def _sheets(db, level_code):
    return (
        db.query(DPS)
        .join(Lesson, Lesson.id == DPS.lesson_id)
        .join(Level, Level.id == Lesson.level_id)
        .filter(Level.level_code == level_code)
        .order_by(Lesson.lesson_number, DPS.dps_number)
        .all()
    )


def _attempt(db, dps, student):
    # Fixed seeds, so the run is repeatable; a rare seed the generator
    # rejects is simply replaced by the next one (not what is tested here).
    for tries in range(5):
        try:
            qset = persist_question_set(db, dps, None, student.id, "PRACTICE", f"SAFE-{dps.dps_number}-{dps.lesson_id[:8]}-{tries}")
            break
        except ValueError:
            db.rollback()
    else:
        raise AssertionError(f"no question set for {dps.id}")
    count = db.query(GeneratedQuestion).filter(GeneratedQuestion.question_set_id == qset.id).count()
    now = datetime.now(timezone.utc)
    attempt = Attempt(dps_id=dps.id, question_set_id=qset.id, student_id=student.id, mode="PRACTICE", status="IN_PROGRESS",
                      started_at=now, expires_at=now + timedelta(seconds=900), duration_seconds=900,
                      total_questions=count, max_score=count)
    db.add(attempt)
    db.commit()
    return attempt


@pytest.mark.parametrize("level_code", ["PM-L4", "MM-L1"])
def test_practice_sheet_payload_never_carries_the_answer(db, level_code):
    student = db.query(Student).filter_by(student_code="MP-ST-SAFE").one()
    pairs = 0
    for dps in _sheets(db, level_code):
        attempt = _attempt(db, dps, student)
        correct = {q.id: str(q.correct_answer) for q in db.query(GeneratedQuestion).filter_by(question_set_id=attempt.question_set_id)}
        for entry in safe_questions_payload(db, attempt):
            assert set(entry["metadata"]) <= STUDENT_SAFE_METADATA_KEYS, entry["metadata"].keys()
            assert "correct_answer" not in entry and "correctAnswer" not in entry
            answer = correct[entry["questionId"]]
            # Section numbers and counts can equal a small answer by chance; the
            # text values must never be the answer.
            texts = {str(v) for k, v in entry["metadata"].items() if k not in NUMBER_KEYS}
            assert answer not in texts
            assert entry["answerFormat"] == answer_format(answer)
            pairs += entry["answerFormat"] == "QUOTIENT_REMAINDER"
    if level_code == "PM-L4":
        assert pairs > 0  # remainder divisions exist and are flagged


def test_helpers():
    assert student_safe_metadata({"question_text": "Find SI", "quotient": 12, "remainder": 3, "root_value": 9}) == {"question_text": "Find SI"}
    assert student_safe_metadata(None) == {}
    assert answer_format("73, 1") == "QUOTIENT_REMAINDER"
    assert answer_format("731") is None
    assert answer_format("-12") is None
    assert answer_format("12.5") is None
