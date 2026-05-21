# YLM Generator Specification v1

## Pipeline

DPS Config → Rule Resolver → Operand Generator → Validator → Answer Calculator → Distractor Generator → Option Shuffler → Backend Question → Safe Student Payload

## Output Rules

- 10 questions per DPS by default.
- 3 signed operands per question.
- Correct answer = sum(operands).
- 4 options: 1 correct + 3 distractors.
- Correct option randomized across A/B/C/D.
- No duplicate options.
- No negative final answer unless enabled.

## Distractors

Use realistic child mistakes: correct ±1, ±5, ±10, missed row, wrong sign, place-value mistake, complement mistake.
