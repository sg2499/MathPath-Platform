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
        # True by default -- callers with no real progress info at all
        # (e.g. no lessons found for this level) should never block a
        # teacher from picking any lesson to start a student on.
        "isNewToLevel": True,
        "assignableDpsIds": [],
    }


def ComputeLessonProgressForStudents(db: Session, students: list[Student], level_id: str) -> dict[str, dict]:
    """Compute per-student lesson position for a single, already-known level.

    "Current lesson" is anchored on the most advanced lesson the student has
    actually been assigned a DPS sheet in -- not inferred from a strict
    lesson-1-first clearing sequence. The previous version assumed every
    student clears lessons strictly in order, so a student who joined the
    platform mid-level (or was assigned straight into a later lesson,
    skipping earlier ones that were never formally attempted here) always
    showed as stuck on Lesson 1, since Lesson 1 was never "fully cleared" in
    this system's own records (Shailesh, 2026-08-31: "many students are
    already in the middle of a level... so we need to precisely and
    accurately show the exact lesson the student is on and if cleared we
    also show the next lesson they are gonna be attempting"). A student
    with no assignment history anywhere in this level yet still falls back
    to the original lesson-1-first walk below, which is the right answer
    for someone who genuinely hasn't started.

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
    lesson_id_by_dps_id: dict[str, str] = {}
    for dps in dps_rows:
        dps_by_lesson.setdefault(dps.lesson_id, []).append(dps)
        lesson_id_by_dps_id[dps.id] = dps.lesson_id
    published_dps_ids = {dps.id for dps in dps_rows if dps.publication_status == "PUBLISHED"}

    ordered_lessons = [lesson for lesson in lessons if dps_by_lesson.get(lesson.id)]
    if not ordered_lessons:
        return {student.id: _EmptyProgress() for student in students}
    lesson_index_by_id = {lesson.id: index for index, lesson in enumerate(ordered_lessons)}

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

    # Highest lesson index each student has ever actually been assigned a
    # DPS sheet in, within this level. Missing from this dict means "never
    # assigned anything here yet" -- that student gets the original
    # lesson-1-first walk below instead of an anchor.
    highest_assigned_lesson_index: dict[str, int] = {}
    for student_id, dps_id in assigned_pairs:
        lesson_id = lesson_id_by_dps_id.get(dps_id)
        lesson_idx = lesson_index_by_id.get(lesson_id) if lesson_id else None
        if lesson_idx is None:
            continue
        if lesson_idx > highest_assigned_lesson_index.get(student_id, -1):
            highest_assigned_lesson_index[student_id] = lesson_idx

    # Every DPS in this level currently assignable to each student -- not
    # just the ones in their anchored "current" lesson. assign-dps/page.tsx
    # uses this (not currentLessonId/assignableInCurrentLesson) to decide
    # who shows up as eligible for a lesson/sheet the teacher picks, so a
    # student correctly anchored on e.g. Lesson 4 always shows up when the
    # teacher picks Lesson 4 to assign or schedule, and a student with no
    # assignment history yet (whose "current lesson" above is only the
    # lesson-1-first fallback) shows up under any lesson, not just that
    # fallback one. "Eligible for something" must always mean "visible
    # there" -- this is computed directly per DPS, never inferred from a
    # single summarized lesson label.
    assignable_dps_ids_by_student: dict[str, list[str]] = {
        student.id: [dps.id for dps in dps_rows if is_assignable_now(student.id, dps.id)]
        for student in students
    }

    def lesson_progress(student_id: str, lesson_idx: int) -> tuple[int, int, bool]:
        lesson = ordered_lessons[lesson_idx]
        lesson_dps = dps_by_lesson[lesson.id]
        cleared_count = sum(1 for dps in lesson_dps if (student_id, dps.id) in cleared_pairs)
        total_count = len(lesson_dps)
        assignable = any(is_assignable_now(student_id, dps.id) for dps in lesson_dps)
        return cleared_count, total_count, assignable

    for student in students:
        anchor_idx = highest_assigned_lesson_index.get(student.id)
        lesson_idx = anchor_idx if anchor_idx is not None else 0
        cleared_count, total_count, assignable = lesson_progress(student.id, lesson_idx)

        # Fully cleared -- advance to the next lesson (what they're about to
        # attempt), same walk whether we started from a real assignment
        # anchor or from Lesson 1 for a student with no history yet.
        while cleared_count == total_count and lesson_idx + 1 < len(ordered_lessons):
            lesson_idx += 1
            cleared_count, total_count, assignable = lesson_progress(student.id, lesson_idx)

        if cleared_count == total_count:
            # Cleared every lesson reachable this way, including the last
            # one in the level -- the level is complete.
            finished_lesson = ordered_lessons[lesson_idx]
            result[student.id] = {
                **_EmptyProgress(),
                "levelComplete": True,
                "previousLessonNumber": finished_lesson.lesson_number,
                "previousLessonTitle": finished_lesson.lesson_title,
                "isNewToLevel": anchor_idx is None,
                "assignableDpsIds": assignable_dps_ids_by_student.get(student.id, []),
            }
            continue

        lesson = ordered_lessons[lesson_idx]
        # "Previous" only reports a real, fully-cleared lesson immediately
        # before this one -- never the lesson merely one index back, which
        # for an assignment-anchored student that skipped ahead may never
        # have been assigned or attempted at all.
        previous_lesson = None
        if lesson_idx > 0:
            previous_cleared, previous_total, _ = lesson_progress(student.id, lesson_idx - 1)
            if previous_total > 0 and previous_cleared == previous_total:
                previous_lesson = ordered_lessons[lesson_idx - 1]
        result[student.id] = {
            "currentLessonId": lesson.id,
            "currentLessonNumber": lesson.lesson_number,
            "currentLessonTitle": lesson.lesson_title,
            "clearedInCurrentLesson": cleared_count,
            "totalInCurrentLesson": total_count,
            "assignableInCurrentLesson": assignable,
            "levelComplete": False,
            "previousLessonNumber": previous_lesson.lesson_number if previous_lesson else None,
            "previousLessonTitle": previous_lesson.lesson_title if previous_lesson else None,
            # No assignment history anywhere in this level yet -- this
            # student's "current lesson" above is only the lesson-1-first
            # fallback, not a real anchor, so a teacher must be able to
            # place their first assignment on ANY lesson in the level (the
            # one matching where the student actually is in real life),
            # not just this fallback. See assign-dps/page.tsx eligibleStudents.
            "isNewToLevel": anchor_idx is None,
            "assignableDpsIds": assignable_dps_ids_by_student.get(student.id, []),
        }

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
