from __future__ import annotations

import json
from dataclasses import replace
from datetime import datetime, timezone, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    AssessmentAssignment,
    AssessmentAttempt,
    AssessmentAttemptAnswer,
    AssessmentBlueprint,
    AssessmentBlueprintLesson,
    AssessmentQuestion,
    AssessmentQuestionOption,
    Assignment,
    AssessmentReattemptApproval,
    AssessmentResult,
    AssessmentVersion,
    Attempt,
    DPS,
    DPSSection,
    Lesson,
    Level,
    Module,
    Student,
    StudentLevelPromotion,
    Teacher,
    User,
)
from app.question_engine.ylm import YLMConfig, generate_ylm_question_set

ASSESSMENT_VERSION_STATUSES = {"DRAFT", "PREVIEW", "PUBLISHED", "ARCHIVED"}
ASSESSMENT_ASSIGNMENT_STATUSES = {"ASSIGNED", "IN_PROGRESS", "SUBMITTED", "CLEARED", "NEEDS_RE_ATTEMPT", "CANCELLED"}
ASSESSMENT_ATTEMPT_STATUSES = {"IN_PROGRESS", "SUBMITTED", "AUTO_SUBMITTED", "CLEARED", "NEEDS_RE_ATTEMPT"}
ASSESSMENT_REATTEMPT_STATUSES = {"PENDING", "APPROVED", "REJECTED", "USED"}
PASSING_PERCENTAGE = 70.0
EXCELLENCE_PERCENTAGE = 90.0


def AssessmentBalancedQuestionMarks(TotalMarks: float | int | None, TotalQuestions: int | None) -> list[float]:
    """Return per-question marks that add up to the assessment total exactly.

    MathPath assessments are always 100-mark papers from the product point of view.
    When the selected question count does not divide 100 cleanly, marks are balanced
    to two decimals across questions instead of letting floating-point arithmetic
    create totals above or below 100.
    """
    try:
        QuestionCount = int(TotalQuestions or 0)
    except (TypeError, ValueError):
        QuestionCount = 0
    if QuestionCount <= 0:
        return []
    try:
        RawTotalMarks = float(TotalMarks) if TotalMarks is not None else 100.0
    except (TypeError, ValueError):
        RawTotalMarks = 100.0
    TotalCents = int(round(max(0.0, RawTotalMarks) * 100))
    BaseCents = TotalCents // QuestionCount
    RemainderCents = TotalCents - (BaseCents * QuestionCount)
    return [round((BaseCents + (1 if Index < RemainderCents else 0)) / 100, 2) for Index in range(QuestionCount)]


def AssessmentQuestionMark(Version: AssessmentVersion | None, Question: AssessmentQuestion | None = None, TotalQuestions: int | None = None) -> float:
    if not Version:
        return 0.0
    QuestionCount = int(TotalQuestions or Version.total_questions or 0)
    Marks = AssessmentBalancedQuestionMarks(Version.total_marks or 100, QuestionCount)
    if not Marks:
        return 0.0
    QuestionNumber = int(getattr(Question, "question_number", 1) or 1) if Question else 1
    Index = min(max(QuestionNumber - 1, 0), len(Marks) - 1)
    return Marks[Index]


def NowUtc() -> datetime:
    return datetime.now(timezone.utc)


def AwareUtc(Value: datetime | None) -> datetime | None:
    if Value is None:
        return None
    return Value if Value.tzinfo else Value.replace(tzinfo=timezone.utc)


def Iso(Value: Any) -> str | None:
    if not Value:
        return None
    return Value.isoformat() if hasattr(Value, "isoformat") else str(Value)


def SafeJson(Value: str | None, Fallback: Any = None) -> Any:
    if Fallback is None:
        Fallback = {}
    if not Value:
        return Fallback
    try:
        return json.loads(Value)
    except Exception:
        return Fallback


def PerformanceBand(Percentage: float) -> str:
    if Percentage >= EXCELLENCE_PERCENTAGE:
        return "Excellence Zone"
    if Percentage >= PASSING_PERCENTAGE:
        return "Growth Zone"
    return "Needs Re-Attempt"


def ResultStatus(Percentage: float) -> str:
    return "CLEARED" if Percentage >= PASSING_PERCENTAGE else "NEEDS_RE_ATTEMPT"


def NormalizeWholeNumber(Value: float | int | None) -> int:
    try:
        RawValue = float(Value) if Value is not None else 0.0
    except (TypeError, ValueError):
        RawValue = 0.0
    RawValue = max(0.0, RawValue)
    return int(RawValue + 0.5)


def NormalizeAssessmentScore(Score: float | int | None, MaxScore: float | int | None) -> int:
    if Score is None:
        return 0
    try:
        RawScore = float(Score)
    except (TypeError, ValueError):
        RawScore = 0.0
    try:
        RawMaxScore = float(MaxScore) if MaxScore is not None else 0.0
    except (TypeError, ValueError):
        RawMaxScore = 0.0
    if RawMaxScore > 0:
        RawScore = min(RawScore, RawMaxScore)
    RawScore = max(0.0, RawScore)
    return NormalizeWholeNumber(RawScore)


def NormalizeAssessmentPercentage(Score: float | int | None, MaxScore: float | int | None) -> int:
    try:
        RawMaxScore = float(MaxScore) if MaxScore is not None else 0.0
    except (TypeError, ValueError):
        RawMaxScore = 0.0
    if RawMaxScore <= 0:
        return 0
    Percentage = (NormalizeAssessmentScore(Score, RawMaxScore) / RawMaxScore) * 100
    return min(100, NormalizeWholeNumber(Percentage))


def AssessmentAttemptLabel(AttemptNumber: int | None, AttemptType: str | None = None) -> str:
    try:
        Number = int(AttemptNumber or 1)
    except (TypeError, ValueError):
        Number = 1
    TypeText = str(AttemptType or "ORIGINAL").upper()
    if TypeText == "RE_ATTEMPT" or Number > 1:
        ReattemptNumber = max(1, Number - 1)
        return f"Re-Attempt {ReattemptNumber}"
    return "Original"


def NextVersionNumber(Db: Session, BlueprintId: str) -> int:
    LatestVersion = (
        Db.query(AssessmentVersion)
        .filter(AssessmentVersion.blueprint_id == BlueprintId)
        .order_by(AssessmentVersion.version_number.desc())
        .first()
    )
    return int(LatestVersion.version_number or 0) + 1 if LatestVersion else 1


def SectionConfig(Db: Session, LessonItem: Lesson, Section: DPSSection, QuestionCount: int, Seed: str) -> YLMConfig:
    LevelItem = Db.get(Level, LessonItem.level_id)
    ModuleItem = Db.get(Module, LevelItem.module_id) if LevelItem else None
    DpsItem = Db.get(DPS, Section.dps_id) if Section.dps_id else None
    return YLMConfig(
        module_code=ModuleItem.module_code if ModuleItem else "MATHPATH",
        level_code=LevelItem.level_code if LevelItem else "LEVEL",
        lesson_number=LessonItem.lesson_number,
        dps_number=DpsItem.dps_number if DpsItem else Section.section_number,
        question_count=QuestionCount,
        rows=Section.rows_count or 3,
        concept_family=Section.concept_family or "DIRECT_ADD_LESS",
        operation_focus=Section.operation_focus or "ADD_LESS",
        abacus_rule=Section.abacus_rule,
        target_numbers=SafeJson(Section.target_numbers_json, []),
        place_value=Section.place_value or "MIXED",
        digit_pattern=Section.digit_pattern or "1D_AND_2D",
        allow_negative_operands=Section.allow_negative_operands,
        allow_negative_answer=Section.allow_negative_answer,
        seed=Seed,
    )


def LessonSourceSections(Db: Session, LessonId: str) -> list[DPSSection]:
    Sections = (
        Db.query(DPSSection)
        .join(DPS, DPSSection.dps_id == DPS.id)
        .filter(DPS.lesson_id == LessonId, DPS.is_active == True)
        .order_by(DPS.dps_number.asc(), DPSSection.section_number.asc())
        .all()
    )
    return Sections


def SplitCountAcrossSources(TotalCount: int, SourceCount: int) -> list[int]:
    if SourceCount <= 0:
        return []
    BaseCount = TotalCount // SourceCount
    Remainder = TotalCount % SourceCount
    Counts = []
    for Index in range(SourceCount):
        Counts.append(BaseCount + (1 if Index < Remainder else 0))
    return [Count for Count in Counts if Count > 0]


def QuestionText(Operands: list[int]) -> str:
    Parts = []
    for Index, Operand in enumerate(Operands):
        if Index == 0:
            Parts.append(str(Operand))
        elif Operand >= 0:
            Parts.append(f"+ {Operand}")
        else:
            Parts.append(f"- {abs(Operand)}")
    return " ".join(Parts)


def QuestionPayload(Db: Session, Question: AssessmentQuestion, IncludeAnswerKey: bool = False) -> dict[str, Any]:
    LessonItem = Db.get(Lesson, Question.lesson_id)
    Options = (
        Db.query(AssessmentQuestionOption)
        .filter(AssessmentQuestionOption.assessment_question_id == Question.id)
        .order_by(AssessmentQuestionOption.display_order.asc(), AssessmentQuestionOption.option_label.asc())
        .all()
    )
    Payload = {
        "id": Question.id,
        "assessmentVersionId": Question.assessment_version_id,
        "questionNumber": Question.question_number,
        "lessonQuestionNumber": Question.lesson_question_number,
        "lessonId": Question.lesson_id,
        "lessonNumber": LessonItem.lesson_number if LessonItem else None,
        "lessonTitle": LessonItem.lesson_title if LessonItem else None,
        "displayType": Question.display_type,
        "questionText": Question.question_text,
        "operands": SafeJson(Question.operands_json, []),
        "operators": SafeJson(Question.operators_json, []),
        "difficulty": Question.difficulty,
        "conceptTag": Question.concept_tag,
        "sourceType": Question.source_type,
        "sourceReferenceId": Question.source_reference_id,
        "metadata": SafeJson(Question.metadata_json, {}),
        "questionMarks": AssessmentQuestionMark(Db.get(AssessmentVersion, Question.assessment_version_id), Question),
        "options": [
            {
                "id": Option.id,
                "label": Option.option_label,
                "value": Option.option_value,
                "displayOrder": Option.display_order,
                **({"isCorrect": Option.is_correct} if IncludeAnswerKey else {}),
            }
            for Option in Options
        ],
        "createdAt": Iso(Question.created_at),
    }
    if IncludeAnswerKey:
        CorrectOption = next((Option for Option in Options if Option.is_correct), None)
        Payload.update(
            {
                "correctAnswer": Question.correct_answer,
                "correctOptionLabel": CorrectOption.option_label if CorrectOption else None,
                "explanation": Question.explanation,
            }
        )
    return Payload


