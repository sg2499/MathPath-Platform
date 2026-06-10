import json
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    CompetitionMockAssignment,
    CompetitionMockAttempt,
    CompetitionMockAttemptAnswer,
    CompetitionMockResultSummary,
    DPS,
    DPSSection,
    Lesson,
    Level,
    Module,
    User,
)
from app.services.generation_service import generate_preview


DEFAULT_COMPETITION_MOCK_QUESTION_COUNT = 60
DEFAULT_COMPETITION_MOCK_DURATION_SECONDS = 1800
DEFAULT_COMPETITION_MARKS_PER_QUESTION = 1


MM_COMPETITION_SECTION_DEFINITIONS: list[dict[str, Any]] = [
    {
        "key": "MM_ABACUS_ADD_LESS",
        "number": 1,
        "title": "Section 1 (With Abacus) - Add/Less",
    },
    {
        "key": "MM_VISUAL_ADD_LESS",
        "number": 2,
        "title": "Section 2 (Visual) - Add/Less",
    },
    {
        "key": "MM_MULTIPLICATION",
        "number": 3,
        "title": "Section 3 - Multiplication",
    },
    {
        "key": "MM_DIVISION",
        "number": 4,
        "title": "Section 4 - Division",
    },
    {
        "key": "MM_POSITIONAL_PLACEMENT",
        "number": 5,
        "title": "Section 5 - Positional & Placement",
    },
    {
        "key": "MM_BODMAS_PERCENTAGE",
        "number": 6,
        "title": "Section 6 - BODMAS, Add/Less Percentage",
    },
    {
        "key": "MM_FINANCIAL",
        "number": 7,
        "title": "Section 7 - Profit/Loss, Simple Interest, Selling Price",
    },
    {
        "key": "MM_SKILL_DRILL",
        "number": 8,
        "title": "Section 8 - Skill Stacker, Concept Drill",
    },
]

MM_COMPETITION_SECTION_BY_KEY = {Row["key"]: Row for Row in MM_COMPETITION_SECTION_DEFINITIONS}


MM_DEFAULT_SECTION_COUNT_FLOOR = 0


def CompetitionMockSectionPlan(db: Session, *, LevelId: str, TotalQuestions: int | None = None) -> dict[str, Any]:
    ModuleRecord, LevelRecord, Lessons, DpsRows = _LevelRecords(db, LevelId)
    RequestedQuestionCount = int(TotalQuestions or DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)
    if _IsMasterModule(ModuleRecord):
        Base = RequestedQuestionCount // len(MM_COMPETITION_SECTION_DEFINITIONS)
        Remainder = RequestedQuestionCount % len(MM_COMPETITION_SECTION_DEFINITIONS)
        Sections = []
        for Index, Section in enumerate(MM_COMPETITION_SECTION_DEFINITIONS):
            Sections.append({
                "sectionKey": Section["key"],
                "sectionNumber": Section["number"],
                "sectionTitle": Section["title"],
                "questionCount": Base + (1 if Index < Remainder else 0),
                "locked": False,
            })
        return {
            "moduleId": ModuleRecord.id,
            "moduleCode": ModuleRecord.module_code,
            "moduleName": ModuleRecord.module_name,
            "levelId": LevelRecord.id,
            "levelCode": LevelRecord.level_code,
            "levelName": LevelRecord.level_name,
            "totalQuestions": RequestedQuestionCount,
            "structure": "MM_8_SECTION_COMPETITION_MOCK",
            "sections": Sections,
        }

    SectionsByDps = _ActiveSectionsByDps(db, DpsRows)
    UniqueSections: dict[str, dict[str, Any]] = {}
    for DpsRecord in DpsRows:
        for Section in SectionsByDps.get(DpsRecord.id, []):
            Title = _NormalizeText(Section.section_title) or _NormalizeText(Section.concept_family) or DpsRecord.dps_title
            Key = Title.upper().replace(" ", "_")[:80]
            if Key not in UniqueSections:
                UniqueSections[Key] = {
                    "sectionKey": Key,
                    "sectionNumber": len(UniqueSections) + 1,
                    "sectionTitle": Title,
                    "questionCount": 0,
                    "locked": False,
                }
    if not UniqueSections:
        UniqueSections["GENERAL_COMPETITION_PRACTICE"] = {
            "sectionKey": "GENERAL_COMPETITION_PRACTICE",
            "sectionNumber": 1,
            "sectionTitle": "Competition Practice",
            "questionCount": RequestedQuestionCount,
            "locked": False,
        }
    Base = RequestedQuestionCount // len(UniqueSections)
    Remainder = RequestedQuestionCount % len(UniqueSections)
    Sections = list(UniqueSections.values())
    for Index, Section in enumerate(Sections):
        Section["questionCount"] = Base + (1 if Index < Remainder else 0)
    return {
        "moduleId": ModuleRecord.id,
        "moduleCode": ModuleRecord.module_code,
        "moduleName": ModuleRecord.module_name,
        "levelId": LevelRecord.id,
        "levelCode": LevelRecord.level_code,
        "levelName": LevelRecord.level_name,
        "totalQuestions": RequestedQuestionCount,
        "structure": "LEVEL_SECTION_COMPETITION_MOCK",
        "sections": Sections,
    }


