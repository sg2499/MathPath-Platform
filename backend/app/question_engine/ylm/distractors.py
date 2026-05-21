import random

def generate_distractors(correct_answer: int, operands: list[int], rng: random.Random, allow_negative: bool = False) -> list[int]:
    candidates: list[int] = []
    deltas = [1, -1, 5, -5, 10, -10, 2, -2, 20, -20]
    candidates.extend(correct_answer + d for d in deltas)

    # Missed row mistakes.
    for i in range(len(operands)):
        candidates.append(sum(v for j, v in enumerate(operands) if j != i))

    # Wrong sign mistakes.
    for i, value in enumerate(operands):
        flipped = operands.copy()
        flipped[i] = -value
        candidates.append(sum(flipped))

    # Place value mistakes around tens/ones.
    for value in operands:
        if abs(value) >= 10 and value % 10 == 0:
            candidates.append(correct_answer - value + (value // 10))

    cleaned: list[int] = []
    for c in candidates:
        if c == correct_answer:
            continue
        if not allow_negative and c < 0:
            continue
        if c not in cleaned:
            cleaned.append(c)

    cleaned.sort(key=lambda x: abs(x - correct_answer))
    selected = cleaned[:3]
    fallback_deltas = [3, -3, 4, -4, 6, -6, 9, -9, 15, -15]
    while len(selected) < 3:
        candidate = correct_answer + rng.choice(fallback_deltas)
        if candidate != correct_answer and (allow_negative or candidate >= 0) and candidate not in selected:
            selected.append(candidate)
    rng.shuffle(selected)
    return selected[:3]
