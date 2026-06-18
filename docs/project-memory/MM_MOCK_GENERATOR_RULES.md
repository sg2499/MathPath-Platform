# Master Module Mock Generator Rules

Last updated: 2026-06-18

## Defaults

- Default questions: 100.
- Default duration: 60 minutes.
- Default section allocation: 10 questions in each of 10 sections.

## Sections

The MM mock generator has exactly 10 approved sections:

1. Add/Less (Abacus)
2. Add/Less (Visual)
3. Multiplication
4. Division
5. Positional & Placement
6. Squares and Square Roots
7. Cubes and Cube Roots
8. BODMAS, Solve Equation, Add/Less Percentage
9. Profit/Loss, Simple Interest, Selling Price
10. Skill Stacker, Concept Drill

## Generation Rules

- Sections are locked.
- A section must only generate sums from its approved concept pool.
- Concepts inside a section must be generated sequentially, not randomly interleaved.
- A generated MM mock must not repeat the same question/sum inside the same mock.
- A generated MM mock must avoid questions/sums already used in the previous 15 active MM mocks for the same level.
- Reuse is acceptable only after that 15-mock freshness window has moved past the older mock.
- If the generator cannot satisfy a section count without breaking the 15-mock freshness rule, it must fail clearly instead of silently repeating recent sums.
- Write Number From Given Position must vary the requested position values inside competition mocks; do not keep generating the same slot such as only `-1`.
- Multiplication and division questions must avoid shortcut scale operands such as `1`, `10`, `20`, `50`, `100`, `1000`, and decimal equivalents that make the problem a place-shift instead of real calculation.
- Division questions must avoid low or scale-like quotients where the answer is immediately obvious.
- Fast visualisation add/less must use exactly 7 rows and must honor the section's explicit digit count, including 2-digit and 3-digit fast visualisation sheets.
- Standard visual add/less must stay within its approved whole-number row range instead of inheriting arbitrary add/less row counts.
- Decimal visual add/less must use approved decimal row patterns: either 3-4 rows of 4-digit whole parts or a 5-row mix that covers 2-digit, 3-digit, and 4-digit whole parts.
- Visual add/less validation must fail clearly if row-count or digit-shape rules are broken.
- The generated question metadata must include the exact competition concept name for review and coverage.
- MM competition generation must bypass the normal lesson/DPS curriculum map when using the section-locked competition generator source.

## Preview Rules

- No question preview should require an inner scrollbar.
- Positional cards must not duplicate their heading/prompt.
- Find the Position of the First Natural Number cards must always display the full task name in the question box, even when backend `question_text` is empty.
- Existing saved mocks should render with the latest frontend cleanup without requiring regeneration.

## Test Expectations

Backend generator changes should preserve:

- 100-question MM mock output.
- 10 locked sections.
- 10 questions per section by default.
- No section-family leakage.
- Concept block sequencing inside every section.
- Stable duplicate detection that ignores volatile fields such as seed, generated question number, and source DPS.
- Fast visualisation questions remain 7 rows with operands matching the section's explicit digit count.
- Decimal visual add/less questions preserve the approved row-count and whole-digit coverage rules.
- Every mapped Master Module DPS plan should generate a non-empty question set in backend regression tests.