def _NormalizeSectionCounts(SectionCounts: dict[str, Any] | None) -> dict[str, int]:
    Normalized: dict[str, int] = {}
    for Key, Value in (SectionCounts or {}).items():
        CleanKey = _NormalizeText(Key)
        if not CleanKey:
            continue
        try:
            Count = int(Value)
        except Exception:
            Count = 0
        if Count > 0:
            Normalized[CleanKey] = Count
    return Normalized


def _SafeJsonLoads(Value: str | None, Fallback: Any) -> Any:
    if not Value:
        return Fallback
    try:
        return json.loads(Value)
    except Exception:
        return Fallback


def _NormalizeText(Value: Any) -> str:
    return str(Value or "").strip()


def _NormalizedSearchText(*Values: Any) -> str:
    return " ".join(_NormalizeText(Value).lower() for Value in Values if _NormalizeText(Value))


def _IsMasterModule(ModuleRecord: Module) -> bool:
    ModuleCode = _NormalizeText(getattr(ModuleRecord, "module_code", "")).upper()
    ModuleName = _NormalizeText(getattr(ModuleRecord, "module_name", "")).lower()
    return ModuleCode == "MM" or "master module" in ModuleName


def _QuestionSourceText(Question: dict[str, Any], FallbackTitle: str) -> str:
    Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
    return _NormalizedSearchText(
        Metadata.get("sectionTitle"),
        Metadata.get("section_title"),
        Metadata.get("conceptFamily"),
        Metadata.get("concept_family"),
        Metadata.get("competitionConceptKey"),
        Metadata.get("sourceDpsTitle"),
        FallbackTitle,
        Question.get("question_text"),
    )


def _QuestionMetadata(Question: dict[str, Any]) -> dict[str, Any]:
    Metadata = Question.get("metadata")
    return Metadata if isinstance(Metadata, dict) else {}


def _QuestionConceptFamily(Question: dict[str, Any], FallbackTitle: str) -> str:
    Metadata = _QuestionMetadata(Question)
    RawConcept = (
        Metadata.get("concept_family")
        or Metadata.get("conceptFamily")
        or Metadata.get("competitionConceptKey")
        or FallbackTitle
    )
    return _NormalizeText(RawConcept).upper()


def _QuestionSectionTitleText(Question: dict[str, Any], FallbackTitle: str) -> str:
    Metadata = _QuestionMetadata(Question)
    return _NormalizedSearchText(
        Metadata.get("section_title"),
        Metadata.get("sectionTitle"),
        Metadata.get("source_section_title"),
        Metadata.get("sourceSectionTitle"),
        FallbackTitle,
        Question.get("question_text"),
    )


