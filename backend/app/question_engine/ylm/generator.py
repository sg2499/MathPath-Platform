import random
from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.ylm.config import YLMConfig, enrich_config_with_lesson_rule
from app.question_engine.ylm.operands import generate_unique_operands, question_difficulty_stage
from app.question_engine.ylm.validators import question_concept_trace, validate_question
from app.question_engine.ylm.distractors import generate_distractors

def generate_ylm_question_set(config: YLMConfig) -> list[dict]:
    config = enrich_config_with_lesson_rule(config)
    questions: list[dict] = []
    seen: set[tuple[int, ...]] = set()
    rng = random.Random(config.seed)

    for question_number in range(1, config.question_count + 1):
        q_rng = random.Random(f"{config.seed}-Q{question_number}")
        operands = generate_unique_operands(config, q_rng, seen)
        if not validate_question(config, operands, set()):
            # This should not happen because generation is built from validated pools.
            # Keep the explicit guard so no invalid YLM worksheet can ever be published.
            raise ValueError(f"Generated invalid YLM Golden Step question for lesson {config.lesson_number}")
        concept_trace = question_concept_trace(config, operands)
        correct_answer = sum(operands)
        distractors = generate_distractors(correct_answer, operands, q_rng, config.allow_negative_answer)
        options = build_mcq_options(correct_answer, distractors, q_rng)
        questions.append({
            "question_number": question_number,
            "display_type": "VERTICAL",
            "operands": operands,
            "operators": ["+" if n >= 0 else "-" for n in operands],
            "correct_answer": correct_answer,
            "options": options,
            "seed": f"{config.seed}-Q{question_number}",
            "metadata": {
                "concept_family": config.concept_family,
                "operation_focus": config.operation_focus,
                "abacus_rule": config.abacus_rule,
                "target_numbers": config.target_numbers,
                "digit_pattern": config.digit_pattern,
                "place_value": config.place_value,
                "allowed_movement_types": list(config.allowed_movement_types or []),
                "required_movement_types": list(config.required_movement_types or []),
                "lesson_title": config.lesson_title,
                "generation_template": config.generation_template,
                "revision_templates": list(config.revision_templates or []),
                "golden_step_validated": concept_trace["golden_step_validated"],
                "primary_concept_tag": concept_trace["primary_concept_tag"],
                "primary_concept_label": concept_trace["primary_concept_label"],
                "concept_tags": concept_trace["concept_tags"],
                "concept_labels": concept_trace["concept_labels"],
                "allowed_concept_tags": concept_trace["allowed_concept_tags"],
                "required_concept_tags": concept_trace["required_concept_tags"],
                "forbidden_concept_tags_present": concept_trace["forbidden_concept_tags_present"],
                "golden_step_trace": concept_trace["step_trace"],
                "difficulty_stage": question_difficulty_stage(question_number - 1),
                "difficulty_progression": "EASY_TO_CHALLENGE",
            },
        })
        seen.add(tuple(operands))
    return rebalance_correct_option_distribution(questions)
