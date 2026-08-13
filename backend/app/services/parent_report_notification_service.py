from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import Module, ParentReportEmailLog, Student, Teacher, User
from app.services.notification_service import ActiveAdminUsers, CreateNotification


def ResolveStudentTeacher(db: Session, student: Student | None) -> Teacher | None:
    """Resolve a student's assigned teacher, matching the same dual-path
    convention `student_payload()`/`teacher_payload()` already use in
    routes_admin.py: `Student.teacher_id` is the modern FK, but many student
    records (bulk-imported or assigned before that column existed) only ever
    got the legacy `Student.teacher` free-text name column set. Checking
    `teacher_id` alone silently treats those students as "no teacher
    assigned" even though the admin UI itself shows one, via that same name
    fallback. Try the FK first, then fall back to a name match.
    """
    if not student:
        return None
    if getattr(student, "teacher_id", None):
        teacher = db.get(Teacher, student.teacher_id)
        if teacher:
            return teacher
    teacher_name = (getattr(student, "teacher", None) or "").strip()
    if teacher_name:
        candidate = (
            db.query(Teacher)
            .join(User, Teacher.user_id == User.id)
            .filter(User.full_name == teacher_name)
            .first()
        )
        if candidate:
            return candidate
    return None


def _student_display(db: Session, student_id: str | None, fallback_code: str | None = None) -> tuple[str, str]:
    student = db.get(Student, student_id) if student_id else None
    student_user = db.get(User, student.user_id) if student and student.user_id else None
    student_name = student_user.full_name if student_user and student_user.full_name else (fallback_code or "Student")
    student_code = student.student_code if student and student.student_code else (fallback_code or "-")
    return student_name, student_code


def _module_label(db: Session, module_code: str | None) -> str:
    code = str(module_code or "-").strip() or "-"
    if code == "-":
        return "Learning Module"
    module = db.query(Module).filter(Module.module_code == code).first()
    if module and module.module_name:
        return f"{module.module_name} · {code}"
    return code


def _log_metadata(db: Session, log: ParentReportEmailLog | None, *, event: str, file_name: str | None = None) -> dict[str, Any]:
    if not log:
        return {"event": event, "targetAction": "parentReportDeliveryHistory"}
    student_name, student_code = _student_display(db, log.student_id, log.student_code)
    return {
        "event": event,
        "targetAction": "parentReportDeliveryHistory",
        "reportDeliveryId": log.id,
        "studentId": log.student_id,
        "studentCode": student_code,
        "studentName": student_name,
        "moduleCode": log.module_code,
        "moduleLabel": _module_label(db, log.module_code),
        "levelCode": log.level_code,
        "recipientEmail": log.recipient_email,
        "recipientType": log.recipient_type,
        "fileName": file_name or log.file_name,
        "status": log.status,
        "highlightId": log.id,
    }


def _notify_admins(
    db: Session,
    *,
    actor_user_id: str | None,
    type: str,
    title: str,
    message: str,
    log: ParentReportEmailLog | None = None,
    category: str = "PARENT_REPORT",
    color_variant: str = "TEAL",
    target_sub_tab: str = "delivery-history",
    metadata: dict[str, Any] | None = None,
) -> None:
    for admin in ActiveAdminUsers(db):
        CreateNotification(
            db,
            recipient_user_id=admin.id,
            recipient_role=admin.role,
            actor_user_id=actor_user_id,
            actor_role="ADMIN" if actor_user_id else None,
            student_id=log.student_id if log else metadata.get("studentId") if metadata else None,
            module_id=None,
            level_id=None,
            report_delivery_id=log.id if log else metadata.get("reportDeliveryId") if metadata else None,
            type=type,
            category=category,
            title=title,
            message=message,
            target_route="/admin/assessments",
            target_tab="parent-reports",
            target_sub_tab=target_sub_tab,
            color_variant=color_variant,
            metadata=metadata or {},
        )


def NotifyParentReportGenerated(
    db: Session,
    *,
    actor_user_id: str | None,
    student_id: str | None,
    student_code: str | None,
    module_code: str | None,
    level_code: str | None,
    file_name: str | None,
) -> None:
    student_name, student_code_value = _student_display(db, student_id, student_code)
    metadata = {
        "event": "PARENT_REPORT_GENERATED",
        "targetAction": "parentReportGenerateReports",
        "studentId": student_id,
        "studentCode": student_code_value,
        "studentName": student_name,
        "moduleCode": module_code,
        "moduleLabel": _module_label(db, module_code),
        "levelCode": level_code,
        "fileName": file_name,
        "highlightId": f"parent-report-{student_code_value}-{level_code}",
    }
    _notify_admins(
        db,
        actor_user_id=actor_user_id,
        type="PARENT_REPORT_GENERATED",
        title="Parent Report Generated",
        message=f"Parent progress report for {student_name} · {level_code or 'Level'} was generated.",
        target_sub_tab="generate-reports",
        metadata=metadata,
    )


def NotifyParentReportPublishedToTeacher(
    db: Session,
    *,
    actor_user_id: str | None,
    log: ParentReportEmailLog,
) -> None:
    """Notify the student's assigned teacher that a progress report is ready to view.

    Fired exactly once, when an admin explicitly publishes a generated report
    to the teacher (a distinct step from generating/downloading the report,
    so admins can regenerate/re-check a report without spamming the teacher).
    """
    student = db.get(Student, log.student_id) if log.student_id else None
    teacher = ResolveStudentTeacher(db, student)
    if not teacher or not teacher.user_id:
        return
    teacher_user = db.get(User, teacher.user_id)
    if not teacher_user:
        return

    student_name, student_code = _student_display(db, log.student_id, log.student_code)
    level_label = log.level_code or "Level"
    module = db.query(Module).filter(Module.module_code == log.module_code).first() if log.module_code else None

    CreateNotification(
        db,
        recipient_user_id=teacher_user.id,
        recipient_role="TEACHER",
        actor_user_id=actor_user_id,
        actor_role="ADMIN" if actor_user_id else None,
        student_id=log.student_id,
        teacher_id=teacher.id,
        module_id=module.id if module else None,
        report_delivery_id=log.id,
        type="PARENT_REPORT_GENERATED",
        category="PARENT_REPORT",
        title=f"{student_name} Progress Report Ready",
        message=f"{student_name}'s progress report for {level_label} has been generated and is ready to view.",
        target_route=f"/teacher/assessments/student/{student_code}",
        target_tab="",
        color_variant="TEAL",
        metadata={
            "event": "PARENT_REPORT_PUBLISHED_TO_TEACHER",
            "targetAction": "viewParentReport",
            "reportDeliveryId": log.id,
            "studentId": log.student_id,
            "studentCode": student_code,
            "studentName": student_name,
            "moduleCode": log.module_code,
            "levelCode": log.level_code,
            "highlightId": log.id,
        },
    )




def NotifyParentReportDeliveryDeleted(
    db: Session,
    *,
    actor_user_id: str | None,
    log: ParentReportEmailLog,
) -> None:
    student_name, _ = _student_display(db, log.student_id, log.student_code)
    metadata = _log_metadata(db, log, event="PARENT_REPORT_DELIVERY_DELETED")
    _notify_admins(
        db,
        actor_user_id=actor_user_id,
        type="PARENT_REPORT_DELIVERY_DELETED",
        category="PARENT_REPORT",
        color_variant="TEAL",
        title="Parent Report Delivery Record Deleted",
        message=f"A parent report delivery record for {student_name} · {log.level_code or 'Level'} was deleted.",
        log=log,
        metadata=metadata,
    )
