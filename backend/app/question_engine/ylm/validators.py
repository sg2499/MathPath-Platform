from app.question_engine.ylm.config import YLMConfig

def validate_question(config: YLMConfig, operands: list[int], seen: set[tuple[int, ...]]) -> bool:
    if len(operands) != config.rows:
        return False
    if tuple(operands) in seen:
        return False
    answer = sum(operands)
    if not config.allow_negative_answer and answer < 0:
        return False
    if answer > 999:
        return False
    if config.target_numbers:
        abs_operands = [abs(v) for v in operands]
        if not any(abs(t) in abs_operands for t in config.target_numbers):
            return False
    return True
