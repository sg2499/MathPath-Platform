import json
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.models import Module, Level, Lesson, DPS, DPSSection, User
from app.question_engine.ylm.config import YLM_LESSON_RULES, YLM_LEVEL_LESSON_RANGES, rule_metadata


def _admin_user_id(db: Session) -> str | None:
    admin = (
        db.query(User)
        .filter(User.role.in_(["SUPER_ADMIN", "ADMIN"]), User.is_active == True)
        .order_by(User.created_at.asc().nullslast())
        .first()
    )
    return admin.id if admin else None


def _ensure_module(db: Session) -> Module:
    module = db.query(Module).filter(Module.module_code == "YLM").first()
    if not module:
        module = Module(
            module_code="YLM",
            module_name="Young Learners Module",
            description="Golden Steps based Young Learners Module for MathPath Abacus foundation learning.",
            display_order=1,
            is_active=True,
        )
        db.add(module)
        db.flush()
    else:
        module.module_name = "Young Learners Module"
        module.description = module.description or "Golden Steps based Young Learners Module for MathPath Abacus foundation learning."
        module.display_order = 1
        module.is_active = True
    return module


def _ensure_level(db: Session, module: Module, level_code: str) -> Level:
    level_number = int(level_code.split("-L")[-1])
    level = db.query(Level).filter(Level.module_id == module.id, Level.level_code == level_code).first()
    if not level:
        level = Level(
            module_id=module.id,
            level_code=level_code,
            level_name=f"Young Learners Level {level_number}",
            internal_level_number=level_number,
            display_order=level_number,
            is_active=True,
        )
        db.add(level)
        db.flush()
    else:
        level.level_name = f"Young Learners Level {level_number}"
        level.internal_level_number = level_number
        level.display_order = level_number
        level.is_active = True
    return level


def _ensure_lesson(db: Session, level: Level, lesson_number: int, lesson_title: str) -> Lesson:
    lesson = db.query(Lesson).filter(Level.id == level.id, Lesson.level_id == level.id, Lesson.lesson_number == lesson_number).first()
    if not lesson:
        lesson = Lesson(
            level_id=level.id,
            lesson_number=lesson_number,
            lesson_title=lesson_title,
            description="YLM Golden Steps lesson generated from the official MathPath Young Learners curriculum.",
            display_order=lesson_number,
            is_active=True,
        )
        db.add(lesson)
        db.flush()
    else:
        lesson.lesson_title = lesson_title
        lesson.description = lesson.description or "YLM Golden Steps lesson generated from the official MathPath Young Learners curriculum."
        lesson.display_order = lesson_number
        lesson.is_active = True
    return lesson


def _ensure_dps(db: Session, lesson: Lesson, dps_number: int, dps_title: str, admin_user_id: str | None) -> DPS:
    dps = db.query(DPS).filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number).first()
    if not dps:
        dps = DPS(
            lesson_id=lesson.id,
            dps_number=dps_number,
            dps_title=dps_title,
            default_question_count=10,
            default_duration_seconds=300,
            marks_per_question=1,
            publication_status="PUBLISHED",
            published_seed=f"YLM-{lesson.lesson_number}-DPS-{dps_number}-GOLDEN-STEPS",
            published_at=datetime.now(timezone.utc),
            published_by_user_id=admin_user_id,
            is_active=True,
        )
        db.add(dps)
        db.flush()
    else:
        dps.dps_title = dps_title
        dps.default_question_count = 10
        dps.default_duration_seconds = 300
        dps.marks_per_question = 1
        dps.publication_status = "PUBLISHED"
        dps.published_seed = dps.published_seed or f"YLM-{lesson.lesson_number}-DPS-{dps_number}-GOLDEN-STEPS"
        dps.published_at = dps.published_at or datetime.now(timezone.utc)
        dps.published_by_user_id = dps.published_by_user_id or admin_user_id
        dps.is_active = True
    return dps


def _ensure_section(db: Session, dps: DPS, dps_title: str, rule) -> None:
    section = db.query(DPSSection).filter(DPSSection.dps_id == dps.id, DPSSection.section_number == 1).first()
    if not section:
        section = DPSSection(
            dps_id=dps.id,
            section_number=1,
            section_title=dps_title,
            question_count=10,
            concept_family=rule.concept_family,
        )
        db.add(section)

    section.section_title = dps_title
    section.question_count = rule.question_count
    section.concept_family = rule.concept_family
    section.operation_focus = rule.operation_focus
    section.abacus_rule = rule.abacus_rule
    section.target_numbers_json = json.dumps(rule.target_numbers)
    section.place_value = rule.place_value
    section.digit_pattern = rule.digit_pattern
    section.rows_count = rule.rows
    section.difficulty = "YLM_GOLDEN_STEPS"
    section.allow_negative_operands = rule.allow_negative_operands
    section.allow_negative_answer = rule.allow_negative_answer
    section.generator_config_json = json.dumps(rule_metadata(rule))


def _deactivate_legacy_level_lessons(db: Session, level: Level, valid_lesson_numbers: set[int]) -> None:
    legacy_lessons = db.query(Lesson).filter(Lesson.level_id == level.id, ~Lesson.lesson_number.in_(valid_lesson_numbers)).all()
    for lesson in legacy_lessons:
        lesson.is_active = False
        dps_items = db.query(DPS).filter(DPS.lesson_id == lesson.id).all()
        for dps in dps_items:
            dps.is_active = False


def seed(db: Session):
    """Seed the complete YLM Golden Steps curriculum.

    This is curriculum/master-data seeding only. It does not create demo users,
    demo assignments, or demo attempts. The seed is idempotent and safe to run on
    every deploy.
    """
    module = _ensure_module(db)
    admin_user_id = _admin_user_id(db)

    levels: dict[str, Level] = {}
    for level_code in YLM_LEVEL_LESSON_RANGES:
        levels[level_code] = _ensure_level(db, module, level_code)

    for level_code, lesson_range in YLM_LEVEL_LESSON_RANGES.items():
        _deactivate_legacy_level_lessons(db, levels[level_code], set(lesson_range))

    for lesson_number in sorted(YLM_LESSON_RULES):
        rule = YLM_LESSON_RULES[lesson_number]
        level = levels[rule.level_code]
        lesson = _ensure_lesson(db, level, lesson_number, rule.lesson_title)
        for dps_number in range(1, 6):
            dps_title = rule.dps_titles[dps_number - 1] if rule.dps_titles else f"{rule.lesson_title} DPS {dps_number}"
            dps = _ensure_dps(db, lesson, dps_number, dps_title, admin_user_id)
            _ensure_section(db, dps, dps_title, rule)

    db.commit()
