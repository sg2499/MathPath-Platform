"""Tell teachers when the rest of a lesson is published (2026-11-03, Shailesh).

A lesson can be published in parts: IM-L2 Lesson 8 had DPS 1-2 published in
July and DPS 3-5 only on 2 Nov. Students given the lesson in between hold the
first sheets only, and nothing told their teacher when the remaining sheets
became available to schedule.

When Admin publishes sheets of a lesson, every teacher who has a student in
that level holding earlier sheets of the lesson but not the newly published
ones gets ONE notification per publish, naming those students and linking
straight to Assign Practice on that lesson.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import DPS, Assignment, Attempt, Lesson, Level, Student, Teacher, User
from app.services.demo_students import RealStudents
from app.services.lesson_progress_service import COMPLETED_ATTEMPT_STATUSES
from app.services.notification_service import CreateNotification
from app.services.practice_notification_service import _teacher_for_student

Logger = logging.getLogger(__name__)

NOTIFICATION_TYPE = "DPS_LESSON_REST_PUBLISHED"


def _SheetLabel(numbers: list[int]) -> str:
    numbers = sorted(numbers)
    if len(numbers) == 1:
        return f"DPS {numbers[0]}"
    return "DPS " + ", ".join(str(n) for n in numbers[:-1]) + f" and {numbers[-1]}"


def _NameList(names: list[str], limit: int = 6) -> str:
    names = sorted(names)
    if len(names) <= limit:
        return ", ".join(names)
    return ", ".join(names[:limit]) + f" and {len(names) - limit} more"


def StudentsNeedingRestOfLesson(db: Session, lesson: Lesson, new_dps_ids: list[str]) -> list[Student]:
    """Active, real students in the lesson's level who hold at least one OTHER
    sheet of this lesson (assigned or done) but are missing at least one of
    the newly published sheets."""
    if not new_dps_ids:
        return []
    lesson_dps_ids = [row[0] for row in db.query(DPS.id).filter(DPS.lesson_id == lesson.id, DPS.is_active == True).all()]
    earlier_ids = [dps_id for dps_id in lesson_dps_ids if dps_id not in set(new_dps_ids)]
    if not earlier_ids:
        return []
    students = (
        RealStudents(db.query(Student).filter(Student.current_level_id == lesson.level_id, Student.is_active == True))
        .all()
    )
    if not students:
        return []
    student_ids = [student.id for student in students]

    def _Held(dps_ids: list[str]) -> set[tuple[str, str]]:
        held = {
            (row[0], row[1])
            for row in db.query(Assignment.assigned_to_id, Assignment.dps_id)
            .filter(
                Assignment.assigned_to_type == "STUDENT",
                Assignment.assigned_to_id.in_(student_ids),
                Assignment.dps_id.in_(dps_ids),
                Assignment.is_active == True,
            )
            .all()
        }
        held |= {
            (row[0], row[1])
            for row in db.query(Attempt.student_id, Attempt.dps_id)
            .filter(Attempt.student_id.in_(student_ids), Attempt.dps_id.in_(dps_ids), Attempt.status.in_(COMPLETED_ATTEMPT_STATUSES))
            .all()
        }
        return held

    earlier_held = _Held(earlier_ids)
    new_held = _Held(list(new_dps_ids))
    result = []
    for student in students:
        has_earlier = any((student.id, dps_id) in earlier_held for dps_id in earlier_ids)
        missing_new = any((student.id, dps_id) not in new_held for dps_id in new_dps_ids)
        if has_earlier and missing_new:
            result.append(student)
    return result


def NotifyTeachersRestOfLessonPublished(db: Session, *, lesson_id: str, published_dps: list[DPS], actor_user_id: str | None = None) -> int:
    """Create the teacher notifications. Returns how many were created. Never
    raises: publishing must succeed even if a notification cannot be made."""
    try:
        lesson = db.get(Lesson, lesson_id)
        if not lesson or not published_dps:
            return 0
        level = db.get(Level, lesson.level_id)
        students = StudentsNeedingRestOfLesson(db, lesson, [dps.id for dps in published_dps])
        if not students:
            return 0
        by_teacher: dict[str, tuple[Teacher, list[Student]]] = {}
        for student in students:
            teacher = _teacher_for_student(db, student)
            if not teacher or not teacher.user_id:
                continue
            by_teacher.setdefault(teacher.id, (teacher, []))[1].append(student)

        sheet_label = _SheetLabel([dps.dps_number for dps in published_dps])
        verb = "is" if len(published_dps) == 1 else "are"
        level_code = level.level_code if level else ""
        created = 0
        for teacher, teacher_students in by_teacher.values():
            names = []
            for student in teacher_students:
                user = db.get(User, student.user_id) if student.user_id else None
                names.append(user.full_name if user and user.full_name else student.student_code)
            count = len(teacher_students)
            CreateNotification(
                db,
                recipient_user_id=teacher.user_id,
                recipient_role="TEACHER",
                type=NOTIFICATION_TYPE,
                category="PRACTICE",
                title=f"{level_code} Lesson {lesson.lesson_number}: {sheet_label} {verb} now published",
                message=(
                    f"{count} of your students {'has' if count == 1 else 'have'} the earlier sheets of this lesson and "
                    f"{'needs' if count == 1 else 'need'} the rest: {_NameList(names)}. "
                    "Open Assign Practice to schedule the remaining sheets."
                ),
                actor_user_id=actor_user_id,
                actor_role="ADMIN",
                teacher_id=teacher.id,
                level_id=lesson.level_id,
                lesson_id=lesson.id,
                target_route=f"/teacher/assign-dps?lesson={lesson.id}",
                metadata={
                    "lessonId": lesson.id,
                    "lessonNumber": lesson.lesson_number,
                    "levelCode": level_code,
                    "publishedDpsNumbers": sorted(dps.dps_number for dps in published_dps),
                    "studentIds": [student.id for student in teacher_students],
                },
            )
            created += 1
        db.commit()
        return created
    except Exception:  # pragma: no cover - logged, never blocks publishing
        Logger.exception("Could not notify teachers that the rest of lesson %s was published", lesson_id)
        db.rollback()
        return 0
