#!/usr/bin/env python3
"""
Standalone, no-DB verification for the IM "Long Division & Estimation" fix
(Shailesh, 2026-07-15 -- see docs/project-memory/OPEN_ISSUES.md).

Why this exists: this session's Cowork sandbox hit the same recurring
stale-bash-mount issue documented throughout COWORK_HANDOFF.md (the Linux
sandbox's mounted view of edited files lags behind what the file-edit tools
actually wrote, sometimes by hundreds of lines) -- confirmed again this round
via `python3 -c "from app.question_engine.im.operands import
TruncateThenRoundQuotient"` throwing an ImportError for a name that
demonstrably exists in the real file (verified via a full manual re-read
through the file-edit tools, twice). Rather than fight the sandbox, this is a
pure-Python, no-server-needed check meant to be run directly in Shailesh's own
terminal, where the files aren't stale.

What it checks (see PLAN.md-equivalent in the OPEN_ISSUES.md entry for the
full spec):
  1. The worked example: 415 / 7 = 59.285714... -> truncate to 59.285 -> 3rd
     decimal is 5 -> rounds up to 59.29.
  2. A handful of additional hand-computed rounding cases, including the
     boundary (3rd decimal exactly 5) and a case that rounds down.
  3. GenerateWholeNumberDivision(), run 1000x across every combination of
     Long Division & Estimation's real digit patterns (3D/1D, 4D/1D) and
     both visual/abacus config paths: every single result must (a) have a
     genuine remainder (dividend % divisor != 0), (b) be quantized to exactly
     2 decimal places, and (c) pass ValidateImQuestion().
  4. Plain (non-long-division) division is unaffected: still produces an
     exact, remainder-free whole-number result and passes validation --
     regression check for the untouched code path.
  5. The validator correctly REJECTS a hand-crafted exact-division pair even
     when isLongDivisionEstimation=True, proving the fairness guard can't be
     bypassed by a stale/bad generated row slipping through.

Usage: run from backend/, no DATABASE_URL or server needed:
    python scripts/verify_long_division_estimation.py
"""
from __future__ import annotations

import random
import sys
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.question_engine.im.config import IMConfig  # noqa: E402
from app.question_engine.im.operands import (  # noqa: E402
    GenerateWholeNumberDivision,
    TruncateThenRoundQuotient,
)
from app.question_engine.im.validators import ValidateImQuestion  # noqa: E402

CHECKS_PASSED = 0
CHECKS_FAILED = 0


def check(label: str, condition: bool, detail: str = "") -> None:
    global CHECKS_PASSED, CHECKS_FAILED
    if condition:
        CHECKS_PASSED += 1
        print(f"  [PASS] {label}")
    else:
        CHECKS_FAILED += 1
        print(f"  [FAIL] {label} {detail}")


def _base_kwargs() -> dict:
    # IMConfig's ModuleCode/LevelCode/LessonNumber/DpsNumber/DpsTitle/LessonTitle
    # are required positional fields but irrelevant to GenerateWholeNumberDivision
    # (which only reads ConceptFamily and GeneratorConfig) -- dummy values here
    # match the same convention as this module's own docstring examples.
    return dict(
        ModuleCode="IM",
        LevelCode="IM-L4",
        LessonNumber=1,
        DpsNumber=1,
        DpsTitle="Verification Harness",
        LessonTitle="Verification Harness",
    )


def _config(dividend_digits: int, divisor_digits: int, visual: bool) -> IMConfig:
    return IMConfig(
        **_base_kwargs(),
        ConceptFamily="WHOLE_NUMBER_DIVISION",
        GeneratorConfig={
            "divisionDigits": (dividend_digits, divisor_digits),
            "isLongDivisionEstimation": True,
            "isVisual": visual,
            "isAbacus": not visual,
        },
    )


