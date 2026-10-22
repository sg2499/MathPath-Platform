"""Performance Reports > Overview (2026-10-21, Part 2)."""

from datetime import datetime, timedelta, timezone

from app.models import StudentLevelPromotion
from app.services import performance_overview_service as overview
from test_dps_chain_state import T0, _assign, _attempt, _chain, db, world  # noqa: F401  (fixtures)

NOW = T0 + timedelta(days=10)


def _scope(ids=("s1", "s2")):
    return overview.OverviewScope(StudentIds=set(ids), LevelIds=None, DpsIds=None)


def test_period_and_buckets():
    key, previous_start, start, end = overview.ResolvePeriod("30d", NOW)
    assert key == "30d" and end - start == timedelta(days=30) and start - previous_start == timedelta(days=30)
    # four weeks and two days: the short first week joins the next one
    buckets = overview._Buckets("30d", start, end)
    assert len(buckets) == 4 and buckets[0][0] == start and buckets[-1][1] == end
    assert len(overview._Buckets("7d", *overview.ResolvePeriod("7d", NOW)[2:])) == 7
    assert overview.ResolvePeriod("nonsense", NOW)[0] == "30d"


def test_tiles_count_each_dps_once_against_the_period_before(db, world):
    _chain(db, "s1", "d1", [40, 50, 90])  # cleared on the third try
    _chain(db, "s1", "d2", [95])  # cleared first time
    _chain(db, "s2", "d1", [30, None])  # failed, re-attempt open
    db.commit()
    data = overview.BuildPerformanceOverview(db, _scope(), "7d", Now=T0 + timedelta(days=2))
    tiles = data["tiles"]
    assert tiles["activeStudents"]["value"] == 2 and tiles["activeStudents"]["previous"] == 0
    assert tiles["attempts"]["value"] == 5
    assert tiles["dpsCleared"]["value"] == 2
    # first tries in the period: s1 d1 (fail), s1 d2 (clear), s2 d1 (fail)
    assert tiles["firstTryClearRate"]["value"] == 33
    assert tiles["reattemptBacklog"]["value"] == 1
    assert sum(point["attempts"] for point in data["series"]) == 5
    # a period that ended before any practice
    old = overview.BuildPerformanceOverview(db, _scope(), "7d", Now=T0 - timedelta(days=1))
    assert old["tiles"]["attempts"]["value"] == 0 and old["tiles"]["averageAccuracy"]["value"] is None


def test_needs_attention_kinds(db, world):
    _chain(db, "s1", "d3", [40, 50, 60], manual_last=True)  # all three tries used: waiting for approval
    _chain(db, "s2", "d1", [20, None])  # one failure, open re-attempt, then nothing for a long time
    db.commit()
    data = overview.BuildPerformanceOverview(db, _scope(), "30d", Now=T0 + timedelta(days=20), PromotionReadyIds=lambda ids: {"s1"})
    kinds = [(item["kind"], item["studentId"]) for item in data["attention"]]
    assert ("APPROVAL", "s1") in kinds
    assert ("READY", "s1") in kinds
    assert ("INACTIVE", "s2") in kinds and ("INACTIVE", "s1") in kinds
    approval = next(item for item in data["attention"] if item["kind"] == "APPROVAL")
    assert approval["dpsNumber"] == 3 and approval["lessonNumber"] == 1 and approval["levelCode"] == "IM-L1"
    # the order: approvals first, idle students last
    assert data["attention"][0]["kind"] == "APPROVAL" and data["attention"][-1]["kind"] == "INACTIVE"
    assert data["attentionCounts"]["APPROVAL"] == 1 and data["attentionCounts"]["READY"] == 1


def test_falling_accuracy(db, world):
    early = _assign(db, "s1", "d4", 0, minutes=0)
    for day in range(3):  # the week before: 90%
        _attempt(db, early, 90, minutes=day * 60 * 24)
    late = _assign(db, "s1", "d5", 0, minutes=8 * 60 * 24)
    for day in range(3):  # this week: 50%
        _attempt(db, late, 50, minutes=(8 + day) * 60 * 24)
    db.commit()
    data = overview.BuildPerformanceOverview(db, _scope(("s1",)), "30d", Now=T0 + timedelta(days=13))
    falling = [item for item in data["attention"] if item["kind"] == "FALLING"]
    assert len(falling) == 1 and falling[0]["drop"] == 40


def test_levels_and_promotions(db, world):
    db.add(StudentLevelPromotion(id="p1", student_id="s2", from_module_id="m", from_level_id="l", to_module_id="m", to_level_id="l", assessment_assignment_id="x", status="PROMOTED", promoted_at=NOW - timedelta(days=1)))
    db.commit()
    data = overview.BuildPerformanceOverview(db, _scope(), "7d", Now=NOW, PromotionReadyIds=lambda ids: {"s1"})
    assert data["levels"] == [{"levelId": "l", "levelCode": "IM-L1", "levelName": "IM L1", "moduleCode": "IM", "onLevel": 2, "readyToPromote": 1, "promotedOut": 1}]
    assert data["tiles"]["promotions"]["value"] == 1
