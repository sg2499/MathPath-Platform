"""Performance Reports, Part 1 (2026-10-21): one set of numbers.

The screen, the Excel and Student History count each DPS once per student, by
its shared state (dps_chain_state_service), the way the trackers do. A level is
completed only when the student is promoted out of it.
"""

from app.api import routes_admin as admin
from app.models import Level, StudentLevelPromotion
from test_dps_chain_state import _chain, db, world  # noqa: F401  (fixtures)


def _setup(db):
    # s1: DPS 1 cleared on Re-Attempt 2 (two failures first), DPS 2 failed once
    # s2: DPS 1 cleared first time
    _chain(db, "s1", "d1", [40, 50, 90])
    _chain(db, "s1", "d2", [30, None])
    _chain(db, "s2", "d1", [95])
    db.commit()


def test_learning_performance_counts_each_dps_once(db, world):
    _setup(db)
    payload = admin._admin_learning_performance_payload(db, module_id="m")
    summary = payload["summary"]
    assert summary["attemptsReviewed"] == 5
    assert summary["attemptsBelowBenchmark"] == 3
    assert (summary["dpsCovered"], summary["dpsCleared"], summary["dpsNeedsReattempt"]) == (3, 2, 1)
    # the older keys the page and the Excel read carry the same DPS counts
    assert (summary["benchmarkMet"], summary["needsImprovement"]) == (2, 1)
    labels = sorted(row["chainRowLabel"] for row in payload["results"])
    # history attempts read as history; the current one carries the DPS state
    assert labels == ["Below Benchmark", "Below Benchmark", "Below Benchmark", "Cleared", "Cleared On Re-Attempt 2"]


def test_scope_filters_in_the_database_keep_the_same_rows(db, world):
    _setup(db)
    every = {row["attemptId"] for row in admin._admin_learning_performance_payload(db)["results"]}
    for scope in ({"module_id": "m"}, {"level_id": "l"}, {"lesson_id": "ls"}, {"module_id": "__ALL__"}):
        assert {row["attemptId"] for row in admin._admin_learning_performance_payload(db, **scope)["results"]} == every
    only_d2 = admin._admin_learning_performance_payload(db, dps_id="d2")["results"]
    assert [row["dpsId"] for row in only_d2] == ["d2"]


def test_excel_matches_the_screen(db, world):
    _setup(db)
    payload = admin._admin_learning_performance_payload(db, module_id="m")
    rows, needs = admin._admin_learning_export_rows(payload)
    assert [row["Status"] for row in rows] == [row["chainRowLabel"] for row in payload["results"]]
    # "Needs Re-Attempt" lists each DPS needing one once, like the tile
    assert len(needs) == payload["summary"]["dpsNeedsReattempt"] == 1
    assert all("-" != value for row in rows for value in row.values())


def test_student_history_is_chain_aware_and_levels_need_a_promotion(db, world):
    _setup(db)
    report = admin._admin_build_student_report(db, "s1", module_id="m")
    summary = report["summary"]
    assert (summary["dpsCleared"], summary["needsReattempt"], summary["dpsCovered"]) == (1, 1, 2)
    assert summary["levelsCleared"] == 0 and summary["modulesCleared"] == 0
    assert all(row.get("chainRowLabel") for row in report["dpsAttempts"])
    level = report["levelProgress"][0]
    assert (level["requiredDps"], level["attemptedDps"], level["clearedDps"], level["completedDps"], level["needsReattempt"]) == (5, 2, 1, 1, 1)
    assert level["isCurrentLevel"] is True

    # promoted out of the module's only level: the level and the module are completed
    db.add(Level(id="l2", module_id="m", level_code="IM-L2", level_name="IM L2"))
    db.flush()
    db.add(StudentLevelPromotion(id="p1", student_id="s1", from_module_id="m", from_level_id="l", to_module_id="m", to_level_id="l2", assessment_assignment_id="x", status="PROMOTED"))
    db.commit()
    summary = admin._admin_build_student_report(db, "s1", module_id="m")["summary"]
    assert summary["levelsCleared"] == 1 and summary["modulesCleared"] == 0  # IM-L2 still to go


def test_student_history_one_call_serves_every_scope(db, world):
    _setup(db)
    narrow = admin._admin_build_student_report(db, "s1", module_id="m", level_id="l", lesson_id="ls", dps_id="d1")
    wide = admin._admin_build_student_report(db, "s1", module_id="m")
    # DPS attempts follow the full scope; the journey stays the module's
    assert {row["dpsId"] for row in narrow["dpsAttempts"]} == {"d1"}
    assert narrow["levelProgress"] == wide["levelProgress"]
    assert narrow["promotionHistory"] == wide["promotionHistory"]


def test_excel_lists_every_dps_the_tile_counts_even_without_an_active_sheet(db, world):
    from app.models import Assignment

    _setup(db)
    # an old sheet switched off: its DPS is judged by its own attempts
    for item in db.query(Assignment).filter(Assignment.dps_id == "d2").all():
        item.is_active = False
    db.commit()
    payload = admin._admin_learning_performance_payload(db, module_id="m")
    _rows, needs = admin._admin_learning_export_rows(payload)
    assert payload["summary"]["dpsNeedsReattempt"] == len(needs) == 1