def _MmCompetitionSectionKeys(Question: dict[str, Any], FallbackTitle: str) -> list[str]:
    """Map generated MM questions into the approved 8 competition sections.

    The competition mock must reuse Learning Path Studio's MM generators while
    grouping generated questions by competition-family.  The mapping is based on
    the generator's concept-family metadata first and text only as a fallback so
    stale titles or section labels do not narrow a competition section to one
    small worksheet subtype.
    """
    ConceptFamily = _QuestionConceptFamily(Question, FallbackTitle)
    Text = _QuestionSourceText(Question, FallbackTitle)
    SectionText = _QuestionSectionTitleText(Question, FallbackTitle)

    SkillDrillFamilies = {"SKILL_STACKER", "CONCEPT_DRILL"}
    FinancialFamilies = {"SIMPLE_INTEREST", "PROFIT_LOSS", "FIND_SELLING_PRICE", "FIND_COST_PRICE"}
    BodmasPercentageFamilies = {"BODMAS", "PERCENTAGE_ADD_LESS", "PERCENTAGE_VALUE", "PERCENTAGE_INCREASE_DECREASE", "SOLVE_EQUATION"}
    PositionalFamilies = {"ANSWER_POSITION"}
    AddLessFamilies = {"ADD_LESS", "DECIMAL_ADD_LESS", "INTEGERS"}
    MultiplicationFamilies = {"WHOLE_NUMBER_MULTIPLICATION", "DECIMAL_MULTIPLICATION", "SQUARES", "CUBES", "MIXED_SQUARE_CUBE"}
    DivisionFamilies = {"WHOLE_NUMBER_DIVISION", "DECIMAL_DIVISION", "SQUARE_ROOT", "CUBE_ROOT", "MIXED_ROOTS"}

    if ConceptFamily in SkillDrillFamilies or any(Term in Text for Term in ["skill stacker", "concept drill"]):
        return ["MM_SKILL_DRILL"]

    if ConceptFamily in FinancialFamilies or any(Term in Text for Term in ["profit", "loss", "simple interest", "selling price", "cost price"]):
        return ["MM_FINANCIAL"]

    if ConceptFamily in BodmasPercentageFamilies or any(Term in Text for Term in ["bodmas", "percentage", "percent", "add percentage", "less percentage", "solve equation"]):
        return ["MM_BODMAS_PERCENTAGE"]

    if ConceptFamily in PositionalFamilies or any(Term in Text for Term in ["position", "placement", "natural number"]):
        return ["MM_POSITIONAL_PLACEMENT"]

    if ConceptFamily in AddLessFamilies or any(Term in Text for Term in ["add-less", "add less", "add/less", "borrowing", "integer", "fast visualisation", "fast visualization"]):
        # Both approved Add/Less competition sections must draw from the full MM
        # Add/Less family: ordinary stacks, decimals, fast visualisation,
        # integers, borrowing, exact digit sheets, and related workbook-valid
        # Add/Less variants.  Do not narrow Section 2 to only visual titles.
        return ["MM_ABACUS_ADD_LESS", "MM_VISUAL_ADD_LESS"]

    if ConceptFamily == "MULTIPLICATION_DIVISION_MIXED":
        if any(Term in SectionText for Term in ["division", "divide", "÷"]):
            return ["MM_DIVISION"]
        if any(Term in SectionText for Term in ["multiplication", " x ", "×", "times"]):
            return ["MM_MULTIPLICATION"]
        return ["MM_MULTIPLICATION", "MM_DIVISION"]

    if ConceptFamily in DivisionFamilies or any(Term in Text for Term in ["division", "÷", "divide"]):
        return ["MM_DIVISION"]

    if ConceptFamily in MultiplicationFamilies or any(Term in Text for Term in ["multiplication", "×", " x ", "times", "square", "cube"]):
        return ["MM_MULTIPLICATION"]

    return []


def _QuestionSignature(Question: dict[str, Any]) -> str:
    Metadata = _QuestionMetadata(Question)
    return "|".join([
        _NormalizeText(Metadata.get("sourceDpsId")),
        _NormalizeText(Metadata.get("sourceQuestionNumber") or Question.get("question_number")),
        _NormalizeText(Question.get("question_text")),
        json.dumps(Question.get("operands") or [], sort_keys=True, default=str),
        json.dumps(Question.get("operators") or [], sort_keys=True, default=str),
        _NormalizeText(Question.get("correct_answer")),
    ])


def _AllocateCompetitionSectionCounts(TargetQuestionCount: int, AvailableBySection: dict[str, int]) -> dict[str, int]:
    ActiveSections = [
        Section["key"]
        for Section in MM_COMPETITION_SECTION_DEFINITIONS
        if AvailableBySection.get(Section["key"], 0) > 0
    ]
    if not ActiveSections:
        return {}

    Requested = max(1, TargetQuestionCount)
    Counts = {SectionKey: 0 for SectionKey in ActiveSections}
    Base = Requested // len(ActiveSections)
    Remainder = Requested % len(ActiveSections)
    for Index, SectionKey in enumerate(ActiveSections):
        Counts[SectionKey] = Base + (1 if Index < Remainder else 0)

    RemainingToAllocate = 0
    for SectionKey in list(Counts.keys()):
        Available = AvailableBySection.get(SectionKey, 0)
        if Counts[SectionKey] > Available:
            RemainingToAllocate += Counts[SectionKey] - Available
            Counts[SectionKey] = Available

    while RemainingToAllocate > 0:
        Added = False
        for SectionKey in ActiveSections:
            Available = AvailableBySection.get(SectionKey, 0)
            if Counts[SectionKey] < Available:
                Counts[SectionKey] += 1
                RemainingToAllocate -= 1
                Added = True
                if RemainingToAllocate <= 0:
                    break
        if not Added:
            break

    return {Key: Value for Key, Value in Counts.items() if Value > 0}


def _RoundRobinSelectFromConceptBuckets(
    ConceptBuckets: dict[str, list[dict[str, Any]]],
    RequiredCount: int,
    ExcludedSignatures: set[str] | None = None,
) -> list[dict[str, Any]]:
    Selected: list[dict[str, Any]] = []
    OrderedConcepts = sorted(ConceptBuckets.keys())
    CursorByConcept = {Concept: 0 for Concept in OrderedConcepts}
    Blocked = ExcludedSignatures or set()
    while len(Selected) < RequiredCount:
        AddedInPass = False
        for Concept in OrderedConcepts:
            Bucket = ConceptBuckets[Concept]
            Cursor = CursorByConcept[Concept]
            while Cursor < len(Bucket) and _QuestionSignature(Bucket[Cursor]) in Blocked:
                Cursor += 1
            CursorByConcept[Concept] = Cursor
            if Cursor < len(Bucket):
                Selected.append(Bucket[Cursor])
                CursorByConcept[Concept] = Cursor + 1
                AddedInPass = True
                if len(Selected) >= RequiredCount:
                    break
        if not AddedInPass:
            break
    return Selected