def _plain_config(dividend_digits: int, divisor_digits: int) -> IMConfig:
    return IMConfig(
        **_base_kwargs(),
        ConceptFamily="WHOLE_NUMBER_DIVISION",
        GeneratorConfig={
            "divisionDigits": (dividend_digits, divisor_digits),
            "isLongDivisionEstimation": False,
        },
    )


def main() -> None:
    print("=" * 88)
    print("LONG DIVISION & ESTIMATION -- standalone verification (no DB required)")
    print("=" * 88)

    print("\n--- 1. Worked example (Shailesh's spec) ---")
    result = TruncateThenRoundQuotient(Decimal(415) / Decimal(7))
    check("415 / 7 -> 59.29", result == Decimal("59.29"), f"(got {result})")

    print("\n--- 2. Additional hand-computed rounding cases ---")
    cases = [
        (Decimal("59.285"), Decimal("59.29")),   # exactly on the boundary, rounds up
        (Decimal("59.284"), Decimal("59.28")),   # 3rd decimal < 5, rounds down
        (Decimal("100.005"), Decimal("100.01")), # boundary again, larger magnitude
        (Decimal("7") / Decimal("3"), Decimal("2.33")),  # 2.333... -> truncate 2.333 -> round to 2.33
        (Decimal("22") / Decimal("7"), Decimal("3.14")), # 3.142857... -> truncate 3.142 -> round to 3.14
    ]
    for exact, expected in cases:
        got = TruncateThenRoundQuotient(exact)
        check(f"{exact} -> {expected}", got == expected, f"(got {got})")

    print("\n--- 3. GenerateWholeNumberDivision(), Long Division & Estimation, 1000 draws per pattern ---")
    rng = random.Random(20260715)
    patterns = [(3, 1, True), (3, 1, False), (4, 1, True), (4, 1, False)]
    for dividend_digits, divisor_digits, visual in patterns:
        cfg = _config(dividend_digits, divisor_digits, visual)
        label = f"{dividend_digits}D/{divisor_digits}D ({'Visual' if visual else 'Abacus'})"
        all_remainder = True
        all_two_decimals = True
        all_valid = True
        for i in range(1000):
            operands, operators, correct_answer, _metadata = GenerateWholeNumberDivision(cfg, rng, i)
            dividend, divisor = operands
            if int(dividend) % int(divisor) == 0:
                all_remainder = False
            exponent = correct_answer.as_tuple().exponent
            if exponent != -2:
                all_two_decimals = False
            if not ValidateImQuestion(cfg, operands, operators, correct_answer):
                all_valid = False
        check(f"{label}: every draw has a genuine remainder", all_remainder)
        check(f"{label}: every answer is quantized to exactly 2 decimals", all_two_decimals)
        check(f"{label}: every draw passes ValidateImQuestion", all_valid)

    print("\n--- 4. Plain division (unaffected code path) still exact, still passes validation ---")
    plain_cfg = _plain_config(4, 2)
    all_exact = True
    all_valid = True
    for i in range(200):
        operands, operators, correct_answer, _metadata = GenerateWholeNumberDivision(plain_cfg, rng, i)
        dividend, divisor = operands
        if int(dividend) % int(divisor) != 0:
            all_exact = False
        if not ValidateImQuestion(plain_cfg, operands, operators, correct_answer):
            all_valid = False
    check("Plain 4D/2D division: every draw is exact (no remainder)", all_exact)
    check("Plain 4D/2D division: every draw passes ValidateImQuestion", all_valid)

    print("\n--- 5. Validator rejects a hand-crafted exact-division pair even when flagged Long Division ---")
    bad_cfg = _config(3, 1, True)
    rejected = not ValidateImQuestion(bad_cfg, [100, 5], ["", "÷"], Decimal("20"))
    check("100 / 5 = 20 (exact) is REJECTED under isLongDivisionEstimation=True", rejected)

    print("\n" + "=" * 88)
    print(f"RESULT: {CHECKS_PASSED} passed, {CHECKS_FAILED} failed.")
    print("=" * 88)
    if CHECKS_FAILED:
        sys.exit(1)


if __name__ == "__main__":
    main()
