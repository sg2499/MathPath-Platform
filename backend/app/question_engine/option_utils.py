import random

LABELS = ["A", "B", "C", "D"]

def build_mcq_options(correct_answer: int, distractors: list[int], rng: random.Random) -> list[dict]:
    values = [correct_answer] + distractors[:3]
    rng.shuffle(values)
    return [
        {
            "label": LABELS[i],
            "value": str(value),
            "is_correct": value == correct_answer,
            "display_order": i + 1,
        }
        for i, value in enumerate(values)
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