def _QuestionConceptKey(Question: dict[str, Any], FallbackTitle: str) -> str:
    Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
    return (
        _NormalizeText(Metadata.get("sectionTitle"))
        or _NormalizeText(Metadata.get("section_title"))
        or _NormalizeText(Metadata.get("conceptFamily"))
        or _NormalizeText(FallbackTitle)
        or "Competition Practice"
    )


def _QuestionSectionNumber(Question: dict[str, Any], FallbackNumber: int) -> int:
    Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
    try:
        return int(Metadata.get("section_number") or Metadata.get("sectionNumber") or FallbackNumber)
    except Exception:
        return FallbackNumber


def _BuildMockCode(ModuleCode: str, LevelCode: str) -> str:
    Timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    Suffix = uuid4().hex[:6].upper()
    return f"CMP-{ModuleCode}-{LevelCode}-{Timestamp}-{Suffix}".replace(" ", "-")


def _LevelRecords(db: Session, LevelId: str) -> tuple[Module, Level, list[Lesson], list[DPS]]:
    LevelRecord = db.get(Level, LevelId)
    if not LevelRecord or not LevelRecord.is_active:
        api_error(404, "LEVEL_NOT_FOUND", "The selected level was not found or is inactive.")
    ModuleRecord = db.get(Module, LevelRecord.module_id)
    if not ModuleRecord or not ModuleRecord.is_active:
        api_error(404, "MODULE_NOT_FOUND", "The selected module was not found or is inactive.")

    Lessons = (
        db.query(Lesson)
        .filter(Lesson.level_id == LevelRecord.id, Lesson.is_active == True)
        .order_by(Lesson.lesson_number.asc())
        .all()
    )
    LessonIds = [LessonRecord.id for LessonRecord in Lessons]
    DpsRows = (
        db.query(DPS)
        .filter(DPS.lesson_id.in_(LessonIds), DPS.is_active == True)
        .order_by(DPS.dps_number.asc())
        .all()
        if LessonIds
        else []
    )
    if not DpsRows:
        api_error(400, "NO_DPS_FOUND", "No active DPS records were found for the selected level.")
    return ModuleRecord, LevelRecord, Lessons, DpsRows


def _ActiveSectionsByDps(db: Session, DpsRows: list[DPS]) -> dict[str, list[DPSSection]]:
    DpsIds = [Row.id for Row in DpsRows]
    Sections = (
        db.query(DPSSection)
        .filter(DPSSection.dps_id.in_(DpsIds))
        .order_by(DPSSection.section_number.asc())
        .all()
        if DpsIds
        else []
    )
    ByDps: dict[str, list[DPSSection]] = defaultdict(list)
    for Section in Sections:
        ByDps[Section.dps_id].append(Section)
    return ByDps


def _CompetitionInstructions(ModuleRecord: Module, LevelRecord: Level, TotalQuestions: int, DurationSeconds: int) -> str:
    Minutes = max(1, round(DurationSeconds / 60))
    return (
        f"Competition-style mock practice for {ModuleRecord.module_name} / {LevelRecord.level_name}. "
        f"Answer all {TotalQuestions} questions within {Minutes} minutes. "
        "Focus on speed, accuracy, time management, and calm exam temperament."
    )


