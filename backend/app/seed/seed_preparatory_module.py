import json
from sqlalchemy.orm import Session

from app.models import Module, Level, Lesson, DPS, DPSSection
from app.seed.preparatory_module_l1_config import PM_L1_LESSONS, pm_l1_dps_rows_for

MODULE_CODE = "PM"
LEVEL_CODE = "PM-L1"

# Matches the sort_order convention already referenced in
# seed_intermediate_module.py / seed_master_module.py: YLM=1, PM=2, BM=3,
# IM=4, MM=5.
MODULE_DISPLAY_ORDER = 2


def _ensure_module(db: Session) -> Module:
    module = db.query(Module).filter(Module.module_code == MODULE_CODE).first()
    if not module:
        module = Module(
            module_code=MODULE_CODE,
            module_name="Preparatory Module",
            description="Preparatory Module for MathPath Abacus learning.",
            display_order=MODULE_DISPLAY_ORDER,
            is_active=True,
        )
        db.add(module)
        db.flush()
    else:
        module.module_name = module.module_name or "Preparatory Module"
        module.description = module.description or "Preparatory Module for MathPath Abacus learning."
        module.display_order = module.display_order or MODULE_DISPLAY_ORDER
        module.is_active = True
    return module


def _ensure_level(db: Session, module: Module) -> Level:
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == LEVEL_CODE).first()
    if not level:
        level = Level(
            module_id=module.id,
            level_code=LEVEL_CODE,
            level_name="Preparatory Level 1",
            internal_level_number=1,
            display_order=1,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = level.level_name or "Preparatory Level 1"
        level.internal_level_number = 1
        level.display_order = 1
        level.is_active = True
    return level


def _ensure_lesson(db: Session, level: Level, lesson_number: int, lesson_title: str) -> Lesson:
    lesson = (
        db.query(Lesson)
        .filter(Lesson.level_id == level.id, Lesson.lesson_number == lesson_number)
        .first()
    )
    if not lesson:
        lesson = Lesson(
            level_id=level.id,
            lesson_number=lesson_number,
            lesson_title=lesson_title,
            description="PM-L1 lesson replicated from Bridge Module's first 15 lessons so every entry path (YLM, Bridge, PM-L1) reaches the same competency before Intermediate/Master Module.",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = lesson_title
        lesson.description = lesson.description or "PM-L1 lesson replicated from Bridge Module's first 15 lessons so every entry path (YLM, Bridge, PM-L1) reaches the same competency before Intermediate/Master Module."
        lesson.display_order = lesson_number
        lesson.is_active = True
    return lesson


def _ensure_dps(db: Session, lesson: Lesson, dps_number: int, dps_title: str) -> DPS:
    dps = db.query(DPS).filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number).first()
    if not dps:
        dps = DPS(
            lesson_id=lesson.id,
            dps_number=dps_number,
            dps_title=dps_title,
            default_question_count=10,
            default_duration_seconds=1200,  # flat 20-minute DPS timer (2026-08-26 timer standardization)
            marks_per_question=1,
            publication_status="DRAFT",
            published_seed=None,
            published_at=None,
            published_by_user_id=None,
            is_active=True,
        )
        db.add(dps)
        db.flush()
    else:
        dps.dps_title = dps_title
        dps.default_question_count = 10
        dps.default_duration_seconds = 1200  # flat 20-minute DPS timer (2026-08-26 timer standardization)
        dps.marks_per_question = dps.marks_per_question or 1
        # Never touch publication_status here -- Admin (Learning Path Studio)
        # is the only publisher, same rule seed_ylm_phase1.py follows. A
        # re-run of this seed must not un-publish or re-publish anything.
        dps.is_active = True
    return dps


def _ensure_section(db: Session, dps: DPS, lesson_number: int, dps_number: int, lesson_title: str, rule) -> None:
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id, DPSSection.section_number == 1).first()
    if not section:
        section = DPSSection(
            dps_id=dps.id,
            section_number=1,
            section_title=rule.dps_title,
            question_count=rule.question_count,
            concept_family=rule.concept_family,
        )
        db.add(section)

    section.section_title = rule.dps_title
    section.question_count = rule.question_count
    section.concept_family = rule.concept_family
    section.operation_focus = rule.operation_focus
    section.abacus_rule = rule.abacus_rule
    section.target_numbers_json = json.dumps(rule.target_numbers)
    section.place_value = rule.place_value
    section.digit_pattern = rule.digit_pattern
    # 2026-09-02 -- narrow-pool DPS row override (see PM_L1_DPS_ROWS_OVERRIDES
    # in preparatory_module_l1_config.py): most DPS use the curriculum's
    # native rule.rows unchanged, but a handful of single-digit-pattern
    # complement DPS need one extra row to have enough unique question
    # combinations for their question_count. This seed() re-runs (and
    # upserts rows_count) on every deploy, so the override reaches
    # already-seeded production DPS rows automatically.
    effective_rows = pm_l1_dps_rows_for(lesson_number, dps_number, rule.rows)
    section.rows_count = effective_rows
    section.difficulty = "PM_L1_BRIDGE_REPLICA"
    section.allow_negative_operands = True
    section.allow_negative_answer = False
    section.generator_config_json = json.dumps({
        "lessonNumber": lesson_number,
        "dpsNumber": dps_number,
        "lessonTitle": lesson_title,
        "dpsTitle": rule.dps_title,
        "conceptFamily": rule.concept_family,
        "operationFocus": rule.operation_focus,
        "abacusRule": rule.abacus_rule,
        "targetNumbers": rule.target_numbers,
        "digitPattern": rule.digit_pattern,
        "generationTemplate": rule.generation_template,
        "revisionTemplates": list(rule.revision_templates),
        "rows": effective_rows,
        "questionCount": rule.question_count,
        "sourceCurriculum": "BRIDGE_MODULE_LESSONS_1_15",
    })


def seed(db: Session):
    """Seed Preparatory Module Level 1, Lessons 1-15.

    Curriculum/master-data seeding only -- idempotent, no demo users,
    assignments, or attempts, same contract as seed_ylm_phase1.py /
    seed_master_module.py / seed_intermediate_module.py. Safe to run on
    every deploy.
    """
    module = _ensure_module(db)
    level = _ensure_level(db, module)

    for lesson_number in sorted(PM_L1_LESSONS):
        lesson_rule = PM_L1_LESSONS[lesson_number]
        lesson = _ensure_lesson(db, level, lesson_number, lesson_rule.lesson_title)
        for dps_number in sorted(lesson_rule.dps):
            dps_rule = lesson_rule.dps[dps_number]
            dps = _ensure_dps(db, lesson, dps_number, dps_rule.dps_title)
            _ensure_section(db, dps, lesson_number, dps_number, lesson_rule.lesson_title, dps_rule)

    db.commit()
