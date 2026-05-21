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