def _CollectGeneratedQuestions(db: Session, ModuleRecord: Module, DpsRows: list[DPS], TargetQuestionCount: int, SectionCountsOverride: dict[str, int] | None = None) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    SectionsByDps = _ActiveSectionsByDps(db, DpsRows)
    GeneratedByConcept: dict[str, list[dict[str, Any]]] = defaultdict(list)
    MmGeneratedBySection: dict[str, dict[str, list[dict[str, Any]]]] = defaultdict(lambda: defaultdict(list))
    CoverageRows: list[dict[str, Any]] = []
    GenerationErrors: list[dict[str, Any]] = []
    IsMmMock = _IsMasterModule(ModuleRecord)

    for DpsRecord in DpsRows:
        Seed = f"COMPETITION-MOCK-DRAFT-{DpsRecord.id}-{uuid4().hex}"
        Sections = SectionsByDps.get(DpsRecord.id, [])
        try:
            Questions = generate_preview(db, DpsRecord, Seed)
        except Exception as Error:
            GenerationErrors.append({
                "dpsId": DpsRecord.id,
                "dpsTitle": DpsRecord.dps_title,
                "error": str(Error),
            })
            continue

        for Question in Questions:
            ConceptKey = _QuestionConceptKey(Question, DpsRecord.dps_title)
            QuestionCopy = dict(Question)
            Metadata = QuestionCopy.get("metadata") if isinstance(QuestionCopy.get("metadata"), dict) else {}
            Metadata = dict(Metadata)
            Metadata.update({
                "sourceDpsId": DpsRecord.id,
                "sourceDpsTitle": DpsRecord.dps_title,
                "sourceLessonId": DpsRecord.lesson_id,
                "competitionConceptKey": ConceptKey,
            })
            QuestionCopy["metadata"] = Metadata
            if IsMmMock:
                SectionKeys = _MmCompetitionSectionKeys(QuestionCopy, DpsRecord.dps_title)
                if SectionKeys:
                    for SectionKey in SectionKeys:
                        MmGeneratedBySection[SectionKey][ConceptKey].append(dict(QuestionCopy))
                else:
                    GeneratedByConcept[ConceptKey].append(QuestionCopy)
            else:
                GeneratedByConcept[ConceptKey].append(QuestionCopy)

        CoverageRows.append({
            "dpsId": DpsRecord.id,
            "dpsNumber": DpsRecord.dps_number,
            "dpsTitle": DpsRecord.dps_title,
            "sections": [
                {
                    "sectionNumber": Section.section_number,
                    "sectionTitle": Section.section_title,
                    "conceptFamily": Section.concept_family,
                    "questionCount": Section.question_count,
                }
                for Section in Sections
            ],
            "generatedQuestionCount": len(Questions),
        })

    if IsMmMock:
        AvailableBySection = {
            SectionKey: sum(len(Questions) for Questions in ConceptBuckets.values())
            for SectionKey, ConceptBuckets in MmGeneratedBySection.items()
        }
        SectionCounts = SectionCountsOverride or _AllocateCompetitionSectionCounts(TargetQuestionCount, AvailableBySection)
        Selected: list[dict[str, Any]] = []
        SectionCoverage: list[dict[str, Any]] = []
        UsedQuestionSignatures: set[str] = set()
        for SectionDefinition in MM_COMPETITION_SECTION_DEFINITIONS:
            SectionKey = SectionDefinition["key"]
            RequiredCount = SectionCounts.get(SectionKey, 0)
            ConceptBuckets = MmGeneratedBySection.get(SectionKey, {})
            SectionSelected = _RoundRobinSelectFromConceptBuckets(ConceptBuckets, RequiredCount, UsedQuestionSignatures)
            if len(SectionSelected) < RequiredCount:
                FallbackSelected = _RoundRobinSelectFromConceptBuckets(ConceptBuckets, RequiredCount - len(SectionSelected))
                Existing = {_QuestionSignature(Question) for Question in SectionSelected}
                for Question in FallbackSelected:
                    Signature = _QuestionSignature(Question)
                    if Signature not in Existing:
                        SectionSelected.append(Question)
                        Existing.add(Signature)
                    if len(SectionSelected) >= RequiredCount:
                        break
            for Question in SectionSelected:
                UsedQuestionSignatures.add(_QuestionSignature(Question))
                Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
                Metadata = dict(Metadata)
                Metadata.update({
                    "competitionSectionKey": SectionKey,
                    "competitionSectionNumber": SectionDefinition["number"],
                    "competitionSectionTitle": SectionDefinition["title"],
                })
                Question["metadata"] = Metadata
            Selected.extend(SectionSelected)
            SectionCoverage.append({
                "sectionKey": SectionKey,
                "sectionNumber": SectionDefinition["number"],
                "sectionTitle": SectionDefinition["title"],
                "availableQuestionCount": AvailableBySection.get(SectionKey, 0),
                "selectedQuestionCount": len(SectionSelected),
                "concepts": [
                    {"conceptName": Concept, "availableQuestionCount": len(Questions)}
                    for Concept, Questions in sorted(ConceptBuckets.items())
                ],
            })

        if not Selected:
            api_error(
                400,
                "COMPETITION_GENERATION_EMPTY",
                "No Master Module competition mock questions could be generated for this level.",
                {"generationErrors": GenerationErrors},
            )

        CoveragePayload = {
            "targetQuestionCount": TargetQuestionCount,
            "selectedQuestionCount": len(Selected),
            "competitionStructure": "MM_8_SECTION_COMPETITION_MOCK",
            "sectionCount": len([Row for Row in SectionCoverage if Row["selectedQuestionCount"] > 0]),
            "sections": SectionCoverage,
            "uncategorizedConcepts": [
                {"conceptName": Concept, "availableQuestionCount": len(GeneratedByConcept[Concept])}
                for Concept in sorted(GeneratedByConcept.keys())
            ],
            "dpsCoverage": CoverageRows,
            "generationErrors": GenerationErrors,
        }
        return Selected, CoveragePayload

    if not GeneratedByConcept:
        api_error(
            400,
            "COMPETITION_GENERATION_EMPTY",
            "No competition mock questions could be generated for this level.",
            {"generationErrors": GenerationErrors},
        )

    OrderedConcepts = sorted(GeneratedByConcept.keys())
    Selected = []
    CursorByConcept = {Concept: 0 for Concept in OrderedConcepts}

    while len(Selected) < TargetQuestionCount:
        AddedInPass = False
        for Concept in OrderedConcepts:
            Bucket = GeneratedByConcept[Concept]
            Cursor = CursorByConcept[Concept]
            if Cursor < len(Bucket):
                Selected.append(Bucket[Cursor])
                CursorByConcept[Concept] = Cursor + 1
                AddedInPass = True
                if len(Selected) >= TargetQuestionCount:
                    break
        if not AddedInPass:
            break

    if not Selected:
        api_error(400, "COMPETITION_GENERATION_EMPTY", "No competition mock questions were selected.")

    CoveragePayload = {
        "targetQuestionCount": TargetQuestionCount,
        "selectedQuestionCount": len(Selected),
        "conceptCount": len(OrderedConcepts),
        "concepts": [
            {"conceptName": Concept, "availableQuestionCount": len(GeneratedByConcept[Concept])}
            for Concept in OrderedConcepts
        ],
        "dpsCoverage": CoverageRows,
        "generationErrors": GenerationErrors,
    }
    return Selected, CoveragePayload