def VersionPayload(Db: Session, Version: AssessmentVersion, IncludeQuestions: bool = False, IncludeAnswerKey: bool = False) -> dict[str, Any]:
    Blueprint = Db.get(AssessmentBlueprint, Version.blueprint_id)
    PublishedBy = Db.get(User, Version.published_by_user_id) if Version.published_by_user_id else None
    GeneratedBy = Db.get(User, Version.generated_by_user_id) if Version.generated_by_user_id else None
    Questions = (
        Db.query(AssessmentQuestion)
        .filter(AssessmentQuestion.assessment_version_id == Version.id)
        .order_by(AssessmentQuestion.question_number.asc())
        .all()
    )
    AssignmentCount = Db.query(AssessmentAssignment).filter(AssessmentAssignment.assessment_version_id == Version.id).count()
    AttemptCount = Db.query(AssessmentAttempt).filter(AssessmentAttempt.assessment_version_id == Version.id).count()

    Payload = {
        "id": Version.id,
        "blueprintId": Version.blueprint_id,
        "blueprintTitle": Blueprint.title if Blueprint else None,
        "versionNumber": Version.version_number,
        "status": Version.status,
        "generationMode": Version.generation_mode,
        "seed": Version.seed,
        "totalQuestions": Version.total_questions,
        "totalMarks": Version.total_marks,
        "marksPerQuestion": Version.marks_per_question,
        "marksMode": "AUTO_BALANCED",
        "marksDisplay": "Auto-Balanced",
        "durationSeconds": Version.duration_seconds,
        "durationMinutes": round((Version.duration_seconds or 0) / 60, 2),
        "questionCount": len(Questions),
        "assignmentCount": AssignmentCount,
        "attemptCount": AttemptCount,
        "generatedByUserId": Version.generated_by_user_id,
        "generatedByName": GeneratedBy.full_name if GeneratedBy else None,
        "publishedByUserId": Version.published_by_user_id,
        "publishedByName": PublishedBy.full_name if PublishedBy else None,
        "generatedAt": Iso(Version.generated_at),
        "publishedAt": Iso(Version.published_at),
        "archivedAt": Iso(Version.archived_at),
        "createdAt": Iso(Version.created_at),
        "updatedAt": Iso(Version.updated_at),
        "isActive": Version.is_active,
    }
    if IncludeQuestions:
        QuestionRows = [QuestionPayload(Db, Question, IncludeAnswerKey=IncludeAnswerKey) for Question in Questions]
        LessonGroups: dict[str, dict[str, Any]] = {}
        for Row in QuestionRows:
            LessonKey = Row["lessonId"] or "unknown"
            if LessonKey not in LessonGroups:
                LessonGroups[LessonKey] = {
                    "lessonId": Row["lessonId"],
                    "lessonNumber": Row["lessonNumber"],
                    "lessonTitle": Row["lessonTitle"],
                    "questionCount": 0,
                    "questions": [],
                }
            LessonGroups[LessonKey]["questionCount"] += 1
            LessonGroups[LessonKey]["questions"].append(Row)
        Payload["questions"] = QuestionRows
        Payload["lessonGroups"] = sorted(LessonGroups.values(), key=lambda Item: (Item.get("lessonNumber") or 9999))
    return Payload


def BlueprintEngineState(Db: Session, BlueprintId: str) -> dict[str, Any]:
    Blueprint = Db.get(AssessmentBlueprint, BlueprintId)
    if not Blueprint:
        api_error(404, "ASSESSMENT_BLUEPRINT_NOT_FOUND", "Assessment blueprint not found.")

    Versions = (
        Db.query(AssessmentVersion)
        .filter(AssessmentVersion.blueprint_id == BlueprintId)
        .order_by(AssessmentVersion.version_number.desc())
        .all()
    )
    PublishedVersions = [Version for Version in Versions if Version.status == "PUBLISHED" and Version.is_active]
    Assignments = Db.query(AssessmentAssignment).filter(AssessmentAssignment.blueprint_id == BlueprintId).count()
    Attempts = Db.query(AssessmentAttempt).join(AssessmentAssignment, AssessmentAttempt.assessment_assignment_id == AssessmentAssignment.id).filter(AssessmentAssignment.blueprint_id == BlueprintId).count()
    Results = Db.query(AssessmentResult).filter(AssessmentResult.blueprint_id == BlueprintId).count()

    return {
        "blueprintId": Blueprint.id,
        "blueprintStatus": Blueprint.status,
        "publishedAvailable": bool(PublishedVersions),
        "versionCount": len(Versions),
        "publishedVersionCount": len(PublishedVersions),
        "assignmentCount": Assignments,
        "attemptCount": Attempts,
        "resultCount": Results,
        "versions": [VersionPayload(Db, Version) for Version in Versions],
    }


def AssessmentEngineFoundation(Db: Session) -> dict[str, Any]:
    BlueprintCount = Db.query(AssessmentBlueprint).count()
    VersionCount = Db.query(AssessmentVersion).count()
    PublishedVersionCount = Db.query(AssessmentVersion).filter(AssessmentVersion.status == "PUBLISHED", AssessmentVersion.is_active == True).count()
    QuestionCount = Db.query(AssessmentQuestion).count()
    AssignmentCount = Db.query(AssessmentAssignment).count()
    AttemptCount = Db.query(AssessmentAttempt).count()
    ResultCount = Db.query(AssessmentResult).count()
    PendingReattemptCount = Db.query(AssessmentReattemptApproval).filter(AssessmentReattemptApproval.status == "PENDING").count()

    return {
        "engineStatus": "Preview Engine Ready",
        "blueprintCount": BlueprintCount,
        "versionCount": VersionCount,
        "publishedVersionCount": PublishedVersionCount,
        "questionCount": QuestionCount,
        "assignmentCount": AssignmentCount,
        "attemptCount": AttemptCount,
        "resultCount": ResultCount,
        "pendingReattemptCount": PendingReattemptCount,
        "governance": {
            "adminPublishesAssessment": True,
            "teacherCanAssignOnlyPublished": True,
            "studentCanAttemptOnlyAssigned": True,
            "adminControlsReattemptApproval": True,
            "levelWideConceptCoverage": True,
            "randomizedGeneratedQuestions": True,
        },
    }




def GenerateAssessmentQuestionBatch(Config: YLMConfig, Count: int) -> list[dict[str, Any]]:
    """Generate the requested number of assessment questions with a robust fallback.

    Some concept-rule configurations have a small valid operand space. The DPS generator
    correctly protects against duplicate operands inside a generated set, but level-wide
    assessments may request more questions from a narrow lesson rule. For assessment
    generation, the priority is to keep the admin-defined lesson distribution intact
    while still using the same mapped concept rules. If a full batch cannot be produced,
    generate questions one-by-one with fresh seeds so the paper can still be built.
    """
    if Count <= 0:
        return []
    FullConfig = replace(Config, question_count=Count)
    try:
        Questions = generate_ylm_question_set(FullConfig)
        if len(Questions) == Count:
            return Questions
    except Exception:
        Questions = []

    Questions = []
    for QuestionIndex in range(1, Count + 1):
        LastError: Exception | None = None
        for RetryIndex in range(1, 16):
            SingleConfig = replace(Config, question_count=1, seed=f"{Config.seed}-AQ{QuestionIndex}-R{RetryIndex}-{uuid4().hex}")
            try:
                Generated = generate_ylm_question_set(SingleConfig)
                if Generated:
                    Row = Generated[0]
                    Row["question_number"] = QuestionIndex
                    Questions.append(Row)
                    break
            except Exception as Exc:
                LastError = Exc
        else:
            raise ValueError(str(LastError) if LastError else f"Could not generate assessment question {QuestionIndex}")
    return Questions

def GenerateAssessmentVersion(Db: Session, Blueprint: AssessmentBlueprint, GeneratedByUserId: str | None = None, Status: str = "PREVIEW") -> AssessmentVersion:
    Db.flush()
    Rows = (
        Db.query(AssessmentBlueprintLesson, Lesson)
        .join(Lesson, AssessmentBlueprintLesson.lesson_id == Lesson.id)
        .filter(AssessmentBlueprintLesson.blueprint_id == Blueprint.id)
        .order_by(AssessmentBlueprintLesson.display_order.asc(), Lesson.lesson_number.asc())
        .all()
    )
    if not Rows:
        api_error(
            400,
            "MISSING_LESSON_DISTRIBUTION",
            "Assessment distribution was not saved before generation. Please save the distribution and try again.",
        )

    Seed = f"ASSESSMENT-{Blueprint.id}-V{NextVersionNumber(Db, Blueprint.id)}-{uuid4().hex}"
    Version = AssessmentVersion(
        blueprint_id=Blueprint.id,
        version_number=NextVersionNumber(Db, Blueprint.id),
        status=Status,
        generation_mode="LEVEL_WIDE_RANDOMIZED",
        seed=Seed,
        total_questions=Blueprint.total_questions,
        total_marks=Blueprint.total_marks,
        marks_per_question=Blueprint.marks_per_question,
        duration_seconds=Blueprint.duration_seconds,
        generated_by_user_id=GeneratedByUserId or Blueprint.created_by_user_id,
        generated_at=NowUtc(),
        is_active=Status != "ARCHIVED",
    )
    Db.add(Version)
    Db.flush()

    QuestionNumber = 1
    for BlueprintLesson, LessonItem in Rows:
        Sections = LessonSourceSections(Db, LessonItem.id)
        if not Sections:
            api_error(
                400,
                "LESSON_HAS_NO_DPS_RULES",
                "Every lesson must have DPS concept rules before assessment generation.",
                {"lessonNumber": LessonItem.lesson_number, "lessonTitle": LessonItem.lesson_title},
            )

        Counts = SplitCountAcrossSources(BlueprintLesson.question_count, len(Sections))
        for SectionIndex, Count in enumerate(Counts):
            Section = Sections[SectionIndex % len(Sections)]
            SectionSeed = f"{Seed}-L{LessonItem.lesson_number}-S{SectionIndex + 1}-{uuid4().hex}"
            Config = SectionConfig(Db, LessonItem, Section, Count, SectionSeed)
            try:
                GeneratedQuestions = GenerateAssessmentQuestionBatch(Config, Count)
            except Exception as Exc:
                api_error(
                    400,
                    "ASSESSMENT_QUESTION_GENERATION_FAILED",
                    "Assessment question generation failed for one lesson. Check its concept rules.",
                    {"lessonNumber": LessonItem.lesson_number, "lessonTitle": LessonItem.lesson_title, "reason": str(Exc)},
                )

            for Generated in GeneratedQuestions:
                Operands = Generated.get("operands", [])
                Metadata = Generated.get("metadata", {}) or {}
                Metadata.update(
                    {
                        "questionMarks": AssessmentQuestionMark(Version, None, Blueprint.total_questions),
                        "marksMode": "AUTO_BALANCED",
                        "sourceDpsSectionId": Section.id,
                        "sourceDpsId": Section.dps_id,
                        "levelWideAssessment": True,
                        "randomizedAssessment": True,
                    }
                )
                AssessmentQuestionRow = AssessmentQuestion(
                    assessment_version_id=Version.id,
                    lesson_id=LessonItem.id,
                    question_number=QuestionNumber,
                    lesson_question_number=Generated.get("question_number") or 1,
                    display_type=Generated.get("display_type") or "VERTICAL",
                    question_text=QuestionText(Operands),
                    operands_json=json.dumps(Operands),
                    operators_json=json.dumps(Generated.get("operators", [])),
                    correct_answer=str(Generated.get("correct_answer")),
                    explanation="Solve the vertical add-less sequence carefully and select the correct answer.",
                    difficulty=Section.difficulty or "MIXED",
                    concept_tag=Metadata.get("concept_family") or Section.concept_family,
                    source_type="DPS_CONCEPT_RULE",
                    source_reference_id=Section.id,
                    seed=Generated.get("seed") or SectionSeed,
                    metadata_json=json.dumps(Metadata),
                )
                Db.add(AssessmentQuestionRow)
                Db.flush()

                for Option in Generated.get("options", []):
                    Db.add(
                        AssessmentQuestionOption(
                            assessment_question_id=AssessmentQuestionRow.id,
                            option_label=Option.get("label"),
                            option_value=str(Option.get("value")),
                            is_correct=bool(Option.get("is_correct")),
                            display_order=int(Option.get("display_order") or 0),
                        )
                    )
                QuestionNumber += 1

    ActualQuestionCount = Db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == Version.id).count()
    if ActualQuestionCount != Blueprint.total_questions:
        api_error(
            400,
            "ASSESSMENT_QUESTION_COUNT_MISMATCH",
            "Generated question count does not match the assessment blueprint.",
            {"expected": Blueprint.total_questions, "actual": ActualQuestionCount},
        )
    Db.flush()
    return Version


