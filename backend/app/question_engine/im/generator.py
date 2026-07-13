"""Top-level Intermediate Module question-set assembly. Independent of
app.question_engine.mm.generator -- same overall shape (section-aware,
seeded, validated, MCQ-optioned) because that shape is proven and the
frontend/backend contract (GeneratedQuestion, DPSSection, admin preview)
expects it, but no code or config is shared with Master Module.
"""

import random
from decimal import Decimal

from app.question_engine.option_utils import build_mcq_options, rebalance_correct_option_distribution
from app.question_engine.im.config import IMConfig, IsImConceptSupported, OperationFocusForConcept
from app.question_engine.im.curriculum_map import IM_CURRICULUM_MAP
from app.question_engine.im.distractors import GenerateImDistractors, GenerateAnswerPositionDistractors
from app.question_engine.im.operands import GenerateImQuestion
from app.question_engine.im.validators import ValidateImQuestion


def _Display(Value: Decimal) -> int | float:
    if Value == Value.to_integral_value():
        return int(Value)
    return float(Value.normalize())


def _DisplayMode(ConceptFamily: str) -> str:
    if ConceptFamily == "ANSWER_POSITION":
        return "ANSWER_POSITION"
    if ConceptFamily in {"ADD_LESS", "DECIMAL_ADD_LESS"}:
        return "VISUAL_STACK"
    if ConceptFamily in {"WHOLE_NUMBER_MULTIPLICATION", "WHOLE_NUMBER_DIVISION", "BODMAS", "SOLVE_EQUATION"}:
        return "EXPRESSION_WORKSHEET"
    if ConceptFamily == "SQUARES":
        return "COMPACT_EXPRESSION"
    if ConceptFamily == "SKILL_STACKER":
        return "SKILL_STACKER_TABLE"
    if ConceptFamily == "CONCEPT_DRILL":
        return "CONCEPT_DRILL_TABLE"
    return "VISUAL_STACK"


def _GenerateSingleSectionQuestionSet(Config: IMConfig, SectionNumber: int = 1, SectionTitle: str | None = None,
                                       StartNumber: int = 1, TotalSections: int = 1) -> list[dict]:
    if not IsImConceptSupported(Config.ConceptFamily):
        raise ValueError(f"Intermediate Module generator does not support concept: {Config.ConceptFamily}")

    Questions: list[dict] = []
    Seen: set[tuple[str, ...]] = set()

    RawCount = min(max(int(Config.QuestionCount or 10), 1), 30)
    QuestionCount = 2 if Config.ConceptFamily in {"SKILL_STACKER", "CONCEPT_DRILL"} else RawCount

    for SectionQuestionNumber in range(1, QuestionCount + 1):
        GlobalQuestionNumber = StartNumber + SectionQuestionNumber - 1
        QuestionSeed = f"{Config.Seed}-IM-S{SectionNumber}-Q{SectionQuestionNumber}"
        Accepted = None
        LastCandidate = None
        for Attempt in range(12):
            Rng = random.Random(QuestionSeed if Attempt == 0 else f"{QuestionSeed}-retry-{Attempt}")
            Operands, Operators, CorrectAnswer, ExtraMetadata = GenerateImQuestion(Config, Rng, SectionQuestionNumber)
            LastCandidate = (Operands, Operators, CorrectAnswer, ExtraMetadata, Rng, Attempt)
            Signature = tuple([str(Value) for Value in Operands] + Operators)
            if ValidateImQuestion(Config, Operands, Operators, CorrectAnswer) and Signature not in Seen:
                Accepted = LastCandidate
                Seen.add(Signature)
                break
        if Accepted is None:
            if LastCandidate is None:
                raise ValueError(f"Intermediate Module generator could not create question {SectionQuestionNumber} for {Config.ConceptFamily}")
            Operands, Operators, CorrectAnswer, ExtraMetadata, Rng, Attempt = LastCandidate
            if not ValidateImQuestion(Config, Operands, Operators, CorrectAnswer):
                raise ValueError(f"Intermediate Module generator produced an invalid question {SectionQuestionNumber} for {Config.ConceptFamily}")
            Seen.add(tuple([str(Value) for Value in Operands] + Operators))
        else:
            Operands, Operators, CorrectAnswer, ExtraMetadata, Rng, Attempt = Accepted

        CorrectDisplay = _Display(CorrectAnswer)
        AllowNegativeOptions = CorrectAnswer < 0
        if ExtraMetadata.get("answer_position_direction"):
            Distractors = GenerateAnswerPositionDistractors(CorrectAnswer, Rng)
        else:
            Distractors = GenerateImDistractors(CorrectAnswer, Rng, AllowNegativeOptions)
        Options = build_mcq_options(CorrectDisplay, Distractors, Rng)

        QuestionText = ExtraMetadata.get("question_text") if isinstance(ExtraMetadata, dict) else None
        DisplaySectionTitle = SectionTitle or Config.DpsTitle
        QuestionPayload = {
            "question_number": GlobalQuestionNumber,
            "display_type": _DisplayMode(Config.ConceptFamily),
            "operands": Operands,
            "operators": Operators,
            "correct_answer": CorrectDisplay,
            "options": Options,
            "seed": QuestionSeed,
        }
        if QuestionText:
            QuestionPayload["question_text"] = QuestionText
        QuestionPayload["metadata"] = {
            "module_code": Config.ModuleCode,
            "level_code": Config.LevelCode,
            "lesson_number": Config.LessonNumber,
            "dps_number": Config.DpsNumber,
            "lesson_title": Config.LessonTitle,
            "dps_title": Config.DpsTitle,
            "section_number": SectionNumber,
            "section_title": DisplaySectionTitle,
            "section_question_number": SectionQuestionNumber,
            "section_question_count": QuestionCount,
            "dps_total_sections": TotalSections,
            "concept_family": Config.ConceptFamily,
            "operation_focus": Config.OperationFocus,
            "digit_pattern": Config.DigitPattern,
            "generator_package": "IM_LEVEL4_SECTION_AWARE_PACKAGE_1",
            "im_validated": True,
            "generation_attempts": Attempt + 1,
            **ExtraMetadata,
        }
        Questions.append(QuestionPayload)
    return Questions


