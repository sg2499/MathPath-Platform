"""Regular mocks are called "Mock", not "Competition Mock" (2026-11-09, Shailesh).

"rename the normal Mock flows to Mock only and remove the competition wording
... for the annual competition part we already have areas assigned and
exclusive to it". Existing mocks get a one-time text fix; Annual Competition
papers are never touched.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.database as database
from app.models import models
from app.models.models import CompetitionMockExam, Level, Module, User
from app.seed.seed_bridge_module_l1 import seed as seed_bm
from app.services.competition_mock_generation_service import CompetitionMockSectionPlan, GenerateCompetitionMockDraft
from app.services.schema_migration import ensure_mock_wording_updated


@pytest.fixture()
def factory(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    Factory = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    monkeypatch.setattr(database, "SessionLocal", Factory)
    return Factory


@pytest.fixture()
def db(factory):
    session = factory()
    try:
        yield session
    finally:
        session.close()


def _paper(db, level, title, instructions, scope="GENERAL"):
    exam = CompetitionMockExam(
        title=title, module_id=level.module_id, level_id=level.id, competition_scope=scope,
        total_questions=10, total_marks=10, duration_seconds=600, status="DRAFT", is_active=True, instructions=instructions,
    )
    db.add(exam)
    db.flush()
    return exam


@pytest.fixture()
def level(db):
    module = Module(module_code="IM", module_name="Intermediate Module", display_order=4, is_active=True)
    db.add(module)
    db.flush()
    row = Level(module_id=module.id, level_code="IM-L2", level_name="IM-L2", internal_level_number=2, display_order=2, is_active=True)
    db.add(row)
    db.commit()
    return row


OLD = "Competition-style mock practice for Intermediate Module / Intermediate Module Level 2. Answer all 32 questions within 30 minutes."
NEW = "Mock practice for Intermediate Module / Intermediate Module Level 2. Answer all 32 questions within 30 minutes."


def test_existing_mocks_get_the_new_wording_once(db, level):
    auto = _paper(db, level, "IM-L2 Competition Mock Practice 30 Aug 2026 14:17", OLD)
    own = _paper(db, level, "IM-2-Mock", OLD)
    keep_name = _paper(db, level, "My Competition Mock Practice Paper", None)
    official = _paper(db, level, "Annual Competition — IM-L2 Official Paper", OLD, "ANNUAL_COMPETITION")
    practice = _paper(db, level, "IM-L2 Competition Mock Practice 1 Jan 2026 10:00", OLD, "ANNUAL_COMPETITION_PRACTICE")
    db.commit()

    ensure_mock_wording_updated()
    ensure_mock_wording_updated()  # running again changes nothing
    db.expire_all()

    assert (auto.title, auto.instructions) == ("IM-L2 Mock Practice 30 Aug 2026 14:17", NEW)
    assert (own.title, own.instructions) == ("IM-2-Mock", NEW)          # admin's own title kept
    assert keep_name.title == "My Competition Mock Practice Paper"       # not an auto title
    for annual in (official, practice):                                   # Annual Competition untouched
        assert annual.instructions == OLD
    assert practice.title == "IM-L2 Competition Mock Practice 1 Jan 2026 10:00"


def test_new_mocks_use_the_new_wording(db):
    seed_bm(db)
    db.commit()
    bm = db.query(Level).filter(Level.level_code == "BM-L1").first()
    admin = User(full_name="Admin", role="SUPER_ADMIN", email="a@test.local", password_hash="x")
    db.add(admin)
    db.flush()
    plan = CompetitionMockSectionPlan(db, LevelId=bm.id, TotalMarks=100)
    rows = [{"sectionKey": s["sectionKey"], "questionCount": s["questionCount"], "marksPerQuestion": s["defaultMarksPerQuestion"]} for s in plan["sections"]]
    exam = GenerateCompetitionMockDraft(db, LevelId=bm.id, CreatedBy=admin, TotalMarks=100, SectionPlan=rows)
    assert exam["title"].startswith("BM-L1 Mock Practice ")
    assert exam["instructions"].startswith("Mock practice for ")
    assert "ompetition" not in exam["title"] + exam["instructions"]


def test_messages_no_longer_say_competition(db, level):
    admin = User(full_name="Admin", role="SUPER_ADMIN", email="a@test.local", password_hash="x")
    db.add(admin)
    db.commit()
    from app.api import routes_admin

    with pytest.raises(HTTPException) as error:
        routes_admin.admin_get_competition_mock_exam("missing", db, None)
    assert error.value.detail["message"] == "Mock exam was not found."
    exam = _paper(db, level, "Mock A", None)
    db.commit()
    assert routes_admin.admin_archive_competition_mock_exam(exam.id, db, None)["message"] == "Mock exam archived."
    assert routes_admin.admin_delete_competition_mock_exam(exam.id, db, None)["message"] == "Mock exam permanently deleted."
