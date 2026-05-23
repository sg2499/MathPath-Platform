from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    AssessmentAssignment,
    AssessmentAttempt,
    AssessmentBlueprint,
    AssessmentReattemptApproval,
    AssessmentResult,
    Level,
    Module,
    Student,
    StudentLevelPromotion,
    Teacher,
    User,
)
from app.services.notification_service import ActiveAdminUsers, CreateNotification


def _student_user(db: Session, student: Student | None) -> User | None:
    return db.get(User, student.user_id) if student and student.user_id else None


def _teacher_user(db: Session, teacher: Teacher | None) -> User | None:
    return db.get(User, teacher.user_id) if teacher and teacher.user_id else None


def _assignment_context(db: Session, assignment: AssessmentAssignment | None) -> dict[str, Any]:
    if not assignment:
        return {}
    student = db.get(Student, assignment.student_id) if assignment.student_id else None
    student_user = _student_user(db, student)
    teacher = db.get(Teacher, assignment.teacher_id) if assignment.teacher_id else None
    teacher_user = _teacher_user(db, teacher)
    blueprint = db.get(AssessmentBlueprint, assignment.blueprint_id) if assignment.blueprint_id else None
    module = db.get(Module, blueprint.module_id) if blueprint and blueprint.module_id else None
    level = db.get(Level, blueprint.level_id) if blueprint and blueprint.level_id else None
    return {
        "student": student,
        "student_user": student_user,
        "teacher": teacher,
        "teacher_user": teacher_user,
        "blueprint": blueprint,
        "module": module,
        "level": level,
        "assessment_title": blueprint.title if blueprint and blueprint.title else "Level Assessment",
        "student_name": student_user.full_name if student_user else (student.student_code if student else "Student"),
        "student_code": student.student_code if student else None,
        "module_label": module.module_name if module else "Module",
        "module_code": module.module_code if module else None,
        "level_label": level.level_code if level else "Level",
        "level_code": level.level_code if level else None,
    }


def _assessment_notification_identity(context: dict[str, Any]) -> str:
    """Stable human-readable assessment identity for notifications.

    Assessment names can repeat across modules and levels, so every assessment
    notification carries Module → Level → Assessment for clear identification.
    """
    module_label = str(context.get("module_code") or context.get("module_label") or "Module").strip()
    level_label = str(context.get("level_code") or context.get("level_label") or "Level").strip()
    assessment_title = str(context.get("assessment_title") or "Assessment").strip()
    return " • ".join([Part for Part in [module_label, level_label, assessment_title] if Part])


def _assessment_identity_metadata(context: dict[str, Any]) -> dict[str, Any]:
    return {
        "displayContext": _assessment_notification_identity(context),
        "moduleLabel": context.get("module_code") or context.get("module_label"),
        "levelLabel": context.get("level_code") or context.get("level_label"),
        "assessmentLabel": context.get("assessment_title"),
    }


