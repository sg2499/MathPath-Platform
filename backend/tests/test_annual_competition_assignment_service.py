"""Package 2 (Annual Competition assignment engine) tests.

Covers every row of REQUIREMENTS.md's Section 1 mapping table, the Bridge
and Master lesson-milestone boundaries (including the edge cases right at
each threshold), the YLM-L1 exclude-by-default toggle, the upsert/
admin-override-preservation behavior, and that "no rule matched" students
never get a row silently written.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    Attempt,
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventRoster,
    DPS,
    Lesson,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_assignment_service as engine
from app.services import annual_competition_studio_service as studio


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _module(db, code, name):
    m = Module(id=f"module-{code}", module_code=code, module_name=name, is_active=True)
    db.add(m)
    return m


def _level(db, module_id, code, name):
    l = Level(id=f"level-{code}", module_id=module_id, level_code=code, level_name=name, is_active=True)
    db.add(l)
    return l


def _user(db, uid, name="Test Student"):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    return u


def _student(db, sid, module_id, level_id, code=None):
    u = _user(db, f"user-{sid}", name=sid)
    s = Student(
        id=sid,
        user_id=u.id,
        student_code=code or f"MP-{sid}",
        current_module_id=module_id,
        current_level_id=level_id,
        is_active=True,
    )
    db.add(s)
    return s


def _admin(db):
    a = User(id="user-admin", full_name="Admin", email="admin@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(a)
    return a


def _event(db):
    e = CompetitionEvent(id="event-1", name="Annual Competition 2026", status="DRAFT", competition_date=datetime.now(timezone.utc))
    db.add(e)
    return e


def _roster(db, event_id, *student_ids):
    """2026-09-29 (Shailesh, Event Roster): the engine/preview now only
    ever considers students on this table for the given event -- every test
    below that exercises the engine/preview must put its student(s) on the
    roster first, same as a real admin would via the Event Roster panel."""
    for StudentId in student_ids:
        db.add(CompetitionEventRoster(id=f"roster-{event_id}-{StudentId}", event_id=event_id, student_id=StudentId))


def _seed_curriculum(db):
    """Seeds every module/level the direct mapping table + Bridge/Master
    branches need, matching real level_code conventions."""
    ylm = _module(db, "YLM", "Young Learners Module")
    pm = _module(db, "PM", "Preparatory Module")
    im = _module(db, "IM", "Intermediate Module")
    bm = _module(db, "BM", "Bridge Module")
    mm = _module(db, "MM", "Master Module")
    db.flush()

    levels = {}
    levels["YLM-L1"] = _level(db, ylm.id, "YLM-L1", "Young Learners Level 1")
    for n in (1, 2, 3, 4):
        levels[f"PM-L{n}"] = _level(db, pm.id, f"PM-L{n}", f"Preparatory Level {n}")
    for n in (1, 2, 3, 4):
        levels[f"IM-L{n}"] = _level(db, im.id, f"IM-L{n}", f"Intermediate Module Level {n}")
    levels["BM-L1"] = _level(db, bm.id, "BM-L1", "Bridge Level 1")
    levels["MM-L1"] = _level(db, mm.id, "MM-L1", "Master Module Level 1")
    db.flush()
    return {"YLM": ylm, "PM": pm, "IM": im, "BM": bm, "MM": mm}, levels


def _seed_lessons_with_one_dps(db, level_id, lesson_numbers):
    """One lesson (with one DPS) per requested lesson_number, so
    IsLessonFullyClearedForStudent / ComputeLessonProgressForStudents have
    something real to walk."""
    lessons = {}
    for n in lesson_numbers:
        lesson = Lesson(id=f"{level_id}-lesson-{n}", level_id=level_id, lesson_number=n, lesson_title=f"Lesson {n}", is_active=True)
        db.add(lesson)
        db.flush()
        dps = DPS(id=f"{level_id}-lesson-{n}-dps-1", lesson_id=lesson.id, dps_number=1, dps_title=f"Lesson {n} Sheet 1", publication_status="PUBLISHED", is_active=True)
        db.add(dps)
        lessons[n] = (lesson, dps)
    db.flush()
    return lessons


def _clear_lesson(db, student_id, dps_id):
    now = datetime.now(timezone.utc)
    db.add(
        Attempt(
            id=f"attempt-{student_id}-{dps_id}",
            dps_id=dps_id,
            student_id=student_id,
            mode="PRACTICE",
            status="SUBMITTED",
            cleared_at_attempt=True,
            started_at=now - timedelta(minutes=10),
            expires_at=now + timedelta(minutes=10),
            duration_seconds=600,
        )
    )


# ---------------------------------------------------------------------------
# Direct mapping table -- every row from REQUIREMENTS.md Section 1
# ---------------------------------------------------------------------------

DIRECT_CASES = [
    ("PM", "PM-L1", "PM-L1"),    # "PL-1 -> PL-1 (all concepts)" -- resolved 2026-09-05,
                                  # see annual_competition_assignment_service.py's own
                                  # docstring ("PL-1 targets its own level...")
    ("PM", "PM-L2", "PM-L1"),    # "PL-2 -> PL-1"
    ("PM", "PM-L3", "PM-L2"),    # "PL-3 -> PL-2"
    ("PM", "PM-L4", "PM-L3"),    # "PL-4 -> PL-3"
    ("IM", "IM-L1", "PM-L4"),    # "IM-1 -> PL-4"
    ("IM", "IM-L2", "IM-L1"),    # "IM-2 -> IM-1"
    ("IM", "IM-L3", "IM-L2"),    # "IM-3 -> IM-2"
    ("IM", "IM-L4", "IM-L3"),    # "IM-4 -> IM-3"
]


@pytest.mark.parametrize("module_code,level_code,expected_target", DIRECT_CASES)
def test_direct_mapping_matches_requirements_table(module_code, level_code, expected_target):
    db = _session()
    modules, levels = _seed_curriculum(db)
    student = _student(db, "s1", modules[module_code].id, levels[level_code].id)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.assigned_level_code == expected_target
    assert computation.no_rule_matched is False


def test_ylm_l1_current_students_excluded_by_default():
    db = _session()
    modules, levels = _seed_curriculum(db)
    student = _student(db, "s1", modules["YLM"].id, levels["YLM-L1"].id)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.no_rule_matched is True
    assert computation.reason == engine.REASON_YLM_L1_EXCLUDED_BY_DEFAULT
    assert computation.assigned_level_code is None


def test_ylm_l1_current_students_included_once_toggle_flipped(monkeypatch):
    db = _session()
    modules, levels = _seed_curriculum(db)
    student = _student(db, "s1", modules["YLM"].id, levels["YLM-L1"].id)
    db.commit()

    monkeypatch.setattr(engine, "INCLUDE_YLM_L1_STUDENTS", True)
    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.no_rule_matched is False
    assert computation.assigned_level_code == "YLM-L1"


def test_student_with_no_current_level_is_flagged_not_silently_skipped():
    db = _session()
    _seed_curriculum(db)
    u = _user(db, "user-s1", "No Level Student")
    student = Student(id="s1", user_id=u.id, student_code="MP-S1", current_module_id=None, current_level_id=None, is_active=True)
    db.add(student)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.no_rule_matched is True
    assert computation.reason == engine.REASON_NO_CURRENT_LEVEL


# ---------------------------------------------------------------------------
# Bridge Module milestone boundaries
# ---------------------------------------------------------------------------

def _bridge_setup(db):
    modules, levels = _seed_curriculum(db)
    lessons = _seed_lessons_with_one_dps(db, levels["BM-L1"].id, [15, 25, 35, 40])
    return modules, levels, lessons


def test_bridge_below_first_milestone_has_no_defined_target():
    db = _session()
    modules, levels, lessons = _bridge_setup(db)
    student = _student(db, "s1", modules["BM"].id, levels["BM-L1"].id)
    db.commit()
    # Nothing cleared at all.

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.no_rule_matched is True
    assert computation.reason == engine.REASON_BRIDGE_BELOW_FIRST_MILESTONE


def test_bridge_lesson_15_cleared_maps_to_pm_l1():
    db = _session()
    modules, levels, lessons = _bridge_setup(db)
    student = _student(db, "s1", modules["BM"].id, levels["BM-L1"].id)
    _, dps15 = lessons[15]
    _clear_lesson(db, "s1", dps15.id)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.assigned_level_code == "PM-L1"
    assert computation.rule_applied == "BRIDGE_MILESTONE:LESSON_15"


def test_bridge_lesson_25_cleared_maps_to_pm_l2_not_pm_l1():
    db = _session()
    modules, levels, lessons = _bridge_setup(db)
    student = _student(db, "s1", modules["BM"].id, levels["BM-L1"].id)
    _clear_lesson(db, "s1", lessons[15][1].id)
    _clear_lesson(db, "s1", lessons[25][1].id)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.assigned_level_code == "PM-L2"


def test_bridge_lesson_35_cleared_maps_to_pm_l3():
    db = _session()
    modules, levels, lessons = _bridge_setup(db)
    student = _student(db, "s1", modules["BM"].id, levels["BM-L1"].id)
    for n in (15, 25, 35):
        _clear_lesson(db, "s1", lessons[n][1].id)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.assigned_level_code == "PM-L3"


def test_bridge_full_completion_maps_to_pm_l4():
    db = _session()
    modules, levels, lessons = _bridge_setup(db)
    student = _student(db, "s1", modules["BM"].id, levels["BM-L1"].id)
    for n in (15, 25, 35, 40):
        _clear_lesson(db, "s1", lessons[n][1].id)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.assigned_level_code == "PM-L4"
    assert computation.rule_applied == "BRIDGE_MILESTONE:FULL_COMPLETION"


# ---------------------------------------------------------------------------
# Master Module lesson-16 threshold + full completion
# ---------------------------------------------------------------------------

def _master_setup(db):
    modules, levels = _seed_curriculum(db)
    lesson_numbers = list(range(1, 18))  # covers below/at/after the lesson-16 threshold
    lessons = _seed_lessons_with_one_dps(db, levels["MM-L1"].id, lesson_numbers)
    return modules, levels, lessons


def test_master_below_lesson_16_maps_to_im_l4():
    db = _session()
    modules, levels, lessons = _master_setup(db)
    student = _student(db, "s1", modules["MM"].id, levels["MM-L1"].id)
    _clear_lesson(db, "s1", lessons[1][1].id)  # only just started
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.assigned_level_code == "IM-L4"
    assert computation.rule_applied == "MASTER_MILESTONE:BELOW_LESSON_16"
    # 2026-09-15 (Shailesh): "we need to have the current lesson number for
    # the MM students as well" -- surfaced via `extra` for every Master
    # cohort branch, not just the lesson-16-or-later one.
    assert computation.extra.get("currentLessonNumber") == 2
    assert computation.extra.get("masterLevelComplete") is False


def test_master_at_lesson_16_maps_to_mm_l1():
    db = _session()
    modules, levels, lessons = _master_setup(db)
    student = _student(db, "s1", modules["MM"].id, levels["MM-L1"].id)
    for n in range(1, 17):  # clears through lesson 16
        _clear_lesson(db, "s1", lessons[n][1].id)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.assigned_level_code == "MM-L1"
    assert computation.rule_applied == "MASTER_MILESTONE:LESSON_16_OR_LATER"
    assert computation.extra.get("currentLessonNumber") == 17
    assert computation.extra.get("masterLevelComplete") is False


def test_master_full_completion_maps_to_mm_l2_and_flags_registry_gap():
    db = _session()
    modules, levels, lessons = _master_setup(db)
    student = _student(db, "s1", modules["MM"].id, levels["MM-L1"].id)
    for n in lessons:
        _clear_lesson(db, "s1", lessons[n][1].id)
    db.commit()

    [computation] = engine.ComputeAssignmentsForRoster(db, [student])
    assert computation.assigned_level_code == "MM-L2"
    assert computation.rule_applied == "MASTER_MILESTONE:FULL_COMPLETION"
    assert computation.extra.get("requiresNewPaperRegistryEntry") is True
    assert computation.extra.get("masterLevelComplete") is True
    assert computation.extra.get("previousLessonNumber") == max(lessons)
    # MM-L2 has no *_COMPETITION_LEVEL_REGISTRY entry yet -- confirm the
    # read-only registry check agrees (this is the same signal the preview
    # endpoint surfaces to admins).
    assert engine.IsRegistryBackedLevelCode("MM-L2") is False
    assert engine.IsRegistryBackedLevelCode("PM-L1") is True


def test_preview_surfaces_master_current_lesson_number_for_admin_ui():
    """2026-09-15 (Shailesh): "we need to have the current lesson number
    for the MM students as well ... so that it is clear why the student is
    gonna sit for MM-L1." Confirms the field actually reaches the Official
    assignment-preview row (not just the internal AssignmentComputation),
    since this is what the admin Studio's "Current Level" column reads."""
    db = _session()
    modules, levels, lessons = _master_setup(db)
    _student(db, "s1", modules["MM"].id, levels["MM-L1"].id)
    for n in range(1, 17):
        _clear_lesson(db, "s1", lessons[n][1].id)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    preview = engine.PreviewAnnualCompetitionAssignments(db, EventId="event-1")
    [row] = preview["rows"]
    assert row["currentLevelCode"] == "MM-L1"
    assert row["computedAssignedLevelCode"] == "MM-L1"
    assert row["currentLessonNumber"] == 17
    assert row["masterLevelComplete"] is False


