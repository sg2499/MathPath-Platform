import dataclasses
import random

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.bm.config import (
    BMConfig,
    BMConceptDrillConfig,
    BMMultiplyConfig,
    BMDivideConfig,
    BMDivideRemainderConfig,
    BMBodmasConfig,
)
from app.question_engine.bm.operands import generate_unique_operands, question_difficulty_stage, total_row_count
from app.question_engine.bm.validators import question_concept_trace, validate_question
from app.question_engine.bm.distractors import generate_distractors
from app.question_engine.bm.concept_drill import generate_concept_drill_question
from app.question_engine.bm.multiply import generate_multiply_table_question
from app.question_engine.bm.divide import generate_divide_table_question
from app.question_engine.bm.divide_remainder import generate_divide_remainder_question
from app.question_engine.bm.bodmas import generate_bodmas_question


def generate_bm_question_set(config: BMConfig) -> list[dict]:
    """Bridge Module Level 1's own, fully independent vertical Add/Less
    question generator. Zero imports from question_engine/pm, pm_l2, pm_l3,
    pm_l4, or any other module's engine -- see this package's __init__.py
    docstring.
    """
    questions: list[dict] = []
    seen: set[tuple[int, ...]] = set()
    rng = random.Random(config.seed)

    total_rows = total_row_count(config)
    effective_config = dataclasses.replace(config, rows=total_rows)

    for question_number in range(1, config.question_count + 1):
        q_rng = random.Random(f"{config.seed}-Q{question_number}")
        question_index = question_number - 1
        operands = generate_unique_operands(config, q_rng, seen)
        if not validate_question(effective_config, operands):
            raise ValueError(f"Generated invalid BM question for lesson {config.lesson_number} DPS {config.dps_number}")
        concept_trace = question_concept_trace(effective_config, operands)
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
                "digit_pattern_second_half": config.digit_pattern_second_half,
                "rows_second_half": config.rows_second_half,
                "place_value": config.place_value,
                "lesson_title": config.lesson_title,
                "dps_title": config.dps_title,
                "practice_mode": config.practice_mode,
                "generation_template": config.generation_template,
                "revision_templates": list(config.revision_templates or []),
                "primary_concept_tag": concept_trace["primary_concept_tag"],
                "primary_concept_label": concept_trace["primary_concept_label"],
                "concept_tags": concept_trace["concept_tags"],
                "concept_labels": concept_trace["concept_labels"],
                "concept_validated": concept_trace["golden_step_validated"],
                "concept_trace": concept_trace["step_trace"],
                "difficulty_stage": question_difficulty_stage(question_index),
                "difficulty_progression": "EASY_TO_CHALLENGE",
            },
        })
        seen.add(tuple(operands))
    return rebalance_correct_option_distribution(questions)


def generate_bm_multiply_set(config: BMMultiplyConfig, count: int) -> list[dict]:
    questions: list[dict] = []
    for i in range(1, count + 1):
        q_rng = random.Random(f"{config.seed}-Q{i}")
        question = generate_multiply_table_question(config, q_rng)
        question["question_number"] = i
        question["seed"] = f"{config.seed}-Q{i}"
        questions.append(question)
    return questions


def generate_bm_divide_set(config: BMDivideConfig, count: int) -> list[dict]:
    questions: list[dict] = []
    for i in range(1, count + 1):
        q_rng = random.Random(f"{config.seed}-Q{i}")
        question = generate_divide_table_question(config, q_rng)
        question["question_number"] = i
        question["seed"] = f"{config.seed}-Q{i}"
        questions.append(question)
    return questions


def generate_bm_divide_remainder_set(config: BMDivideRemainderConfig, count: int) -> list[dict]:
    questions: list[dict] = []
    for i in range(1, count + 1):
        q_rng = random.Random(f"{config.seed}-Q{i}")
        question = generate_divide_remainder_question(config, q_rng)
        question["question_number"] = i
        question["seed"] = f"{config.seed}-Q{i}"
        questions.append(question)
    return questions


def generate_bm_bodmas_set(config: BMBodmasConfig, count: int) -> list[dict]:
    questions: list[dict] = []
    for i in range(1, count + 1):
        q_rng = random.Random(f"{config.seed}-Q{i}")
        question = generate_bodmas_question(config, q_rng)
        question["question_number"] = i
        question["seed"] = f"{config.seed}-Q{i}"
        questions.append(question)
    return questions


def generate_bm_concept_drill_set(specs: list[tuple[BMConceptDrillConfig, int]]) -> list[dict]:
    """Assembles one DPS's Concept Drill sub-block from an ordered list of
    (config, count) specs, e.g. [(multiply_config, 1), (divide_config, 1)]
    -- same sequential-numbering convention PM-L2/L3/L4's equivalent uses.
    """
    questions: list[dict] = []
    question_number = 1
    for config, count in specs:
        for _ in range(count):
            q_rng = random.Random(f"{config.seed}-Q{question_number}")
            question = generate_concept_drill_question(config, q_rng)
            question["question_number"] = question_number
            question["seed"] = f"{config.seed}-Q{question_number}"
            question_number += 1
            questions.append(question)
    return questions