def GenerateAssessmentPreview(Db: Session, BlueprintId: str, GeneratedByUserId: str | None = None) -> dict[str, Any]:
    Blueprint = Db.get(AssessmentBlueprint, BlueprintId)
    if not Blueprint or not Blueprint.is_active:
        api_error(404, "ASSESSMENT_BLUEPRINT_NOT_FOUND", "Assessment blueprint not found.")
    if Blueprint.status == "ARCHIVED":
        api_error(400, "ARCHIVED_BLUEPRINT_LOCKED", "Archived assessments cannot generate previews.")
    Version = GenerateAssessmentVersion(Db, Blueprint, GeneratedByUserId=GeneratedByUserId, Status="PREVIEW")
    Db.commit()
    Db.refresh(Version)
    return VersionPayload(Db, Version, IncludeQuestions=True, IncludeAnswerKey=True)


def LatestGeneratedVersion(Db: Session, BlueprintId: str, IncludeAnswerKey: bool = False) -> dict[str, Any] | None:
    Version = (
        Db.query(AssessmentVersion)
        .filter(AssessmentVersion.blueprint_id == BlueprintId)
        .order_by(
            AssessmentVersion.published_at.desc().nullslast(),
            AssessmentVersion.generated_at.desc().nullslast(),
            AssessmentVersion.version_number.desc(),
        )
        .first()
    )
    if not Version:
        return None
    return VersionPayload(Db, Version, IncludeQuestions=True, IncludeAnswerKey=IncludeAnswerKey)


def PublishAssessmentVersion(Db: Session, BlueprintId: str, PublishedByUserId: str | None = None) -> AssessmentVersion:
    Blueprint = Db.get(AssessmentBlueprint, BlueprintId)
    if not Blueprint or not Blueprint.is_active:
        api_error(404, "ASSESSMENT_BLUEPRINT_NOT_FOUND", "Assessment blueprint not found.")
    if Blueprint.status == "ARCHIVED":
        api_error(400, "ARCHIVED_BLUEPRINT_LOCKED", "Archived assessments cannot be published.")

    ExistingPublished = (
        Db.query(AssessmentVersion)
        .filter(
            AssessmentVersion.blueprint_id == Blueprint.id,
            AssessmentVersion.status == "PUBLISHED",
            AssessmentVersion.is_active == True,
        )
        .order_by(AssessmentVersion.version_number.desc())
        .first()
    )
    if ExistingPublished:
        return ExistingPublished

    Version = (
        Db.query(AssessmentVersion)
        .filter(AssessmentVersion.blueprint_id == Blueprint.id, AssessmentVersion.status == "PREVIEW")
        .order_by(AssessmentVersion.generated_at.desc().nullslast(), AssessmentVersion.version_number.desc())
        .first()
    )
    if not Version:
        Version = GenerateAssessmentVersion(Db, Blueprint, GeneratedByUserId=PublishedByUserId, Status="PREVIEW")

    QuestionCount = Db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == Version.id).count()
    if QuestionCount != Blueprint.total_questions:
        api_error(
            400,
            "ASSESSMENT_PREVIEW_INCOMPLETE",
            "Generate a complete assessment preview before publishing.",
            {"expected": Blueprint.total_questions, "actual": QuestionCount},
        )

    Version.status = "PUBLISHED"
    Version.published_by_user_id = PublishedByUserId
    Version.published_at = NowUtc()
    Version.is_active = True

    Blueprint.status = "PUBLISHED"
    Blueprint.published_at = Version.published_at
    Blueprint.archived_at = None
    Blueprint.is_active = True

    return Version


def RegisterPublishedBlueprintVersion(Db: Session, Blueprint: AssessmentBlueprint, PublishedByUserId: str | None = None) -> AssessmentVersion:
    return PublishAssessmentVersion(Db, Blueprint.id, PublishedByUserId=PublishedByUserId)


def EnsureBlueprintCanBeDeleted(Db: Session, BlueprintId: str) -> None:
    VersionIds = [row[0] for row in Db.query(AssessmentVersion.id).filter(AssessmentVersion.blueprint_id == BlueprintId).all()]
    VersionCount = len(VersionIds)
    AssignmentCount = Db.query(AssessmentAssignment).filter(AssessmentAssignment.blueprint_id == BlueprintId).count()
    ResultCount = Db.query(AssessmentResult).filter(AssessmentResult.blueprint_id == BlueprintId).count()
    AttemptCount = 0
    ReattemptApprovalCount = 0
    if VersionIds:
        AttemptCount = Db.query(AssessmentAttempt).filter(AssessmentAttempt.assessment_version_id.in_(VersionIds)).count()
        AssignmentIds = [row[0] for row in Db.query(AssessmentAssignment.id).filter(AssessmentAssignment.blueprint_id == BlueprintId).all()]
        if AssignmentIds:
            ReattemptApprovalCount = Db.query(AssessmentReattemptApproval).filter(AssessmentReattemptApproval.assessment_assignment_id.in_(AssignmentIds)).count()

    if AssignmentCount or AttemptCount or ResultCount or ReattemptApprovalCount:
        api_error(
            400,
            "ASSESSMENT_HAS_STUDENT_HISTORY",
            "This assessment has assignment or attempt history. Archive it instead of deleting it.",
            {
                "versionCount": VersionCount,
                "assignmentCount": AssignmentCount,
                "attemptCount": AttemptCount,
                "resultCount": ResultCount,
                "reattemptApprovalCount": ReattemptApprovalCount,
            },
        )


def SetAssessmentVersionAvailability(Db: Session, BlueprintId: str, VersionId: str, IsAvailable: bool) -> dict[str, Any]:
    Version = Db.get(AssessmentVersion, VersionId)
    if not Version or Version.blueprint_id != BlueprintId:
        api_error(404, "ASSESSMENT_VERSION_NOT_FOUND", "Assessment version not found.")
    if Version.status != "PUBLISHED":
        api_error(400, "ASSESSMENT_VERSION_NOT_PUBLISHED", "Only published assessment versions can be made available or paused.")
    Version.is_active = IsAvailable
    Db.commit()
    Db.refresh(Version)
    return VersionPayload(Db, Version, IncludeQuestions=True, IncludeAnswerKey=True)


def AvailablePublishedVersions(Db: Session, LevelId: str | None = None) -> list[AssessmentVersion]:
    Query = (
        Db.query(AssessmentVersion)
        .join(AssessmentBlueprint, AssessmentVersion.blueprint_id == AssessmentBlueprint.id)
        .filter(
            AssessmentVersion.status == "PUBLISHED",
            AssessmentVersion.is_active == True,
            AssessmentBlueprint.status == "PUBLISHED",
            AssessmentBlueprint.is_active == True,
        )
    )
    if LevelId:
        Query = Query.filter(AssessmentBlueprint.level_id == LevelId)
    return Query.order_by(AssessmentBlueprint.title.asc(), AssessmentVersion.version_number.asc()).all()


def AssessmentVersionOptionPayload(Db: Session, Version: AssessmentVersion) -> dict[str, Any]:
    Blueprint = Db.get(AssessmentBlueprint, Version.blueprint_id)
    LevelItem = Db.get(Level, Blueprint.level_id) if Blueprint else None
    ModuleItem = Db.get(Module, Blueprint.module_id) if Blueprint else None
    QuestionCount = Db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == Version.id).count()
    AssignmentCount = Db.query(AssessmentAssignment).filter(AssessmentAssignment.assessment_version_id == Version.id, AssessmentAssignment.is_active == True).count()
    return {
        "assessmentVersionId": Version.id,
        "blueprintId": Version.blueprint_id,
        "title": Blueprint.title if Blueprint else "Assessment",
        "versionNumber": Version.version_number,
        "status": Version.status,
        "isAvailable": bool(Version.is_active),
        "moduleId": Blueprint.module_id if Blueprint else None,
        "moduleCode": ModuleItem.module_code if ModuleItem else None,
        "moduleName": ModuleItem.module_name if ModuleItem else None,
        "levelId": Blueprint.level_id if Blueprint else None,
        "levelCode": LevelItem.level_code if LevelItem else None,
        "levelName": LevelItem.level_name if LevelItem else None,
        "totalQuestions": Version.total_questions,
        "questionCount": QuestionCount,
        "totalMarks": Version.total_marks,
        "marksPerQuestion": Version.marks_per_question,
        "marksMode": "AUTO_BALANCED",
        "marksDisplay": "Auto-Balanced",
        "durationSeconds": Version.duration_seconds,
        "durationMinutes": round((Version.duration_seconds or 0) / 60, 2),
        "assignmentCount": AssignmentCount,
        "publishedAt": Iso(Version.published_at),
    }


def ExistingAssessmentAssignmentForLevel(Db: Session, StudentId: str, LevelId: str) -> AssessmentAssignment | None:
    return (
        Db.query(AssessmentAssignment)
        .join(AssessmentBlueprint, AssessmentAssignment.blueprint_id == AssessmentBlueprint.id)
        .filter(
            AssessmentAssignment.student_id == StudentId,
            AssessmentAssignment.is_active == True,
            AssessmentAssignment.status != "CANCELLED",
            AssessmentBlueprint.level_id == LevelId,
        )
        .order_by(AssessmentAssignment.assigned_at.desc())
        .first()
    )


def LevelForAssessmentAssignment(Db: Session, Assignment: AssessmentAssignment | None) -> Level | None:
    if not Assignment:
        return None
    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id)
    return Db.get(Level, Blueprint.level_id) if Blueprint else None


def LatestAssessmentResultForAssignment(Db: Session, AssignmentId: str) -> AssessmentResult | None:
    return (
        Db.query(AssessmentResult)
        .filter(AssessmentResult.assessment_assignment_id == AssignmentId)
        .order_by(AssessmentResult.completion_date.desc().nullslast(), AssessmentResult.created_at.desc())
        .first()
    )


def LatestAssessmentAttemptForAssignment(Db: Session, AssignmentId: str) -> AssessmentAttempt | None:
    return (
        Db.query(AssessmentAttempt)
        .filter(AssessmentAttempt.assessment_assignment_id == AssignmentId)
        .order_by(AssessmentAttempt.attempt_number.desc(), AssessmentAttempt.started_at.desc())
        .first()
    )


def NextAssessmentAttemptNumberForStudentLevel(Db: Session, StudentId: str, LevelId: str | None) -> int:
    if not LevelId:
        return 2
    Attempts = (
        Db.query(AssessmentAttempt)
        .join(AssessmentAssignment, AssessmentAttempt.assessment_assignment_id == AssessmentAssignment.id)
        .join(AssessmentBlueprint, AssessmentAssignment.blueprint_id == AssessmentBlueprint.id)
        .filter(
            AssessmentAttempt.student_id == StudentId,
            AssessmentAssignment.is_active == True,
            AssessmentAssignment.status != "CANCELLED",
            AssessmentBlueprint.level_id == LevelId,
        )
        .all()
    )
    LatestNumber = max([int(Attempt.attempt_number or 0) for Attempt in Attempts], default=1)
    return max(2, LatestNumber + 1)