# ---------------------------------------------------------------------------
# Preview (dry-run) + Run (commit) -- upsert and admin-override preservation
# ---------------------------------------------------------------------------

def test_preview_never_writes_to_the_database():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    _event(db)
    db.commit()

    engine.PreviewAnnualCompetitionAssignments(db, EventId="event-1")
    assert db.query(CompetitionEventAssignment).count() == 0


def test_run_creates_auto_assignment_rows():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert result["created"] == 1
    row = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one()
    assert row.assigned_level_code == "PM-L1"
    assert row.assignment_source == "AUTO"


def test_run_never_overwrites_an_admin_override():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    db.add(
        CompetitionEventAssignment(
            id="assignment-s1",
            event_id="event-1",
            student_id="s1",
            assigned_level_code="PM-L3",  # deliberately different from what AUTO would compute (PM-L1)
            assignment_source="ADMIN_OVERRIDE",
            is_active=True,
        )
    )
    _roster(db, "event-1", "s1")
    db.commit()

    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert result["created"] == 0
    assert result["updated"] == 0
    assert result["skippedAdminOverrides"] == 1
    row = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one()
    assert row.assigned_level_code == "PM-L3"
    assert row.assignment_source == "ADMIN_OVERRIDE"


def test_run_updates_an_existing_auto_row_when_level_changes():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    first = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert first["created"] == 1

    # Student progresses to PM-L3 before the engine is re-run.
    student = db.get(Student, "s1")
    student.current_level_id = levels["PM-L3"].id
    db.commit()

    second = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert second["updated"] == 1
    assert second["created"] == 0
    row = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one()
    assert row.assigned_level_code == "PM-L2"  # "PL-3 -> PL-2"


