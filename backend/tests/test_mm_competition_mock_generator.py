from collections import defaultdict
from datetime import datetime, timedelta, timezone
import json
import random

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CompetitionMockExam, CompetitionMockQuestion, Lesson, Level, Module
from app.question_engine.mm.config import MMConfig
from app.question_engine.mm.operands import (
    GenerateAnswerPosition,
    GenerateDecimalDivision,
    GenerateDecimalMultiplication,
    GenerateWholeNumberDivision,
    GenerateWholeNumberMultiplication,
    _IsTrivialScaleOperand,
)
from app.services.competition_mock_generation_service import (
    MM_COMPETITION_RECENT_MOCK_FRESHNESS_WINDOW,
    MM_COMPETITION_SECTION_CONCEPT_POOLS,
    MM_COMPETITION_SECTION_DEFINITIONS,
    MM_DEFAULT_COMPETITION_MOCK_DURATION_SECONDS,
    MM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT,
    _CollectMmCompetitionSectionLockedQuestions,
    _MmCompetitionDigitConfig,
    _MmSectionCountMap,
    _QuestionSignature,
    _RecentMmCompetitionQuestionSignatures,
)


def _master_module_records():
    module = Module(id="module-mm", module_code="MM", module_name="Master Module")
    level = Level(
        id="level-mm-9",
        module_id=module.id,
        level_code="MM-L9",
        level_name="Level - 9",
    )
    lessons = [
        Lesson(
            id=f"lesson-{lesson_number}",
            level_id=level.id,
            lesson_number=lesson_number,
            lesson_title=f"Lesson {lesson_number}",
        )
        for lesson_number in range(1, 31)
    ]
    return module, level, lessons


def _question_family(question):
    metadata = question.get("metadata") or {}
    return str(
        metadata.get("concept_family")
        or metadata.get("conceptFamily")
        or question.get("concept_family")
        or question.get("conceptFamily")
        or ""
    )


def _competition_concept(question):
    metadata = question.get("metadata") or {}
    return str(metadata.get("competitionConceptName") or metadata.get("conceptName") or "")


def _mm_config(concept_family: str, title: str, generator_config: dict | None = None) -> MMConfig:
    return MMConfig(
        ModuleCode="MM",
        LevelCode="MM-L1",
        LessonNumber=24,
        DpsNumber=3,
        DpsTitle=title,
        LessonTitle="Lesson 24",
        QuestionCount=10,
        Seed="TEST-MM-SEED",
        ConceptFamily=concept_family,
        GeneratorConfig=generator_config or {},
    )


def _assert_concept_blocks_are_sequential(concept_names):
    completed = set()
    previous = None
    for concept_name in concept_names:
        if concept_name == previous:
            continue
        assert concept_name not in completed
        if previous is not None:
            completed.add(previous)
        previous = concept_name


def test_mm_mock_defaults_and_section_count_distribution():
    assert MM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT == 100
    assert MM_DEFAULT_COMPETITION_MOCK_DURATION_SECONDS == 3600

    counts = _MmSectionCountMap(MM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)

    assert len(counts) == 10
    assert sum(counts.values()) == 100
    assert set(counts.values()) == {10}


def test_mm_mock_generation_keeps_sections_locked_and_concepts_sequential():
    module, level, lessons = _master_module_records()
    questions, coverage = _CollectMmCompetitionSectionLockedQuestions(
        module,
        level,
        lessons,
        MM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT,
    )

    allowed_families_by_section = {
        section["key"]: {spec["conceptFamily"] for spec in MM_COMPETITION_SECTION_CONCEPT_POOLS[section["key"]]}
        for section in MM_COMPETITION_SECTION_DEFINITIONS
    }
    section_questions = defaultdict(list)

    assert len(questions) == 100
    assert coverage["competitionStructure"] == "MM_10_SECTION_COMPETITION_MOCK_SECTION_LOCKED"
    assert len(coverage["sections"]) == 10

    for question in questions:
        metadata = question["metadata"]
        section_key = metadata["competitionSectionKey"]
        section_questions[section_key].append(question)

        assert metadata["competitionSectionLocked"] is True
        assert metadata["competitionConceptName"]
        assert _question_family(question) in allowed_families_by_section[section_key]

    for section in MM_COMPETITION_SECTION_DEFINITIONS:
        section_key = section["key"]
        assert len(section_questions[section_key]) == 10
        _assert_concept_blocks_are_sequential(
            [_competition_concept(question) for question in section_questions[section_key]]
        )

    write_position_questions = [
        question
        for question in section_questions["MM_POSITIONAL_PLACEMENT"]
        if _competition_concept(question) == "Write Number From Given Position"
    ]
    write_positions = [int((question.get("metadata") or {}).get("position")) for question in write_position_questions]
    assert len(write_positions) == len(set(write_positions))


def test_mm_competition_digit_config_respects_title_digit_patterns():
    assert _MmCompetitionDigitConfig("2D X 2D Multiplication", "WHOLE_NUMBER_MULTIPLICATION") == {
        "multiplicationDigits": [2, 2]
    }
    assert _MmCompetitionDigitConfig("3D DIVISION 2D Division", "WHOLE_NUMBER_DIVISION") == {
        "divisionDigits": [3, 2]
    }


def test_mm_question_signature_ignores_volatile_generation_fields():
    first = {
        "question_number": 1,
        "question_text": "  12 + 3  ",
        "operands": ["12.0", "3"],
        "operators": ["+"],
        "correct_answer": "15.00",
        "seed": "seed-a",
        "metadata": {"sourceDpsId": "dps-a", "sourceQuestionNumber": 1},
    }
    second = {
        "question_number": 99,
        "question_text": "12 + 3",
        "operands": [12, 3],
        "operators": ["+"],
        "correct_answer": 15,
        "seed": "seed-b",
        "metadata": {"sourceDpsId": "dps-b", "sourceQuestionNumber": 99},
    }

    assert _QuestionSignature(first) == _QuestionSignature(second)