def GenerateImQuestionSet(Config: IMConfig) -> list[dict]:
    GeneratorConfig = Config.GeneratorConfig if isinstance(Config.GeneratorConfig, dict) else {}
    SectionDefinitions = GeneratorConfig.get("dpsSections") or IM_CURRICULUM_MAP.get(Config.LessonNumber, {}).get(Config.DpsNumber, [])

    if not SectionDefinitions:
        return rebalance_correct_option_distribution(_GenerateSingleSectionQuestionSet(Config))

    Questions: list[dict] = []
    StartNumber = 1
    TotalSections = len(SectionDefinitions)
    for Index, Section in enumerate(SectionDefinitions, start=1):
        SectionTitle = str(Section.get("sectionTitle") or Config.DpsTitle)
        SectionConcept = str(Section.get("conceptFamily") or Config.ConceptFamily)
        RawSectionCount = int(Section.get("questionCount") or 10)
        SectionCount = 2 if SectionConcept in {"SKILL_STACKER", "CONCEPT_DRILL"} else RawSectionCount

        SectionConfig = IMConfig(
            ModuleCode=Config.ModuleCode,
            LevelCode=Config.LevelCode,
            LessonNumber=Config.LessonNumber,
            DpsNumber=Config.DpsNumber,
            DpsTitle=SectionTitle,
            LessonTitle=Config.LessonTitle,
            QuestionCount=SectionCount,
            Seed=f"{Config.Seed}-SECTION-{Index}",
            ConceptFamily=SectionConcept,
            OperationFocus=OperationFocusForConcept(SectionConcept),
            DigitPattern=str(Section.get("digitPattern") or Config.DigitPattern),
            Difficulty=str(Section.get("difficulty") or Config.Difficulty),
            GeneratorConfig={**Section},
        )
        SectionQuestions = _GenerateSingleSectionQuestionSet(SectionConfig, Index, SectionTitle, StartNumber, TotalSections)
        Questions.extend(SectionQuestions)
        StartNumber += SectionCount

    return rebalance_correct_option_distribution(Questions)
