import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import DPS, DPSSection, Lesson, Level, Module, User


YLM_L2_LESSONS = [
    {
        "lessonNumber": 1,
        "lessonTitle": "Direct Add-Less Speed Building",
        "dps": [
            ("Direct Add-Less Speed Drill 1", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"),
            ("Direct Add-Less Speed Drill 2", "DIRECT_ADD_LESS", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"),
            ("Direct Add-Less Mixed Practice", "MIXED_REVISION", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"),
        ],
    },
    {
        "lessonNumber": 2,
        "lessonTitle": "Complement of 5 Mixed Application",
        "dps": [
            ("Complement of 5 Addition Practice", "COMPLEMENT_OF_5", "ADDITION", "ADD_5_LESS_4", [1, 2, 3, 4], "ONES", "1D"),
            ("Complement of 5 Subtraction Practice", "COMPLEMENT_OF_5", "SUBTRACTION", "LESS_5_ADD_4", [1, 2, 3, 4], "ONES", "1D"),
            ("Complement of 5 Mixed Revision", "MIXED_REVISION", "ADD_LESS", None, [], "MIXED", "1D_AND_2D"),
        ],
    },
]


def _admin_user_id(db: Session) -> str | None:
    admin = (
        db.query(User)
        .filter(User.role.in_(["SUPER_ADMIN", "ADMIN"]), User.is_active == True)
        .order_by(User.created_at.asc().nullslast())
        .first()
    )
    return admin.id if admin else None


def _ensure_ylm_module(db: Session) -> Module:
    module = db.query(Module).filter(Module.module_code == "YLM").first()
    if module:
        if not module.is_active:
            module.is_active = True
        return module

    module = Module(
        module_code="YLM",
        module_name="Young Learners Module",
        description="Young Learners Module for MathPath Abacus foundation levels.",
        display_order=1,
        is_active=True,
    )
    db.add(module)
    db.flush()
    return module


def _ensure_level_two(db: Session, module: Module) -> Level:
    level = (
        db.query(Level)
        .filter(Level.module_id == module.id, Level.level_code == "YLM-L2")
        .first()
    )
    if level:
        level.level_name = "Young Learners Level 2"
        level.internal_level_number = 2
        level.display_order = 2
        level.is_active = True
        return level

    level = Level(
        module_id=module.id,
        level_code="YLM-L2",
        level_name="Young Learners Level 2",
        internal_level_number=2,
        display_order=2,
        is_active=True,
    )
    db.add(level)
    db.flush()
    return level


def _ensure_lesson(db: Session, level: Level, lesson_number: int, lesson_title: str) -> Lesson:
    lesson = (
        db.query(Lesson)
        .filter(Lesson.level_id == level.id, Lesson.lesson_number == lesson_number)
        .first()
    )
    if lesson:
        lesson.lesson_title = lesson_title
        lesson.display_order = lesson_number
        lesson.is_active = True
        return lesson

    lesson = Lesson(
        level_id=level.id,
        lesson_number=lesson_number,
        lesson_title=lesson_title,
        display_order=lesson_number,
        is_active=True,
    )
    db.add(lesson)
    db.flush()
    return lesson


def _ensure_dps(
    db: Session,
    lesson: Lesson,
    dps_number: int,
    dps_title: str,
    admin_user_id: str | None,
) -> DPS:
    dps = (
        db.query(DPS)
        .filter(DPS.lesson_id == lesson.id, DPS.dps_number == dps_number)
        .first()
    )
    if not dps:
        dps = DPS(
            lesson_id=lesson.id,
            dps_number=dps_number,
            dps_title=dps_title,
            default_question_count=10,
            default_duration_seconds=300,
            marks_per_question=1,
        )
        db.add(dps)
        db.flush()

    dps.dps_title = dps_title
    dps.default_question_count = 10
    dps.default_duration_seconds = 300
    dps.marks_per_question = 1
    dps.publication_status = "PUBLISHED"
    dps.published_at = dps.published_at or datetime.now(timezone.utc)
    dps.published_by_user_id = dps.published_by_user_id or admin_user_id
    dps.published_seed = dps.published_seed or f"YLM-L2-TEST-DPS-{dps_number}"
    dps.is_active = True
    return dps


def _ensure_section(
    db: Session,
    dps: DPS,
    title: str,
    concept: str,
    operation: str,
    rule: str | None,
    targets: list[int],
    place: str,
    digit: str,
) -> None:
    section = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id == dps.id, DPSSection.section_number == 1)
        .first()
    )
    if not section:
        section = DPSSection(
            dps_id=dps.id,
            section_number=1,
            section_title=title,
            question_count=10,
            concept_family=concept,
        )
        db.add(section)

    section.section_title = title
    section.question_count = 10
    section.concept_family = concept
    section.operation_focus = operation
    section.abacus_rule = rule
    section.target_numbers_json = json.dumps(targets)
    section.place_value = place
    section.digit_pattern = digit
    section.rows_count = 3
    section.allow_negative_operands = True
    section.allow_negative_answer = False
    section.is_active = True


def seed(db: Session) -> None:
    """Idempotently adds the minimal YLM-L2 test level for promotion validation.

    This seed intentionally adds only a lightweight next-level structure so Phase 8.7.2
    can validate successful promotion from YLM-L1 to YLM-L2 without expanding the full
    production curriculum yet.
    """
    module = _ensure_ylm_module(db)
    level = _ensure_level_two(db, module)
    admin_user_id = _admin_user_id(db)

    for lesson_data in YLM_L2_LESSONS:
        lesson = _ensure_lesson(
            db,
            level,
            lesson_data["lessonNumber"],
            lesson_data["lessonTitle"],
        )
        for dps_number, row in enumerate(lesson_data["dps"], start=1):
            title, concept, operation, rule, targets, place, digit = row
            dps = _ensure_dps(db, lesson, dps_number, title, admin_user_id)
            _ensure_section(db, dps, title, concept, operation, rule, targets, place, digit)

    db.commit()