def ExistingOpenAssessmentReattemptApproval(Db: Session, AssignmentId: str) -> AssessmentReattemptApproval | None:
    return (
        Db.query(AssessmentReattemptApproval)
        .filter(
            AssessmentReattemptApproval.assessment_assignment_id == AssignmentId,
            AssessmentReattemptApproval.status.in_(["PENDING", "APPROVED"]),
            AssessmentReattemptApproval.used_at.is_(None),
        )
        .order_by(AssessmentReattemptApproval.requested_at.desc())
        .first()
    )


def ExistingAssessmentReattemptApprovalForAssignment(Db: Session, AssignmentId: str) -> AssessmentReattemptApproval | None:
    return (
        Db.query(AssessmentReattemptApproval)
        .filter(AssessmentReattemptApproval.assessment_assignment_id == AssignmentId)
        .order_by(
            AssessmentReattemptApproval.used_at.desc().nullslast(),
            AssessmentReattemptApproval.approved_at.desc().nullslast(),
            AssessmentReattemptApproval.requested_at.desc(),
        )
        .first()
    )


def EnsurePendingAssessmentReattemptApproval(
    Db: Session,
    Assignment: AssessmentAssignment,
    Attempt: AssessmentAttempt | None = None,
    Reason: str | None = None,
    RequestedByUserId: str | None = None,
) -> AssessmentReattemptApproval | None:
    if not Assignment or Assignment.status != "NEEDS_RE_ATTEMPT":
        return None
    ExistingLifecycle = ExistingAssessmentReattemptApprovalForAssignment(Db, Assignment.id)
    if ExistingLifecycle:
        return ExistingLifecycle

    LevelItem = LevelForAssessmentAssignment(Db, Assignment)
    AttemptNumber = NextAssessmentAttemptNumberForStudentLevel(Db, Assignment.student_id, LevelItem.id if LevelItem else None)
    Approval = AssessmentReattemptApproval(
        assessment_assignment_id=Assignment.id,
        student_id=Assignment.student_id,
        assessment_attempt_id=Attempt.id if Attempt else None,
        requested_by_user_id=RequestedByUserId,
        status="PENDING",
        reason=Reason or "Assessment result is below the benchmark and requires Admin approval for re-attempt access.",
        next_attempt_number=AttemptNumber,
    )
    Db.add(Approval)
    Db.flush()
    return Approval


def SyncAssessmentReattemptApprovalQueue(Db: Session) -> None:
    Assignments = (
        Db.query(AssessmentAssignment)
        .filter(
            AssessmentAssignment.is_active == True,
            AssessmentAssignment.status == "NEEDS_RE_ATTEMPT",
        )
        .all()
    )
    for Assignment in Assignments:
        Attempt = LatestAssessmentAttemptForAssignment(Db, Assignment.id)
        EnsurePendingAssessmentReattemptApproval(Db, Assignment, Attempt=Attempt)


def AssessmentReattemptApprovalPayload(Db: Session, Approval: AssessmentReattemptApproval) -> dict[str, Any]:
    Assignment = Db.get(AssessmentAssignment, Approval.assessment_assignment_id)
    StudentItem = Db.get(Student, Approval.student_id) if Approval.student_id else None
    StudentUser = Db.get(User, StudentItem.user_id) if StudentItem else None
    TeacherItem = Db.get(Teacher, Assignment.teacher_id) if Assignment and Assignment.teacher_id else None
    TeacherUser = Db.get(User, TeacherItem.user_id) if TeacherItem else None
    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id) if Assignment else None
    Version = Db.get(AssessmentVersion, Assignment.assessment_version_id) if Assignment else None
    LevelItem = Db.get(Level, Blueprint.level_id) if Blueprint else None
    ModuleItem = Db.get(Module, Blueprint.module_id) if Blueprint else None
    Attempt = Db.get(AssessmentAttempt, Approval.assessment_attempt_id) if Approval.assessment_attempt_id else LatestAssessmentAttemptForAssignment(Db, Assignment.id) if Assignment else None
    Result = LatestAssessmentResultForAssignment(Db, Assignment.id) if Assignment else None
    RequestedBy = Db.get(User, Approval.requested_by_user_id) if Approval.requested_by_user_id else None
    ApprovedBy = Db.get(User, Approval.approved_by_user_id) if Approval.approved_by_user_id else None
    AssignmentType = getattr(Assignment, "assessment_assignment_type", None) or "ORIGINAL"

    return {
        "approvalId": Approval.id,
        "assessmentAssignmentId": Assignment.id if Assignment else None,
        "assessmentVersionId": Assignment.assessment_version_id if Assignment else None,
        "blueprintId": Assignment.blueprint_id if Assignment else None,
        "studentId": StudentItem.id if StudentItem else None,
        "studentCode": StudentItem.student_code if StudentItem else None,
        "studentName": StudentUser.full_name if StudentUser else "-",
        "teacherId": TeacherItem.id if TeacherItem else None,
        "teacherName": TeacherUser.full_name if TeacherUser else "-",
        "moduleId": ModuleItem.id if ModuleItem else None,
        "moduleCode": ModuleItem.module_code if ModuleItem else None,
        "moduleName": ModuleItem.module_name if ModuleItem else None,
        "levelId": LevelItem.id if LevelItem else None,
        "levelCode": LevelItem.level_code if LevelItem else None,
        "levelName": LevelItem.level_name if LevelItem else None,
        "assessmentTitle": Blueprint.title if Blueprint else "Assessment",
        "versionNumber": Version.version_number if Version else None,
        "failedAssessmentTitle": Blueprint.title if Blueprint else "Assessment",
        "failedAssessmentVersionLabel": f"Version {Version.version_number}" if Version and Version.version_number else None,
        "assignmentType": AssignmentType,
        "sourceAssignmentId": getattr(Assignment, "source_assignment_id", None) if Assignment else None,
        "attemptId": Attempt.id if Attempt else None,
        "attemptNumber": Attempt.attempt_number if Attempt else Approval.next_attempt_number,
        "attemptType": Attempt.attempt_type if Attempt else AssignmentType,
        "score": float(Result.score) if Result else (float(Attempt.total_score) if Attempt else None),
        "maxScore": float(Result.max_score) if Result else (float(Attempt.max_score) if Attempt else None),
        "percentage": float(Result.percentage) if Result else (float(Attempt.percentage) if Attempt else None),
        "resultStatus": Result.result_status if Result else (Attempt.result_status if Attempt else None),
        "completionDate": Iso(Result.completion_date if Result else Attempt.submitted_at if Attempt else None),
        "status": Approval.status,
        "statusLabel": "Pending Approval" if Approval.status == "PENDING" else "Approved" if Approval.status == "APPROVED" and not Approval.used_at else "Re-Attempt Assigned" if Approval.status == "APPROVED" and Approval.used_at else "Rejected" if Approval.status == "REJECTED" else Approval.status.title(),
        "actionLabel": "Approve" if Approval.status == "PENDING" else "Approved" if Approval.status == "APPROVED" else "Rejected" if Approval.status == "REJECTED" else Approval.status.title(),
        "reason": Approval.reason,
        "adminNote": Approval.admin_note,
        "nextAttemptNumber": Approval.next_attempt_number,
        "requestedByName": RequestedBy.full_name if RequestedBy else "System",
        "approvedByName": ApprovedBy.full_name if ApprovedBy else None,
        "requestedAt": Iso(Approval.requested_at),
        "approvedAt": Iso(Approval.approved_at),
        "usedAt": Iso(Approval.used_at),
        "canApprove": Approval.status == "PENDING",
        "canReject": Approval.status == "PENDING",
        "canAssign": Approval.status == "APPROVED" and Approval.used_at is None,
    }


def AssessmentApprovalLifecyclePriority(Item: dict[str, Any]) -> int:
    Status = str(Item.get("status") or "").upper()
    if Status == "APPROVED" and Item.get("usedAt"):
        return 4
    if Status == "APPROVED":
        return 3
    if Status == "REJECTED":
        return 2
    if Status == "PENDING":
        return 1
    return 0


def AssessmentApprovalLifecycleKey(Item: dict[str, Any]) -> str:
    return str(
        Item.get("assessmentAssignmentId")
        or f"{Item.get('studentId') or 'student'}:{Item.get('levelId') or 'level'}:{Item.get('failedAssessmentTitle') or Item.get('assessmentTitle') or 'assessment'}"
    )


def ListAssessmentReattemptApprovals(Db: Session, Status: str | None = None) -> dict[str, Any]:
    SyncAssessmentReattemptApprovalQueue(Db)
    Approvals = (
        Db.query(AssessmentReattemptApproval)
        .order_by(AssessmentReattemptApproval.requested_at.desc())
        .all()
    )
    RawItems = [AssessmentReattemptApprovalPayload(Db, Approval) for Approval in Approvals]
    LifecycleItems: dict[str, dict[str, Any]] = {}
    for Item in RawItems:
        Key = AssessmentApprovalLifecycleKey(Item)
        Existing = LifecycleItems.get(Key)
        if not Existing or AssessmentApprovalLifecyclePriority(Item) > AssessmentApprovalLifecyclePriority(Existing):
            LifecycleItems[Key] = Item
    Items = sorted(
        LifecycleItems.values(),
        key=lambda Item: (
            str(Item.get("usedAt") or Item.get("approvedAt") or Item.get("requestedAt") or ""),
            AssessmentApprovalLifecyclePriority(Item),
        ),
        reverse=True,
    )
    StatusFilter = Status.upper() if Status and Status.upper() != "ALL" else None
    if StatusFilter:
        Items = [Item for Item in Items if str(Item.get("status") or "").upper() == StatusFilter]
    AllLifecycleItems = list(LifecycleItems.values())
    ApprovedItems = [Item for Item in AllLifecycleItems if Item.get("status") == "APPROVED"]
    PendingItems = [Item for Item in AllLifecycleItems if Item.get("status") == "PENDING"]
    RejectedItems = [Item for Item in AllLifecycleItems if Item.get("status") == "REJECTED"]
    AssignedItems = [Item for Item in ApprovedItems if Item.get("usedAt")]
    return {
        "total": len(AllLifecycleItems),
        "pending": len(PendingItems),
        "approved": len(ApprovedItems),
        "assigned": len(AssignedItems),
        "rejected": len(RejectedItems),
        "items": Items,
    }


def ApproveAssessmentReattempt(Db: Session, ApprovalId: str, AdminUserId: str, AdminNote: str | None = None) -> AssessmentReattemptApproval:
    Approval = Db.get(AssessmentReattemptApproval, ApprovalId)
    if not Approval:
        api_error(404, "ASSESSMENT_REATTEMPT_APPROVAL_NOT_FOUND", "Assessment re-attempt approval request not found.")
    if Approval.status != "PENDING":
        api_error(400, "ASSESSMENT_REATTEMPT_APPROVAL_NOT_PENDING", "Only pending re-attempt requests can be approved.")
    Assignment = Db.get(AssessmentAssignment, Approval.assessment_assignment_id)
    if not Assignment or Assignment.status != "NEEDS_RE_ATTEMPT":
        api_error(400, "ASSESSMENT_REATTEMPT_NOT_REQUIRED", "This assessment no longer requires re-attempt approval.")
    Approval.status = "APPROVED"
    Approval.approved_by_user_id = AdminUserId
    Approval.approved_at = NowUtc()
    Approval.admin_note = AdminNote
    Db.commit()
    Db.refresh(Approval)
    return Approval


