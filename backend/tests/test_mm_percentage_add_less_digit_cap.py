"""Coverage for the 2026-09-15 fix (Shailesh): "the mm add/less percentage
problem also needs to be addressed for the competition that is across both
the flows official and practice" -- MM Add/Less Percentage final answers
must never exceed 5 total digits (integer + decimal digits combined,
trailing zeros excluded).

GeneratePercentageAddLess (backend/app/question_engine/mm/operands.py) is
the single shared generator behind DPS, Assessment, Mock Exam, and Annual
Competition (both OFFICIAL and PRACTICE scopes) -- all reach it via
GenerateMmQuestionSet, so this one fix (and this one test file) covers
every flow. Exercises every lesson band (1-6, via LessonNumber) plus the
Annual Competition's own fixed LessonNumber=5 default, across both
operators (Add %, Less %) and a wide spread of RNG seeds, to catch any
band/operator combination that could slip past the cap.
"""
from __future__ import annotations

import random
from decimal import Decimal

import pytest

from app.question_engine.mm.config import MMConfig
from app.question_engine.mm.operands import GeneratePercentageAddLess


def _TotalDigitCount(Value: Decimal) -> int:
    Normalized = Value.to_integral_value() if Value == Value.to_integral_value() else Value.normalize()
    return len("".join(Character for Character in format(Normalized, "f") if Character.isdigit()))


def _MakeConfig(LessonNumber: int, DpsTitle: str) -> MMConfig:
    return MMConfig(
        ModuleCode="MM", LevelCode="MM-L1", LessonNumber=LessonNumber, DpsNumber=1,
        DpsTitle=DpsTitle, LessonTitle=f"Lesson {LessonNumber}", QuestionCount=20,
        Seed="digit-cap-test", ConceptFamily="PERCENTAGE_ADD_LESS",
    )


# Lesson numbers spanning every _LessonBand (1-6) at its band boundary, plus
# the Annual Competition's own fixed default (LessonNumber=5 -> Band 1,
# since _MM_PERCENTAGE_POOL sets no explicit mmLessonNumber).
LESSON_NUMBERS_BY_BAND = [1, 6, 11, 16, 21, 26]
ANNUAL_COMPETITION_DEFAULT_LESSON_NUMBER = 5


@pytest.mark.parametrize("lesson_number", LESSON_NUMBERS_BY_BAND + [ANNUAL_COMPETITION_DEFAULT_LESSON_NUMBER])
@pytest.mark.parametrize("dps_title", ["Add Percentage Practice", "Less Percentage Practice"])
def test_correct_answer_never_exceeds_five_total_digits(lesson_number, dps_title):
    """Stress-tests one (lesson-band, operator) combination across 300 RNG
    seeds -- large enough to expose a systematic band/range problem (the
    kind a single fixed seed could get lucky and miss) without being slow.
    """
    Config = _MakeConfig(lesson_number, dps_title)
    for SeedValue in range(300):
        Rng = random.Random(SeedValue)
        for QuestionNumber in (1, 5, 10, 15, 20):
            _Operands, _Symbols, CorrectAnswer, Metadata = GeneratePercentageAddLess(Config, Rng, QuestionNumber)
            assert _TotalDigitCount(CorrectAnswer) <= 5, (
                f"lesson={lesson_number} title={dps_title!r} seed={SeedValue} q={QuestionNumber} "
                f"answer={CorrectAnswer} exceeds the 5-digit cap"
            )
            assert Metadata["correct_answer_max_total_digits"] == 5


def test_mixed_add_less_title_also_respects_the_cap():
    """A DPS/section title that names neither "add" nor "less" explicitly
    lets the generator pick the operator itself (Rng.choice) -- covered
    separately since that's a different code path from the two title-driven
    branches above.
    """
    Config = _MakeConfig(16, "Percentage Practice")
    for SeedValue in range(200):
        Rng = random.Random(SeedValue)
        for QuestionNumber in (1, 10, 20):
            _Operands, _Symbols, CorrectAnswer, _Metadata = GeneratePercentageAddLess(Config, Rng, QuestionNumber)
            assert _TotalDigitCount(CorrectAnswer) <= 5