def test_run_links_matching_slot_on_newly_created_assignment():
    """2026-09-08 regression -- RunAnnualCompetitionAssignmentEngine never
    wrote slot_id at all before this fix, exactly like the manual-override
    path (see test_annual_competition_studio_service.py for the full story).
    A student computed onto a level a slot already claims must have that
    slot linked the moment the row is created."""
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    slot = studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 10, 20, tzinfo=timezone.utc),
        ApplicableLevelCodes=["PM-L1"],  # "PL-2 -> PL-1" is what the engine computes for this student
    )

    engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    row = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one()
    assert row.assigned_level_code == "PM-L1"
    assert row.slot_id == slot["slotId"]


def test_run_relinks_slot_when_computed_level_changes_between_runs():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    SlotForPmL1 = studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 10, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 10, 20, tzinfo=timezone.utc),
        ApplicableLevelCodes=["PM-L1"],
    )
    SlotForPmL2 = studio.CreateCompetitionEventSlot(
        db, EventId="event-1", Mode="OFFLINE",
        ScheduledStartAt=datetime(2026, 10, 11, 11, 0, tzinfo=timezone.utc),
        ScheduledEndAt=datetime(2026, 10, 11, 11, 30, tzinfo=timezone.utc),
        ApplicableLevelCodes=["PM-L2"],
    )

    engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    row = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one()
    assert row.assigned_level_code == "PM-L1"
    assert row.slot_id == SlotForPmL1["slotId"]

    # Student progresses to PM-L3 before the engine is re-run -- "PL-3 -> PL-2".
    student = db.get(Student, "s1")
    student.current_level_id = levels["PM-L3"].id
    db.commit()

    engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    row = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one()
    assert row.assigned_level_code == "PM-L2"
    assert row.slot_id == SlotForPmL2["slotId"]  # re-resolved, not left stuck on the old slot


