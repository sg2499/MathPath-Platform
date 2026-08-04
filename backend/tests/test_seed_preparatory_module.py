"""Exercises PM-L1's seeded curriculum through the real generation pipeline
(seed_preparatory_module.seed() -> generation_service.generate_preview()),
the exact call Learning Path Studio's "Generate Preview" button makes -- not
a hand-built config that bypasses the DB, since that would only prove the
question engine works and say nothing about whether the seeded
DPSSection.generator_config_json actually reaches it.

See OPEN_ISSUES.md 2026-08-04: PM-L1 lessons 1-15 replicate Bridge Module's
first 15 lessons exactly, since a student can enter the platform via YLM,
Bridge, or PM-L1 and all three paths must land at the same competency level
before Intermediate/Master Module.
"""
from __future__ import annotations

import pathlib

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.models import models
from app.models.models import DPS, Lesson, Level, Module
from app.seed.seed_preparatory_module import seed as seed_pm
from app.seed.preparatory_module_l1_config import PM_L1_LESSONS
from app.services.generation_service import generate_preview, build_preview_seed


def test_pm_engine_package_never_imports_another_modules_engine():
    """Product requirement (2026-08-04): every module gets a fully dedicated
    generator so a failure in one module's generation code can never affect
    another. option_utils/smart_distractors are the one deliberate exception
    -- generic "shuffle 4 MCQ options" / "produce a plausible wrong number"
    math already shared identically by YLM, MM, and IM before PM existed,
    not curriculum logic. Everything else under question_engine/pm must be
    self-contained.
    """
    pm_dir = pathlib.Path(__file__).resolve().parents[1] / "app" / "question_engine" / "pm"
    forbidden = ("app.question_engine.ylm", "app.question_engine.mm", "app.question_engine.im")
    offenders = []
    for path in pm_dir.glob("*.py"):
        for line in path.read_text().splitlines():
            stripped = line.strip()
            if not (stripped.startswith("from ") or stripped.startswith("import ")):
                continue
            for marker in forbidden:
                if marker in stripped:
                    offenders.append(f"{path.name}: {stripped!r} imports {marker}")
    assert not offenders, "\n".join(offenders)


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    models.Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


def test_seed_creates_15_lessons_75_dps(db):
    seed_pm(db)
    module = db.query(Module).filter(Module.module_code == "PM").first()
    assert module is not None
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L1").first()
    assert level is not None
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()
    assert [l.lesson_number for l in lessons] == list(range(1, 16))
    for lesson in lessons:
        dps_rows = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
        assert [d.dps_number for d in dps_rows] == [1, 2, 3, 4, 5]


def test_seed_is_idempotent(db):
    seed_pm(db)
    seed_pm(db)
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L1").first()
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).all()
    assert len(lessons) == 15


def test_every_pm_l1_dps_generates_cleanly_through_the_real_admin_preview_call(db):
    """This is the load-bearing check: generate_preview() is the exact
    function routes_admin.py's POST /dps/{dps_id}/generate-preview calls, so
    this proves the seeded DB config -> YLMConfig -> question set path
    genuinely works end to end for all 75 DPS, not just that the underlying
    engine can produce valid output when handed a hand-built config.
    """
    seed_pm(db)
    module = db.query(Module).filter(Module.module_code == "PM").first()
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == "PM-L1").first()
    lessons = db.query(Lesson).filter(Lesson.level_id == level.id).order_by(Lesson.lesson_number).all()

    failures: list[str] = []
    for lesson in lessons:
        rule = PM_L1_LESSONS[lesson.lesson_number]
        dps_rows = db.query(DPS).filter(DPS.lesson_id == lesson.id).order_by(DPS.dps_number).all()
        for dps in dps_rows:
            dps_rule = rule.dps[dps.dps_number]
            label = f"L{lesson.lesson_number} DPS{dps.dps_number} ({dps_rule.dps_title})"
            try:
                questions = generate_preview(db, dps, build_preview_seed(dps))
            except Exception as exc:  # noqa: BLE001
                failures.append(f"{label}: EXCEPTION {exc!r}")
                continue

            if len(questions) != 10:
                failures.append(f"{label}: expected 10 questions, got {len(questions)}")
                continue

            seen_operand_sets = set()
            for q in questions:
                operands = q["operands"]
                if len(operands) != 3:
                    failures.append(f"{label}: expected 3 operand rows, got {len(operands)}")
                if sum(operands) != q["correct_answer"]:
                    failures.append(f"{label}: answer mismatch for {operands}")
                if q["correct_answer"] < 0:
                    failures.append(f"{label}: negative answer for {operands}")
                seen_operand_sets.add(tuple(operands))

                # The generation_template actually reached the engine (this is
                # the specific regression this test guards against: before
                # generation_service.build_config_from_dps() was extended to
                # read generation_template/revision_templates from
                # generator_config_json, every non-YLM/MM/IM module silently
                # generated plain DIRECT questions regardless of concept).
                metadata = q["metadata"]
                if dps_rule.generation_template == "REVISION":
                    observed_template = metadata.get("generation_template")
                    if observed_template != "REVISION":
                        failures.append(f"{label}: expected generation_template REVISION in metadata, got {observed_template!r}")
                elif dps_rule.generation_template != "DIRECT":
                    if metadata.get("generation_template") != dps_rule.generation_template:
                        failures.append(f"{label}: expected generation_template {dps_rule.generation_template!r}, got {metadata.get('generation_template')!r}")

            if len(seen_operand_sets) < 6:
                failures.append(f"{label}: only {len(seen_operand_sets)}/10 unique question shapes -- pool may be too narrow")

            # Multi-target lessons (12-15 DPS5) should draw from both targets
            # across a 10-question sheet, not just one of them.
            if len(dps_rule.target_numbers) > 1:
                observed_targets = {abs(v) for q in questions for v in q["operands"][1:]}
                missing = [t for t in dps_rule.target_numbers if t not in observed_targets]
                if missing:
                    failures.append(f"{label}: target(s) {missing} never appeared across 10 generated questions")

    assert not failures, "\n" + "\n".join(failures)
