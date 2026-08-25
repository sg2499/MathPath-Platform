"""Derived lesson-position tracking for teacher-facing practice tools.

Nothing here is stored -- a student's "current lesson" is always computed
fresh from Attempt.cleared_at_attempt (the same benchmark-clear flag that
drives every other "cleared" signal in the product), so it can never drift
out of sync with what actually happened. There is deliberately no stored
pointer / migration for this: a stored value would need to be kept in sync
by every code path that can move it (grading, admin intervention, manual
promotion), and any missed path would produce stale/false info for the
teacher, which is exactly what this feature must never do.

"Assignable" mirrors, byte-for-byte, the exact block/allow decision
assign_single_dps_to_students() (routes_teacher.py) already makes per DPS --
the two must never diverge, so both call the two helpers below rather than
each re-deriving their own version of "has this student already got this
sheet".
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Assignment, AssignmentReattemptPermission, Attempt, DPS, Lesson, Student

COMPLETED_ATTEMPT_STATUSES = ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]


def student_has_completed_dps(db: Session, student_id: str, dps_id: str) -> bool:
    return (
        db.query(Attempt)
        .filter(
            Attempt.student_id == student_id,
            Attempt.dps_id == dps_id,
            Attempt.status.in_(COMPLETED_ATTEMPT_STATUSES),
        )
        .first()
        is not None
    )


def active_reattempt_permission_for_teacher(db: Session, student_id: str, dps_id: str):
    return (
        db.query(AssignmentReattemptPermission)
        .filter(
            AssignmentReattemptPermission.student_id == student_id,
            AssignmentReattemptPermission.dps_id == dps_id,
            AssignmentReattemptPermission.status == "APPROVED",
            AssignmentReattemptPermission.used_at.is_(None),
        )
        .order_by(AssignmentReattemptPermission.allowed_at.desc())
        .first()
    )


def _EmptyProgress() -> dict:
    return {
        "currentLessonId": None,
        "currentLessonNumber": None,
        "currentLessonTitle": None,
        "clearedInCurrentLesson": 0,
        "totalInCurrentLesson": 0,
        "assignableInCurrentLesson": False,
        "levelComplete": False,
        "previousLessonNumber": None,
        "previousLessonTitle": None,
    }


def ComputeLessonProgressForStudents(db: Session, students: list[Student], level_id: str) -> dict[str, dict]:
    """Compute per-student lesson position for a single, already-known level.

    Batched (no N+1): one query per fact type across all students/DPS in the
    level, then everything else is plain in-memory set lookups.
    """
    result: dict[str, dict] = {}
    if not students or not level_id:
        return result

    lessons = (
        db.query(Lesson)
        .filter(Lesson.level_id == level_id, Lesson.is_active == True)
        .order_by(Lesson.lesson_number.asc())
        .all()
    )
    if not lessons:
        return {student.id: _EmptyProgress() for student in students}

    # Every DPS row for the lesson counts toward the total shown to the
    # teacher -- including a not-yet-published sheet and a concept-drill
    # slot (both are real rows in this same table, just a different
    # publication_status/content type). Filtering to PUBLISHED here was the
    # bug: a lesson with 5 real sheets but only 2 published showed "0/2"
    # instead of "0/5". Only assignability (below) still requires PUBLISHED,
    # since that's the one thing a teacher genuinely cannot act on yet.
    lesson_ids = [lesson.id for lesson in lessons]
    dps_rows = (
        db.query(DPS)
        .filter(DPS.lesson_id.in_(lesson_ids), DPS.is_active == True)
        .all()
    )
    dps_by_lesson: dict[str, list[DPS]] = {}
    for dps in dps_rows:
        dps_by_lesson.setdefault(dps.lesson_id, []).append(dps)
    published_dps_ids = {dps.id for dps in dps_rows if dps.publication_status == "PUBLISHED"}

    ordered_lessons = [lesson for lesson in lessons if dps_by_lesson.get(lesson.id)]
    if not ordered_lessons:
        return {student.id: _EmptyProgress() for student in students}

    student_ids = [student.id for student in students]
    all_dps_ids = [dps.id for dps in dps_rows]

    cleared_pairs = {
        (row[0], row[1])
        for row in db.query(Attempt.student_id, Attempt.dps_id)
        .filter(Attempt.student_id.in_(student_ids), Attempt.dps_id.in_(all_dps_ids), Attempt.cleared_at_attempt == True)
        .distinct()
        .all()
    }
    completed_pairs = {
        (row[0], row[1])
        for row in db.query(Attempt.student_id, Attempt.dps_id)
        .filter(Attempt.student_id.in_(student_ids), Attempt.dps_id.in_(all_dps_ids), Attempt.status.in_(COMPLETED_ATTEMPT_STATUSES))
        .distinct()
        .all()
    }
    assigned_pairs = {
        (row[0], row[1])
        for row in db.query(Assignment.assigned_to_id, Assignment.dps_id)
        .filter(
            Assignment.assigned_to_type == "STUDENT",
            Assignment.assigned_to_id.in_(student_ids),
            Assignment.dps_id.in_(all_dps_ids),
            Assignment.is_active == True,
        )
        .distinct()
        .all()
    }
    open_reattempt_pairs = {
        (row[0], row[1])
        for row in db.query(AssignmentReattemptPermission.student_id, AssignmentReattemptPermission.dps_id)
        .filter(
            AssignmentReattemptPermission.student_id.in_(student_ids),
            AssignmentReattemptPermission.dps_id.in_(all_dps_ids),
            AssignmentReattemptPermission.status == "APPROVED",
            AssignmentReattemptPermission.used_at.is_(None),
        )
        .distinct()
        .all()
    }

    def is_assignable_now(student_id: str, dps_id: str) -> bool:
        # A teacher can never assign an unpublished sheet, whatever else is
        # true about it (matches the DPS_NOT_PUBLISHED block enforced at the
        # actual assignment-creation routes).
        if dps_id not in published_dps_ids:
            return False
        # Mirrors assign_single_dps_to_students(): blocked by an active
        # STUDENT assignment or a completed attempt, unless an approved,
        # unused reattempt permission is open for this exact student+DPS.
        blocked = (student_id, dps_id) in assigned_pairs or (student_id, dps_id) in completed_pairs
        if not blocked:
            return True
        return (student_id, dps_id) in open_reattempt_pairs

    for student in students:
        last_cleared_lesson = None
        current = None
        for lesson in ordered_lessons:
            lesson_dps = dps_by_lesson[lesson.id]
            cleared_count = sum(1 for dps in lesson_dps if (student.id, dps.id) in cleared_pairs)
            total_count = len(lesson_dps)
            if cleared_count == total_count:
                last_cleared_lesson = (lesson.lesson_number, lesson.lesson_title)
                continue
            assignable = any(is_assignable_now(student.id, dps.id) for dps in lesson_dps)
            current = {
                "currentLessonId": lesson.id,
                "currentLessonNumber": lesson.lesson_number,
                "currentLessonTitle": lesson.lesson_title,
                "clearedInCurrentLesson": cleared_count,
                "totalInCurrentLesson": total_count,
                "assignableInCurrentLesson": assignable,
                "levelComplete": False,
                "previousLessonNumber": last_cleared_lesson[0] if last_cleared_lesson else None,
                "previousLessonTitle": last_cleared_lesson[1] if last_cleared_lesson else None,
            }
            break
        if current is None:
            # Every lesson in the level is fully cleared.
            current = _EmptyProgress()
            current["levelComplete"] = True
            if last_cleared_lesson:
                current["previousLessonNumber"] = last_cleared_lesson[0]
                current["previousLessonTitle"] = last_cleared_lesson[1]
        result[student.id] = current

    return result


def ComputeLessonProgressByLevelGroups(db: Session, students: list[Student]) -> dict[str, dict]:
    """Same as ComputeLessonProgressForStudents but groups students by their
    own current_level_id first, so callers can pass a mixed-level roster
    (e.g. a teacher's full student list) in one call.
    """
    result: dict[str, dict] = {}
    by_level: dict[str, list[Student]] = {}
    for student in students:
        if not student.current_level_id:
            continue
        by_level.setdefault(student.current_level_id, []).append(student)

    for level_id, level_students in by_level.items():
        result.update(ComputeLessonProgressForStudents(db, level_students, level_id))

    return result


def IsLessonFullyClearedForStudent(db: Session, student_id: str, lesson_id: str) -> tuple[bool, int, int]:
    """Returns (all_cleared, cleared_count, total_count) for one student in
    one lesson. Used by the notification hook to detect the exact moment a
    lesson's last sheet clears.

    Total is every real DPS row for the lesson (any publication status),
    same as ComputeLessonProgressForStudents above -- otherwise this would
    fire "lesson cleared" the moment every currently-published sheet is
    cleared, even while an unpublished sheet still belongs to the lesson.
    """
    dps_rows = (
        db.query(DPS)
        .filter(DPS.lesson_id == lesson_id, DPS.is_active == True)
        .all()
    )
    if not dps_rows:
        return False, 0, 0
    dps_ids = [dps.id for dps in dps_rows]
    cleared_count = (
        db.query(Attempt.dps_id)
        .filter(Attempt.student_id == student_id, Attempt.dps_id.in_(dps_ids), Attempt.cleared_at_attempt == True)
        .distinct()
        .count()
    )
    total_count = len(dps_ids)
    return cleared_count == total_count, cleared_count, total_count
