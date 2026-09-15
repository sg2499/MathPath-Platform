"""Annual Competition -- Practice paper assignment/submission notifications.

2026-09-15 (Shailesh): "we need to configure the notifications flow for the
student, teacher and admin side whenever a batch of practice papers are
assigned to the students ... we also need to implement the notifications for
the submission of these papers." Neither the practice flow nor the official
Annual Competition flow sent any notification at all before this -- this
module is new, not a fix.

Deliberately its own small service (mirroring the one-concern-per-file
convention already used by practice_notification_service.py for DPS,
competition_mock_assignment_service.py/competition_mock_attempt_service.py
for Competition Mock, rank_notification_service.py for leaderboard rank
changes) rather than folded into either of those, so this stays easy to find
and doesn't risk perturbing an already-shipped notification path.

Two entry points, one per event this was asked for:

  * NotifyAnnualCompetitionPracticeAssigned -- called once per student from
    BatchAssignAnnualCompetitionPracticePapers's own per-student loop
    (annual_competition_studio_service.py). That function already generates
    a student's whole Quantity of papers in one call, so -- unlike DPS's
    NotifyPracticeAssignmentsCreated, which has to merge many small
    single-sheet notifications created across a weekly scheduler into one
    grouped notification -- there is only ever one notification-worthy event
    per student per admin action to begin with. No merge/dedup window
    needed.

  * NotifyAnnualCompetitionPracticeSubmitted -- called once per attempt from
    _AdvanceOrFinalize (annual_competition_attempt_service.py), immediately
    after ComputeAndFinalizeCompetitionEventResult finalizes the whole
    paper. _AdvanceOrFinalize only reaches that branch once the LAST section
    in the paper has just been closed -- intermediate section submits just
    advance to the next section and return, never touching this function --
    so this fires exactly once per practice attempt, regardless of whether
    the student submitted manually, the timer auto-advanced them past their
    final section, or the admin reconciliation sweep finalized an abandoned
    attempt later. Gated on attempt_type == "PRACTICE" so the (currently
    silent-by-design, out of scope for this change) OFFICIAL flow is
    untouched.

Both notify student + teacher (if the student has one) + every active admin,
following the same three-way pattern DPS and Competition-Mock-submission
already use -- confirmed with Shailesh as the right default (Competition-
Mock's own *assignment* path is the one inconsistent precedent in this
codebase that does NOT notify admins; this intentionally follows DPS/
Mock-submission instead, per his explicit "student, teacher and admin"
requirement for both events).

One deliberate asymmetry: on assignment, the acting admin (whoever clicked
"Assign Papers") is excluded from the admin broadcast -- notifying an admin
about the action they just took themselves is noise, not signal. Every
*other* active admin still gets it. Submission has no such exclusion: the
actor there is always the student, never an admin.

New category ANNUAL_COMPETITION_PRACTICE (not "PRACTICE", which is DPS's,
and not "COMPETITION_MOCK", which is the practice-mock feature's) so
NotificationsBell.tsx can route these distinctly from both of those --
several of its existing matchers key off `type.includes("PRACTICE")` /
`route.includes("/student/practice")`, which would otherwise false-positive
against these notifications' own type strings and routes.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    CompetitionEventAttempt,
    CompetitionEventResult,
    Student,
    Teacher,
    User,
)
from app.services.annual_competition_paper_registry import FormatCompetitionLevelLabel
from app.services.notification_service import ActiveAdminUsers, CreateNotification

ANNUAL_COMPETITION_PRACTICE_CATEGORY = "ANNUAL_COMPETITION_PRACTICE"


def _StudentUser(db: Session, student: Student | None) -> User | None:
    return db.get(User, student.user_id) if student and student.user_id else None


def _TeacherForStudent(db: Session, student: Student | None) -> Teacher | None:
    if not student or not student.teacher_id:
        return None
    return db.get(Teacher, student.teacher_id)


def _TeacherUser(db: Session, teacher: Teacher | None) -> User | None:
    return db.get(User, teacher.user_id) if teacher and teacher.user_id else None


def NotifyAnnualCompetitionPracticeAssigned(
    db: Session,
    *,
    student_id: str,
    competition_level_code: str,
    quantity: int,
    actor_user_id: str | None,
) -> None:
    student = db.get(Student, student_id)
    if not student:
        return

    student_user = _StudentUser(db, student)
    teacher = _TeacherForStudent(db, student)
    teacher_user = _TeacherUser(db, teacher)
    student_name = student_user.full_name if student_user else (student.student_code or "Student")

    safe_quantity = max(1, int(quantity or 0))
    plural = "" if safe_quantity == 1 else "s"
    # 2026-09-15 (Shailesh): "nothing should showcase the old name wherever
    # it is being seen by the human eyes" -- message/title text uses the
    # display label; metadata.levelCode stays the raw code since that's what
    # NotificationsBell.tsx's AppendDeepLinkParams forwards as a query param
    # (the frontend re-derives the label from the code for its own display).
    level_label = FormatCompetitionLevelLabel(competition_level_code)

    metadata: dict[str, Any] = {
        "event": "ANNUAL_PRACTICE_ASSIGNED",
        "studentCode": student.student_code,
        "levelCode": competition_level_code,
        "quantity": safe_quantity,
        "targetAction": "review-assigned-practice",
    }

    if student_user:
        CreateNotification(
            db,
            recipient_user_id=student_user.id,
            recipient_role="STUDENT",
            actor_user_id=actor_user_id,
            actor_role="ADMIN" if actor_user_id else None,
            student_id=student.id,
            teacher_id=teacher.id if teacher else None,
            type="ANNUAL_PRACTICE_ASSIGNED",
            category=ANNUAL_COMPETITION_PRACTICE_CATEGORY,
            title=f"{safe_quantity} Practice Paper{plural} Assigned",
            message=f"{safe_quantity} new {level_label} practice paper{plural} are ready in your Annual Competition Practice tab.",
            target_route="/student/competition/annual",
            target_tab="PRACTICE",
            metadata=metadata,
        )

    if teacher_user:
        CreateNotification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            actor_user_id=actor_user_id,
            actor_role="ADMIN" if actor_user_id else None,
            student_id=student.id,
            teacher_id=teacher.id if teacher else None,
            type="ANNUAL_PRACTICE_ASSIGNED_BY_ADMIN",
            category=ANNUAL_COMPETITION_PRACTICE_CATEGORY,
            title=f"{safe_quantity} Practice Paper{plural} Assigned To {student_name}",
            message=f"{student_name} now has {safe_quantity} new {level_label} practice paper{plural} pending.",
            target_route="/teacher/competition/annual",
            target_tab="PRACTICE",
            metadata=metadata,
        )

    for AdminUser in ActiveAdminUsers(db):
        # Skip the admin who actually clicked "Assign Papers" -- notifying
        # them about their own just-completed action is noise, not signal.
        # Every OTHER active admin/super-admin still gets it, same as DPS.
        if actor_user_id and AdminUser.id == actor_user_id:
            continue
        CreateNotification(
            db,
            recipient_user_id=AdminUser.id,
            recipient_role=AdminUser.role,
            actor_user_id=actor_user_id,
            actor_role="ADMIN" if actor_user_id else None,
            student_id=student.id,
            teacher_id=teacher.id if teacher else None,
            type="ANNUAL_PRACTICE_ASSIGNED_BY_ADMIN",
            category=ANNUAL_COMPETITION_PRACTICE_CATEGORY,
            title=f"{safe_quantity} Practice Paper{plural} Assigned To {student_name}",
            message=f"{student_name} now has {safe_quantity} new {level_label} practice paper{plural} pending.",
            target_route="/admin/competition/annual-studio",
            target_tab="PRACTICE",
            target_sub_tab="RESULTS",
            metadata=metadata,
        )


def NotifyAnnualCompetitionPracticeSubmitted(db: Session, *, attempt_id: str) -> None:
    attempt = db.get(CompetitionEventAttempt, attempt_id)
    if not attempt or attempt.attempt_type != "PRACTICE":
        return

    result = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == attempt.id).first()
    if not result:
        return

    student = db.get(Student, attempt.student_id)
    if not student:
        return

    student_user = _StudentUser(db, student)
    teacher = _TeacherForStudent(db, student)
    teacher_user = _TeacherUser(db, teacher)
    student_name = student_user.full_name if student_user else (student.student_code or "Student")
    level_code = result.competition_level_code
    level_label = FormatCompetitionLevelLabel(level_code)

    accuracy = int(round(float(result.accuracy_percentage or 0)))
    score_label = f"{int(round(result.score or 0))}/{int(round(result.max_score or 0))}"

    metadata: dict[str, Any] = {
        "event": "ANNUAL_PRACTICE_SUBMITTED",
        "studentCode": student.student_code,
        "levelCode": level_code,
        "attemptId": attempt.id,
        "accuracy": accuracy,
        "targetAction": "view-practice-result",
    }

    if student_user:
        CreateNotification(
            db,
            recipient_user_id=student_user.id,
            recipient_role="STUDENT",
            actor_user_id=student_user.id,
            actor_role="STUDENT",
            student_id=student.id,
            teacher_id=teacher.id if teacher else None,
            attempt_id=attempt.id,
            type="ANNUAL_PRACTICE_SUBMITTED",
            category=ANNUAL_COMPETITION_PRACTICE_CATEGORY,
            title="Practice Paper Submitted",
            message=f"You submitted your {level_label} practice paper. Score: {score_label} ({accuracy}%).",
            target_route=f"/student/competition/annual/attempt/{attempt.id}",
            metadata=metadata,
        )

    if teacher_user:
        CreateNotification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            actor_user_id=student_user.id if student_user else None,
            actor_role="STUDENT",
            student_id=student.id,
            teacher_id=teacher.id if teacher else None,
            attempt_id=attempt.id,
            type="ANNUAL_PRACTICE_SUBMITTED_BY_STUDENT",
            category=ANNUAL_COMPETITION_PRACTICE_CATEGORY,
            title=f"{student_name} Submitted A Practice Paper",
            message=f"{student_name} completed a {level_label} practice paper. Score: {score_label} ({accuracy}%).",
            target_route="/teacher/competition/annual",
            target_tab="PRACTICE",
            metadata=metadata,
        )

    for AdminUser in ActiveAdminUsers(db):
        CreateNotification(
            db,
            recipient_user_id=AdminUser.id,
            recipient_role=AdminUser.role,
            actor_user_id=student_user.id if student_user else None,
            actor_role="STUDENT",
            student_id=student.id,
            teacher_id=teacher.id if teacher else None,
            attempt_id=attempt.id,
            type="ANNUAL_PRACTICE_SUBMITTED_BY_STUDENT",
            category=ANNUAL_COMPETITION_PRACTICE_CATEGORY,
            title=f"{student_name} Submitted A Practice Paper",
            message=f"{student_name} completed a {level_label} practice paper. Score: {score_label} ({accuracy}%).",
            target_route="/admin/competition/annual-studio",
            target_tab="PRACTICE",
            target_sub_tab="RESULTS",
            metadata=metadata,
        )
