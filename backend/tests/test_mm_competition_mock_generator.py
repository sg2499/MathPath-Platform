from collections import defaultdict

from app.models import Lesson, Level, Module
from app.services.competition_mock_generation_service import (
    MM_COMPETITION_SECTION_CONCEPT_POOLS,
    MM_COMPETITION_SECTION_DEFINITIONS,
    MM_DEFAULT_COMPETITION_MOCK_DURATION_SECONDS,
    MM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT,
    _CollectMmCompetitionSectionLockedQuestions,
    _MmCompetitionDigitConfig,
    _MmSectionCountMap,
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


def test_mm_competition_digit_config_respects_title_digit_patterns():
    assert _MmCompetitionDigitConfig("2D X 2D Multiplication", "WHOLE_NUMBER_MULTIPLICATION") == {
        "multiplicationDigits": [2, 2]
    }
    assert _MmCompetitionDigitConfig("3D DIVISION 2D Division", "WHOLE_NUMBER_DIVISION") == {
        "divisionDigits": [3, 2]
    }
