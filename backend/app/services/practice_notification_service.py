from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    Assignment,
    AssignmentReattemptPermission,
    Attempt,
    DPS,
    Lesson,
    Level,
    Module,
    Student,
    Teacher,
    User,
    Notification,
)
from app.services.notification_service import ActiveAdminUsers, CreateNotification

PRACTICE_BENCHMARK_PERCENTAGE = 70.0


def _json_loads(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        Parsed = json.loads(value)
        return Parsed if isinstance(Parsed, dict) else {}
    except Exception:
        return {}


def _json_dumps(value: dict[str, Any] | None) -> str | None:
    if value is None:
        return None
    return json.dumps(value, default=str)


def _merge_unique_values(*Groups: list[Any]) -> list[Any]:
    Seen: set[str] = set()
    Result: list[Any] = []
    for Group in Groups:
        for Value in Group or []:
            if Value is None:
                continue
            Key = str(Value)
            if not Key or Key in Seen:
                continue
            Seen.add(Key)
            Result.append(Value)
    return Result


def _recent_assignment_notification(
    db: Session,
    *,
    recipient_user_id: str,
    student_id: str | None,
    module_id: str | None,
    level_id: str | None,
    actor_user_id: str | None,
    target_route: str | None,
    since_minutes: int = 10,
) -> Notification | None:
    Since = datetime.now(timezone.utc) - timedelta(minutes=since_minutes)
    Query = db.query(Notification).filter(
        Notification.recipient_user_id == recipient_user_id,
        Notification.category == "PRACTICE",
        Notification.type.in_([
            "DPS_ASSIGNED",
            "DPS_ASSIGNED_BULK",
            "DPS_ASSIGNED_BY_TEACHER",
            "DPS_ASSIGNED_BULK_BY_TEACHER",
            "DPS_REATTEMPT_ASSIGNED",
            "DPS_REATTEMPT_ASSIGNED_BY_TEACHER",
        ]),
        Notification.student_id == student_id,
        Notification.module_id == module_id,
        Notification.level_id == level_id,
        Notification.is_read.is_(False),
        Notification.created_at >= Since,
    )
    if actor_user_id:
        Query = Query.filter(Notification.actor_user_id == actor_user_id)
    if target_route:
        Query = Query.filter(Notification.target_route == target_route)
    return Query.order_by(Notification.created_at.desc()).first()


def _create_or_merge_assignment_notification(
    db: Session,
    *,
    recipient_user_id: str,
    recipient_role: str,
    actor_user_id: str | None,
    actor_role: str | None,
    student_id: str | None,
    teacher_id: str | None,
    module_id: str | None,
    level_id: str | None,
    lesson_id: str | None,
    dps_id: str | None,
    type: str,
    title: str,
    message: str,
    target_route: str,
    target_tab: str,
    metadata: dict[str, Any],
    student_name: str | None,
    teacher_name: str | None,
    display_level: str | None,
) -> Notification:
    ShouldMerge = "REATTEMPT" not in str(type or "").upper() and "APPROVAL" not in str(type or "").upper()
    Existing = None
    if ShouldMerge:
        Existing = _recent_assignment_notification(
            db,
            recipient_user_id=recipient_user_id,
            student_id=student_id,
            module_id=module_id,
            level_id=level_id,
            actor_user_id=actor_user_id,
            target_route=target_route,
        )
    if not Existing:
        return CreateNotification(
            db,
            recipient_user_id=recipient_user_id,
            recipient_role=recipient_role,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            student_id=student_id,
            teacher_id=teacher_id,
            module_id=module_id,
            level_id=level_id,
            lesson_id=lesson_id,
            dps_id=dps_id,
            type=type,
            category="PRACTICE",
            title=title,
            message=message,
            target_route=target_route,
            target_tab=target_tab,
            metadata=metadata,
        )

    ExistingMetadata = _json_loads(Existing.metadata_json)
    ExistingAssignmentIds = ExistingMetadata.get("assignmentIds") if isinstance(ExistingMetadata.get("assignmentIds"), list) else []
    ExistingDpsIds = ExistingMetadata.get("dpsIds") if isinstance(ExistingMetadata.get("dpsIds"), list) else []
    ExistingLessonIds = ExistingMetadata.get("lessonIds") if isinstance(ExistingMetadata.get("lessonIds"), list) else []
    NewAssignmentIds = metadata.get("assignmentIds") if isinstance(metadata.get("assignmentIds"), list) else []
    NewDpsIds = metadata.get("dpsIds") if isinstance(metadata.get("dpsIds"), list) else []
    NewLessonIds = metadata.get("lessonIds") if isinstance(metadata.get("lessonIds"), list) else []

    MergedAssignmentIds = _merge_unique_values(ExistingAssignmentIds, NewAssignmentIds, [metadata.get("assignmentId")])
    MergedDpsIds = _merge_unique_values(ExistingDpsIds, NewDpsIds, [metadata.get("dpsId")])
    MergedLessonIds = _merge_unique_values(ExistingLessonIds, NewLessonIds, [metadata.get("lessonId")])
    MergedCount = max(len(MergedDpsIds), len(MergedAssignmentIds), 2)

    ExistingMetadata.update(metadata)
    ExistingMetadata.update({
        "assignmentIds": MergedAssignmentIds,
        "assignmentCount": MergedCount,
        "dpsIds": MergedDpsIds,
        "dpsCount": MergedCount,
        "lessonIds": MergedLessonIds,
        "notificationGroup": "PRACTICE_BULK",
        "isGrouped": True,
        "targetAction": "review-assigned-dps" if recipient_role.upper() == "STUDENT" else "review-student-practice",
    })

    Existing.type = "DPS_ASSIGNED_BULK" if recipient_role.upper() == "STUDENT" else "DPS_ASSIGNED_BULK_BY_TEACHER"
    if recipient_role.upper() == "STUDENT":
        Existing.title = f"{MergedCount} DPS Assigned"
        Existing.message = f"{display_level or 'This level'} has {MergedCount} new DPS sheets ready."
    else:
        Existing.title = f"{MergedCount} DPS Assigned To {student_name or 'Student'}"
        Existing.message = f"{teacher_name or 'Teacher'} assigned {MergedCount} DPS sheets to {student_name or 'this student'}."
    Existing.lesson_id = lesson_id or Existing.lesson_id
    Existing.dps_id = dps_id or Existing.dps_id
    Existing.target_tab = target_tab or Existing.target_tab
    Existing.target_route = target_route or Existing.target_route
    Existing.metadata_json = _json_dumps(ExistingMetadata)
    Existing.created_at = datetime.now(timezone.utc)
    Existing.updated_at = datetime.now(timezone.utc)
    db.flush()
    return Existing


def _student_user(db: Session, student: Student | None) -> User | None:
    return db.get(User, student.user_id) if student and student.user_id else None


def _teacher_user(db: Session, teacher: Teacher | None) -> User | None:
    return db.get(User, teacher.user_id) if teacher and teacher.user_id else None


def _teacher_for_student(db: Session, student: Student | None) -> Teacher | None:
    if not student:
        return None
    teacher_id = getattr(student, "teacher_id", None)
    if teacher_id:
        teacher = db.get(Teacher, teacher_id)
        if teacher:
            return teacher
    teacher_name = (getattr(student, "teacher", None) or "").strip()
    if not teacher_name:
        return None
    teacher_users = db.query(User).filter(User.full_name == teacher_name, User.is_active.is_(True)).all()
    teacher_user_ids = [user.id for user in teacher_users]
    if not teacher_user_ids:
        return None
    return db.query(Teacher).filter(Teacher.user_id.in_(teacher_user_ids), Teacher.is_active.is_(True)).first()


def _teacher_for_assignment_or_student(db: Session, assignment: Assignment | None, student: Student | None) -> Teacher | None:
    if assignment and assignment.assigned_by_user_id:
        teacher = db.query(Teacher).filter(Teacher.user_id == assignment.assigned_by_user_id, Teacher.is_active.is_(True)).first()
        if teacher:
            return teacher
    return _teacher_for_student(db, student)


def _practice_context(db: Session, *, assignment: Assignment | None = None, attempt: Attempt | None = None, permission: AssignmentReattemptPermission | None = None) -> dict[str, Any]:
    if not assignment and attempt and attempt.assignment_id:
        assignment = db.get(Assignment, attempt.assignment_id)
    if not assignment and permission and permission.assignment_id:
        assignment = db.get(Assignment, permission.assignment_id)

    dps = None
    if attempt and attempt.dps_id:
        dps = db.get(DPS, attempt.dps_id)
    if not dps and assignment and assignment.dps_id:
        dps = db.get(DPS, assignment.dps_id)
    if not dps and permission and permission.dps_id:
        dps = db.get(DPS, permission.dps_id)

    lesson = db.get(Lesson, dps.lesson_id) if dps and dps.lesson_id else None
    level = db.get(Level, lesson.level_id) if lesson and lesson.level_id else None
    module = db.get(Module, level.module_id) if level and level.module_id else None

    student = None
    if attempt and attempt.student_id:
        student = db.get(Student, attempt.student_id)
    if not student and permission and permission.student_id:
        student = db.get(Student, permission.student_id)
    if not student and assignment and assignment.assigned_to_type == "STUDENT" and assignment.assigned_to_id:
        student = db.get(Student, assignment.assigned_to_id)

    teacher = _teacher_for_assignment_or_student(db, assignment, student)
    student_user = _student_user(db, student)
    teacher_user = _teacher_user(db, teacher)

    lesson_number = lesson.lesson_number if lesson else None
    dps_number = dps.dps_number if dps else None
    dps_label = f"DPS {dps_number}" if dps_number is not None else "DPS"
    if dps and dps.dps_title:
        dps_label = f"{dps_label}: {dps.dps_title}"

    return {
        "assignment": assignment,
        "attempt": attempt,
        "permission": permission,
        "student": student,
        "student_user": student_user,
        "teacher": teacher,
        "teacher_user": teacher_user,
        "dps": dps,
        "lesson": lesson,
        "level": level,
        "module": module,
        "student_name": student_user.full_name if student_user else (student.student_code if student else "Student"),
        "student_code": student.student_code if student else None,
        "teacher_name": teacher_user.full_name if teacher_user else "Teacher",
        "module_label": module.module_name if module else "Module",
        "module_code": module.module_code if module else None,
        "level_label": level.level_code if level else "Level",
        "level_code": level.level_code if level else None,
        "lesson_id": lesson.id if lesson else None,
        "dps_id": dps.id if dps else None,
        "lesson_label": f"Lesson {lesson_number}" if lesson_number is not None else "Lesson",
        "dps_label": dps_label,
    }


def _practice_notification_identity(context: dict[str, Any]) -> str:
    """Stable human-readable DPS identity for every practice notification.

    DPS numbers repeat across levels and lessons. Notifications therefore need
    the full learning-path identity so students, teachers, and admins can
    identify the exact work item without opening the page first.
    """
    level_label = str(context.get("level_code") or context.get("level_label") or "Level").strip()
    lesson_label = str(context.get("lesson_label") or "Lesson").strip()
    dps_label = str(context.get("dps_label") or "DPS").strip()
    return " • ".join([Part for Part in [level_label, lesson_label, dps_label] if Part])


def _practice_identity_metadata(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "displayContext": _practice_notification_identity(context),
        "levelLabel": context.get("level_code") or context.get("level_label"),
        "lessonLabel": context.get("lesson_label"),
        "dpsLabel": context.get("dps_label"),
    }


def _admin_practice_target_route(context: dict[str, Any]) -> str:
    student_code = str(context.get("student_code") or "").strip()
    return f"/admin/assignments/student/{student_code}" if student_code else "/admin/assignments"


def _teacher_practice_target_route(context: dict[str, Any]) -> str:
    student_code = str(context.get("student_code") or "").strip()
    return f"/teacher/assignment-tracker/student/{student_code}" if student_code else "/teacher/assignment-tracker"


def _admin_notifications(
    db: Session,
    *,
    type: str,
    category: str,
    title: str,
    message: str,
    actor_user_id: str | None = None,
    actor_role: str | None = None,
    student_id: str | None = None,
    teacher_id: str | None = None,
    module_id: str | None = None,
    level_id: str | None = None,
    lesson_id: str | None = None,
    dps_id: str | None = None,
    attempt_id: str | None = None,
    target_route: str = "/admin/assignments",
    target_tab: str | None = None,
    target_sub_tab: str | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    for admin in ActiveAdminUsers(db):
        CreateNotification(
            db,
            recipient_user_id=admin.id,
            recipient_role=admin.role,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            student_id=student_id,
            teacher_id=teacher_id,
            module_id=module_id,
            level_id=level_id,
            lesson_id=lesson_id,
            dps_id=dps_id,
            attempt_id=attempt_id,
            type=type,
            category=category,
            title=title,
            message=message,
            target_route=target_route,
            target_tab=target_tab,
            target_sub_tab=target_sub_tab,
            metadata=metadata,
        )


def _unique_compact(values: list[Any]) -> list[Any]:
    seen: set[str] = set()
    result: list[Any] = []
    for value in values:
        if value is None:
            continue
        key = str(value)
        if not key or key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _assignment_group_metadata(
    *,
    contexts: list[dict[str, Any]],
    assignments: list[Assignment],
    first_assignment: Assignment,
    first_context: dict[str, Any],
    count: int,
    target_action: str,
) -> dict[str, Any]:
    first_lesson = first_context.get("lesson")
    first_dps = first_context.get("dps")
    level_label = first_context.get("level_code") or first_context.get("level_label")
    assignment_ids = _unique_compact([assignment.id for assignment in assignments])
    dps_ids = _unique_compact([
        (context.get("dps").id if context.get("dps") else None)
        for context in contexts
    ])
    lesson_ids = _unique_compact([
        (context.get("lesson").id if context.get("lesson") else None)
        for context in contexts
    ])
    return {
        "assignmentId": first_assignment.id,
        "assignmentIds": assignment_ids,
        "assignmentCount": count,
        "dpsCount": count,
        "dpsId": first_dps.id if first_dps else None,
        "dpsIds": dps_ids,
        "lessonId": first_lesson.id if first_lesson else None,
        "lessonIds": lesson_ids,
        "studentCode": first_context.get("student_code"),
        "moduleCode": first_context.get("module_code"),
        "levelCode": level_label,
        "highlightId": f"assignment-{first_assignment.id}",
        "targetAction": target_action,
        "notificationGroup": "PRACTICE_BULK" if count > 1 else "PRACTICE",
        "isGrouped": count > 1,
        **_practice_identity_metadata(first_context),
    }


def _practice_focus_metadata(context: dict[str, Any], *, assignment: Assignment | None = None, attempt: Attempt | None = None, target_action: str) -> dict[str, Any]:
    lesson = context.get("lesson")
    dps = context.get("dps")
    return {
        "assignmentId": assignment.id if assignment else None,
        "attemptId": attempt.id if attempt else None,
        "dpsId": dps.id if dps else None,
        "lessonId": lesson.id if lesson else None,
        "studentCode": context.get("student_code"),
        "moduleCode": context.get("module_code"),
        "levelCode": context.get("level_code") or context.get("level_label"),
        "highlightId": f"assignment-{assignment.id}" if assignment else (f"attempt-{attempt.id}" if attempt else None),
        "targetAction": target_action,
        "notificationGroup": "PRACTICE",
        **_practice_identity_metadata(context),
    }


def NotifyPracticeReattemptApprovalNeeded(
    db: Session,
    *,
    attempt_id: str,
) -> None:
    """Notify all roles when automatic re-attempt capacity is exhausted."""
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return

    assignment = db.get(Assignment, attempt.assignment_id) if attempt.assignment_id else None
    context = _practice_context(db, assignment=assignment, attempt=attempt)
    student = context.get("student")
    student_user = context.get("student_user")
    teacher = context.get("teacher")
    teacher_user = context.get("teacher_user")
    module = context.get("module")
    level = context.get("level")
    lesson = context.get("lesson")
    dps = context.get("dps")
    dps_label = context.get("dps_label")
    dps_identity = _practice_notification_identity(context)
    student_name = context.get("student_name")
    attempt_number = int(getattr(attempt, "attempt_number", 0) or 0)
    next_attempt_number = max(attempt_number + 1, 1)
    if attempt_number <= 3:
        student_review_message = f"You have used all 3 available attempts for {dps_identity}. Your teacher will review your work and guide the next step before another attempt is opened."
        teacher_review_message = f"{student_name} has used all 3 available attempts for {dps_identity}. Review the record and coordinate Admin approval before another attempt is opened."
        admin_review_message = f"{student_name} has used all 3 available attempts for {dps_identity}. Admin approval is required before another attempt is opened."
    else:
        current_label = f"Re-Attempt {max(attempt_number - 1, 1)}"
        next_label = f"Re-Attempt {max(next_attempt_number - 1, 1)}"
        student_review_message = f"{current_label} for {dps_identity} needs teacher review. Your teacher will guide the next step before {next_label} is opened."
        teacher_review_message = f"{student_name}'s {current_label} for {dps_identity} needs review. Coordinate Admin approval before {next_label} is opened."
        admin_review_message = f"{student_name}'s {current_label} for {dps_identity} needs review. Admin approval is required before {next_label} is opened."

    if student_user:
        CreateNotification(
            db,
            recipient_user_id=student_user.id,
            recipient_role="STUDENT",
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            lesson_id=lesson.id if lesson else None,
            dps_id=dps.id if dps else None,
            attempt_id=attempt.id,
            type="DPS_REATTEMPT_APPROVAL_NEEDED",
            category="PRACTICE",
            title="Teacher Review Needed",
            message=student_review_message,
            target_route=f"/student/result/{attempt.id}",
            target_tab="practice-result",
            metadata=_practice_focus_metadata(context, assignment=assignment, attempt=attempt, target_action="teacher-review-needed"),
        )

    if teacher_user:
        CreateNotification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            lesson_id=lesson.id if lesson else None,
            dps_id=dps.id if dps else None,
            attempt_id=attempt.id,
            type="DPS_REATTEMPT_APPROVAL_NEEDED",
            category="PRACTICE",
            title=f"Re-Attempt Approval Needed For {student_name}",
            message=teacher_review_message,
            target_route=_teacher_practice_target_route(context),
            target_tab="practice-tracker",
            metadata=_practice_focus_metadata(context, assignment=assignment, attempt=attempt, target_action="lesson-insights-approval-needed"),
        )

    _admin_notifications(
        db,
        type="DPS_REATTEMPT_APPROVAL_NEEDED",
        category="PRACTICE",
        title=f"Re-Attempt Approval Needed For {student_name}",
        message=admin_review_message,
        student_id=student.id if student else None,
        teacher_id=teacher.id if teacher else None,
        module_id=module.id if module else None,
        level_id=level.id if level else None,
        lesson_id=lesson.id if lesson else None,
        dps_id=dps.id if dps else None,
        attempt_id=attempt.id,
        target_route=_admin_practice_target_route(context),
        target_tab="practice-control",
        metadata=_practice_focus_metadata(context, assignment=assignment, attempt=attempt, target_action="lesson-insights-approval-needed"),
    )


def NotifyPracticeAssignmentsCreated(
    db: Session,
    *,
    assignment_ids: list[str],
    actor_user_id: str | None,
) -> None:
    PreparedGroups: dict[tuple[str, str, str], list[tuple[Assignment, dict[str, Any]]]] = {}

    for assignment_id in assignment_ids:
        assignment = db.get(Assignment, assignment_id)
        context = _practice_context(db, assignment=assignment)
        student = context.get("student") if context else None
        if not assignment or not context or not student:
            continue
        group_key = (
            str(student.id or context.get("student_code") or ""),
            str(context.get("module_code") or ""),
            str(context.get("level_code") or context.get("level_label") or ""),
        )
        PreparedGroups.setdefault(group_key, []).append((assignment, context))

    for entries in PreparedGroups.values():
        if not entries:
            continue
        assignments = [entry[0] for entry in entries]
        contexts = [entry[1] for entry in entries]
        first_assignment = assignments[0]
        first_context = contexts[0]
        count = len(entries)

        student = first_context.get("student")
        student_user = first_context.get("student_user")
        teacher = first_context.get("teacher")
        teacher_user = first_context.get("teacher_user")
        module = first_context.get("module")
        level = first_context.get("level")
        lesson = first_context.get("lesson")
        dps = first_context.get("dps")
        dps_label = first_context.get("dps_label")
        dps_identity = _practice_notification_identity(first_context)
        level_label = first_context.get("level_label")
        student_name = first_context.get("student_name")
        teacher_name = first_context.get("teacher_name")
        display_level = first_context.get("level_code") or level_label

        IsReattemptAssignment = any(int(getattr(AssignmentItem, "retry_attempt_number", 0) or 0) > 0 for AssignmentItem in assignments)

        if count == 1:
            ReattemptNumber = int(getattr(first_assignment, "retry_attempt_number", 0) or 0)
            if IsReattemptAssignment:
                student_title = "Re-Attempt Practice Assigned"
                student_message = f"{dps_identity} has been assigned again in your Practice tab for focused improvement."
                admin_title = f"Re-Attempt Assigned To {student_name}"
                admin_message = f"{student_name} now has {dps_identity} pending as Re-Attempt {ReattemptNumber}."
                student_target_action = "start-reattempt"
                admin_target_action = "lesson-insights-pending-reattempt"
            else:
                student_title = "New DPS Assigned"
                student_message = f"{dps_identity} is now available in your Practice tab."
                admin_title = "DPS Assigned By Teacher"
                admin_message = f"{teacher_name} assigned {dps_identity} to {student_name}."
                student_target_action = "start"
                admin_target_action = "view-record"
        else:
            if IsReattemptAssignment:
                student_title = f"{count} Re-Attempt Sheets Assigned"
                student_message = f"{display_level} has {count} focused re-attempt sheets ready in your Practice tab."
                admin_title = f"{count} Re-Attempt Sheets Assigned To {student_name}"
                admin_message = f"{student_name} has {count} pending re-attempt sheets ready for review."
                student_target_action = "review-reattempts"
                admin_target_action = "lesson-insights-pending-reattempt"
            else:
                student_title = f"{count} DPS Assigned"
                student_message = f"{display_level} has {count} new DPS sheets ready."
                admin_title = f"{count} DPS Assigned To {student_name}"
                admin_message = f"{teacher_name} assigned {count} DPS sheets to {student_name}."
                student_target_action = "review-assigned-dps"
                admin_target_action = "review-student-practice"

        if student_user:
            _create_or_merge_assignment_notification(
                db,
                recipient_user_id=student_user.id,
                recipient_role="STUDENT",
                actor_user_id=actor_user_id,
                actor_role="TEACHER" if actor_user_id else None,
                student_id=student.id if student else None,
                teacher_id=teacher.id if teacher else None,
                module_id=module.id if module else None,
                level_id=level.id if level else None,
                lesson_id=lesson.id if lesson else None,
                dps_id=dps.id if dps else None,
                type="DPS_REATTEMPT_ASSIGNED" if IsReattemptAssignment else ("DPS_ASSIGNED_BULK" if count > 1 else "DPS_ASSIGNED"),
                title=student_title,
                message=student_message,
                target_route="/student/practice",
                target_tab="practice",
                metadata=_assignment_group_metadata(
                    contexts=contexts,
                    assignments=assignments,
                    first_assignment=first_assignment,
                    first_context=first_context,
                    count=count,
                    target_action=student_target_action,
                ),
                student_name=student_name,
                teacher_name=teacher_name,
                display_level=display_level,
            )

        if teacher_user:
            TeacherMetadata = _assignment_group_metadata(
                contexts=contexts,
                assignments=assignments,
                first_assignment=first_assignment,
                first_context=first_context,
                count=count,
                target_action=admin_target_action,
            )
            _create_or_merge_assignment_notification(
                db,
                recipient_user_id=teacher_user.id,
                recipient_role="TEACHER",
                actor_user_id=actor_user_id,
                actor_role="TEACHER" if actor_user_id else None,
                student_id=student.id if student else None,
                teacher_id=teacher.id if teacher else None,
                module_id=module.id if module else None,
                level_id=level.id if level else None,
                lesson_id=lesson.id if lesson else None,
                dps_id=dps.id if dps else None,
                type="DPS_REATTEMPT_ASSIGNED_BY_TEACHER" if IsReattemptAssignment else ("DPS_ASSIGNED_BULK_BY_TEACHER" if count > 1 else "DPS_ASSIGNED_BY_TEACHER"),
                title=admin_title,
                message=admin_message,
                target_route=_teacher_practice_target_route(first_context),
                target_tab="practice-tracker",
                metadata=TeacherMetadata,
                student_name=student_name,
                teacher_name=teacher_name,
                display_level=display_level,
            )

        AdminMetadata = _assignment_group_metadata(
            contexts=contexts,
            assignments=assignments,
            first_assignment=first_assignment,
            first_context=first_context,
            count=count,
            target_action=admin_target_action,
        )
        AdminTargetRoute = _admin_practice_target_route(first_context)
        for AdminUser in ActiveAdminUsers(db):
            _create_or_merge_assignment_notification(
                db,
                recipient_user_id=AdminUser.id,
                recipient_role=AdminUser.role,
                actor_user_id=actor_user_id,
                actor_role="TEACHER" if actor_user_id else None,
                student_id=student.id if student else None,
                teacher_id=teacher.id if teacher else None,
                module_id=module.id if module else None,
                level_id=level.id if level else None,
                lesson_id=lesson.id if lesson else None,
                dps_id=dps.id if dps else None,
                type="DPS_REATTEMPT_ASSIGNED_BY_TEACHER" if IsReattemptAssignment else ("DPS_ASSIGNED_BULK_BY_TEACHER" if count > 1 else "DPS_ASSIGNED_BY_TEACHER"),
                title=admin_title,
                message=admin_message,
                target_route=AdminTargetRoute,
                target_tab="practice-control",
                metadata=AdminMetadata,
                student_name=student_name,
                teacher_name=teacher_name,
                display_level=display_level,
            )



def NotifyPracticeFreshPracticeAssigned(
    db: Session,
    *,
    assignment_id: str,
    actor_user_id: str | None,
    source_attempt_id: str | None = None,
) -> None:
    """Notify all roles when Admin approval creates a fresh same-concept practice sheet.

    This is intentionally separate from the old permission-unlock notification.
    The approval action now creates a new assignment shell immediately; the
    student receives a different question set when starting that assignment
    because manual retry assignments use fresh retry seeds.
    """
    assignment = db.get(Assignment, assignment_id)
    if not assignment:
        return

    source_attempt = db.get(Attempt, source_attempt_id) if source_attempt_id else None
    context = _practice_context(db, assignment=assignment, attempt=source_attempt)
    student = context.get("student")
    student_user = context.get("student_user")
    teacher = context.get("teacher")
    teacher_user = context.get("teacher_user")
    module = context.get("module")
    level = context.get("level")
    lesson = context.get("lesson")
    dps = context.get("dps")
    dps_identity = _practice_notification_identity(context)
    student_name = context.get("student_name")

    metadata = _practice_focus_metadata(
        context,
        assignment=assignment,
        attempt=source_attempt,
        target_action="lesson-insights-fresh-practice-assigned",
    )
    metadata.update({
        "freshAssignmentId": assignment.id,
        "sourceAttemptId": source_attempt.id if source_attempt else None,
        "assignmentSource": getattr(assignment, "assignment_source", None),
        "retryAttemptNumber": getattr(assignment, "retry_attempt_number", None),
    })

    if student_user:
        CreateNotification(
            db,
            recipient_user_id=student_user.id,
            recipient_role="STUDENT",
            actor_user_id=actor_user_id,
            actor_role="TEACHER" if actor_user_id else None,
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            lesson_id=lesson.id if lesson else None,
            dps_id=dps.id if dps else None,
            type="DPS_FRESH_PRACTICE_ASSIGNED",
            category="REATTEMPT",
            title=f"Re-Attempt {int(getattr(assignment, 'retry_attempt_number', 0) or 0)} Assigned",
            message=f"Your teacher has opened Re-Attempt {int(getattr(assignment, 'retry_attempt_number', 0) or 0)} for {dps_identity}. Open the Practice tab to complete the new sheet.",
            target_route=f"/student/results/module/{context.get('module_code')}" if context.get("module_code") else "/student/results",
            target_tab="practice",
            metadata=metadata,
        )

    if teacher_user:
        CreateNotification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            actor_user_id=actor_user_id,
            actor_role="ADMIN" if actor_user_id else None,
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            lesson_id=lesson.id if lesson else None,
            dps_id=dps.id if dps else None,
            type="DPS_FRESH_PRACTICE_ASSIGNED",
            category="REATTEMPT",
            title=f"Re-Attempt {int(getattr(assignment, 'retry_attempt_number', 0) or 0)} Assigned After Admin Approval",
            message=f"Admin approval has opened Re-Attempt {int(getattr(assignment, 'retry_attempt_number', 0) or 0)} for {student_name} in {dps_identity}. The latest record is now pending in the tracker.",
            target_route=_teacher_practice_target_route(context),
            target_tab="practice-tracker",
            metadata=metadata,
        )

    for AdminUser in ActiveAdminUsers(db):
        CreateNotification(
            db,
            recipient_user_id=AdminUser.id,
            recipient_role=AdminUser.role,
            actor_user_id=actor_user_id,
            actor_role="ADMIN" if actor_user_id else None,
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            lesson_id=lesson.id if lesson else None,
            dps_id=dps.id if dps else None,
            type="DPS_FRESH_PRACTICE_ASSIGNED",
            category="REATTEMPT",
            title=f"Re-Attempt {int(getattr(assignment, 'retry_attempt_number', 0) or 0)} Assigned After Approval",
            message=f"Re-Attempt {int(getattr(assignment, 'retry_attempt_number', 0) or 0)} has been assigned to {student_name} for {dps_identity}. Previous exhausted attempts remain preserved in history.",
            target_route=_admin_practice_target_route(context),
            target_tab="practice-control",
            metadata=metadata,
        )

