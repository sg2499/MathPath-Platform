import random
from decimal import Decimal, InvalidOperation
from typing import Any

LABELS = ["A", "B", "C", "D"]


def _NormaliseOptionKey(Value: Any) -> str:
    try:
        DecimalValue = Decimal(str(Value))
        if DecimalValue == DecimalValue.to_integral_value():
            return str(int(DecimalValue))
        return format(DecimalValue.normalize(), "f")
    except (InvalidOperation, ValueError, TypeError):
        return str(Value)


def _IsWholeNumber(Value: Any) -> bool:
    try:
        DecimalValue = Decimal(str(Value))
        return DecimalValue == DecimalValue.to_integral_value()
    except (InvalidOperation, ValueError, TypeError):
        return False


def _FallbackDistractor(CorrectAnswer: Any, Offset: int) -> Any:
    try:
        CorrectDecimal = Decimal(str(CorrectAnswer))
        if CorrectDecimal == CorrectDecimal.to_integral_value():
            Candidate = CorrectDecimal + Decimal(Offset)
            return int(Candidate)
        Places = max(1, -CorrectDecimal.normalize().as_tuple().exponent)
        Step = Decimal("1").scaleb(-Places)
        Candidate = CorrectDecimal + (Step * Decimal(Offset))
        return float(Candidate)
    except (InvalidOperation, ValueError, TypeError):
        return f"{CorrectAnswer}-{Offset}"


def build_mcq_options(correct_answer: Any, distractors: list[Any], rng: random.Random) -> list[dict]:
    """Build MCQ options with no duplicate values and no answer-format giveaway.

    Concept-specific distractor generators are responsible for producing the best
    pedagogical distractors. This shared layer protects all modules from duplicate
    options and guarantees that the correct answer is present exactly once.
    """
    CorrectKey = _NormaliseOptionKey(correct_answer)
    Values: list[Any] = [correct_answer]
    Seen = {CorrectKey}

    for Distractor in distractors:
        Key = _NormaliseOptionKey(Distractor)
        if Key in Seen:
            continue
        Values.append(Distractor)
        Seen.add(Key)
        if len(Values) == 4:
            break

    Offset = 1
    while len(Values) < 4:
        Candidate = _FallbackDistractor(correct_answer, Offset if Offset % 2 else -Offset)
        Key = _NormaliseOptionKey(Candidate)
        if Key not in Seen:
            Values.append(Candidate)
            Seen.add(Key)
        Offset += 1

    rng.shuffle(Values)
    return [
        {
            "label": LABELS[i],
            "value": str(Value),
            "is_correct": _NormaliseOptionKey(Value) == CorrectKey,
            "display_order": i + 1,
        }
        for i, Value in enumerate(Values)
    ]


def rebalance_correct_option_distribution(questions: list[dict], max_per_label: int = 5) -> list[dict]:
    # Simple quality guard for 10-question sets. If one label dominates, rotate options safely.
    counts = {label: 0 for label in LABELS}
    for q in questions:
        for opt in q["options"]:
            if opt["is_correct"]:
                counts[opt["label"]] += 1
    if not counts or max(counts.values()) <= max_per_label:
        return questions
    for idx, q in enumerate(questions):
        target_label = LABELS[idx % 4]
        current_idx = next(i for i, opt in enumerate(q["options"]) if opt["is_correct"])
        target_idx = LABELS.index(target_label)
        q["options"][current_idx], q["options"][target_idx] = q["options"][target_idx], q["options"][current_idx]
        for i, opt in enumerate(q["options"]):
            opt["label"] = LABELS[i]
            opt["display_order"] = i + 1
    return questions
