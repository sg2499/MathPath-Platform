import random
from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.ylm.config import YLMConfig
from app.question_engine.ylm.operands import generate_operands
from app.question_engine.ylm.validators import validate_question
from app.question_engine.ylm.distractors import generate_distractors

def generate_ylm_question_set(config: YLMConfig) -> list[dict]:
    questions: list[dict] = []
    seen: set[tuple[int, ...]] = set()
    rng = random.Random(config.seed)

    for question_number in range(1, config.question_count + 1):
        for retry in range(200):
            q_rng = random.Random(f"{config.seed}-Q{question_number}-{retry}")
            operands = generate_operands(config, q_rng)
            if not validate_question(config, operands, seen):
                continue
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
                "seed": f"{config.seed}-Q{question_number}-{retry}",
                "metadata": {
                    "concept_family": config.concept_family,
                    "operation_focus": config.operation_focus,
                    "abacus_rule": config.abacus_rule,
                    "target_numbers": config.target_numbers,
                    "digit_pattern": config.digit_pattern,
                    "place_value": config.place_value,
                },
            })
            seen.add(tuple(operands))
            break
        else:
            raise ValueError(f"Could not generate valid YLM question {question_number}")
    return rebalance_correct_option_distribution(questions)
