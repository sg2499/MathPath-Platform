"""Route-level (HTTP) end-to-end check for the section-wise assessment rework.

The existing test_section_wise_assessment_generation.py suite calls the
service-layer functions directly. This file instead goes through the actual
FastAPI routes (POST /api/admin/assessment-blueprints, the
generate-preview/generated-assessment endpoints, and the new
GET /api/admin/levels/{level_id}/assessment-sections endpoint) using
AssessmentBlueprintCreateRequest exactly as the real admin frontend would
send it, to catch any Pydantic/route-wiring bug the service-layer tests can't
see (e.g. the AssessmentLessonDistributionRequest optional-field shape).

Startup DB seeding is intentionally skipped (no `with TestClient(app)`) so
this never touches the real configured DATABASE_URL -- get_db and admin_dep
are both overridden to point at an isolated in-memory sqlite session and a
fake admin user.
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.database import get_db
from app.models import models
from app.models.models import Module, Level, User
from app.api.routes_admin import admin_dep
from app.services.competition_mock_generation_service import (
    MM_COMPETITION_LEVEL_REGISTRY,
    IM_COMPETITION_LEVEL_REGISTRY,
)


@pytest.fixture()
def client():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()

    admin = User(full_name="Route Test Admin", role="SUPER_ADMIN", email="routeadmin@test.local", password_hash="x")
    session.add(admin)
    session.commit()

    def _override_get_db():
        try:
            yield session
        finally:
            pass

    def _override_admin_dep():
        return admin

    app.dependency_overrides[get_db] = _override_get_db
    app.dependency_overrides[admin_dep] = _override_admin_dep

    test_client = TestClient(app)
    try:
        yield test_client, session, admin
    finally:
        app.dependency_overrides.clear()
        session.close()


def _seed_level(session, module_code, module_name, level_code, level_name):
    module = Module(module_code=module_code, module_name=module_name, is_active=True)
    session.add(module)
    session.flush()
    level = Level(module_id=module.id, level_code=level_code, level_name=level_name, is_active=True)
    session.add(level)
    session.commit()
    return module, level


def test_mm_full_http_round_trip(client):
    test_client, session, admin = client
    module, level = _seed_level(session, "MM", "Master Module", "MM-L1", "MM Level 1")

    sections_resp = test_client.get(f"/api/admin/levels/{level.id}/assessment-sections")
    assert sections_resp.status_code == 200, sections_resp.text
    sections_payload = sections_resp.json()
    assert sections_payload["isSectionWise"] is True
    section_defs = sections_payload["sections"]
    assert len(section_defs) == len(MM_COMPETITION_LEVEL_REGISTRY["MM-L1"]["sectionDefinitions"])

    questions_per_section = 2
    distribution = [{"sectionKey": s["sectionKey"], "questionCount": questions_per_section} for s in section_defs]
    total_questions = len(section_defs) * questions_per_section

    create_resp = test_client.post(
        "/api/admin/assessment-blueprints",
        json={
            "title": "MM-L1 Route Assessment",
            "moduleId": module.id,
            "levelId": level.id,
            "totalQuestions": total_questions,
            "durationSeconds": 1800,
            "lessonDistribution": distribution,
            "instructions": None,
            "status": "PUBLISHED",
        },
    )
    assert create_resp.status_code == 200, create_resp.text
    blueprint_payload = create_resp.json()
    assert blueprint_payload["distributionMode"] == "SECTION_WISE"
    blueprint_id = blueprint_payload["id"]

    get_resp = test_client.get(f"/api/admin/assessment-blueprints/{blueprint_id}")
    assert get_resp.status_code == 200, get_resp.text
    assert get_resp.json()["distributionMode"] == "SECTION_WISE"

    preview_resp = test_client.post(f"/api/admin/assessment-blueprints/{blueprint_id}/generate-preview")
    assert preview_resp.status_code == 200, preview_resp.text

    generated_resp = test_client.get(f"/api/admin/assessment-blueprints/{blueprint_id}/generated-assessment")
    assert generated_resp.status_code == 200, generated_resp.text
    generated = generated_resp.json()
    assert generated["available"] is True
    assessment = generated["assessment"]
    assert assessment["questionCount"] == total_questions
    assert assessment["totalMarks"] == total_questions  # MM: flat 1 mark/question
    groups = assessment["lessonGroups"]
    assert len(groups) == len(section_defs)
    assert all(g["groupKind"] == "SECTION" for g in groups)


def test_im_full_http_round_trip(client):
    test_client, session, admin = client
    module, level = _seed_level(session, "IM", "Intermediate Module", "IM-L4", "IM Level 4")

    sections_resp = test_client.get(f"/api/admin/levels/{level.id}/assessment-sections")
    assert sections_resp.status_code == 200, sections_resp.text
    section_defs = sections_resp.json()["sections"]

    questions_per_section = 4
    distribution = [{"sectionKey": s["sectionKey"], "questionCount": questions_per_section} for s in section_defs]
    total_questions = len(section_defs) * questions_per_section

    create_resp = test_client.post(
        "/api/admin/assessment-blueprints",
        json={
            "title": "IM-L4 Route Assessment",
            "moduleId": module.id,
            "levelId": level.id,
            "totalQuestions": total_questions,
            "durationSeconds": 1800,
            "lessonDistribution": distribution,
            "instructions": None,
            "status": "PUBLISHED",
        },
    )
    assert create_resp.status_code == 200, create_resp.text
    blueprint_id = create_resp.json()["id"]

    preview_resp = test_client.post(f"/api/admin/assessment-blueprints/{blueprint_id}/generate-preview")
    assert preview_resp.status_code == 200, preview_resp.text

    generated = test_client.get(f"/api/admin/assessment-blueprints/{blueprint_id}/generated-assessment").json()
    assessment = generated["assessment"]
    assert assessment["questionCount"] == total_questions
    weighted_families = {"SKILL_STACKER", "CONCEPT_DRILL"}
    expected_total = sum(
        5.0 if q.get("conceptTag") in weighted_families else 1.0
        for q in assessment["questions"]
    )
    assert assessment["totalMarks"] == expected_total
    groups = assessment["lessonGroups"]
    assert all(g["groupKind"] == "SECTION" for g in groups)
    assert sum(g["questionCount"] for g in groups) == total_questions


def test_ylm_level_reports_lesson_wise_not_section_wise(client):
    test_client, session, admin = client
    module, level = _seed_level(session, "YLM", "Young Learners Module", "YLM-L1", "YLM Level 1")

    sections_resp = test_client.get(f"/api/admin/levels/{level.id}/assessment-sections")
    assert sections_resp.status_code == 200, sections_resp.text
    payload = sections_resp.json()
    assert payload["isSectionWise"] is False
    assert payload["sections"] == []