def test_run_writes_no_row_for_students_with_no_rule_matched():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["YLM"].id, levels["YLM-L1"].id)  # excluded by default
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert result["created"] == 0
    assert result["noRuleMatched"] == 1
    assert db.query(CompetitionEventAssignment).count() == 0


def test_preview_reports_would_overwrite_admin_override_without_changing_it():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    _event(db)
    db.add(
        CompetitionEventAssignment(
            id="assignment-s1",
            event_id="event-1",
            student_id="s1",
            assigned_level_code="PM-L3",
            assignment_source="ADMIN_OVERRIDE",
            is_active=True,
        )
    )
    _roster(db, "event-1", "s1")
    db.commit()

    preview = engine.PreviewAnnualCompetitionAssignments(db, EventId="event-1")
    [row] = preview["rows"]
    assert row["wouldOverwriteAdminOverride"] is True
    assert row["wouldChangeOnRun"] is False
    assert db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one().assigned_level_code == "PM-L3"


def test_preview_unknown_event_raises_404():
    from fastapi import HTTPException

    db = _session()
    with pytest.raises(HTTPException):
        engine.PreviewAnnualCompetitionAssignments(db, EventId="does-not-exist")


# ---------------------------------------------------------------------------
# Event Roster (2026-09-29, Shailesh) -- the explicit per-event eligibility
# list. Covers: the roster now being the only thing that scopes "Run
# Assignment Engine (All Students)" (the exact live bug being fixed -- a
# slot never officially assigned to real students leaking onto them because
# the old code considered every active student on the platform), the
# "Selected" run staying intersected with the roster, and the roster CRUD
# itself (bulk + single add/remove, per-student isolation on a bad id).
# ---------------------------------------------------------------------------

