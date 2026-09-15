"""2026-09-15 (Shailesh): "we need to configure the notifications flow for
the student, teacher and admin side whenever a batch of practice papers are
assigned to the students ... we also need to implement the notifications for
the submission of these papers." Covers both entry points in
annual_competition_practice_notification_service.py:

  * NotifyAnnualCompetitionPracticeAssigned, exercised via the real
    BatchAssignAnnualCompetitionPracticePapers admin action (studio_service),
    not called directly -- so this also proves the wiring in that function
    actually fires, not just that the notify function works in isolation.
  * NotifyAnnualCompetitionPracticeSubmitted, exercised via the real
    section-submit path (StartAnnualCompetitionPracticeAttempt +
    SaveCompetitionEventAnswer + SubmitCompetitionEventSection), so the
    "once per whole paper, not once per section" behavior confirmed with
    Shailesh is proven against the actual _AdvanceOrFinalize code path, not
    asserted about it.

Fixtures mirror test_annual_competition_attempt_review_service.py's own
_setup_student_with_practice_questions/_answer conventions (self-contained,
no cross-file imports) since submission tests need real gradeable questions
and section timers, not just a paper row.
"""

from datetime import datetime, timezone

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventLevelPaper,
    CompetitionEventSectionTimer,
    CompetitionMockExam,
    CompetitionMockQuestion,
    Level,
    Module,
    Notification,
    Student,
    Teacher,
    User,
)
from app.services import annual_competition_attempt_service as attempt_engine
from app.services import annual_competition_studio_service as studio


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _admin(db, uid="admin-1", name="Admin One"):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(u)
    return u


def _teacher(db, uid="teacher-1", name="Teacher One"):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="TEACHER", is_active=True)
    db.add(u)
    db.flush()
    t = Teacher(id=f"t-{uid}", user_id=u.id, teacher_code=f"TCH-{uid}", is_active=True)
    db.add(t)
    db.flush()
    return t


