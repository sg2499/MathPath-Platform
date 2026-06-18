from collections import Counter

from app.question_engine.mm import GenerateMmQuestionSet, MMConfig
from app.question_engine.mm.curriculum_map import MM_CURRICULUM_MAP
from app.question_engine.ylm import YLMConfig, generate_ylm_question_set

def test_ylm_generator_outputs_valid_mcq_set():
    config = YLMConfig(
        module_code="YLM",
        level_code="YLM-L1",
        lesson_number=5,
        dps_number=1,
        concept_family="COMPLEMENT_OF_5",
        operation_focus="ADDITION",
        abacus_rule="ADD_5_LESS_2",
        target_numbers=[3],
        place_value="ONES",
        digit_pattern="1D",
        seed="TEST-SEED",
    )
    questions = generate_ylm_question_set(config)
    assert len(questions) == 10
    for q in questions:
        assert len(q["operands"]) == 3
        assert q["correct_answer"] == sum(q["operands"])
        assert q["correct_answer"] >= 0
        assert len(q["options"]) == 4
        assert len({o["value"] for o in q["options"]}) == 4
        assert sum(1 for o in q["options"] if o["is_correct"]) == 1


def test_mm_lesson_one_dps_one_generates_all_attached_concepts():
    config = MMConfig(
        ModuleCode="MM",
        LevelCode="MM-L1",
        LessonNumber=1,
        DpsNumber=1,
        DpsTitle="DPS 1: Decimal Number Add-Less, 2D x 2D (Visual) & 4D / 2D (Visual)",
        LessonTitle="Lesson 1",
        QuestionCount=30,
        Seed="TEST-MM-L1-DPS1",
        ConceptFamily="DECIMAL_ADD_LESS",
        OperationFocus="MIXED",
        DigitPattern="MASTER_MODULE",
        Difficulty="MASTER",
        GeneratorConfig={},
    )

    questions = GenerateMmQuestionSet(config)

    assert len(questions) == 30
    assert Counter(q["metadata"]["concept_family"] for q in questions) == {
        "DECIMAL_ADD_LESS": 10,
        "WHOLE_NUMBER_MULTIPLICATION": 10,
        "WHOLE_NUMBER_DIVISION": 10,
    }
    decimal_questions = [q for q in questions if q["metadata"]["concept_family"] == "DECIMAL_ADD_LESS"]
    assert all(q["correct_answer"] < 0 for q in decimal_questions)


def test_all_master_module_curriculum_mapped_dps_generate_cleanly():
    failures: list[str] = []

    for lesson_number, dps_map in sorted(MM_CURRICULUM_MAP.items()):
        for dps_number in sorted(dps_map):
            config = MMConfig(
                ModuleCode="MM",
                LevelCode="MM-L1",
                LessonNumber=lesson_number,
                DpsNumber=dps_number,
                DpsTitle=f"Lesson {lesson_number} DPS {dps_number}",
                LessonTitle=f"Lesson {lesson_number}",
                QuestionCount=30,
                Seed=f"TEST-MM-L{lesson_number}-DPS{dps_number}",
                ConceptFamily="CONCEPT_DRILL",
                OperationFocus="MIXED",
                DigitPattern="MASTER_MODULE",
                Difficulty="MASTER",
                GeneratorConfig={},
            )
            try:
                questions = GenerateMmQuestionSet(config)
            except Exception as exc:
                failures.append(f"Lesson {lesson_number} DPS {dps_number}: {type(exc).__name__}: {exc}")
                continue
            if not questions:
                failures.append(f"Lesson {lesson_number} DPS {dps_number}: empty question set")

    assert failures == []
