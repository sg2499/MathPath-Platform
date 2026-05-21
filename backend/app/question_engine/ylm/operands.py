import random
from app.question_engine.ylm.config import YLMConfig

def _base_for_digit_pattern(config: YLMConfig, rng: random.Random) -> int:
    if config.digit_pattern == "1D":
        return rng.randint(1, 8)
    if config.digit_pattern == "2D_TENS":
        return rng.choice([10, 20, 30, 40, 50, 60, 70, 80])
    return rng.randint(10, 80)

def _support_operand(config: YLMConfig, rng: random.Random) -> int:
    if config.place_value == "ONES":
        pool = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    elif config.place_value == "TENS":
        pool = [10, 20, 30, 40, 50]
    else:
        pool = [1, 2, 3, 4, 5, 10, 20, 30, 40]
    value = rng.choice(pool)
    if config.allow_negative_operands and rng.random() < 0.35:
        value = -value
    return value

def generate_operands(config: YLMConfig, rng: random.Random) -> list[int]:
    base = _base_for_digit_pattern(config, rng)
    target = rng.choice(config.target_numbers) if config.target_numbers else _support_operand(config, rng)

    if config.operation_focus == "SUBTRACTION":
        target = -abs(target)
    elif config.operation_focus == "ADDITION":
        target = abs(target)

    third = _support_operand(config, rng)
    # Keep beginner direct add-less clean unless negative is allowed.
    return [base, target, third]