def _StoreQuestionOptions(db: Session, QuestionRecord: CompetitionMockQuestion, Options: list[dict[str, Any]]) -> None:
    Labels = ["A", "B", "C", "D", "E", "F"]
    for Index, Option in enumerate(Options or []):
        Label = _NormalizeText(Option.get("label")) or Labels[Index] if Index < len(Labels) else str(Index + 1)
        db.add(CompetitionMockQuestionOption(
            mock_question_id=QuestionRecord.id,
            option_label=Label[:1],
            option_value=str(Option.get("value", "")),
            is_correct=bool(Option.get("is_correct")),
            display_order=int(Option.get("display_order") or Index + 1),
        ))


def GenerateCompetitionMockDraft(
    db: Session,
    *,
    LevelId: str,
    CreatedBy: User,
    Title: str | None = None,
    TotalQuestions: int | None = None,
    DurationSeconds: int | None = None,
    CompetitionScope: str = "GENERAL",
    DifficultyBand: str = "COMPETITION",
    SectionCounts: dict[str, Any] | None = None,
) -> dict[str, Any]:
    ModuleRecord, LevelRecord, Lessons, DpsRows = _LevelRecords(db, LevelId)
    SectionCountsOverride = _NormalizeSectionCounts(SectionCounts)
    RequestedQuestionCount = int(TotalQuestions or sum(SectionCountsOverride.values()) or DEFAULT_COMPETITION_MOCK_QUESTION_COUNT)
    if RequestedQuestionCount < 10:
        api_error(400, "INVALID_QUESTION_COUNT", "Competition mock exams must contain at least 10 questions.")
    if RequestedQuestionCount > 150:
        api_error(400, "INVALID_QUESTION_COUNT", "Competition mock exams cannot exceed 150 questions in this package.")

    RequestedDurationSeconds = int(DurationSeconds or DEFAULT_COMPETITION_MOCK_DURATION_SECONDS)
    if RequestedDurationSeconds < 300:
        api_error(400, "INVALID_DURATION", "Competition mock duration must be at least 5 minutes.")

    if SectionCountsOverride:
        RequestedQuestionCount = sum(SectionCountsOverride.values())
    SelectedQuestions, CoveragePayload = _CollectGeneratedQuestions(db, ModuleRecord, DpsRows, RequestedQuestionCount, SectionCountsOverride)
    ActualQuestionCount = len(SelectedQuestions)
    MockCode = _BuildMockCode(ModuleRecord.module_code, LevelRecord.level_code)
    MockTitle = Title or f"{LevelRecord.level_code} Competition Mock Practice {datetime.now(timezone.utc).strftime('%d %b %Y %H:%M')}"

    ExamRecord = CompetitionMockExam(
        title=MockTitle,
        mock_code=MockCode,
        module_id=ModuleRecord.id,
        level_id=LevelRecord.id,
        competition_scope=CompetitionScope or "GENERAL",
        difficulty_band=DifficultyBand or "COMPETITION",
        total_questions=ActualQuestionCount,
        total_marks=ActualQuestionCount * DEFAULT_COMPETITION_MARKS_PER_QUESTION,
        marks_per_question=DEFAULT_COMPETITION_MARKS_PER_QUESTION,
        duration_seconds=RequestedDurationSeconds,
        status="DRAFT",
        instructions=_CompetitionInstructions(ModuleRecord, LevelRecord, ActualQuestionCount, RequestedDurationSeconds),
        syllabus_coverage_json=json.dumps(CoveragePayload),
        generation_config_json=json.dumps({
            "engine": "COMPETITION_MOCK_GENERATOR_FOUNDATION",
            "requestedQuestionCount": RequestedQuestionCount,
            "actualQuestionCount": ActualQuestionCount,
            "source": "LEVEL_DPS_GENERATORS",
            "competitionStructure": CoveragePayload.get("competitionStructure", "BALANCED_CONCEPT_ROTATION"),
            "sectionCounts": SectionCountsOverride,
        }),
        created_by_user_id=CreatedBy.id if CreatedBy else None,
        is_active=True,
    )
    db.add(ExamRecord)
    db.flush()

    ConceptSectionNumbers: dict[str, int] = {}
    for Index, Question in enumerate(SelectedQuestions, start=1):
        Metadata = Question.get("metadata") if isinstance(Question.get("metadata"), dict) else {}
        ConceptKey = _QuestionConceptKey(Question, f"Section {Index}")
        ExistingSectionNumber = Metadata.get("competitionSectionNumber")
        ExistingSectionTitle = _NormalizeText(Metadata.get("competitionSectionTitle"))
        if ExistingSectionNumber and ExistingSectionTitle:
            try:
                SectionNumber = int(ExistingSectionNumber)
            except Exception:
                SectionNumber = len(ConceptSectionNumbers) + 1
            SectionTitle = ExistingSectionTitle
        else:
            if ConceptKey not in ConceptSectionNumbers:
                ConceptSectionNumbers[ConceptKey] = len(ConceptSectionNumbers) + 1
            SectionNumber = ConceptSectionNumbers[ConceptKey]
            SectionTitle = ConceptKey
        QuestionMetadata = dict(Metadata)
        QuestionMetadata.update({
            "competitionSectionNumber": SectionNumber,
            "competitionSectionTitle": SectionTitle,
            "sourceQuestionNumber": Question.get("question_number"),
        })
        QuestionRecord = CompetitionMockQuestion(
            mock_exam_id=ExamRecord.id,
            section_number=SectionNumber,
            section_title=SectionTitle,
            question_number=Index,
            display_type=str(Question.get("display_type") or "VERTICAL"),
            question_text=Question.get("question_text"),
            operands_json=json.dumps(Question.get("operands") or []),
            operators_json=json.dumps(Question.get("operators") or []),
            correct_answer=str(Question.get("correct_answer")),
            explanation=Question.get("explanation"),
            difficulty=str(Question.get("difficulty") or DifficultyBand or "COMPETITION"),
            concept_family=str(Metadata.get("conceptFamily") or Metadata.get("concept_family") or ConceptKey)[:100],
            concept_tag=ConceptKey[:100],
            source_type="LEVEL_DPS_GENERATOR",
            source_reference_id=str(Metadata.get("sourceDpsId") or ""),
            seed=str(Question.get("seed") or ""),
            marks=DEFAULT_COMPETITION_MARKS_PER_QUESTION,
            metadata_json=json.dumps(QuestionMetadata),
        )
        db.add(QuestionRecord)
        db.flush()
        _StoreQuestionOptions(db, QuestionRecord, Question.get("options") or [])

    db.commit()
    db.refresh(ExamRecord)
    return CompetitionMockExamPayload(db, ExamRecord, IncludeQuestions=True)



