import random
from decimal import Decimal

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.mm.config import MMConfig, IsPackage1Supported
from app.question_engine.mm.distractors import GenerateMmDistractors
from app.question_engine.mm.operands import DifficultyStage, GeneratePackage1Question
from app.question_engine.mm.validators import ValidateMmQuestion


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


def GenerateMmQuestionSet(Config: MMConfig) -> list[dict]:
    if not IsPackage1Supported(Config.ConceptFamily):
        raise ValueError(f"Master Module generator Package 1 does not support concept: {Config.ConceptFamily}")

    Questions: list[dict] = []
    Seen: set[tuple[str, ...]] = set()

    for QuestionNumber in range(1, Config.QuestionCount + 1):
        QuestionSeed = f"{Config.Seed}-MM-Q{QuestionNumber}"
        Rng = random.Random(QuestionSeed)
        Attempt = 0
        while True:
            Operands, Operators, CorrectAnswer, ExtraMetadata = GeneratePackage1Question(Config, Rng, QuestionNumber)
            Signature = tuple([str(Value) for Value in Operands] + Operators)
            if Signature not in Seen and ValidateMmQuestion(Config, Operands, Operators, CorrectAnswer):
                Seen.add(Signature)
                break
            Attempt += 1
            if Attempt > 80:
                # Deterministic fallback by changing only the per-question random stream;
                # still uses the same concept-specific generator and validator.
                Rng = random.Random(f"{QuestionSeed}-retry-{Attempt}")

        CorrectDisplay = _Display(CorrectAnswer)
        Distractors = GenerateMmDistractors(CorrectAnswer, Rng, False)
        Options = build_mcq_options(CorrectDisplay, Distractors, Rng)
        Questions.append({
            "question_number": QuestionNumber,
            "display_type": "VERTICAL",
            "operands": Operands,
            "operators": Operators,
            "correct_answer": CorrectDisplay,
            "options": Options,
            "seed": QuestionSeed,
            "metadata": {
                "module_code": Config.ModuleCode,
                "level_code": Config.LevelCode,
                "lesson_number": Config.LessonNumber,
                "dps_number": Config.DpsNumber,
                "lesson_title": Config.LessonTitle,
                "dps_title": Config.DpsTitle,
                "concept_family": Config.ConceptFamily,
                "operation_focus": Config.OperationFocus,
                "digit_pattern": Config.DigitPattern,
                "difficulty_stage": DifficultyStage(QuestionNumber - 1),
                "difficulty_progression": "MM_WARM_UP_TO_CHALLENGE",
                "generator_package": "MM_PACKAGE_1_DECIMAL_MULTIPLICATION_DIVISION",
                "mm_validated": True,
                **ExtraMetadata,
            },
        })
    return rebalance_correct_option_distribution(Questions)
