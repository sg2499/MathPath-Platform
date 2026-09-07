"""Annual Competition -- auto-assignment engine (Package 2).

Computes which Annual Competition level a student should compete at, given
their CURRENT platform position (module + level, and for the two
single-level modules, lesson progress within that level). This is pure
computation -- nothing here writes to the database except
RunAnnualCompetitionAssignmentEngine, and even that only ever touches
CompetitionEventAssignment rows for the one event it's asked about.

## Why an explicit lookup table, not a generic "one level below" walk

Level.next_level_id (see docs/project-memory/PRODUCT_RULES.md "Curriculum
Progression Paths") already encodes "what comes after this level," and it's
tempting to just invert it. That would be wrong here: IM-L1 has two
legitimate predecessors in the real progression graph -- PM-L4 (Path 1/2)
and BM-L1 (Path 3, which never touches PM at all) -- so a generic reverse
walk is genuinely ambiguous exactly at the boundary this feature cares
about. MathPath's own auto-assignment table (REQUIREMENTS.md Section 1)
sidesteps that ambiguity entirely: an IM-L1 student always competes at
PL-4/PM-L4, regardless of which path got them to IM-L1. DIRECT_LEVEL_MAPPING
below is that table, transcribed verbatim and keyed on the platform's real
level codes (verified against Level.level_name, e.g. level_code "PM-L1" has
level_name "Preparatory Level 1" -- confirming the client's "PL-1" really is
"PM-L1", not a guess).

## Why Bridge and Master are handled separately

BM and MM are each a single curriculum level today (BM-L1, MM-L1) -- there
is no "BM-L2" or "IM-equivalent" level to look up. MathPath's placement
rule for students currently in one of these two modules is instead a lesson
-progress threshold WITHIN that one level (REQUIREMENTS.md Section 1):
Bridge at lesson 15/25/35/full -> PL-1/PL-2/PL-3/PL-4, Master below/at-or
-after lesson 16 or fully complete -> IM-4/MM-1/MM-2. These reuse
lesson_progress_service.py's existing, already-proven signals
(IsLessonFullyClearedForStudent / ComputeLessonProgressForStudents) rather
than inventing new progress tracking.

## MM-2 is a real target with no paper-generation registry entry yet

Master Module has exactly one seeded curriculum Level (MM-L1) -- there is
no "MM-L2" Level row, and MM_COMPETITION_LEVEL_REGISTRY
(competition_mock_generation_service.py) only has one key, "MM-L1". This is
expected, not a bug: MathPath's own internal dev spec already describes
"MM1"/"MM2" as two distinct competition paper tiers carved out of the same
Master Module content (mirroring how a single BM-L1 fans out into four
PL-tier placements above) -- it is a paper-generation-registry gap for a
later package, not a missing curriculum level. This engine still correctly
computes "MM-L2" as the target for a student who has finished the full
Master Module; IsRegistryBackedLevelCode() below flags that the destination
has no generation registry entry yet, purely for admin-preview visibility,
so Package 3 (paper generation) inherits a known, tracked gap instead of a
surprise.

## YLP-1 participation (REQUIREMENTS.md open item 1) and why the toggle
## is coarser than "just exclude YLP-1"

Every one of YLP-2 and YLP-3 maps to the SAME competition bracket (YLM,
branded "Bloomers" to students/parents) per MathPath's own table -- none of
the seven open items make that mapping conditional. The one open item is
*whether YLP-1 competes at all*. As of the 2026-08-12 curriculum change
(PRODUCT_RULES.md), the Young Learners Module was collapsed to a single
level, YLM-L1 -- the platform has no data field distinguishing a "YLP-1"
sub-cohort from "YLP-2/YLP-3" within current YLM-L1 students.
INCLUDE_YLM_L1_STUDENTS below is therefore a whole-population toggle, not a
YLP-1-specific one: while it's False (the documented default -- "excluded
until confirmed"), no current-YLM-L1 student gets an assignment computed at
all. If MathPath confirms YLP-1 should be excluded but YLP-2/YLP-3
included, that needs a real sub-cohort signal (e.g. a lesson-progress
threshold within YLM-L1, same shape as Bridge/Master above) that does not
exist in the requirements yet -- flag that back to MathPath rather than
guessing a boundary.

## PL-1 targets its own level, not the shared YLM/"Bloomers" bracket
## (REQUIREMENTS.md item 1, resolved 2026-09-05)

Earlier this table routed `("PM", "PM-L1")` (client's "PL-1") into the same
YLM-L1 bracket as YLP-2/YLP-3, mirroring the client's Section 1 table
literally. The client's fuller answer on the YLM/PL-1 age-boundary
question (REQUIREMENTS.md "Seven outstanding confirmations" item 1)
clarified that PL-1 gets "all the concepts" -- a materially richer paper
than the direct-sums-only "Bloomers" tier -- and a follow-up confirmed this
split needs no age-based logic at all: YLP enrollment is itself restricted
to Class 1/2 (so always under 8) and any PM-L1-current student has by
definition already progressed past the YLP bracket. So the split is fully
described by the student's existing (module, level) position alone, and
PL-1 (`PM-L1`) now targets its OWN level's already-existing, already
-configured competition registry (`PM_COMPETITION_LEVEL_REGISTRY["PM-L1"]`
in pm_competition_mock_generation_service.py -- same 3-section shape as
YLM-L1 but with materially richer digit patterns) rather than the shared
YLM-L1 bracket. This is a pure redirect of one table row to an
already-valid target: `PM-L1` was already present in Package 3's
VALID_COMPETITION_LEVEL_CODES and DEFAULT_SECTION_TIMERS_BY_LEVEL_CODE
(annual_competition_studio_service.py), so no new registry/config work was
needed. `Student.dob` is deliberately NOT used anywhere in this module --
age is a structural consequence of enrollment/curriculum position here, not
an independent signal to check at runtime.

Nothing in this module is a hardcoded assumption about *content* fairness
-- see docs/project-memory/annual-competition/REQUIREMENTS.md and
.mathpath/packages/pkg-02-assignment-engine.md for the full context this
was built from.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import api_error
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    Level,
    Module,
    Student,
    User,
)
from app.services.lesson_progress_service import (
    ComputeLessonProgressForStudents,
    IsLessonFullyClearedForStudent,
)

# ---------------------------------------------------------------------------
# The explicit mapping table (REQUIREMENTS.md Section 1), verbatim.
# Key: (current module_code, current level_code) -> assigned_level_code.
# Only covers modules/levels that map directly, level-to-level. Bridge
# (BM-L1) and Master (MM-L1) are computed separately below via lesson
# milestones, never through this dict.
# ---------------------------------------------------------------------------
DIRECT_LEVEL_MAPPING: dict[tuple[str, str], str] = {
    ("YLM", "YLM-L1"): "YLM-L1",   # "YLP-2, YLP-3 -> YLM" (Young Learner / "Bloomers" category)
    ("PM", "PM-L1"): "PM-L1",      # "PL-1 -> PL-1 (all concepts)" -- see docstring's
                                    # "PL-1 targets its own level" section (2026-09-05
                                    # client follow-up); PL-1 competes at its own level's
                                    # full paper, NOT the shared YLM/"Bloomers" bracket.
    ("PM", "PM-L2"): "PM-L1",      # "PL-2 -> PL-1"
    ("PM", "PM-L3"): "PM-L2",      # "PL-3 -> PL-2"
    ("PM", "PM-L4"): "PM-L3",      # "PL-4 -> PL-3"
    ("IM", "IM-L1"): "PM-L4",      # "IM-1 -> PL-4" (crosses module boundary)
    ("IM", "IM-L2"): "IM-L1",      # "IM-2 -> IM-1"
    ("IM", "IM-L3"): "IM-L2",      # "IM-3 -> IM-2"
    ("IM", "IM-L4"): "IM-L3",      # "IM-4 -> IM-3"
}

BRIDGE_MODULE_CODE = "BM"
BRIDGE_LEVEL_CODE = "BM-L1"
MASTER_MODULE_CODE = "MM"
MASTER_LEVEL_CODE = "MM-L1"
YLM_MODULE_CODE = "YLM"
YLM_LEVEL_CODE = "YLM-L1"

# Bridge milestone boundaries (REQUIREMENTS.md: "Lesson 15 -> PL-1, Lesson 25
# -> PL-2, Lesson 35 -> PL-3, full Bridge -> PL-4"), highest-first so the
# lookup below can short-circuit on the first milestone that's cleared.
# A Bridge student who hasn't yet cleared lesson 15 has no defined target in
# MathPath's own table -- REQUIREMENTS_OPEN_ITEM_3 below, not guessed at.
BRIDGE_MILESTONES: list[tuple[int, str]] = [
    (35, "PM-L3"),
    (25, "PM-L2"),
    (15, "PM-L1"),
]
BRIDGE_FULL_COMPLETION_TARGET = "PM-L4"

MASTER_LESSON_16_THRESHOLD = 16
MASTER_BELOW_THRESHOLD_TARGET = "IM-L4"
MASTER_AT_OR_ABOVE_THRESHOLD_TARGET = "MM-L1"
MASTER_FULL_COMPLETION_TARGET = "MM-L2"  # see module docstring -- no registry entry yet, by design at this stage

# REQUIREMENTS.md open item 1 default: "Excluded by default (a simple
# on/off switch)". See module docstring for why this is a whole-YLM-L1
# -population toggle rather than a YLP-1-specific one. Flip to True only
# once MathPath has confirmed YLP-1 participation; this is a deliberate
# code constant, not a per-event DB setting, to avoid a schema change for
# a still-unconfirmed default (see pkg-02-assignment-engine.md).
INCLUDE_YLM_L1_STUDENTS = False

# Reasons a student can end up with no computed assignment -- always
# surfaced in the dry-run preview, never silently dropped.
REASON_YLM_L1_EXCLUDED_BY_DEFAULT = "YLM_L1_EXCLUDED_PENDING_YLP1_CONFIRMATION"
REASON_BRIDGE_BELOW_FIRST_MILESTONE = "BRIDGE_BELOW_LESSON_15_NO_DEFINED_TARGET"
REASON_NO_CURRENT_LEVEL = "STUDENT_HAS_NO_CURRENT_LEVEL"
REASON_UNMAPPED_LEVEL = "CURRENT_LEVEL_NOT_IN_ANNUAL_COMPETITION_SCOPE"


@dataclass
class AssignmentComputation:
    student_id: str
    current_module_code: str | None
    current_level_code: str | None
    assigned_level_code: str | None
    rule_applied: str | None
    no_rule_matched: bool
    reason: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)


def _ActiveLevelsByModuleAndCode(db: Session) -> dict[tuple[str, str], Level]:
    """One query, not one per student: every active Level joined to its
    Module, keyed by (module_code, level_code)."""
    Rows = (
        db.query(Level, Module)
        .join(Module, Level.module_id == Module.id)
        .filter(Level.is_active == True, Module.is_active == True)
        .all()
    )
    return {(ModuleRecord.module_code, LevelRecord.level_code): LevelRecord for LevelRecord, ModuleRecord in Rows}


def _LevelsById(LevelsByCode: dict[tuple[str, str], Level]) -> dict[str, tuple[str, str]]:
    return {LevelRecord.id: Key for Key, LevelRecord in LevelsByCode.items()}


def _ResolveBridgeMilestoneLessonIds(db: Session, BridgeLevel: Level | None) -> dict[int, str]:
    if not BridgeLevel:
        return {}
    from app.models import Lesson  # local import: avoid a module-level cycle with lesson_progress_service's own imports

    NeededNumbers = [Number for Number, _Target in BRIDGE_MILESTONES]
    Rows = (
        db.query(Lesson)
        .filter(Lesson.level_id == BridgeLevel.id, Lesson.lesson_number.in_(NeededNumbers), Lesson.is_active == True)
        .all()
    )
    return {LessonRecord.lesson_number: LessonRecord.id for LessonRecord in Rows}


def ComputeAssignmentsForRoster(db: Session, students: list[Student]) -> list[AssignmentComputation]:
    """Pure computation, no DB writes. Batched: one lesson-progress query per
    module (Bridge, Master) covering every student in that module at once,
    never one query per student.
    """
    if not students:
        return []

    LevelsByCode = _ActiveLevelsByModuleAndCode(db)
    LevelKeyById = _LevelsById(LevelsByCode)

    Results: list[AssignmentComputation] = []
    BridgeStudents: list[Student] = []
    MasterStudents: list[Student] = []

    for StudentRecord in students:
        LevelKey = LevelKeyById.get(StudentRecord.current_level_id) if StudentRecord.current_level_id else None
        if not LevelKey:
            Results.append(
                AssignmentComputation(
                    student_id=StudentRecord.id,
                    current_module_code=None,
                    current_level_code=None,
                    assigned_level_code=None,
                    rule_applied=None,
                    no_rule_matched=True,
                    reason=REASON_NO_CURRENT_LEVEL,
                )
            )
            continue

        ModuleCode, LevelCode = LevelKey

        if ModuleCode == BRIDGE_MODULE_CODE and LevelCode == BRIDGE_LEVEL_CODE:
            BridgeStudents.append(StudentRecord)
            continue
        if ModuleCode == MASTER_MODULE_CODE and LevelCode == MASTER_LEVEL_CODE:
            MasterStudents.append(StudentRecord)
            continue

        if ModuleCode == YLM_MODULE_CODE and LevelCode == YLM_LEVEL_CODE and not INCLUDE_YLM_L1_STUDENTS:
            Results.append(
                AssignmentComputation(
                    student_id=StudentRecord.id,
                    current_module_code=ModuleCode,
                    current_level_code=LevelCode,
                    assigned_level_code=None,
                    rule_applied="DIRECT_LEVEL_MAPPING",
                    no_rule_matched=True,
                    reason=REASON_YLM_L1_EXCLUDED_BY_DEFAULT,
                )
            )
            continue

        Target = DIRECT_LEVEL_MAPPING.get(LevelKey)
        if Target is None:
            Results.append(
                AssignmentComputation(
                    student_id=StudentRecord.id,
                    current_module_code=ModuleCode,
                    current_level_code=LevelCode,
                    assigned_level_code=None,
                    rule_applied=None,
                    no_rule_matched=True,
                    reason=REASON_UNMAPPED_LEVEL,
                )
            )
            continue

        Results.append(
            AssignmentComputation(
                student_id=StudentRecord.id,
                current_module_code=ModuleCode,
                current_level_code=LevelCode,
                assigned_level_code=Target,
                rule_applied="DIRECT_LEVEL_MAPPING",
                no_rule_matched=False,
            )
        )

    # --- Bridge cohort: lesson-milestone lookup, batched per milestone ---
    if BridgeStudents:
        BridgeLevel = LevelsByCode.get((BRIDGE_MODULE_CODE, BRIDGE_LEVEL_CODE))
        MilestoneLessonIds = _ResolveBridgeMilestoneLessonIds(db, BridgeLevel)
        BridgeProgress = (
            ComputeLessonProgressForStudents(db, BridgeStudents, BridgeLevel.id) if BridgeLevel else {}
        )
        for StudentRecord in BridgeStudents:
            Progress = BridgeProgress.get(StudentRecord.id) or {}
            if Progress.get("levelComplete"):
                Results.append(
                    AssignmentComputation(
                        student_id=StudentRecord.id,
                        current_module_code=BRIDGE_MODULE_CODE,
                        current_level_code=BRIDGE_LEVEL_CODE,
                        assigned_level_code=BRIDGE_FULL_COMPLETION_TARGET,
                        rule_applied="BRIDGE_MILESTONE:FULL_COMPLETION",
                        no_rule_matched=False,
                    )
                )
                continue

            MatchedTarget: str | None = None
            MatchedMilestone: int | None = None
            for MilestoneNumber, Target in BRIDGE_MILESTONES:
                LessonId = MilestoneLessonIds.get(MilestoneNumber)
                if not LessonId:
                    continue
                AllCleared, _Cleared, _Total = IsLessonFullyClearedForStudent(db, StudentRecord.id, LessonId)
                if AllCleared:
                    MatchedTarget = Target
                    MatchedMilestone = MilestoneNumber
                    break

            if MatchedTarget is None:
                Results.append(
                    AssignmentComputation(
                        student_id=StudentRecord.id,
                        current_module_code=BRIDGE_MODULE_CODE,
                        current_level_code=BRIDGE_LEVEL_CODE,
                        assigned_level_code=None,
                        rule_applied=None,
                        no_rule_matched=True,
                        reason=REASON_BRIDGE_BELOW_FIRST_MILESTONE,
                    )
                )
            else:
                Results.append(
                    AssignmentComputation(
                        student_id=StudentRecord.id,
                        current_module_code=BRIDGE_MODULE_CODE,
                        current_level_code=BRIDGE_LEVEL_CODE,
                        assigned_level_code=MatchedTarget,
                        rule_applied=f"BRIDGE_MILESTONE:LESSON_{MatchedMilestone}",
                        no_rule_matched=False,
                    )
                )

    # --- Master cohort: lesson-16 threshold + full completion, batched ---
    if MasterStudents:
        MasterLevel = LevelsByCode.get((MASTER_MODULE_CODE, MASTER_LEVEL_CODE))
        MasterProgress = (
            ComputeLessonProgressForStudents(db, MasterStudents, MasterLevel.id) if MasterLevel else {}
        )
        for StudentRecord in MasterStudents:
            Progress = MasterProgress.get(StudentRecord.id) or {}
            if Progress.get("levelComplete"):
                Results.append(
                    AssignmentComputation(
                        student_id=StudentRecord.id,
                        current_module_code=MASTER_MODULE_CODE,
                        current_level_code=MASTER_LEVEL_CODE,
                        assigned_level_code=MASTER_FULL_COMPLETION_TARGET,
                        rule_applied="MASTER_MILESTONE:FULL_COMPLETION",
                        no_rule_matched=False,
                        extra={"requiresNewPaperRegistryEntry": True},
                    )
                )
                continue

            CurrentLessonNumber = Progress.get("currentLessonNumber")
            if CurrentLessonNumber is not None and CurrentLessonNumber >= MASTER_LESSON_16_THRESHOLD:
                Target = MASTER_AT_OR_ABOVE_THRESHOLD_TARGET
                Rule = "MASTER_MILESTONE:LESSON_16_OR_LATER"
            else:
                # Covers both "genuinely below lesson 16" and the rare
                # no-progress-info edge case (isNewToLevel with no anchor at
                # all) -- both mean "hasn't reached lesson 16 yet", which
                # MathPath's table maps to IM-4. Never left unmatched: this
                # branch (unlike Bridge's) has a defined target for every
                # case in REQUIREMENTS.md.
                Target = MASTER_BELOW_THRESHOLD_TARGET
                Rule = "MASTER_MILESTONE:BELOW_LESSON_16"
            Results.append(
                AssignmentComputation(
                    student_id=StudentRecord.id,
                    current_module_code=MASTER_MODULE_CODE,
                    current_level_code=MASTER_LEVEL_CODE,
                    assigned_level_code=Target,
                    rule_applied=Rule,
                    no_rule_matched=False,
                )
            )

    return Results


def IsRegistryBackedLevelCode(LevelCode: str | None) -> bool:
    """True if an existing *_COMPETITION_LEVEL_REGISTRY already has a config
    for this level code -- i.e. Competition Mock paper generation could
    produce a paper for it today. Read-only lookup, imported lazily so this
    module never becomes a required import for the (much heavier)
    generation services just to do this one check.
    """
    if not LevelCode:
        return False
    from app.services.competition_mock_generation_service import (
        IM_COMPETITION_LEVEL_REGISTRY,
        MM_COMPETITION_LEVEL_REGISTRY,
    )
    from app.services.pm_competition_mock_generation_service import PM_COMPETITION_LEVEL_REGISTRY
    from app.services.bm_competition_mock_generation_service import BM_COMPETITION_LEVEL_REGISTRY
    from app.services.ylm_competition_mock_generation_service import YLM_COMPETITION_LEVEL_REGISTRY

    AllRegistries = (
        set(IM_COMPETITION_LEVEL_REGISTRY)
        | set(MM_COMPETITION_LEVEL_REGISTRY)
        | set(PM_COMPETITION_LEVEL_REGISTRY)
        | set(BM_COMPETITION_LEVEL_REGISTRY)
        | set(YLM_COMPETITION_LEVEL_REGISTRY)
    )
    return LevelCode in AllRegistries


def _RosterForEvent(db: Session, StudentIds: list[str] | None) -> list[Student]:
    Query = db.query(Student).filter(Student.is_active == True)
    if StudentIds:
        UniqueIds = [Id for Id in dict.fromkeys([str(Item or "").strip() for Item in StudentIds]) if Id]
        Query = Query.filter(Student.id.in_(UniqueIds))
    return Query.order_by(Student.student_code.asc()).all()


def PreviewAnnualCompetitionAssignments(
    db: Session,
    *,
    EventId: str,
    StudentIds: list[str] | None = None,
) -> dict[str, Any]:
    """Dry run: computes what the engine WOULD do, writes nothing. Mirrors
    the shape of the existing admin eligibility-preview endpoints
    (routes_admin.py's assessment-eligibility pattern) -- pure db.query,
    no db.add/db.commit anywhere in this function or anything it calls.
    """
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "The selected Annual Competition event was not found.")

    Students = _RosterForEvent(db, StudentIds)
    Computations = ComputeAssignmentsForRoster(db, Students)

    ExistingRows = (
        db.query(CompetitionEventAssignment)
        .filter(
            CompetitionEventAssignment.event_id == EventId,
            CompetitionEventAssignment.student_id.in_([StudentRecord.id for StudentRecord in Students]),
        )
        .all()
    )
    ExistingByStudentId = {Row.student_id: Row for Row in ExistingRows}

    StudentById = {StudentRecord.id: StudentRecord for StudentRecord in Students}
    Rows: list[dict[str, Any]] = []
    for Computation in Computations:
        StudentRecord = StudentById.get(Computation.student_id)
        Existing = ExistingByStudentId.get(Computation.student_id)
        WouldChange = (
            not Computation.no_rule_matched
            and (not Existing or Existing.assigned_level_code != Computation.assigned_level_code)
        )
        Rows.append(
            {
                "studentId": Computation.student_id,
                "studentCode": StudentRecord.student_code if StudentRecord else None,
                "studentName": (StudentRecord.user.full_name if StudentRecord and StudentRecord.user else None),
                "currentModuleCode": Computation.current_module_code,
                "currentLevelCode": Computation.current_level_code,
                "computedAssignedLevelCode": Computation.assigned_level_code,
                "ruleApplied": Computation.rule_applied,
                "noRuleMatched": Computation.no_rule_matched,
                "reason": Computation.reason,
                "existingAssignedLevelCode": Existing.assigned_level_code if Existing else None,
                "existingAssignmentSource": Existing.assignment_source if Existing else None,
                "wouldOverwriteAdminOverride": bool(Existing and Existing.assignment_source == "ADMIN_OVERRIDE"),
                "wouldChangeOnRun": WouldChange and not (Existing and Existing.assignment_source == "ADMIN_OVERRIDE"),
                "requiresNewPaperRegistryEntry": bool(Computation.extra.get("requiresNewPaperRegistryEntry"))
                or (Computation.assigned_level_code is not None and not IsRegistryBackedLevelCode(Computation.assigned_level_code)),
            }
        )

    return {
        "eventId": EventId,
        "eventName": EventRecord.name,
        "totalStudentsConsidered": len(Rows),
        "wouldAssignCount": sum(1 for Row in Rows if Row["wouldChangeOnRun"]),
        "noRuleMatchedCount": sum(1 for Row in Rows if Row["noRuleMatched"]),
        "adminOverridePreservedCount": sum(1 for Row in Rows if Row["wouldOverwriteAdminOverride"]),
        "rows": Rows,
    }


def RunAnnualCompetitionAssignmentEngine(
    db: Session,
    *,
    EventId: str,
    RunBy: User,
    StudentIds: list[str] | None = None,
) -> dict[str, Any]:
    """Commits AUTO assignments for the given event. An existing
    ADMIN_OVERRIDE row for a student is never touched -- mirrors the
    upsert-but-never-clobber-an-override pattern this repo already uses for
    CompetitionMockAssignment (competition_mock_assignment_service.py).
    A student with no_rule_matched=True gets no row written at all (not a
    row with a null level) -- REQUIREMENTS.md's open items must stay
    visible in the preview, never silently defaulted into a committed row.
    """
    EventRecord = db.get(CompetitionEvent, EventId)
    if not EventRecord:
        api_error(404, "COMPETITION_EVENT_NOT_FOUND", "The selected Annual Competition event was not found.")

    Students = _RosterForEvent(db, StudentIds)
    Computations = ComputeAssignmentsForRoster(db, Students)
    Actionable = [Computation for Computation in Computations if not Computation.no_rule_matched]

    ExistingRows = (
        db.query(CompetitionEventAssignment)
        .filter(
            CompetitionEventAssignment.event_id == EventId,
            CompetitionEventAssignment.student_id.in_([Computation.student_id for Computation in Actionable]),
        )
        .all()
    )
    ExistingByStudentId = {Row.student_id: Row for Row in ExistingRows}

    CreatedCount = 0
    UpdatedCount = 0
    SkippedOverrideCount = 0

    for Computation in Actionable:
        Existing = ExistingByStudentId.get(Computation.student_id)
        if Existing and Existing.assignment_source == "ADMIN_OVERRIDE":
            SkippedOverrideCount += 1
            continue
        if Existing:
            if Existing.assigned_level_code != Computation.assigned_level_code:
                Existing.assigned_level_code = Computation.assigned_level_code
                Existing.assignment_source = "AUTO"
                Existing.computed_at = datetime.now(timezone.utc)
                Existing.is_active = True
                UpdatedCount += 1
            continue
        NewRow = CompetitionEventAssignment(
            event_id=EventId,
            student_id=Computation.student_id,
            assigned_level_code=Computation.assigned_level_code,
            assignment_source="AUTO",
            is_active=True,
        )
        db.add(NewRow)
        CreatedCount += 1

    db.commit()

    return {
        "eventId": EventId,
        "totalConsidered": len(Computations),
        "created": CreatedCount,
        "updated": UpdatedCount,
        "skippedAdminOverrides": SkippedOverrideCount,
        "noRuleMatched": len(Computations) - len(Actionable),
    }