def test_engine_all_students_run_only_covers_the_roster_not_the_whole_platform():
    """The exact live bug this feature closes: "the real student accounts
    are also getting [assigned a slot] when i have never assigned that
    officially -- i had only allotted it to the test students." Two
    students exist on the platform; only one is on this event's roster.
    Running "All Students" (StudentIds=None) must never touch the other."""
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)  # on the roster
    _student(db, "s2", modules["PM"].id, levels["PM-L2"].id)  # NOT on the roster -- must never be touched
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert result["created"] == 1
    Rows = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.event_id == "event-1").all()
    assert {Row.student_id for Row in Rows} == {"s1"}


def test_engine_selected_students_run_is_intersected_with_the_roster():
    """A StudentIds selection that includes someone off the roster must
    silently exclude them, never assign them anyway."""
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    _student(db, "s2", modules["PM"].id, levels["PM-L2"].id)  # not rostered
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin, StudentIds=["s1", "s2"])
    assert result["created"] == 1
    Rows = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.event_id == "event-1").all()
    assert {Row.student_id for Row in Rows} == {"s1"}


def test_preview_all_students_only_covers_the_roster():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    _student(db, "s2", modules["PM"].id, levels["PM-L2"].id)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    preview = engine.PreviewAnnualCompetitionAssignments(db, EventId="event-1")
    assert {Row["studentId"] for Row in preview["rows"]} == {"s1"}