def RejectAssessmentReattempt(Db: Session, ApprovalId: str, AdminUserId: str, AdminNote: str | None = None) -> AssessmentReattemptApproval:
    Approval = Db.get(AssessmentReattemptApproval, ApprovalId)
    if not Approval:
        api_error(404, "ASSESSMENT_REATTEMPT_APPROVAL_NOT_FOUND", "Assessment re-attempt approval request not found.")
    if Approval.status != "PENDING":
        api_error(400, "ASSESSMENT_REATTEMPT_APPROVAL_NOT_PENDING", "Only pending re-attempt requests can be rejected.")
    Approval.status = "REJECTED"
    Approval.approved_by_user_id = AdminUserId
    Approval.approved_at = NowUtc()
    Approval.admin_note = AdminNote
    Db.commit()
    Db.refresh(Approval)
    return Approval




def NextLevelForLevel(Db: Session, CurrentLevel: Level | None) -> Level | None:
    if not CurrentLevel:
        return None
    Query = (
        Db.query(Level)
        .filter(
            Level.module_id == CurrentLevel.module_id,
            Level.is_active == True,
            Level.id != CurrentLevel.id,
        )
    )
    if CurrentLevel.display_order is not None:
        NextByDisplay = (
            Query.filter(Level.display_order > CurrentLevel.display_order)
            .order_by(Level.display_order.asc(), Level.internal_level_number.asc().nullslast(), Level.level_code.asc())
            .first()
        )
        if NextByDisplay:
            return NextByDisplay
    if CurrentLevel.internal_level_number is not None:
        NextByInternal = (
            Query.filter(Level.internal_level_number > CurrentLevel.internal_level_number)
            .order_by(Level.internal_level_number.asc(), Level.display_order.asc(), Level.level_code.asc())
            .first()
        )
        if NextByInternal:
            return NextByInternal
    return None


def PromotionTargetLevelOptions(Db: Session, CurrentLevel: Level | None) -> list[dict[str, Any]]:
    NextLevel = NextLevelForLevel(Db, CurrentLevel)
    if not NextLevel:
        return []
    NextModule = Db.get(Module, NextLevel.module_id) if NextLevel.module_id else None
    return [
        {
            "levelId": NextLevel.id,
            "levelCode": NextLevel.level_code,
            "levelName": NextLevel.level_name,
            "moduleId": NextModule.id if NextModule else None,
            "moduleCode": NextModule.module_code if NextModule else None,
            "moduleName": NextModule.module_name if NextModule else None,
            "label": f"{NextLevel.level_code} — {NextLevel.level_name}",
        }
    ]


def AssessmentPromotionRecordForAssignment(Db: Session, AssignmentId: str | None) -> StudentLevelPromotion | None:
    if not AssignmentId:
        return None
    return (
        Db.query(StudentLevelPromotion)
        .filter(
            StudentLevelPromotion.assessment_assignment_id == AssignmentId,
            StudentLevelPromotion.status == "PROMOTED",
        )
        .order_by(StudentLevelPromotion.promoted_at.desc().nullslast(), StudentLevelPromotion.created_at.desc())
        .first()
    )


def FirstDpsForLevel(Db: Session, LevelId: str | None) -> DPS | None:
    if not LevelId:
        return None
    FirstLesson = (
        Db.query(Lesson)
        .filter(Lesson.level_id == LevelId, Lesson.is_active == True)
        .order_by(Lesson.display_order.asc(), Lesson.lesson_number.asc())
        .first()
    )
    if not FirstLesson:
        return None
    return (
        Db.query(DPS)
        .filter(DPS.lesson_id == FirstLesson.id, DPS.is_active == True)
        .order_by(DPS.dps_number.asc())
        .first()
    )


def PromotedLevelStartPayload(Db: Session, Promotion: StudentLevelPromotion | None) -> dict[str, Any]:
    if not Promotion:
        return {
            "hasStartedPromotedLevel": False,
            "promotedLevelStartedAt": None,
            "promotedLevelFirstDpsId": None,
            "promotedLevelFirstDpsTitle": None,
        }

    FirstDps = FirstDpsForLevel(Db, Promotion.to_level_id)
    if not FirstDps:
        return {
            "hasStartedPromotedLevel": False,
            "promotedLevelStartedAt": None,
            "promotedLevelFirstDpsId": None,
            "promotedLevelFirstDpsTitle": None,
        }

    StartedAttempt = (
        Db.query(Attempt)
        .filter(
            Attempt.student_id == Promotion.student_id,
            Attempt.dps_id == FirstDps.id,
        )
        .order_by(Attempt.started_at.asc())
        .first()
    )

    return {
        "hasStartedPromotedLevel": bool(StartedAttempt),
        "promotedLevelStartedAt": Iso(StartedAttempt.started_at) if StartedAttempt else None,
        "promotedLevelFirstDpsId": FirstDps.id,
        "promotedLevelFirstDpsTitle": FirstDps.dps_title,
    }


def AssessmentProgressionPayload(
    Db: Session,
    Assignment: AssessmentAssignment | None,
    Result: AssessmentResult | None = None,
    Attempt: AssessmentAttempt | None = None,
    LevelItem: Level | None = None,
    ModuleItem: Module | None = None,
) -> dict[str, Any]:
    if not Assignment:
        return {
            "progressionStatus": "NOT_AVAILABLE",
            "progressionStatusLabel": "Not Available",
            "isReadyForNextLevel": False,
            "isPromoted": False,
            "nextLevelAvailable": False,
            "promotionCanProceed": False,
            "promotionBlockReason": "Promotion becomes available after the level assessment is cleared.",
            "progressionMessage": "Promotion becomes available after the level assessment is cleared.",
        }

    PromotionRecord = AssessmentPromotionRecordForAssignment(Db, Assignment.id)
    if PromotionRecord:
        StartedPayload = PromotedLevelStartPayload(Db, PromotionRecord)
        return {
            "progressionStatus": "PROMOTED",
            "progressionStatusLabel": "Promoted",
            "isReadyForNextLevel": False,
            "isPromoted": True,
            "nextLevelAvailable": True,
            "promotionCanProceed": False,
            "promotionBlockReason": "Student has already been promoted for this cleared assessment.",
            "promotionId": PromotionRecord.id,
            "promotedAt": Iso(PromotionRecord.promoted_at),
            "promotedByUserId": PromotionRecord.promoted_by_user_id,
            "fromModuleId": PromotionRecord.from_module_id,
            "fromModuleCode": PromotionRecord.from_module_code,
            "fromLevelId": PromotionRecord.from_level_id,
            "fromLevelCode": PromotionRecord.from_level_code,
            "toModuleId": PromotionRecord.to_module_id,
            "toModuleCode": PromotionRecord.to_module_code,
            "toLevelId": PromotionRecord.to_level_id,
            "toLevelCode": PromotionRecord.to_level_code,
            "progressionMessage": "Student has been promoted to the next level.",
            **StartedPayload,
        }

    Cleared = bool(Result and Result.cleared)
    if not Cleared and Attempt:
        Cleared = str(getattr(Attempt, "result_status", "")).upper() == "CLEARED" or str(getattr(Attempt, "status", "")).upper() == "CLEARED"
    if not Cleared:
        return {
            "progressionStatus": "NOT_AVAILABLE",
            "progressionStatusLabel": "Not Available",
            "isReadyForNextLevel": False,
            "isPromoted": False,
            "nextLevelAvailable": False,
            "promotionCanProceed": False,
            "promotionBlockReason": "Promotion becomes available after the level assessment is cleared.",
            "progressionMessage": "Promotion becomes available after the level assessment is cleared.",
        }

    NextLevel = NextLevelForLevel(Db, LevelItem)
    NextModule = Db.get(Module, NextLevel.module_id) if NextLevel else None
    NextLevelAvailable = bool(NextLevel)
    PromotionBlockReason = None if NextLevelAvailable else f"No next level is available after {LevelItem.level_code if LevelItem else 'this level'}. Create the next level in Learning Path before promoting this student."

    return {
        "progressionStatus": "READY_FOR_NEXT_LEVEL",
        "progressionStatusLabel": "Available" if NextLevelAvailable else "Next Level Setup Required",
        "isReadyForNextLevel": True,
        "isPromoted": False,
        "nextLevelAvailable": NextLevelAvailable,
        "promotionCanProceed": NextLevelAvailable,
        "promotionBlockReason": PromotionBlockReason,
        "fromModuleId": ModuleItem.id if ModuleItem else None,
        "fromModuleCode": ModuleItem.module_code if ModuleItem else None,
        "fromLevelId": LevelItem.id if LevelItem else None,
        "fromLevelCode": LevelItem.level_code if LevelItem else None,
        "toModuleId": NextModule.id if NextModule else None,
        "toModuleCode": NextModule.module_code if NextModule else None,
        "toLevelId": NextLevel.id if NextLevel else None,
        "toLevelCode": NextLevel.level_code if NextLevel else None,
        "toLevelName": NextLevel.level_name if NextLevel else None,
        "promotionTargetLevels": PromotionTargetLevelOptions(Db, LevelItem),
        "progressionMessage": "Student is ready for the next level. Admin can promote when operationally appropriate." if NextLevelAvailable else PromotionBlockReason,
    }


def PromoteAssessmentStudentToNextLevel(Db: Session, AssessmentAssignmentId: str, PromotedByUserId: str | None = None, TargetLevelId: str | None = None, TargetLevelCode: str | None = None) -> dict[str, Any]:
    Assignment = Db.get(AssessmentAssignment, AssessmentAssignmentId)
    if not Assignment or not Assignment.is_active:
        api_error(404, "ASSESSMENT_ASSIGNMENT_NOT_FOUND", "Assessment assignment not found.")

    StudentItem = Db.get(Student, Assignment.student_id)
    if not StudentItem or not StudentItem.is_active:
        api_error(404, "STUDENT_NOT_FOUND", "Student not found for this assessment assignment.")

    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id)
    LevelItem = Db.get(Level, Blueprint.level_id) if Blueprint else None
    ModuleItem = Db.get(Module, Blueprint.module_id) if Blueprint else None
    if not Blueprint or not LevelItem:
        api_error(400, "ASSESSMENT_LEVEL_CONTEXT_MISSING", "Assessment level context is missing.")

    ExistingPromotion = AssessmentPromotionRecordForAssignment(Db, Assignment.id)
    if ExistingPromotion:
        return {
            "promoted": False,
            "alreadyPromoted": True,
            "message": "Student has already been promoted for this assessment result.",
            "promotion": StudentLevelPromotionPayload(Db, ExistingPromotion),
            "assignment": AssessmentAssignmentPayload(Db, Assignment),
        }

    Result = LatestAssessmentResultForAssignment(Db, Assignment.id)
    Attempt = LatestAssessmentAttemptForAssignment(Db, Assignment.id)
    if not Result or not Result.cleared:
        api_error(400, "PROMOTION_NOT_AVAILABLE", "Student can be promoted only after clearing the level assessment.")

    NextLevel = NextLevelForLevel(Db, LevelItem)
    if not NextLevel:
        api_error(400, "NEXT_LEVEL_SETUP_REQUIRED", f"No next level is available after {LevelItem.level_code}. Create the next level in Learning Path before promoting this student.")

    RequestedTarget = (TargetLevelId or TargetLevelCode or "").strip()
    if RequestedTarget and RequestedTarget not in {NextLevel.id, NextLevel.level_code}:
        api_error(400, "INVALID_PROMOTION_TARGET", f"{NextLevel.level_code} is the only valid next level after {LevelItem.level_code} right now.")

    NextModule = Db.get(Module, NextLevel.module_id) if NextLevel else None

    ExistingSamePath = (
        Db.query(StudentLevelPromotion)
        .filter(
            StudentLevelPromotion.student_id == StudentItem.id,
            StudentLevelPromotion.from_level_id == LevelItem.id,
            StudentLevelPromotion.to_level_id == NextLevel.id,
            StudentLevelPromotion.status == "PROMOTED",
        )
        .first()
    )
    if ExistingSamePath:
        return {
            "promoted": False,
            "alreadyPromoted": True,
            "message": "Student has already been promoted from this level.",
            "promotion": StudentLevelPromotionPayload(Db, ExistingSamePath),
            "assignment": AssessmentAssignmentPayload(Db, Assignment),
        }

    Promotion = StudentLevelPromotion(
        student_id=StudentItem.id,
        student_code=StudentItem.student_code,
        from_module_id=ModuleItem.id if ModuleItem else None,
        from_module_code=ModuleItem.module_code if ModuleItem else None,
        from_level_id=LevelItem.id,
        from_level_code=LevelItem.level_code,
        to_module_id=NextModule.id if NextModule else None,
        to_module_code=NextModule.module_code if NextModule else None,
        to_level_id=NextLevel.id,
        to_level_code=NextLevel.level_code,
        assessment_assignment_id=Assignment.id,
        assessment_attempt_id=Attempt.id if Attempt else None,
        assessment_result_id=Result.id if Result else None,
        score=NormalizeAssessmentScore(Result.score if Result else None, Result.max_score if Result else None) if Result else None,
        max_score=float(Result.max_score) if Result and Result.max_score is not None else None,
        percentage=NormalizeAssessmentPercentage(Result.score if Result else None, Result.max_score if Result else None) if Result else None,
        status="PROMOTED",
        promoted_by_user_id=PromotedByUserId,
        promoted_at=NowUtc(),
    )
    Db.add(Promotion)

    StudentItem.current_module_id = NextModule.id if NextModule else StudentItem.current_module_id
    StudentItem.current_level_id = NextLevel.id
    Db.flush()
    Db.commit()
    Db.refresh(Promotion)
    Db.refresh(StudentItem)

    return {
        "promoted": True,
        "alreadyPromoted": False,
        "message": f"{StudentItem.student_code} has been promoted to {NextLevel.level_code}.",
        "promotion": StudentLevelPromotionPayload(Db, Promotion),
        "assignment": AssessmentAssignmentPayload(Db, Assignment),
    }


