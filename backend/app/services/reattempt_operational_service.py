"""Operational helpers for MathPath DPS re-attempt state.

Phase 10.9.4D centralises the business rule that Needs Re-Attempt cards count
unique DPS concept chains, not raw failed attempts. A student can fail Original,
Re-Attempt 1, Re-Attempt 2, and Re-Attempt 3 for the same DPS, but operational
cards must still count that as one uncleared DPS concept until the concept is
cleared.
"""

from __future__ import annotations

from typing import Iterable

from app.models import Attempt

COMPLETED_ATTEMPT_STATUSES = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED", "CLEARED"}
DEFAULT_BENCHMARK_PERCENTAGE = 70.0


def IsCompletedAttempt(AttemptItem: Attempt | None) -> bool:
    if not AttemptItem:
        return False
    return str(getattr(AttemptItem, "status", "") or "").upper() in COMPLETED_ATTEMPT_STATUSES


def AttemptActivityTimestamp(AttemptItem: Attempt | None):
    if not AttemptItem:
        return None
    return (
        getattr(AttemptItem, "submitted_at", None)
        or getattr(AttemptItem, "started_at", None)
        or getattr(AttemptItem, "created_at", None)
    )


def AttemptSequenceValue(AttemptItem: Attempt | None) -> int:
    if not AttemptItem:
        return 0
    AttemptNumber = getattr(AttemptItem, "attempt_number", None)
    if AttemptNumber is not None:
        try:
            return int(AttemptNumber or 0)
        except (TypeError, ValueError):
            return 0
    return 0


def AttemptConceptKey(AttemptItem: Attempt | None) -> str:
    """Return the stable operational key for one DPS retry chain."""
    if not AttemptItem:
        return "UNKNOWN"
    GroupId = getattr(AttemptItem, "attempt_group_id", None)
    if GroupId:
        return f"GROUP::{GroupId}"
    DpsId = getattr(AttemptItem, "dps_id", None)
    StudentId = getattr(AttemptItem, "student_id", None)
    if StudentId and DpsId:
        return f"STUDENT::{StudentId}::DPS::{DpsId}"
    if DpsId:
        return f"DPS::{DpsId}"
    AssignmentId = getattr(AttemptItem, "assignment_id", None)
    if AssignmentId:
        return f"ASSIGNMENT::{AssignmentId}"
    return f"ATTEMPT::{getattr(AttemptItem, 'id', 'UNKNOWN')}"


def IsAttemptCleared(AttemptItem: Attempt | None, BenchmarkPercentage: float = DEFAULT_BENCHMARK_PERCENTAGE) -> bool:
    if not IsCompletedAttempt(AttemptItem):
        return False
    try:
        AccuracyValue = float(getattr(AttemptItem, "accuracy_percentage", 0) or 0)
    except (TypeError, ValueError):
        AccuracyValue = 0
    BenchmarkStatus = str(getattr(AttemptItem, "benchmark_status", "") or "").upper()
    return AccuracyValue >= BenchmarkPercentage or BenchmarkStatus == "CLEARED"


def SortAttemptsByOperationalFreshness(AttemptItems: Iterable[Attempt]) -> list[Attempt]:
    return sorted(
        list(AttemptItems or []),
        key=lambda AttemptItem: (
            AttemptSequenceValue(AttemptItem),
            AttemptActivityTimestamp(AttemptItem) or "",
            str(getattr(AttemptItem, "id", "") or ""),
        ),
    )


def LatestCompletedAttemptByConcept(
    AttemptItems: Iterable[Attempt],
    BenchmarkPercentage: float = DEFAULT_BENCHMARK_PERCENTAGE,
) -> dict[str, Attempt]:
    """Return the latest completed/current attempt per unique DPS concept chain."""
    LatestByConcept: dict[str, Attempt] = {}
    for AttemptItem in SortAttemptsByOperationalFreshness(AttemptItems):
        if not IsCompletedAttempt(AttemptItem):
            continue
        ConceptKey = AttemptConceptKey(AttemptItem)
        ExistingAttempt = LatestByConcept.get(ConceptKey)
        if not ExistingAttempt:
            LatestByConcept[ConceptKey] = AttemptItem
            continue

        # Prefer a clearing attempt over an older failed attempt even if legacy
        # attempt numbers are missing. Otherwise use the later sequence/timestamp.
        ExistingCleared = IsAttemptCleared(ExistingAttempt, BenchmarkPercentage)
        CurrentCleared = IsAttemptCleared(AttemptItem, BenchmarkPercentage)
        if CurrentCleared and not ExistingCleared:
            LatestByConcept[ConceptKey] = AttemptItem
            continue
        if CurrentCleared == ExistingCleared:
            LatestByConcept[ConceptKey] = AttemptItem
    return LatestByConcept


def CurrentOperationalAttempts(
    AttemptItems: Iterable[Attempt],
    BenchmarkPercentage: float = DEFAULT_BENCHMARK_PERCENTAGE,
) -> list[Attempt]:
    return list(LatestCompletedAttemptByConcept(AttemptItems, BenchmarkPercentage).values())


def NeedsReattemptAttempts(
    AttemptItems: Iterable[Attempt],
    BenchmarkPercentage: float = DEFAULT_BENCHMARK_PERCENTAGE,
) -> list[Attempt]:
    return [
        AttemptItem
        for AttemptItem in CurrentOperationalAttempts(AttemptItems, BenchmarkPercentage)
        if not IsAttemptCleared(AttemptItem, BenchmarkPercentage)
    ]


def CountNeedsReattemptConcepts(
    AttemptItems: Iterable[Attempt],
    BenchmarkPercentage: float = DEFAULT_BENCHMARK_PERCENTAGE,
) -> int:
    return len(NeedsReattemptAttempts(AttemptItems, BenchmarkPercentage))


def ClearedConceptAttempts(
    AttemptItems: Iterable[Attempt],
    BenchmarkPercentage: float = DEFAULT_BENCHMARK_PERCENTAGE,
) -> list[Attempt]:
    return [
        AttemptItem
        for AttemptItem in CurrentOperationalAttempts(AttemptItems, BenchmarkPercentage)
        if IsAttemptCleared(AttemptItem, BenchmarkPercentage)
    ]


def CountManualInterventionRequiredConcepts(
    AttemptItems: Iterable[Attempt],
    BenchmarkPercentage: float = DEFAULT_BENCHMARK_PERCENTAGE,
) -> int:
    CountValue = 0
    for AttemptItem in NeedsReattemptAttempts(AttemptItems, BenchmarkPercentage):
        RequiresManualIntervention = bool(getattr(AttemptItem, "requires_manual_intervention", False))
        AttemptNumber = AttemptSequenceValue(AttemptItem)
        BenchmarkStatus = str(getattr(AttemptItem, "benchmark_status", "") or "").upper()
        if RequiresManualIntervention or AttemptNumber >= 3 or BenchmarkStatus == "MANUAL_INTERVENTION_REQUIRED":
            CountValue += 1
    return CountValue