def NotifyPracticeAttemptSubmitted(
    db: Session,
    *,
    attempt_id: str,
) -> None:
    attempt = db.get(Attempt, attempt_id)
    if not attempt:
        return

    assignment = db.get(Assignment, attempt.assignment_id) if attempt.assignment_id else None
    context = _practice_context(db, assignment=assignment, attempt=attempt)
    student = context.get("student")
    student_user = context.get("student_user")
    teacher = context.get("teacher")
    teacher_user = context.get("teacher_user")
    module = context.get("module")
    level = context.get("level")
    lesson = context.get("lesson")
    dps = context.get("dps")
    dps_label = context.get("dps_label")
    dps_identity = _practice_notification_identity(context)
    level_label = context.get("level_label")
    student_name = context.get("student_name")

    accuracy = int(round(float(attempt.accuracy_percentage or 0)))
    cleared = accuracy >= PRACTICE_BENCHMARK_PERCENTAGE
    title = "DPS Cleared" if cleared else "DPS Needs Re-Attempt"
    notification_type = "DPS_CLEARED" if cleared else "DPS_NEEDS_REATTEMPT"
    category = "PRACTICE"
    message = f"{dps_identity} result is available: {accuracy}%."

    if student_user:
        CreateNotification(
            db,
            recipient_user_id=student_user.id,
            recipient_role="STUDENT",
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            lesson_id=lesson.id if lesson else None,
            dps_id=dps.id if dps else None,
            attempt_id=attempt.id,
            type=notification_type,
            category=category,
            title=title,
            message=message,
            target_route=f"/student/result/{attempt.id}",
            target_tab="practice-result",
            metadata={
                "assignmentId": assignment.id if assignment else None,
                "attemptId": attempt.id,
                "dpsId": dps.id if dps else None,
                "lessonId": lesson.id if lesson else None,
                "studentCode": context.get("student_code"),
                "moduleCode": context.get("module_code"),
                "levelCode": context.get("level_code") or level_label,
                "accuracy": accuracy,
                "highlightId": f"attempt-{attempt.id}",
                "targetAction": "view-result",
                "notificationGroup": "PRACTICE",
                **_practice_identity_metadata(context),
            },
        )

    if teacher_user:
        CreateNotification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            lesson_id=lesson.id if lesson else None,
            dps_id=dps.id if dps else None,
            attempt_id=attempt.id,
            type=notification_type,
            category=category,
            title=f"{student_name} {title}",
            message=f"{student_name} completed {dps_identity} with {accuracy}% accuracy.",
            target_route=_teacher_practice_target_route(context),
            target_tab="practice-tracker",
            metadata={
                "assignmentId": assignment.id if assignment else None,
                "attemptId": attempt.id,
                "dpsId": dps.id if dps else None,
                "lessonId": lesson.id if lesson else None,
                "studentCode": context.get("student_code"),
                "moduleCode": context.get("module_code"),
                "levelCode": context.get("level_code") or level_label,
                "accuracy": accuracy,
                "highlightId": f"attempt-{attempt.id}",
                "targetAction": "lesson-insights-attempt",
                "notificationGroup": "PRACTICE",
                **_practice_identity_metadata(context),
            },
        )

    _admin_notifications(
        db,
        type=notification_type,
        category=category,
        title=f"{student_name} {title}",
        message=f"{student_name} completed {dps_identity} with {accuracy}% accuracy.",
        student_id=student.id if student else None,
        teacher_id=teacher.id if teacher else None,
        module_id=module.id if module else None,
        level_id=level.id if level else None,
        lesson_id=lesson.id if lesson else None,
        dps_id=dps.id if dps else None,
        attempt_id=attempt.id,
        target_route=_admin_practice_target_route(context),
        target_tab="practice-control",
        metadata={
                "assignmentId": assignment.id if assignment else None,
                "attemptId": attempt.id,
                "dpsId": dps.id if dps else None,
                "lessonId": lesson.id if lesson else None,
                "studentCode": context.get("student_code"),
                "moduleCode": context.get("module_code"),
                "levelCode": context.get("level_code") or level_label,
                "accuracy": accuracy,
                "highlightId": f"attempt-{attempt.id}",
                "targetAction": "lesson-insights-attempt",
                "notificationGroup": "PRACTICE",
                **_practice_identity_metadata(context),
            },
    )

    if not cleared and bool(getattr(attempt, "requires_manual_intervention", False)):
        NotifyPracticeReattemptApprovalNeeded(db, attempt_id=attempt.id)

# NOTE: NotifyPracticeReattemptUnlocked() was removed here as part of the
# full student-portal audit -- it was fully built but never called from any
# code path. The actual reattempt-approval flow (routes_admin.py's
# admin_approve_reattempt-style endpoint) already sends
# NotifyPracticeFreshPracticeAssigned() at the moment a reattempt permission
# is approved and its fresh assignment is created in the same step, so a
# second "unlocked" notification for the same event would have been a
# duplicate, not a fix, if this had ever been wired in.