def DeleteCompetitionMockExam(db: Session, *, MockExamId: str) -> dict[str, Any]:
    ExamRecord = db.get(CompetitionMockExam, MockExamId)
    if not ExamRecord:
        api_error(404, "COMPETITION_MOCK_NOT_FOUND", "Competition mock exam was not found.")

    Questions = db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.mock_exam_id == MockExamId).all()
    QuestionIds = [Question.id for Question in Questions]
    Assignments = db.query(CompetitionMockAssignment).filter(CompetitionMockAssignment.mock_exam_id == MockExamId).all()
    AssignmentIds = [Assignment.id for Assignment in Assignments]
    Attempts = db.query(CompetitionMockAttempt).filter(CompetitionMockAttempt.mock_exam_id == MockExamId).all()
    AttemptIds = [Attempt.id for Attempt in Attempts]

    DeletedSummary = {
        "mockExamId": MockExamId,
        "title": ExamRecord.title,
        "questionsDeleted": len(QuestionIds),
        "assignmentsDeleted": len(AssignmentIds),
        "attemptsDeleted": len(AttemptIds),
    }

    if AttemptIds:
        db.query(CompetitionMockResultSummary).filter(CompetitionMockResultSummary.mock_attempt_id.in_(AttemptIds)).delete(synchronize_session=False)
        db.query(CompetitionMockAttemptAnswer).filter(CompetitionMockAttemptAnswer.mock_attempt_id.in_(AttemptIds)).delete(synchronize_session=False)
    if QuestionIds:
        db.query(CompetitionMockQuestionOption).filter(CompetitionMockQuestionOption.mock_question_id.in_(QuestionIds)).delete(synchronize_session=False)
    db.query(CompetitionMockAttempt).filter(CompetitionMockAttempt.mock_exam_id == MockExamId).delete(synchronize_session=False)
    db.query(CompetitionMockAssignment).filter(CompetitionMockAssignment.mock_exam_id == MockExamId).delete(synchronize_session=False)
    db.query(CompetitionMockQuestion).filter(CompetitionMockQuestion.mock_exam_id == MockExamId).delete(synchronize_session=False)
    db.delete(ExamRecord)
    db.commit()
    return DeletedSummary


