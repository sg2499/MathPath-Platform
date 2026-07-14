import pytest
from fastapi import HTTPException

from app.models import Lesson, Level, Module
from app.services.competition_mock_generation_service import (
    IM_COMPETITION_SECTION_CONCEPT_POOLS,
    IM_COMPETITION_SECTION_DEFINITIONS,
    IM_COMPETITION_LEVEL_REGISTRY,
    IM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT,
    _CollectImCompetitionSectionLockedQuestions,
    _ImCompetitionLevelConfig,
)


def test_im_l4_is_registered_with_a_complete_competition_mock_structure():
    # IM_COMPETITION_LEVEL_REGISTRY is the single source of truth generation
    # code reads from -- if IM-L4 ever fell out of it, every IM competition
    # mock in production would start failing immediately, so this pins down
    # that it stays present and points at the real, non-empty structures.
    assert "IM-L4" in IM_COMPETITION_LEVEL_REGISTRY
    config = IM_COMPETITION_LEVEL_REGISTRY["IM-L4"]
    assert config["sectionDefinitions"] == IM_COMPETITION_SECTION_DEFINITIONS
    assert config["sectionConceptPools"] == IM_COMPETITION_SECTION_CONCEPT_POOLS
    assert len(config["sectionDefinitions"]) == 8
    for section in config["sectionDefinitions"]:
        assert config["sectionConceptPools"].get(section["key"])


def test_unregistered_im_level_fails_loudly_instead_of_reusing_im_l4():
    # IM competition mocks are designed level by level (confirmed with
    # Shailesh), so a level with no entry in IM_COMPETITION_LEVEL_REGISTRY
    # (IM-L1/L2/L3 today) must be rejected with a clear, catchable error --
    # never silently generate IM-L4's questions under a different level's
    # name.
    module = Module(id="module-im", module_code="IM", module_name="Intermediate Module")
    unregistered_level = Level(
        id="level-im-1",
        module_id=module.id,
        level_code="IM-L1",
        level_name="Level - 1",
    )

    with pytest.raises(HTTPException) as exc:
        _ImCompetitionLevelConfig(unregistered_level)
    assert exc.value.status_code == 400
    assert exc.value.detail["code"] == "IM_COMPETITION_LEVEL_NOT_CONFIGURED"

    lessons = [
        Lesson(id=f"im-lesson-{n}", level_id=unregistered_level.id, lesson_number=n, lesson_title=f"Lesson {n}")
        for n in range(1, 13)
    ]
    with pytest.raises(HTTPException) as exc:
        _CollectImCompetitionSectionLockedQuestions(
            module,
            unregistered_level,
            lessons,
            IM_DEFAULT_COMPETITION_MOCK_QUESTION_COUNT,
        )
    assert exc.value.detail["code"] == "IM_COMPETITION_LEVEL_NOT_CONFIGURED"