def _student(db, sid="s1", name="Ravi Kumar", module_id=None, level_id=None, teacher_id=None):
    u = User(id=f"user-{sid}", full_name=name, email=f"{sid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    db.flush()
    s = Student(
        id=sid, user_id=u.id, student_code=f"MP-{sid.upper()}",
        current_module_id=module_id, current_level_id=level_id, teacher_id=teacher_id, is_active=True,
    )
    db.add(s)
    db.flush()
    return s


def _module_and_level(db, module_code="PM", level_code="PM-L2", level_name="Preparatory Level 2"):
    m = db.query(Module).filter(Module.module_code == module_code).first()
    if not m:
        m = Module(id=f"module-{module_code}", module_code=module_code, module_name=module_code, is_active=True)
        db.add(m)
        db.flush()
    l = Level(id=f"level-{level_code}", module_id=m.id, level_code=level_code, level_name=level_name, is_active=True)
    db.add(l)
    db.flush()
    return m, l


def _question(db, mock_exam_id, section_number, question_number, correct_answer="4", qid=None):
    qid = qid or f"q-{section_number}-{question_number}"
    q = CompetitionMockQuestion(
        id=qid, mock_exam_id=mock_exam_id, section_number=section_number, question_number=question_number,
        display_type="VERTICAL", correct_answer=correct_answer, concept_family="Addition", marks=1,
        question_text=f"Question {question_number}",
    )
    db.add(q)
    db.flush()
    return q


def _setup_student_with_practice_questions(db, student, section_seconds, questions_per_section, level_code="PM-L2"):
    """Same convention as test_annual_competition_attempt_review_service.py's
    own practice fixture -- no event_id (practice never belongs to one),
    paper_kind="PRACTICE" with assigned_student_id set."""
    m, l = _module_and_level(db, level_code=level_code)
    exam = CompetitionMockExam(
        id=f"practice-exam-{level_code}-{student.id}", title="Test Exam", module_id=m.id, level_id=l.id,
        total_questions=20, duration_seconds=1200, is_active=True,
    )
    db.add(exam)
    db.flush()
    for section_number, count in enumerate(questions_per_section, start=1):
        for n in range(1, count + 1):
            question_number = (section_number - 1) * 10 + n
            _question(db, exam.id, section_number, question_number, qid=f"practice-q-{student.id}-{section_number}-{question_number}")

    level_paper_id = f"practice-paper-{student.id}"
    paper = CompetitionEventLevelPaper(
        id=level_paper_id, event_id=None, competition_level_code=level_code,
        mock_exam_id=exam.id, status="READY", paper_kind="PRACTICE",
        assigned_student_id=student.id, assigned_by_user_id=None, assigned_at=datetime.now(timezone.utc),
    )
    db.add(paper)
    db.flush()
    for i, seconds in enumerate(section_seconds, start=1):
        t = CompetitionEventSectionTimer(
            id=f"{level_paper_id}-timer-{i}", level_paper_id=paper.id, section_number=i,
            section_title=f"Speed Round {i}", mode="ABACUS", time_limit_seconds=seconds, display_order=i,
        )
        db.add(t)
    db.flush()
    db.commit()
    return paper


def _notifications_for(db, user_id, type_prefix="ANNUAL_PRACTICE"):
    return (
        db.query(Notification)
        .filter(Notification.recipient_user_id == user_id, Notification.type.like(f"{type_prefix}%"))
        .all()
    )


# ---------------------------------------------------------------------------
# Assignment notifications
# ---------------------------------------------------------------------------

def test_batch_assign_notifies_student_teacher_and_other_admins_but_not_the_acting_admin():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    acting_admin = _admin(db, "admin-acting", "Acting Admin")
    other_admin = _admin(db, "admin-other", "Other Admin")
    teacher = _teacher(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id, teacher_id=teacher.id)
    db.commit()

    studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=acting_admin,
    )

    student_user_id = student.user_id
    teacher_user_id = teacher.user_id

    student_notifications = _notifications_for(db, student_user_id)
    assert len(student_notifications) == 1
    assert student_notifications[0].type == "ANNUAL_PRACTICE_ASSIGNED"
    assert student_notifications[0].category == "ANNUAL_COMPETITION_PRACTICE"
    assert "5" in student_notifications[0].title
    assert "PM-L2" in student_notifications[0].message

    teacher_notifications = _notifications_for(db, teacher_user_id)
    assert len(teacher_notifications) == 1
    assert teacher_notifications[0].type == "ANNUAL_PRACTICE_ASSIGNED_BY_ADMIN"
    assert "Ravi Kumar" in teacher_notifications[0].title

    # The admin who actually clicked "Assign Papers" gets nothing -- notifying
    # them about their own just-completed action would be noise.
    assert _notifications_for(db, "admin-acting") == []

    # Every OTHER active admin still gets one.
    other_admin_notifications = _notifications_for(db, "admin-other")
    assert len(other_admin_notifications) == 1
    assert other_admin_notifications[0].type == "ANNUAL_PRACTICE_ASSIGNED_BY_ADMIN"


def test_batch_assign_notification_skips_teacher_gracefully_when_student_has_none():
    db = _session()
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    admin = _admin(db)
    student = _student(db, "s1", module_id=module.id, level_id=level.id, teacher_id=None)
    db.commit()

    outcome = studio.BatchAssignAnnualCompetitionPracticePapers(
        db, CompetitionLevelCode="PM-L2", StudentIds=[student.id], Quantity=5, AssignedBy=admin,
    )
    assert outcome["studentsSucceeded"] == 1

    # Student notification still fires even with no teacher on record.
    assert len(_notifications_for(db, student.user_id)) == 1


# ---------------------------------------------------------------------------
# Submission notifications
# ---------------------------------------------------------------------------