def test_recent_mm_competition_signatures_only_use_last_15_same_level_mocks():
    engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(engine)
    TestingSession = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

    module = Module(id="module-mm", module_code="MM", module_name="Master Module")
    level = Level(id="level-mm-9", module_id=module.id, level_code="MM-L9", level_name="Level - 9")
    other_level = Level(id="level-mm-8", module_id=module.id, level_code="MM-L8", level_name="Level - 8")
    base_time = datetime(2026, 6, 1, tzinfo=timezone.utc)

    with TestingSession() as db:
        db.add_all([module, level, other_level])
        for index in range(MM_COMPETITION_RECENT_MOCK_FRESHNESS_WINDOW + 1):
            exam = CompetitionMockExam(
                id=f"mock-{index:02d}",
                title=f"Mock {index}",
                mock_code=f"MOCK-{index:02d}",
                module_id=module.id,
                level_id=level.id,
                total_questions=1,
                duration_seconds=3600,
                created_at=base_time + timedelta(minutes=index),
                is_active=True,
            )
            question = CompetitionMockQuestion(
                id=f"question-{index:02d}",
                mock_exam_id=exam.id,
                section_number=1,
                section_title="Section 1",
                question_number=1,
                display_type="VISUAL_STACK",
                question_text="",
                operands_json=json.dumps([index, 1]),
                operators_json=json.dumps(["+"]),
                correct_answer=str(index + 1),
                metadata_json=json.dumps({"competitionSectionKey": "MM_ABACUS_ADD_LESS"}),
            )
            db.add_all([exam, question])

        other_exam = CompetitionMockExam(
            id="mock-other-level",
            title="Other Level Mock",
            mock_code="OTHER-LEVEL",
            module_id=module.id,
            level_id=other_level.id,
            total_questions=1,
            duration_seconds=3600,
            created_at=base_time + timedelta(minutes=100),
            is_active=True,
        )
        other_question = CompetitionMockQuestion(
            id="question-other-level",
            mock_exam_id=other_exam.id,
            section_number=1,
            section_title="Section 1",
            question_number=1,
            display_type="VISUAL_STACK",
            operands_json=json.dumps([999, 1]),
            operators_json=json.dumps(["+"]),
            correct_answer="1000",
        )
        db.add_all([other_exam, other_question])
        db.commit()

        signatures = _RecentMmCompetitionQuestionSignatures(db, ModuleRecord=module, LevelRecord=level)

    oldest_signature = _QuestionSignature({"operands": [0, 1], "operators": ["+"], "correct_answer": 1})
    newest_signature = _QuestionSignature({"operands": [15, 1], "operators": ["+"], "correct_answer": 16})
    other_level_signature = _QuestionSignature({"operands": [999, 1], "operators": ["+"], "correct_answer": 1000})

    assert len(signatures) == MM_COMPETITION_RECENT_MOCK_FRESHNESS_WINDOW
    assert newest_signature in signatures
    assert oldest_signature not in signatures
    assert other_level_signature not in signatures


def test_write_number_from_given_position_varies_competition_positions():
    config = _mm_config(
        "ANSWER_POSITION",
        "Write Number From Given Position",
        {"source": "MM_COMPETITION_SECTION_LOCKED_GENERATOR"},
    )

    positions = [
        GenerateAnswerPosition(config, random.Random(f"write-position-{index}"), 5)[0][0]
        for index in range(18)
    ]

    assert len(set(positions)) >= 4
    assert positions.count(-1) < len(positions) // 2


def test_mm_multiplication_and_division_avoid_trivial_scale_operands():
    multiplication_config = _mm_config(
        "WHOLE_NUMBER_MULTIPLICATION",
        "5D x 2D Multiplication",
        {"multiplicationDigits": [5, 2]},
    )
    decimal_multiplication_config = _mm_config(
        "DECIMAL_MULTIPLICATION",
        "4D x 2D Decimal Multiplication",
        {"multiplicationDigits": [4, 2]},
    )
    division_config = _mm_config(
        "WHOLE_NUMBER_DIVISION",
        "6D division 3D Division",
        {"divisionDigits": [6, 3]},
    )
    decimal_division_config = _mm_config(
        "DECIMAL_DIVISION",
        "6D division 3D Decimal Division",
        {"divisionDigits": [6, 3]},
    )

    for index in range(25):
        operands, _, _, _ = GenerateWholeNumberMultiplication(multiplication_config, random.Random(f"whole-mul-{index}"), 9)
        assert not any(_IsTrivialScaleOperand(operand) for operand in operands)

        operands, _, _, _ = GenerateDecimalMultiplication(decimal_multiplication_config, random.Random(f"decimal-mul-{index}"), 9)
        assert not any(_IsTrivialScaleOperand(operand) for operand in operands)

        operands, _, answer, _ = GenerateWholeNumberDivision(division_config, random.Random(f"whole-div-{index}"), 9)
        assert not _IsTrivialScaleOperand(operands[1])
        assert answer > 10
        assert not _IsTrivialScaleOperand(answer)

        operands, _, answer, _ = GenerateDecimalDivision(decimal_division_config, random.Random(f"decimal-div-{index}"), 9)
        assert not _IsTrivialScaleOperand(operands[1])
        assert not _IsTrivialScaleOperand(answer)
