"""The signed-in student's details carry their current level code (2026-10-11).

The student dashboard shows "Current Level: PM-L3" from /auth/me, read fresh
on every visit, so a promotion shows straight away.
"""
from __future__ import annotations

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import Level, Module, Student, User
from app.services.auth_service import user_payload


@pytest.fixture()
def db():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)()
    try:
        yield session
    finally:
        session.close()


def _student(db, level_id):
    user = User(full_name="Level Student", role="STUDENT", email="level.student@test.local", password_hash="x")
    db.add(user)
    db.flush()
    student = Student(user_id=user.id, student_code="ST-LVL", current_level_id=level_id)
    db.add(student)
    db.commit()
    return user, student


def test_current_level_code_is_sent_and_follows_a_promotion(db):
    module = Module(module_code="PM", module_name="Preparatory Module")
    db.add(module)
    db.flush()
    level_3 = Level(module_id=module.id, level_code="PM-L3", level_name="Preparatory Level 3", display_order=3)
    level_4 = Level(module_id=module.id, level_code="PM-L4", level_name="Preparatory Level 4", display_order=4)
    db.add_all([level_3, level_4])
    db.flush()
    user, student = _student(db, level_3.id)

    assert user_payload(db, user)["student"]["currentLevelCode"] == "PM-L3"

    student.current_level_id = level_4.id
    db.commit()
    assert user_payload(db, user)["student"]["currentLevelCode"] == "PM-L4"


def test_student_without_a_level_gets_no_code(db):
    user, _ = _student(db, None)
    assert user_payload(db, user)["student"]["currentLevelCode"] is None