def StudentLevelPromotionPayload(Db: Session, Promotion: StudentLevelPromotion) -> dict[str, Any]:
    StudentItem = Db.get(Student, Promotion.student_id) if Promotion else None
    StudentUser = Db.get(User, StudentItem.user_id) if StudentItem else None
    PromotedBy = Db.get(User, Promotion.promoted_by_user_id) if Promotion and Promotion.promoted_by_user_id else None
    Assignment = Db.get(AssessmentAssignment, Promotion.assessment_assignment_id) if Promotion and Promotion.assessment_assignment_id else None
    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id) if Assignment else None
    FromModule = Db.get(Module, Promotion.from_module_id) if Promotion and Promotion.from_module_id else None
    FromLevel = Db.get(Level, Promotion.from_level_id) if Promotion and Promotion.from_level_id else None
    ToModule = Db.get(Module, Promotion.to_module_id) if Promotion and Promotion.to_module_id else None
    ToLevel = Db.get(Level, Promotion.to_level_id) if Promotion and Promotion.to_level_id else None
    return {
        "promotionId": Promotion.id,
        "studentId": Promotion.student_id,
        "studentName": StudentUser.full_name if StudentUser else None,
        "studentCode": Promotion.student_code or (StudentItem.student_code if StudentItem else None),
        "fromModuleId": Promotion.from_module_id,
        "fromModuleCode": Promotion.from_module_code or (FromModule.module_code if FromModule else None),
        "fromModuleName": FromModule.module_name if FromModule else None,
        "fromLevelId": Promotion.from_level_id,
        "fromLevelCode": Promotion.from_level_code or (FromLevel.level_code if FromLevel else None),
        "fromLevelName": FromLevel.level_name if FromLevel else None,
        "toModuleId": Promotion.to_module_id,
        "toModuleCode": Promotion.to_module_code or (ToModule.module_code if ToModule else None),
        "toModuleName": ToModule.module_name if ToModule else None,
        "toLevelId": Promotion.to_level_id,
        "toLevelCode": Promotion.to_level_code or (ToLevel.level_code if ToLevel else None),
        "toLevelName": ToLevel.level_name if ToLevel else None,
        "assessmentAssignmentId": Promotion.assessment_assignment_id,
        "assessmentAttemptId": Promotion.assessment_attempt_id,
        "assessmentResultId": Promotion.assessment_result_id,
        "assessmentTitle": Blueprint.title if Blueprint else "Assessment",
        "score": Promotion.score,
        "maxScore": Promotion.max_score,
        "percentage": Promotion.percentage,
        "status": Promotion.status,
        "statusLabel": "Promoted" if Promotion.status == "PROMOTED" else Promotion.status.title(),
        "promotedByUserId": Promotion.promoted_by_user_id,
        "promotedByName": PromotedBy.full_name if PromotedBy else None,
        "promotedAt": Iso(Promotion.promoted_at),
        "createdAt": Iso(Promotion.created_at),
    }


def ListStudentLevelPromotions(Db: Session) -> dict[str, Any]:
    Promotions = (
        Db.query(StudentLevelPromotion)
        .order_by(StudentLevelPromotion.promoted_at.desc().nullslast(), StudentLevelPromotion.created_at.desc())
        .all()
    )
    Items = [StudentLevelPromotionPayload(Db, Promotion) for Promotion in Promotions]
    return {
        "items": Items,
        "total": len(Items),
    }

def AssessmentAssignmentPayload(Db: Session, Assignment: AssessmentAssignment) -> dict[str, Any]:
    StudentItem = Db.get(Student, Assignment.student_id)
    StudentUser = Db.get(User, StudentItem.user_id) if StudentItem else None
    TeacherItem = Db.get(Teacher, Assignment.teacher_id) if Assignment.teacher_id else None
    TeacherUser = Db.get(User, TeacherItem.user_id) if TeacherItem else None
    Version = Db.get(AssessmentVersion, Assignment.assessment_version_id)
    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id)
    LevelItem = Db.get(Level, Blueprint.level_id) if Blueprint else None
    ModuleItem = Db.get(Module, Blueprint.module_id) if Blueprint else None
    Attempt = (
        Db.query(AssessmentAttempt)
        .filter(AssessmentAttempt.assessment_assignment_id == Assignment.id)
        .order_by(AssessmentAttempt.started_at.desc())
        .first()
    )
    Result = (
        Db.query(AssessmentResult)
        .filter(AssessmentResult.assessment_assignment_id == Assignment.id)
        .order_by(AssessmentResult.completion_date.desc().nullslast(), AssessmentResult.created_at.desc())
        .first()
    )
    ReattemptApproval = (
        Db.query(AssessmentReattemptApproval)
        .filter(
            AssessmentReattemptApproval.assessment_assignment_id == Assignment.id,
            AssessmentReattemptApproval.student_id == Assignment.student_id,
            AssessmentReattemptApproval.status.in_(["PENDING", "APPROVED"]),
            AssessmentReattemptApproval.used_at.is_(None),
        )
        .order_by(AssessmentReattemptApproval.approved_at.asc().nullslast(), AssessmentReattemptApproval.requested_at.asc())
        .first()
    )

    Status = Assignment.status
    if Result:
        Status = "COMPLETED" if Result.cleared else "REATTEMPT_AVAILABLE"
    elif Attempt and Attempt.status in ["SUBMITTED", "AUTO_SUBMITTED", "CLEARED", "NEEDS_RE_ATTEMPT"]:
        Status = "COMPLETED" if getattr(Attempt, "result_status", None) == "CLEARED" else "REATTEMPT_AVAILABLE"
    elif Attempt and Attempt.status == "IN_PROGRESS":
        Status = "IN_PROGRESS"
    elif Status == "ASSIGNED":
        Status = "PENDING"
    elif Status == "NEEDS_RE_ATTEMPT":
        Status = "REATTEMPT_AVAILABLE"
    elif Status == "CLEARED":
        Status = "COMPLETED"

    MaxScore = float(Result.max_score) if Result else (float(Attempt.max_score) if Attempt else (float(Version.total_marks) if Version else None))
    RawScore = float(Result.score) if Result else (float(Attempt.total_score) if Attempt else None)
    Score = NormalizeAssessmentScore(RawScore, MaxScore) if RawScore is not None else None
    Accuracy = NormalizeAssessmentPercentage(Score, MaxScore) if Score is not None else (float(Result.percentage) if Result else (float(Attempt.percentage) if Attempt else None))
    BenchmarkStatus = ("PASS" if Result and Result.cleared else "BELOW_BENCHMARK" if Result else "PENDING")
    RequiresAttention = bool(Result and not Result.cleared)
    ProgressionPayload = AssessmentProgressionPayload(Db, Assignment, Result=Result, Attempt=Attempt, LevelItem=LevelItem, ModuleItem=ModuleItem)

    return {
        "assignmentId": Assignment.id,
        "assessmentAssignmentId": Assignment.id,
        "assessmentVersionId": Assignment.assessment_version_id,
        "blueprintId": Assignment.blueprint_id,
        "assessmentId": Assignment.blueprint_id,
        "assessmentTitle": Blueprint.title if Blueprint else "Assessment",
        "assignmentTitle": Blueprint.title if Blueprint else "Assessment",
        "assignmentType": "ASSESSMENT",
        "assessmentAssignmentType": getattr(Assignment, "assessment_assignment_type", None) or "ORIGINAL",
        "isReattemptAssignment": (getattr(Assignment, "assessment_assignment_type", None) or "ORIGINAL") == "RE_ATTEMPT",
        "sourceAssessmentAssignmentId": getattr(Assignment, "source_assignment_id", None),
        "assessmentReattemptApprovalId": getattr(Assignment, "reattempt_approval_id", None),
        "assignedByName": TeacherUser.full_name if TeacherUser else "Teacher",
        "assignedByRole": "TEACHER",
        "assignedToType": "STUDENT",
        "studentId": StudentItem.id if StudentItem else None,
        "studentName": StudentUser.full_name if StudentUser else "-",
        "studentCode": StudentItem.student_code if StudentItem else "-",
        "className": StudentItem.class_name if StudentItem else None,
        "section": StudentItem.section if StudentItem else None,
        "status": Status,
        "attemptId": Attempt.id if Attempt else None,
        "attemptStatus": Attempt.status if Attempt else None,
        "attemptNumber": Attempt.attempt_number if Attempt else getattr(Assignment, "current_attempt_number", None),
        "attemptType": Attempt.attempt_type if Attempt else (getattr(Assignment, "assessment_assignment_type", None) or "ORIGINAL"),
        "attemptLabel": AssessmentAttemptLabel(Attempt.attempt_number if Attempt else getattr(Assignment, "current_attempt_number", None), Attempt.attempt_type if Attempt else getattr(Assignment, "assessment_assignment_type", None)),
        "score": Score,
        "totalMarks": MaxScore,
        "accuracy": Accuracy,
        "correctCount": Attempt.correct_count if Attempt else None,
        "wrongCount": Attempt.wrong_count if Attempt else None,
        "unansweredCount": Attempt.unanswered_count if Attempt else None,
        "timeTakenSeconds": Attempt.time_taken_seconds if Attempt else None,
        "benchmarkPercentage": PASSING_PERCENTAGE,
        "benchmarkStatus": BenchmarkStatus,
        "requiresAttention": RequiresAttention,
        "benchmarkMessage": "Assessment is below benchmark and needs re-attempt support." if RequiresAttention else ("Assessment meets the 70% benchmark." if Result else "Assessment result will be calculated after submission."),
        "reattemptPermissionId": ReattemptApproval.id if ReattemptApproval else None,
        "reattemptStatus": ReattemptApproval.status if ReattemptApproval else "NONE",
        "reattemptStatusLabel": "Pending Approval" if ReattemptApproval and ReattemptApproval.status == "PENDING" else "Re-Attempt Approved" if ReattemptApproval and ReattemptApproval.status == "APPROVED" else "None",
        "reattemptNextAttemptNumber": ReattemptApproval.next_attempt_number if ReattemptApproval else None,
        "reattemptAllowedAt": Iso(ReattemptApproval.approved_at or ReattemptApproval.requested_at) if ReattemptApproval else None,
        "createdAt": Iso(Assignment.assigned_at),
        "startedAt": Iso(Attempt.started_at) if Attempt else None,
        "submittedAt": Iso(Attempt.submitted_at) if Attempt else None,
        "attemptDate": Iso(Attempt.started_at) if Attempt else None,
        "completedDate": Iso(Result.completion_date) if Result else (Iso(Attempt.submitted_at) if Attempt else None),
        "dpsId": None,
        "dpsNumber": None,
        "dpsTitle": None,
        "lessonId": None,
        "lessonNumber": None,
        "lessonTitle": None,
        "levelId": LevelItem.id if LevelItem else None,
        "levelCode": LevelItem.level_code if LevelItem else None,
        "levelName": LevelItem.level_name if LevelItem else None,
        "moduleId": ModuleItem.id if ModuleItem else None,
        "moduleCode": ModuleItem.module_code if ModuleItem else None,
        "moduleName": ModuleItem.module_name if ModuleItem else None,
        "versionNumber": Version.version_number if Version else None,
        "totalQuestions": Version.total_questions if Version else None,
        "questionCount": Version.total_questions if Version else None,
        "durationSeconds": Version.duration_seconds if Version else None,
        "durationMinutes": round((Version.duration_seconds or 0) / 60, 2) if Version else None,
        "marksPerQuestion": Version.marks_per_question if Version else None,
        **ProgressionPayload,
    }



