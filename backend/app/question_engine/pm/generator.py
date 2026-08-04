import random

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.pm.config import PMConfig
from app.question_engine.pm.operands import generate_unique_operands, question_difficulty_stage
from app.question_engine.pm.validators import question_concept_trace, validate_question
from app.question_engine.pm.distractors import generate_distractors


def generate_pm_question_set(config: PMConfig) -> list[dict]:
    """Preparatory Module's own, fully independent question generator.

    Does not import from question_engine.ylm/mm/im, and nothing in those
    packages imports from here -- a bug or future change in any of them can
    never change PM's output, and a bug here can never touch them. The
    algorithm (bead-movement classification, complement-of-5/10 base pools,
    difficulty staging) was authored specifically for PM's own use in
    validators.py/operands.py in this same directory.
    """
    questions: list[dict] = []
    seen: set[tuple[int, ...]] = set()
    rng = random.Random(config.seed)

    for question_number in range(1, config.question_count + 1):
        q_rng = random.Random(f"{config.seed}-Q{question_number}")
        operands = generate_unique_operands(config, q_rng, seen)
        if not validate_question(config, operands):
            raise ValueError(f"Generated invalid PM question for lesson {config.lesson_number} DPS {config.dps_number}")
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
                "lesson_title": config.lesson_title,
                "dps_title": config.dps_title,
                "generation_template": config.generation_template,
                "revision_templates": list(config.revision_templates or []),
                "primary_concept_tag": concept_trace["primary_concept_tag"],
                "primary_concept_label": concept_trace["primary_concept_label"],
                "concept_tags": concept_trace["concept_tags"],
                "concept_labels": concept_trace["concept_labels"],
                "concept_validated": concept_trace["golden_step_validated"],
                "concept_trace": concept_trace["step_trace"],
                "difficulty_stage": question_difficulty_stage(question_number - 1),
                "difficulty_progression": "EASY_TO_CHALLENGE",
            },
        })
        seen.add(tuple(operands))
    return rebalance_correct_option_distribution(questions)