def _admin_notifications(
    db: Session,
    *,
    type: str,
    category: str,
    title: str,
    message: str,
    actor_user_id: str | None = None,
    student_id: str | None = None,
    teacher_id: str | None = None,
    module_id: str | None = None,
    level_id: str | None = None,
    assessment_id: str | None = None,
    attempt_id: str | None = None,
    target_route: str = "/admin/assessments",
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
            actor_role="TEACHER" if actor_user_id else None,
            student_id=student_id,
            teacher_id=teacher_id,
            module_id=module_id,
            level_id=level_id,
            assessment_id=assessment_id,
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


def NotifyAssessmentAssignmentsCreated(
    db: Session,
    *,
    assignment_ids: list[str],
    actor_user_id: str | None,
) -> None:
    for assignment_id in assignment_ids:
        assignment = db.get(AssessmentAssignment, assignment_id)
        context = _assignment_context(db, assignment)
        if not assignment or not context:
            continue
        student = context.get("student")
        student_user = context.get("student_user")
        teacher = context.get("teacher")
        blueprint = context.get("blueprint")
        module = context.get("module")
        level = context.get("level")
        assessment_title = context.get("assessment_title")
        assessment_identity = _assessment_notification_identity(context)
        module_code = context.get("module_code")
        level_label = context.get("level_label")
        level_code = context.get("level_code")
        assignment_type = (assignment.assessment_assignment_type or "ORIGINAL").upper()
        is_reattempt = assignment_type == "RE_ATTEMPT"

        student_title = "Re-Attempt Assessment Assigned" if is_reattempt else "Assessment Assigned"
        student_message = f"{assessment_identity} is now available in your Assessments tab."
        if student_user:
            CreateNotification(
                db,
                recipient_user_id=student_user.id,
                recipient_role="STUDENT",
                actor_user_id=actor_user_id,
                actor_role="TEACHER",
                student_id=student.id if student else None,
                teacher_id=teacher.id if teacher else None,
                module_id=module.id if module else None,
                level_id=level.id if level else None,
                assessment_id=assignment.id,
                type="ASSESSMENT_REATTEMPT_ASSIGNED" if is_reattempt else "ASSESSMENT_ASSIGNED",
                category="REATTEMPT" if is_reattempt else "ASSESSMENT",
                title=student_title,
                message=student_message,
                target_route="/student/assessments",
                target_tab="assessments",
                metadata={"assignmentId": assignment.id, "assessmentTitle": assessment_title, "studentCode": context.get("student_code"), "moduleCode": module_code, "levelCode": level_code or level_label, "highlightId": assignment.id, "targetAction": "start", **_assessment_identity_metadata(context)},
            )

        _admin_notifications(
            db,
            type="ASSESSMENT_REATTEMPT_ASSIGNED" if is_reattempt else "ASSESSMENT_ASSIGNED",
            category="REATTEMPT" if is_reattempt else "ASSESSMENT",
            title="Assessment Re-Attempt Assigned" if is_reattempt else "Assessment Assigned By Teacher",
            message=f"{context.get('student_name')} was assigned {assessment_identity}.",
            actor_user_id=actor_user_id,
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            assessment_id=assignment.id,
            target_route="/admin/assessments",
            target_tab="student-records",
            metadata={"assignmentId": assignment.id, "assignmentType": assignment_type, "studentCode": context.get("student_code"), "moduleCode": module_code, "levelCode": level_code or level_label, "highlightId": assignment.id, "targetAction": "view", **_assessment_identity_metadata(context)},
        )


def NotifyAssessmentAttemptSubmitted(
    db: Session,
    *,
    attempt_id: str,
) -> None:
    attempt = db.get(AssessmentAttempt, attempt_id)
    if not attempt:
        return
    assignment = db.get(AssessmentAssignment, attempt.assessment_assignment_id) if attempt.assessment_assignment_id else None
    context = _assignment_context(db, assignment)
    if not assignment or not context:
        return

    student = context.get("student")
    student_user = context.get("student_user")
    teacher = context.get("teacher")
    teacher_user = context.get("teacher_user")
    module = context.get("module")
    level = context.get("level")
    assessment_title = context.get("assessment_title")
    assessment_identity = _assessment_notification_identity(context)
    module_code = context.get("module_code")
    level_label = context.get("level_label")
    level_code = context.get("level_code")
    score = int(round(float(attempt.total_score or 0)))
    percentage = int(round(float(attempt.percentage or 0)))
    cleared = (attempt.status or "").upper() == "CLEARED"
    title = "Assessment Cleared" if cleared else "Assessment Needs Re-Attempt"
    category = "RESULT" if cleared else "REATTEMPT"
    message = f"{assessment_identity} result is available: {score} / 100 ({percentage}%)."

    if student_user:
        CreateNotification(
            db,
            recipient_user_id=student_user.id,
            recipient_role="STUDENT",
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            assessment_id=assignment.id,
            attempt_id=attempt.id,
            type="ASSESSMENT_CLEARED" if cleared else "ASSESSMENT_NEEDS_REATTEMPT",
            category=category,
            title=title,
            message=message,
            target_route=f"/student/assessment-result/{attempt.id}",
            target_tab="result",
            metadata={"assignmentId": assignment.id, "attemptId": attempt.id, "score": score, "percentage": percentage, "studentCode": context.get("student_code"), "moduleCode": module_code, "levelCode": level_code or level_label, "highlightId": attempt.id, "targetAction": "view-result", **_assessment_identity_metadata(context)},
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
            assessment_id=assignment.id,
            attempt_id=attempt.id,
            type="STUDENT_ASSESSMENT_CLEARED" if cleared else "STUDENT_ASSESSMENT_NEEDS_REATTEMPT",
            category=category,
            title=f"{context.get('student_name')} {('Cleared Assessment' if cleared else 'Needs Re-Attempt')}",
            message=f"{context.get('student_name')} completed {assessment_identity} with {score} / 100.",
            target_route="/teacher/assessments",
            target_tab="assessment-tracker",
            metadata={"assignmentId": assignment.id, "attemptId": attempt.id, "score": score, "percentage": percentage, "studentCode": context.get("student_code"), "moduleCode": module_code, "levelCode": level_code or level_label, "highlightId": attempt.id, "targetAction": "view", **_assessment_identity_metadata(context)},
        )

    _admin_notifications(
        db,
        type="STUDENT_ASSESSMENT_CLEARED" if cleared else "STUDENT_ASSESSMENT_NEEDS_REATTEMPT",
        category=category,
        title=f"{context.get('student_name')} {('Cleared Assessment' if cleared else 'Needs Re-Attempt')}",
        message=f"{context.get('student_name')} completed {assessment_identity} with {score} / 100.",
        student_id=student.id if student else None,
        teacher_id=teacher.id if teacher else None,
        module_id=module.id if module else None,
        level_id=level.id if level else None,
        assessment_id=assignment.id,
        attempt_id=attempt.id,
        target_route="/admin/assessments",
        target_tab="student-records" if cleared else "reattempt-approvals",
        metadata={"assignmentId": assignment.id, "attemptId": attempt.id, "score": score, "percentage": percentage, "studentCode": context.get("student_code"), "moduleCode": module_code, "levelCode": level_code or level_label, "highlightId": attempt.id, "targetAction": "view", **_assessment_identity_metadata(context)},
    )

    if not cleared:
        _admin_notifications(
            db,
            type="ASSESSMENT_REATTEMPT_REQUEST_CREATED",
            category="REATTEMPT",
            title="Re-Attempt Approval Needed",
            message=f"{context.get('student_name')} needs approval for a re-attempt in {assessment_identity}.",
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            assessment_id=assignment.id,
            attempt_id=attempt.id,
            target_route="/admin/assessments",
            target_tab="reattempt-approvals",
            metadata={"assignmentId": assignment.id, "attemptId": attempt.id, **_assessment_identity_metadata(context)},
        )


def NotifyAssessmentReattemptDecision(
    db: Session,
    *,
    approval_id: str,
    actor_user_id: str | None,
    decision: str,
) -> None:
    approval = db.get(AssessmentReattemptApproval, approval_id)
    if not approval:
        return
    assignment = db.get(AssessmentAssignment, approval.assessment_assignment_id) if approval.assessment_assignment_id else None
    context = _assignment_context(db, assignment)
    if not assignment or not context:
        return
    teacher_user = context.get("teacher_user")
    teacher = context.get("teacher")
    student = context.get("student")
    module = context.get("module")
    level = context.get("level")
    approved = decision.upper() == "APPROVED"
    assessment_identity = _assessment_notification_identity(context)
    if teacher_user:
        CreateNotification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            actor_user_id=actor_user_id,
            actor_role="ADMIN",
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=module.id if module else None,
            level_id=level.id if level else None,
            assessment_id=assignment.id,
            attempt_id=approval.assessment_attempt_id,
            type="ASSESSMENT_REATTEMPT_APPROVED" if approved else "ASSESSMENT_REATTEMPT_REJECTED",
            category="REATTEMPT",
            title="Re-Attempt Approved" if approved else "Re-Attempt Rejected",
            message=(
                f"Admin approved re-attempt assignment for {context.get('student_name')} in {assessment_identity}."
                if approved
                else f"Admin rejected the re-attempt request for {context.get('student_name')} in {assessment_identity}."
            ),
            target_route="/teacher/assign-assessment" if approved else "/teacher/assessments",
            target_tab="assign-assessment" if approved else "assessment-tracker",
            metadata={"approvalId": approval.id, "assignmentId": assignment.id, "decision": decision.upper(), **_assessment_identity_metadata(context)},
        )