def ArchiveCompetitionMockExam(db: Session, *, MockExamId: str) -> dict[str, Any]:
    ExamRecord = db.get(CompetitionMockExam, MockExamId)
    if not ExamRecord or not ExamRecord.is_active:
        api_error(404, "COMPETITION_MOCK_NOT_FOUND", "Competition mock exam was not found.")

    ExamRecord.status = "ARCHIVED"
    ExamRecord.archived_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ExamRecord)
    return CompetitionMockExamPayload(db, ExamRecord, IncludeQuestions=False)

def CompetitionMockExamPayload(db: Session, ExamRecord: CompetitionMockExam, IncludeQuestions: bool = False) -> dict[str, Any]:
    ModuleRecord = db.get(Module, ExamRecord.module_id)
    LevelRecord = db.get(Level, ExamRecord.level_id)
    Payload: dict[str, Any] = {
        "mockExamId": ExamRecord.id,
        "mockCode": ExamRecord.mock_code,
        "title": ExamRecord.title,
        "moduleId": ExamRecord.module_id,
        "moduleCode": ModuleRecord.module_code if ModuleRecord else None,
        "moduleName": ModuleRecord.module_name if ModuleRecord else None,
        "levelId": ExamRecord.level_id,
        "levelCode": LevelRecord.level_code if LevelRecord else None,
        "levelName": LevelRecord.level_name if LevelRecord else None,
        "competitionScope": ExamRecord.competition_scope,
        "difficultyBand": ExamRecord.difficulty_band,
        "totalQuestions": ExamRecord.total_questions,
        "totalMarks": ExamRecord.total_marks,
        "marksPerQuestion": ExamRecord.marks_per_question,
        "durationSeconds": ExamRecord.duration_seconds,
        "status": ExamRecord.status,
        "instructions": ExamRecord.instructions,
        "syllabusCoverage": _SafeJsonLoads(ExamRecord.syllabus_coverage_json, {}),
        "generationConfig": _SafeJsonLoads(ExamRecord.generation_config_json, {}),
        "createdAt": ExamRecord.created_at.isoformat() if ExamRecord.created_at else None,
        "updatedAt": ExamRecord.updated_at.isoformat() if ExamRecord.updated_at else None,
        "archivedAt": ExamRecord.archived_at.isoformat() if ExamRecord.archived_at else None,
    }
    if IncludeQuestions:
        Questions = (
            db.query(CompetitionMockQuestion)
            .filter(CompetitionMockQuestion.mock_exam_id == ExamRecord.id)
            .order_by(CompetitionMockQuestion.question_number.asc())
            .all()
        )
        OptionsByQuestion: dict[str, list[CompetitionMockQuestionOption]] = defaultdict(list)
        if Questions:
            Options = (
                db.query(CompetitionMockQuestionOption)
                .filter(CompetitionMockQuestionOption.mock_question_id.in_([Question.id for Question in Questions]))
                .order_by(CompetitionMockQuestionOption.display_order.asc())
                .all()
            )
            for Option in Options:
                OptionsByQuestion[Option.mock_question_id].append(Option)
        Payload["questions"] = [
            {
                "mockQuestionId": Question.id,
                "sectionNumber": Question.section_number,
                "sectionTitle": Question.section_title,
                "questionNumber": Question.question_number,
                "displayType": Question.display_type,
                "questionText": Question.question_text,
                "operands": _SafeJsonLoads(Question.operands_json, []),
                "operators": _SafeJsonLoads(Question.operators_json, []),
                "correctAnswer": Question.correct_answer,
                "difficulty": Question.difficulty,
                "conceptFamily": Question.concept_family,
                "conceptTag": Question.concept_tag,
                "options": [
                    {
                        "optionId": Option.id,
                        "label": Option.option_label,
                        "value": Option.option_value,
                        "isCorrect": Option.is_correct,
                        "displayOrder": Option.display_order,
                    }
                    for Option in OptionsByQuestion.get(Question.id, [])
                ],
            }
            for Question in Questions
        ]
    return Payload


def ListCompetitionMockDrafts(db: Session, LevelId: str | None = None) -> list[dict[str, Any]]:
    Query = db.query(CompetitionMockExam).filter(CompetitionMockExam.is_active == True)
    if LevelId:
        Query = Query.filter(CompetitionMockExam.level_id == LevelId)
    Rows = Query.order_by(CompetitionMockExam.created_at.desc()).limit(100).all()
    return [CompetitionMockExamPayload(db, Row, IncludeQuestions=False) for Row in Rows]