def test_practice_submission_notifies_once_when_the_whole_paper_is_finalized_not_per_section():
    """2026-09-15 (Shailesh): "the notifications ... will appear once the
    entire paper gets submitted right? not for each section the student
    submits while attempting the paper right?" -- this is the direct proof:
    a 2-section paper submits section 1 first (no notification should exist
    yet), then section 2 (which finalizes the whole attempt -- exactly one
    notification per recipient should exist only now)."""
    db = _session()
    teacher = _teacher(db)
    student = _student(db, "s1", teacher_id=teacher.id)
    admin = _admin(db)
    db.commit()

    _setup_student_with_practice_questions(db, student, section_seconds=(600, 600), questions_per_section=[1, 1])

    started = attempt_engine.StartAnnualCompetitionPracticeAttempt(db, student, "PM-L2")
    attempt_id, token = started["attemptId"], started["sessionToken"]

    attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "practice-q-s1-1-1", "4")
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    # Section 1 (not the last) submitted -- no submission notification yet.
    assert _notifications_for(db, student.user_id, "ANNUAL_PRACTICE_SUBMITTED") == []
    assert _notifications_for(db, teacher.user_id, "ANNUAL_PRACTICE_SUBMITTED") == []
    assert _notifications_for(db, admin.id, "ANNUAL_PRACTICE_SUBMITTED") == []

    attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 2, "practice-q-s1-2-11", "4")
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 2)

    # Section 2 was the LAST section -- the whole paper is now finalized,
    # exactly one submission notification per recipient.
    student_notifications = _notifications_for(db, student.user_id, "ANNUAL_PRACTICE_SUBMITTED")
    assert len(student_notifications) == 1
    assert student_notifications[0].type == "ANNUAL_PRACTICE_SUBMITTED"
    assert student_notifications[0].category == "ANNUAL_COMPETITION_PRACTICE"
    assert "100" in student_notifications[0].message  # both questions answered correctly

    teacher_notifications = _notifications_for(db, teacher.user_id, "ANNUAL_PRACTICE_SUBMITTED")
    assert len(teacher_notifications) == 1
    assert teacher_notifications[0].type == "ANNUAL_PRACTICE_SUBMITTED_BY_STUDENT"
    assert "Ravi Kumar" in teacher_notifications[0].title

    admin_notifications = _notifications_for(db, admin.id, "ANNUAL_PRACTICE_SUBMITTED")
    assert len(admin_notifications) == 1
    assert admin_notifications[0].type == "ANNUAL_PRACTICE_SUBMITTED_BY_STUDENT"


def test_official_attempt_submission_does_not_send_any_practice_notification():
    """Scope guard: the OFFICIAL flow's own submission notification is out of
    scope for this change (Shailesh only asked for practice) and must stay
    silent -- confirms the attempt_type == "PRACTICE" gate in
    _AdvanceOrFinalize actually excludes OFFICIAL attempts, not just that
    PRACTICE attempts notify."""
    db = _session()
    student = _student(db, "s1")
    admin = _admin(db)
    db.commit()

    m, l = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = CompetitionMockExam(
        id="official-exam", title="Official Exam", module_id=m.id, level_id=l.id,
        total_questions=20, duration_seconds=1200, is_active=True,
    )
    db.add(exam)
    db.flush()
    _question(db, exam.id, 1, 1, qid="official-q-1-1")

    event = CompetitionEvent(
        id="event-1", name="Annual Competition 2026", status="SCHEDULED",
        competition_date=datetime.now(timezone.utc),
    )
    db.add(event)
    db.flush()

    assignment = CompetitionEventAssignment(
        id="assign-s1", event_id=event.id, student_id=student.id,
        assigned_level_code="PM-L2", assignment_source="AUTO", is_active=True,
    )
    db.add(assignment)
    db.flush()

    paper = CompetitionEventLevelPaper(
        id="official-paper", event_id=event.id, competition_level_code="PM-L2",
        mock_exam_id=exam.id, status="READY",
    )
    db.add(paper)
    db.flush()
    timer = CompetitionEventSectionTimer(
        id="official-paper-timer-1", level_paper_id=paper.id, section_number=1,
        section_title="Speed Round 1", mode="ABACUS", time_limit_seconds=600, display_order=1,
    )
    db.add(timer)
    db.commit()

    started = attempt_engine.StartCompetitionEventAttempt(db, student, event.id)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    attempt_engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "official-q-1-1", "4")
    attempt_engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)

    assert _notifications_for(db, student.user_id, "ANNUAL_PRACTICE") == []
    assert _notifications_for(db, admin.id, "ANNUAL_PRACTICE") == []