def NotifyStudentPromoted(
    db: Session,
    *,
    promotion_id: str,
    actor_user_id: str | None,
) -> None:
    promotion = db.get(StudentLevelPromotion, promotion_id)
    if not promotion:
        return
    student = db.get(Student, promotion.student_id) if promotion.student_id else None
    student_user = _student_user(db, student)
    from_level = db.get(Level, promotion.from_level_id) if promotion.from_level_id else None
    to_level = db.get(Level, promotion.to_level_id) if promotion.to_level_id else None
    to_module = db.get(Module, promotion.to_module_id) if promotion.to_module_id else None
    teacher = db.query(Teacher).filter(Teacher.is_active == True).filter(Teacher.user.has(User.full_name == student.teacher)).first() if student and student.teacher else None
    teacher_user = _teacher_user(db, teacher)
    from_code = promotion.from_level_code or (from_level.level_code if from_level else "Completed Level")
    to_code = promotion.to_level_code or (to_level.level_code if to_level else "Next Level")

    if student_user:
        CreateNotification(
            db,
            recipient_user_id=student_user.id,
            recipient_role="STUDENT",
            actor_user_id=actor_user_id,
            actor_role="ADMIN",
            student_id=student.id if student else None,
            teacher_id=teacher.id if teacher else None,
            module_id=to_module.id if to_module else None,
            level_id=to_level.id if to_level else None,
            assessment_id=promotion.assessment_assignment_id,
            attempt_id=promotion.assessment_attempt_id,
            type="STUDENT_PROMOTED",
            category="PROMOTION",
            title="Promoted To Next Level",
            message=f"You have been promoted from {from_code} to {to_code}.",
            target_route="/student/results",
            target_tab="progress",
            metadata={"promotionId": promotion.id, "fromLevel": from_code, "toLevel": to_code},
        )

    if teacher_user:
        CreateNotification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            actor_user_id=actor_user_id,
            actor_role="ADMIN",
            student_id=student.id if student else None,
            teacher_id=teacher.id,
            module_id=to_module.id if to_module else None,
            level_id=to_level.id if to_level else None,
            assessment_id=promotion.assessment_assignment_id,
            attempt_id=promotion.assessment_attempt_id,
            type="STUDENT_PROMOTED",
            category="PROMOTION",
            title=f"{student_user.full_name if student_user else 'Student'} Promoted",
            message=f"{student_user.full_name if student_user else 'Student'} moved from {from_code} to {to_code}.",
            target_route="/teacher/promotion-history",
            target_tab="promotion-history",
            metadata={"promotionId": promotion.id, "fromLevel": from_code, "toLevel": to_code},
        )

    _admin_notifications(
        db,
        type="STUDENT_PROMOTED",
        category="PROMOTION",
        title=f"{student_user.full_name if student_user else 'Student'} Promoted",
        message=f"{student_user.full_name if student_user else 'Student'} moved from {from_code} to {to_code}.",
        actor_user_id=actor_user_id,
        student_id=student.id if student else None,
        teacher_id=teacher.id if teacher else None,
        module_id=to_module.id if to_module else None,
        level_id=to_level.id if to_level else None,
        assessment_id=promotion.assessment_assignment_id,
        attempt_id=promotion.assessment_attempt_id,
        target_route="/admin/assessments",
        target_tab="promotion-history",
        metadata={"promotionId": promotion.id, "fromLevel": from_code, "toLevel": to_code},
    )
