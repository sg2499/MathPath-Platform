"""Performance Reports > Learning Performance views (2026-10-21, Part 3)."""

from datetime import timedelta

from app.api import routes_admin as admin
from app.services import learning_rollup_service as rollup
from test_dps_chain_state import T0, _assign, _attempt, _chain, db, world  # noqa: F401  (fixtures)


def _setup(db):
    # s1: d1 cleared on the third try, d2 failed once (re-attempt open)
    # s2: d1 cleared first time
    _chain(db, "s1", "d1", [40, 50, 90])
    _chain(db, "s1", "d2", [30, None])
    _chain(db, "s2", "d1", [95])
    db.commit()


def test_drill_down_rows_add_up_to_the_tiles(db, world):
    _setup(db)
    data = admin._admin_learning_rollup_payload(db, "content", "all")
    assert data["level"] == "module" and [row["code"] for row in data["rows"]] == ["IM"]
    module = data["rows"][0]
    summary = data["summary"]
    assert (module["dpsCovered"], module["dpsCleared"], module["dpsNeedsReattempt"]) == (summary["dpsCovered"], summary["dpsCleared"], summary["dpsNeedsReattempt"]) == (3, 2, 1)
    # first tries: s1 d1 fail, s1 d2 fail, s2 d1 clear
    assert module["firstTryClearRate"] == 33
    # cleared DPS: s1 d1 on try 3, s2 d1 on try 1
    assert module["averageTriesToClear"] == 2.0
    assert module["students"] == 2 and module["attempts"] == 5
    assert module["flag"] == "LOW_ACCURACY"  # 61% average over five attempts


def test_each_step_of_the_drill_down(db, world):
    _setup(db)
    assert [row["code"] for row in admin._admin_learning_rollup_payload(db, "content", "all", module_id="m")["rows"]] == ["IM-L1"]
    assert [row["code"] for row in admin._admin_learning_rollup_payload(db, "content", "all", module_id="m", level_id="l")["rows"]] == ["Lesson 1"]
    dps = admin._admin_learning_rollup_payload(db, "content", "all", module_id="m", level_id="l", lesson_id="ls")
    assert [(row["code"], row["dpsCovered"]) for row in dps["rows"]] == [("DPS 1", 2), ("DPS 2", 1)]
    one = admin._admin_learning_rollup_payload(db, "content", "all", module_id="m", level_id="l", lesson_id="ls", dps_id="d1")
    assert one["level"] == "student"
    assert [item["label"] for item in one["path"]] == ["All Modules", "IM", "IM-L1", "Lesson 1", "DPS 1"]
    by_student = {row["studentId"]: row for row in one["rows"]}
    assert by_student["s1"]["tries"] == 3 and by_student["s1"]["bestAccuracy"] == 90 and by_student["s1"]["bucket"] == "CLEARED"
    assert by_student["s2"]["statusLabel"] == "Cleared" and by_student["s2"]["tries"] == 1
    assert by_student["s1"]["assignmentId"] and by_student["s1"]["attemptId"]


def test_by_student_and_by_teacher(db, world):
    _setup(db)
    students = admin._admin_learning_rollup_payload(db, "students", "all")["rows"]
    assert [(row["studentCode"], row["dpsCovered"], row["dpsCleared"], row["currentLevelCode"]) for row in students] == [("MP-s1", 2, 1, "IM-L1"), ("MP-s2", 1, 1, "IM-L1")]
    teachers = admin._admin_learning_rollup_payload(db, "teachers", "all")["rows"]
    # no teacher on these students: one "Not Assigned" row carries them
    assert [(row["teacherName"], row["dpsCovered"]) for row in teachers] == [("Not Assigned", 3)]


def test_the_period_keeps_its_attempts_and_first_tries_look_back(db, world):
    _setup(db)
    # a fourth DPS: failed long ago, cleared today
    early = _assign(db, "s2", "d3", 0, minutes=0)
    _attempt(db, early, 20, minutes=0)
    later = _assign(db, "s2", "d3", 1, "AUTO_RETRY", early.id, minutes=60 * 24 * 15)
    _attempt(db, later, 80, minutes=60 * 24 * 15)
    db.commit()
    rows = admin._admin_learning_performance_payload(db, module_id="m", KeepAllRows=True)["_allRows"]
    start = T0 + timedelta(days=10)
    in_period = rollup.RowsInPeriod(rows, start)
    assert [row["dpsId"] for row in in_period] == ["d3"]
    stats = rollup.KeyStats(rows, 70)
    buckets: dict = {}
    admin._admin_dps_buckets_for_rows(in_period, buckets)
    (row,) = rollup.BuildContentRollup(in_period, buckets, stats, "module", 70)
    # only d3 counts, and its first try (before the period) was a failure
    assert (row["dpsCovered"], row["dpsCleared"], row["firstTryClearRate"], row["averageTriesToClear"]) == (1, 1, 0, 2.0)


def test_the_excel_follows_the_view(db, world):
    _setup(db)
    names = {
        ("content", None): "By Module",
        ("content", "d1"): "DPS Students",
        ("students", None): "By Student",
        ("teachers", None): "By Teacher",
    }
    for (view, dps), name in names.items():
        payload = admin._admin_learning_rollup_payload(db, view, "all", module_id="m" if dps else None, level_id="l" if dps else None, lesson_id="ls" if dps else None, dps_id=dps)
        sheet, rows = admin._admin_learning_rollup_sheet(payload)
        assert sheet == name and len(rows) == len(payload["rows"])
        assert all(value != "-" for row in rows for value in row.values())
    module_sheet = admin._admin_learning_rollup_sheet(admin._admin_learning_rollup_payload(db, "content", "all"))[1][0]
    assert (module_sheet["DPS Practised"], module_sheet["DPS Cleared"], module_sheet["First-Try Clear %"]) == (3, 2, "33%")