def AssessmentRemainingSeconds(Attempt: AssessmentAttempt) -> int:
    if not Attempt or not Attempt.expires_at:
        return 0
    ExpiresAt = AwareUtc(Attempt.expires_at)
    if not ExpiresAt:
        return 0
    Delta = ExpiresAt - NowUtc()
    return max(0, int(Delta.total_seconds()))


def AssessmentQuestionSafePayload(Db: Session, Question: AssessmentQuestion, SavedOptionId: str | None = None) -> dict[str, Any]:
    Options = (
        Db.query(AssessmentQuestionOption)
        .filter(AssessmentQuestionOption.assessment_question_id == Question.id)
        .order_by(AssessmentQuestionOption.display_order.asc(), AssessmentQuestionOption.option_label.asc())
        .all()
    )
    return {
        "questionId": Question.id,
        "questionNumber": Question.question_number,
        "displayType": Question.display_type,
        "questionText": Question.question_text,
        "operands": SafeJson(Question.operands_json, []),
        "operators": SafeJson(Question.operators_json, []),
        "savedOptionId": SavedOptionId,
        "options": [
            {
                "optionId": Option.id,
                "label": Option.option_label,
                "value": Option.option_value,
            }
            for Option in Options
        ],
    }


def AssessmentQuestionsForAttempt(Db: Session, Attempt: AssessmentAttempt) -> list[dict[str, Any]]:
    SavedAnswers = {
        Answer.assessment_question_id: Answer.selected_option_id
        for Answer in Db.query(AssessmentAttemptAnswer)
        .filter(AssessmentAttemptAnswer.assessment_attempt_id == Attempt.id)
        .all()
    }
    Questions = (
        Db.query(AssessmentQuestion)
        .filter(AssessmentQuestion.assessment_version_id == Attempt.assessment_version_id)
        .order_by(AssessmentQuestion.question_number.asc())
        .all()
    )
    return [AssessmentQuestionSafePayload(Db, Question, SavedAnswers.get(Question.id)) for Question in Questions]


def GetAssessmentAssignmentForStudent(Db: Session, StudentItem: Student, AssignmentId: str) -> AssessmentAssignment:
    Assignment = Db.get(AssessmentAssignment, AssignmentId)
    if not Assignment or not Assignment.is_active or Assignment.student_id != StudentItem.id:
        api_error(404, "ASSESSMENT_ASSIGNMENT_NOT_FOUND", "Assessment assignment not found for this student.")
    return Assignment


def GetAssessmentAttemptForStudent(Db: Session, StudentItem: Student, AttemptId: str) -> AssessmentAttempt:
    Attempt = Db.get(AssessmentAttempt, AttemptId)
    if not Attempt or Attempt.student_id != StudentItem.id:
        api_error(404, "ASSESSMENT_ATTEMPT_NOT_FOUND", "Assessment attempt not found for this student.")
    return Attempt


def StudentAssessmentStartPayload(Db: Session, StudentItem: Student, AssignmentId: str) -> dict[str, Any]:
    Assignment = GetAssessmentAssignmentForStudent(Db, StudentItem, AssignmentId)
    Version = Db.get(AssessmentVersion, Assignment.assessment_version_id)
    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id)
    LevelItem = Db.get(Level, Blueprint.level_id) if Blueprint else None
    ModuleItem = Db.get(Module, Blueprint.module_id) if Blueprint else None
    LatestAttempt = (
        Db.query(AssessmentAttempt)
        .filter(AssessmentAttempt.assessment_assignment_id == Assignment.id)
        .order_by(AssessmentAttempt.started_at.desc())
        .first()
    )
    LatestResult = (
        Db.query(AssessmentResult)
        .filter(AssessmentResult.assessment_assignment_id == Assignment.id)
        .order_by(AssessmentResult.completion_date.desc().nullslast(), AssessmentResult.created_at.desc())
        .first()
    )
    Action = "Start Assessment"
    if LatestAttempt and LatestAttempt.status == "IN_PROGRESS":
        Action = "Resume Assessment"
    elif LatestResult:
        Action = "View Result"
    return {
        "assignmentId": Assignment.id,
        "assessmentVersionId": Assignment.assessment_version_id,
        "blueprintId": Assignment.blueprint_id,
        "title": Blueprint.title if Blueprint else "Level Assessment",
        "moduleCode": ModuleItem.module_code if ModuleItem else None,
        "moduleName": ModuleItem.module_name if ModuleItem else None,
        "levelCode": LevelItem.level_code if LevelItem else None,
        "levelName": LevelItem.level_name if LevelItem else None,
        "status": AssessmentAssignmentPayload(Db, Assignment).get("status"),
        "attemptId": LatestAttempt.id if LatestAttempt else None,
        "resultAttemptId": LatestResult.assessment_attempt_id if LatestResult else None,
        "action": Action,
        "details": {
            "questions": Version.total_questions if Version else 0,
            "totalMarks": Version.total_marks if Version else 100,
            "durationSeconds": Version.duration_seconds if Version else 0,
            "durationMinutes": round((Version.duration_seconds or 0) / 60, 2) if Version else 0,
            "marksPerQuestion": Version.marks_per_question if Version else 0,
            "benchmarkPercentage": PASSING_PERCENTAGE,
            "answerType": "MCQ",
            "optionsPerQuestion": 4,
            "navigationAllowed": True,
            "autoSubmit": True,
        },
        "instructions": [
            "Answer each question carefully before submitting.",
            "Each question has 4 options.",
            "You can move between questions using the navigator.",
            "The assessment will auto-submit when time is up.",
        ],
    }


def StartAssessmentAttempt(Db: Session, StudentItem: Student, AssignmentId: str) -> AssessmentAttempt:
    Assignment = GetAssessmentAssignmentForStudent(Db, StudentItem, AssignmentId)
    Version = Db.get(AssessmentVersion, Assignment.assessment_version_id)
    if not Version or Version.status != "PUBLISHED":
        api_error(400, "ASSESSMENT_VERSION_NOT_PUBLISHED", "Only published assessment versions can be attempted.")

    LatestAttempt = (
        Db.query(AssessmentAttempt)
        .filter(AssessmentAttempt.assessment_assignment_id == Assignment.id)
        .order_by(AssessmentAttempt.attempt_number.desc())
        .first()
    )
    if LatestAttempt and LatestAttempt.status == "IN_PROGRESS":
        return LatestAttempt
    if LatestAttempt and LatestAttempt.status in {"CLEARED", "NEEDS_RE_ATTEMPT", "SUBMITTED", "AUTO_SUBMITTED"}:
        api_error(400, "ASSESSMENT_ALREADY_ATTEMPTED", "This assessment attempt is already completed. View the result or wait for re-attempt access.")

    QuestionCount = Db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == Version.id).count()
    if QuestionCount <= 0:
        api_error(400, "ASSESSMENT_HAS_NO_QUESTIONS", "This assessment has no generated questions.")

    StartedAt = NowUtc()
    AssignmentType = getattr(Assignment, "assessment_assignment_type", None) or "ORIGINAL"
    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id)
    AttemptNumber = 1
    if AssignmentType == "RE_ATTEMPT":
        LevelId = Blueprint.level_id if Blueprint else None
        AttemptNumber = NextAssessmentAttemptNumberForStudentLevel(Db, StudentItem.id, LevelId)
        LinkedApproval = Db.get(AssessmentReattemptApproval, getattr(Assignment, "reattempt_approval_id", None)) if getattr(Assignment, "reattempt_approval_id", None) else None
        if LinkedApproval and LinkedApproval.next_attempt_number:
            AttemptNumber = int(LinkedApproval.next_attempt_number)

    Attempt = AssessmentAttempt(
        assessment_assignment_id=Assignment.id,
        assessment_version_id=Version.id,
        student_id=StudentItem.id,
        attempt_number=AttemptNumber,
        attempt_type="RE_ATTEMPT" if AssignmentType == "RE_ATTEMPT" else "ORIGINAL",
        status="IN_PROGRESS",
        started_at=StartedAt,
        expires_at=StartedAt + timedelta(seconds=int(Version.duration_seconds or 0)),
        duration_seconds=int(Version.duration_seconds or 0),
        total_questions=QuestionCount,
        max_score=float(Version.total_marks or 100),
    )
    Db.add(Attempt)
    Assignment.status = "IN_PROGRESS"
    Assignment.current_attempt_number = AttemptNumber
    Db.commit()
    Db.refresh(Attempt)
    return Attempt


def AssessmentAttemptPayload(Db: Session, Attempt: AssessmentAttempt) -> dict[str, Any]:
    Assignment = Db.get(AssessmentAssignment, Attempt.assessment_assignment_id)
    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id) if Assignment else None
    Version = Db.get(AssessmentVersion, Attempt.assessment_version_id)
    LevelItem = Db.get(Level, Blueprint.level_id) if Blueprint else None
    ModuleItem = Db.get(Module, Blueprint.module_id) if Blueprint else None
    return {
        "attemptId": Attempt.id,
        "assignmentId": Attempt.assessment_assignment_id,
        "assessmentVersionId": Attempt.assessment_version_id,
        "title": Blueprint.title if Blueprint else "Level Assessment",
        "mode": "ASSESSMENT",
        "status": Attempt.status,
        "moduleCode": ModuleItem.module_code if ModuleItem else None,
        "levelCode": LevelItem.level_code if LevelItem else None,
        "startedAt": Iso(Attempt.started_at),
        "expiresAt": Iso(Attempt.expires_at),
        "remainingSeconds": AssessmentRemainingSeconds(Attempt),
        "totalQuestions": Attempt.total_questions,
        "totalMarks": Version.total_marks if Version else Attempt.max_score,
        "benchmarkPercentage": PASSING_PERCENTAGE,
        "questions": AssessmentQuestionsForAttempt(Db, Attempt) if Attempt.status == "IN_PROGRESS" else [],
        "resultAvailable": Attempt.status != "IN_PROGRESS",
    }