def test_roster_add_bulk_then_list_returns_every_student():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    _student(db, "s2", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    db.commit()

    result = engine.AddStudentsToEventRoster(db, EventId="event-1", StudentIds=["s1", "s2"], AddedBy=admin)
    assert result["studentsRequested"] == 2
    assert result["studentsSucceeded"] == 2
    assert result["studentsFailed"] == 0

    listing = engine.ListEventRoster(db, EventId="event-1")
    assert listing["totalStudents"] == 2
    assert {Row["studentId"] for Row in listing["rows"]} == {"s1", "s2"}


def test_roster_add_single_student_also_works():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    db.commit()

    result = engine.AddStudentsToEventRoster(db, EventId="event-1", StudentIds=["s1"], AddedBy=admin)
    assert result["studentsSucceeded"] == 1
    assert engine.ListEventRoster(db, EventId="event-1")["totalStudents"] == 1


def test_roster_add_is_idempotent_for_an_already_rostered_student():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    db.commit()

    engine.AddStudentsToEventRoster(db, EventId="event-1", StudentIds=["s1"], AddedBy=admin)
    result = engine.AddStudentsToEventRoster(db, EventId="event-1", StudentIds=["s1"], AddedBy=admin)
    assert result["studentsSucceeded"] == 1  # already on the roster -- not an error, not a duplicate row
    assert engine.ListEventRoster(db, EventId="event-1")["totalStudents"] == 1


def test_roster_add_one_bad_student_id_does_not_lose_the_others():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    db.commit()

    result = engine.AddStudentsToEventRoster(db, EventId="event-1", StudentIds=["s1", "does-not-exist"], AddedBy=admin)
    assert result["studentsSucceeded"] == 1
    assert result["studentsFailed"] == 1
    assert result["failed"][0]["studentId"] == "does-not-exist"
    assert engine.ListEventRoster(db, EventId="event-1")["totalStudents"] == 1


def test_roster_add_requires_at_least_one_student():
    from fastapi import HTTPException

    db = _session()
    admin = _admin(db)
    _event(db)
    db.commit()
    with pytest.raises(HTTPException):
        engine.AddStudentsToEventRoster(db, EventId="event-1", StudentIds=[], AddedBy=admin)


def test_roster_remove_bulk_leaves_the_others_untouched():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    _student(db, "s2", modules["PM"].id, levels["PM-L2"].id)
    _student(db, "s3", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1", "s2", "s3")
    db.commit()

    result = engine.RemoveStudentsFromEventRoster(db, EventId="event-1", StudentIds=["s1", "s2"])
    assert result["studentsRemoved"] == 2
    listing = engine.ListEventRoster(db, EventId="event-1")
    assert {Row["studentId"] for Row in listing["rows"]} == {"s3"}


def test_roster_remove_single_student_also_works():
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    result = engine.RemoveStudentsFromEventRoster(db, EventId="event-1", StudentIds=["s1"])
    assert result["studentsRemoved"] == 1
    assert engine.ListEventRoster(db, EventId="event-1")["totalStudents"] == 0


def test_roster_remove_never_touches_an_existing_assignment():
    """2026-09-29 (Shailesh, decision on removal mid-event): removing a
    student from the roster only stops FUTURE assignment/override runs --
    it must never cascade to (or otherwise disturb) an assignment they
    already have."""
    db = _session()
    modules, levels = _seed_curriculum(db)
    _student(db, "s1", modules["PM"].id, levels["PM-L2"].id)
    admin = _admin(db)
    _event(db)
    _roster(db, "event-1", "s1")
    db.commit()

    engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").count() == 1

    engine.RemoveStudentsFromEventRoster(db, EventId="event-1", StudentIds=["s1"])
    assert db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").count() == 1

    # And a re-run now excludes them entirely, but the earlier row is untouched.
    student = db.get(Student, "s1")
    student.current_level_id = levels["PM-L3"].id
    db.commit()
    result = engine.RunAnnualCompetitionAssignmentEngine(db, EventId="event-1", RunBy=admin)
    assert result["created"] == 0
    assert result["updated"] == 0
    Row = db.query(CompetitionEventAssignment).filter(CompetitionEventAssignment.student_id == "s1").one()
    assert Row.assigned_level_code == "PM-L1"  # untouched from the first run, not recomputed to PM-L2


def test_roster_remove_requires_at_least_one_student():
    from fastapi import HTTPException

    db = _session()
    _event(db)
    db.commit()
    with pytest.raises(HTTPException):
        engine.RemoveStudentsFromEventRoster(db, EventId="event-1", StudentIds=[])


def test_roster_list_unknown_event_raises_404():
    from fastapi import HTTPException

    db = _session()
    with pytest.raises(HTTPException):
        engine.ListEventRoster(db, EventId="does-not-exist")