def SaveAssessmentAnswer(Db: Session, StudentItem: Student, AttemptId: str, QuestionId: str, SelectedOptionId: str) -> dict[str, Any]:
    Attempt = GetAssessmentAttemptForStudent(Db, StudentItem, AttemptId)
    if Attempt.status != "IN_PROGRESS":
        return {"status": Attempt.status, "resultAvailable": True}
    if AssessmentRemainingSeconds(Attempt) <= 0:
        Attempt = SubmitAssessmentAttempt(Db, StudentItem, AttemptId, Auto=True)
        return {"status": Attempt.status, "resultAvailable": True}

    Question = Db.get(AssessmentQuestion, QuestionId)
    Option = Db.get(AssessmentQuestionOption, SelectedOptionId)
    if not Question or Question.assessment_version_id != Attempt.assessment_version_id:
        api_error(404, "ASSESSMENT_QUESTION_NOT_FOUND", "Assessment question not found.")
    if not Option or Option.assessment_question_id != Question.id:
        api_error(400, "INVALID_ASSESSMENT_OPTION", "Selected option does not belong to this question.")

    Answer = (
        Db.query(AssessmentAttemptAnswer)
        .filter(
            AssessmentAttemptAnswer.assessment_attempt_id == Attempt.id,
            AssessmentAttemptAnswer.assessment_question_id == Question.id,
        )
        .first()
    )
    if not Answer:
        Answer = AssessmentAttemptAnswer(
            assessment_attempt_id=Attempt.id,
            assessment_question_id=Question.id,
        )
        Db.add(Answer)
    Answer.selected_option_id = Option.id
    Answer.selected_value = Option.option_value
    Answer.is_correct = bool(Option.is_correct)
    Version = Db.get(AssessmentVersion, Attempt.assessment_version_id)
    Answer.marks_awarded = AssessmentQuestionMark(Version, Question) if Option.is_correct else 0.0
    Answer.answered_at = NowUtc()
    Answer.updated_at = NowUtc()

    Attempt.attempted_count = (
        Db.query(AssessmentAttemptAnswer)
        .filter(AssessmentAttemptAnswer.assessment_attempt_id == Attempt.id, AssessmentAttemptAnswer.selected_option_id.isnot(None))
        .count()
    )
    Db.commit()
    return {"saved": True, "status": Attempt.status, "questionId": Question.id, "selectedOptionId": Option.id}


def SubmitAssessmentAttempt(Db: Session, StudentItem: Student, AttemptId: str, Auto: bool = False) -> AssessmentAttempt:
    Attempt = GetAssessmentAttemptForStudent(Db, StudentItem, AttemptId)
    if Attempt.status != "IN_PROGRESS":
        return Attempt

    Version = Db.get(AssessmentVersion, Attempt.assessment_version_id)
    Assignment = Db.get(AssessmentAssignment, Attempt.assessment_assignment_id)
    Questions = Db.query(AssessmentQuestion).filter(AssessmentQuestion.assessment_version_id == Attempt.assessment_version_id).all()
    Answers = {
        Answer.assessment_question_id: Answer
        for Answer in Db.query(AssessmentAttemptAnswer).filter(AssessmentAttemptAnswer.assessment_attempt_id == Attempt.id).all()
    }
    CorrectCount = 0
    WrongCount = 0
    AttemptedCount = 0
    RawScore = 0.0
    TotalQuestions = len(Questions)
    for Question in Questions:
        Answer = Answers.get(Question.id)
        if Answer and Answer.selected_option_id:
            AttemptedCount += 1
            Option = Db.get(AssessmentQuestionOption, Answer.selected_option_id)
            IsCorrect = bool(Option and Option.is_correct)
            QuestionMarks = AssessmentQuestionMark(Version, Question, TotalQuestions)
            Answer.is_correct = IsCorrect
            Answer.selected_value = Option.option_value if Option else Answer.selected_value
            Answer.marks_awarded = QuestionMarks if IsCorrect else 0.0
            if IsCorrect:
                CorrectCount += 1
                RawScore += QuestionMarks
            else:
                WrongCount += 1
    UnansweredCount = max(0, TotalQuestions - AttemptedCount)
    MaxScore = float(Version.total_marks or 100) if Version else 100.0
    Score = NormalizeAssessmentScore(RawScore, MaxScore)
    Percentage = NormalizeAssessmentPercentage(Score, MaxScore)
    Status = ResultStatus(Percentage)
    SubmittedAt = NowUtc()

    Attempt.status = Status
    Attempt.submitted_at = SubmittedAt
    Attempt.attempted_count = AttemptedCount
    Attempt.correct_count = CorrectCount
    Attempt.wrong_count = WrongCount
    Attempt.unanswered_count = UnansweredCount
    Attempt.total_score = Score
    Attempt.max_score = MaxScore
    Attempt.percentage = Percentage
    Attempt.performance_band = PerformanceBand(Percentage)
    Attempt.result_status = Status
    StartedAt = AwareUtc(Attempt.started_at)
    Attempt.time_taken_seconds = max(0, int((SubmittedAt - StartedAt).total_seconds())) if StartedAt else None

    if Assignment:
        Assignment.status = "CLEARED" if Status == "CLEARED" else "NEEDS_RE_ATTEMPT"

    ExistingResult = Db.query(AssessmentResult).filter(AssessmentResult.assessment_attempt_id == Attempt.id).first()
    if not ExistingResult:
        ExistingResult = AssessmentResult(
            assessment_attempt_id=Attempt.id,
            assessment_assignment_id=Attempt.assessment_assignment_id,
            assessment_version_id=Attempt.assessment_version_id,
            blueprint_id=Assignment.blueprint_id if Assignment else "",
            student_id=Attempt.student_id,
        )
        Db.add(ExistingResult)
    ExistingResult.score = Score
    ExistingResult.max_score = MaxScore
    ExistingResult.percentage = Percentage
    ExistingResult.performance_band = PerformanceBand(Percentage)
    ExistingResult.result_status = Status
    ExistingResult.cleared = Status == "CLEARED"
    ExistingResult.level_cleared = Status == "CLEARED"
    ExistingResult.completion_date = SubmittedAt

    if Assignment and Status == "NEEDS_RE_ATTEMPT":
        EnsurePendingAssessmentReattemptApproval(
            Db,
            Assignment,
            Attempt=Attempt,
            Reason="Assessment result is below the 70% benchmark and requires Admin approval for re-attempt access.",
        )

    Db.commit()
    Db.refresh(Attempt)
    return Attempt


def AssessmentResultPayload(Db: Session, Attempt: AssessmentAttempt, IncludeReview: bool = True) -> dict[str, Any]:
    Assignment = Db.get(AssessmentAssignment, Attempt.assessment_assignment_id)
    Blueprint = Db.get(AssessmentBlueprint, Assignment.blueprint_id) if Assignment else None
    Version = Db.get(AssessmentVersion, Attempt.assessment_version_id)
    LevelItem = Db.get(Level, Blueprint.level_id) if Blueprint else None
    ModuleItem = Db.get(Module, Blueprint.module_id) if Blueprint else None
    Result = Db.query(AssessmentResult).filter(AssessmentResult.assessment_attempt_id == Attempt.id).first()
    ProgressionPayload = AssessmentProgressionPayload(Db, Assignment, Result=Result, Attempt=Attempt, LevelItem=LevelItem, ModuleItem=ModuleItem)
    Payload = {
        "attemptId": Attempt.id,
        "assignmentId": Attempt.assessment_assignment_id,
        "assignmentTitle": Blueprint.title if Blueprint else "Level Assessment",
        "assignmentType": "ASSESSMENT",
        "mode": "ASSESSMENT",
        "status": Attempt.status,
        "attemptNumber": Attempt.attempt_number,
        "attemptType": Attempt.attempt_type,
        "attemptLabel": AssessmentAttemptLabel(Attempt.attempt_number, Attempt.attempt_type),
        "score": NormalizeAssessmentScore(Attempt.total_score or 0, Attempt.max_score or (Version.total_marks if Version else 100)),
        "maxScore": float(Attempt.max_score or (Version.total_marks if Version else 100)),
        "accuracyPercentage": NormalizeAssessmentPercentage(Attempt.total_score or 0, Attempt.max_score or (Version.total_marks if Version else 100)),
        "percentage": NormalizeAssessmentPercentage(Attempt.total_score or 0, Attempt.max_score or (Version.total_marks if Version else 100)),
        "correct": int(Attempt.correct_count or 0),
        "wrong": int(Attempt.wrong_count or 0),
        "unanswered": int(Attempt.unanswered_count or 0),
        "timeTakenSeconds": Attempt.time_taken_seconds,
        "benchmarkPercentage": PASSING_PERCENTAGE,
        "benchmarkStatus": "PASS" if Attempt.status == "CLEARED" else "BELOW_BENCHMARK",
        "requiresAttention": Attempt.status != "CLEARED",
        "benchmarkMessage": "Assessment meets the 70% benchmark." if Attempt.status == "CLEARED" else "Assessment is below benchmark and needs re-attempt support.",
        "performanceBand": Attempt.performance_band or PerformanceBand(float(Attempt.percentage or 0)),
        "moduleCode": ModuleItem.module_code if ModuleItem else None,
        "moduleName": ModuleItem.module_name if ModuleItem else None,
        "levelCode": LevelItem.level_code if LevelItem else None,
        "levelName": LevelItem.level_name if LevelItem else None,
        "completedDate": Iso(Result.completion_date if Result else Attempt.submitted_at),
        "submittedAt": Iso(Attempt.submitted_at),
        "attemptDate": Iso(Attempt.started_at),
        **ProgressionPayload,
    }
    if IncludeReview:
        Answers = {
            Answer.assessment_question_id: Answer
            for Answer in Db.query(AssessmentAttemptAnswer).filter(AssessmentAttemptAnswer.assessment_attempt_id == Attempt.id).all()
        }
        Rows = []
        Questions = (
            Db.query(AssessmentQuestion)
            .filter(AssessmentQuestion.assessment_version_id == Attempt.assessment_version_id)
            .order_by(AssessmentQuestion.question_number.asc())
            .all()
        )
        for Question in Questions:
            Options = (
                Db.query(AssessmentQuestionOption)
                .filter(AssessmentQuestionOption.assessment_question_id == Question.id)
                .order_by(AssessmentQuestionOption.display_order.asc(), AssessmentQuestionOption.option_label.asc())
                .all()
            )
            Answer = Answers.get(Question.id)
            Selected = next((Option for Option in Options if Answer and Option.id == Answer.selected_option_id), None)
            Correct = next((Option for Option in Options if Option.is_correct), None)
            Rows.append({
                "questionId": Question.id,
                "questionNumber": Question.question_number,
                "questionText": Question.question_text,
                "operands": SafeJson(Question.operands_json, []),
                "operators": SafeJson(Question.operators_json, []),
                "isCorrect": bool(Answer and Answer.is_correct),
                "selectedOption": {"id": Selected.id, "label": Selected.option_label, "value": Selected.option_value} if Selected else None,
                "correctOption": {"id": Correct.id, "label": Correct.option_label, "value": Correct.option_value} if Correct else None,
            })
        Payload["questionReview"] = Rows
    return Payload
