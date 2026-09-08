"""Package 9 (Full Rehearsal + Regression) -- end-to-end rehearsal.

Every other Annual Competition test file proves its own package's logic in
isolation (attempt/timer engine, scoring, studio, certificates, ...). This
file proves the opposite thing: that those packages actually compose into
one coherent 11 Oct 2026 day when run together, using nothing but the same
public service functions the real API routes call.

One event, five slots (offline x3, online-India, online-international) an
admin has already scheduled -- one of the three offline slots deliberately
not open yet, so the slot gate (Package 5) is exercised for real, not just
assumed. Four students who ARE inside their slot's window start, and
between them this rehearsal drives every scenario Package 9's own
checklist names:

  - a genuine disconnect-and-resume, simulated the same way a real network
    drop actually manifests to this server (a heartbeat call arriving long
    after the section's last recorded heartbeat -- see
    RecordCompetitionEventHeartbeat's own docstring on why that, not a
    synthetic remaining-seconds edit, is the only faithful way to simulate
    this), covering both of PM-L2's section modes (ABACUS, then VISUAL);
  - an attempt nobody ever returns to (closed tab, event day over), left
    for the Package 4 reconciliation sweep to catch, alongside a second
    attempt that IS still being actively heartbeated at that exact moment,
    to prove the sweep only ever touches what's actually gone quiet;
  - the full scoring -> rank -> release -> certificate pipeline (Packages
    6 and 8) run against attempts this rehearsal itself produced, including
    a certificate pulled for the reconciled/abandoned attempt specifically
    -- proving "every finalized participant is eligible" holds even for a
    result nobody voluntarily submitted.

Checklist item 2 ("at least one simulated disconnect-and-resume per section
type") is read here as CompetitionEventSectionTimer.mode (ABACUS/VISUAL/
MIXED/...) -- the only sense in which this codebase's competition sections
have a "type" at all (see models.py's own comment on that column). Reading
annual_competition_attempt_service.py confirms RecordCompetitionEventHeartbeat
never branches on mode -- a pause behaves identically whatever the section's
mode is, by design -- so this is a rehearsal-realism choice, not a hunt for
mode-specific behavior that doesn't exist: the same student disconnects
once in an ABACUS section and once in a VISUAL section, back to back.

Full regression (checklist item 2's second half -- existing DPS/Assessment/
Competition Mock suites staying green, and a clean `pytest`/`npm run build`)
is verified by running those suites directly, not by anything in this file;
see pkg-09-rehearsal-and-regression.md for that run's recorded result.
"""

import asyncio
import io
from datetime import datetime, timedelta, timezone

import pypdf
import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import (
    CompetitionEvent,
    CompetitionEventAssignment,
    CompetitionEventAttempt,
    CompetitionEventAttemptSectionState,
    CompetitionEventLevelPaper,
    CompetitionEventResult,
    CompetitionEventSectionTimer,
    CompetitionEventSlot,
    CompetitionMockExam,
    CompetitionMockQuestion,
    CompetitionMockQuestionOption,
    Level,
    Module,
    Student,
    User,
)
from app.services import annual_competition_attempt_service as engine
from app.services import annual_competition_certificate_service as certificates
from app.services import annual_competition_scoring_service as scoring

SECTION_SECONDS = 900  # 15 min per section, matches PM-L2's real default


def _session():
    db_engine = create_engine("sqlite:///:memory:", future=True)
    Base.metadata.create_all(db_engine)
    Session = sessionmaker(bind=db_engine, autoflush=False, autocommit=False, future=True)
    return Session()


def _user(db, uid, name):
    u = User(id=uid, full_name=name, email=f"{uid}@example.test", password_hash="x", role="STUDENT", is_active=True)
    db.add(u)
    return u


def _admin(db):
    a = User(id="user-admin", full_name="Admin", email="admin@example.test", password_hash="x", role="ADMIN", is_active=True)
    db.add(a)
    return a


def _student(db, sid, name):
    _user(db, f"user-{sid}", name)
    s = Student(id=sid, user_id=f"user-{sid}", student_code=f"MP-{sid}", is_active=True)
    db.add(s)
    return s


def _event(db, event_id="event-rehearsal"):
    e = CompetitionEvent(
        id=event_id,
        name="Annual Competition 2026",
        status="SCHEDULED",
        competition_date=datetime(2026, 10, 11, tzinfo=timezone.utc),
    )
    db.add(e)
    db.flush()
    return e


def _slot(db, slot_id, event_id, mode, opens_in_hours):
    """opens_in_hours negative -> slot already open; positive -> not yet."""
    now = datetime.now(timezone.utc)
    s = CompetitionEventSlot(
        id=slot_id,
        event_id=event_id,
        mode=mode,
        slot_label=f"{mode} -- {slot_id}",
        scheduled_start_at=now + timedelta(hours=opens_in_hours),
        scheduled_end_at=now + timedelta(hours=opens_in_hours + 1),
        is_active=True,
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
    l = db.query(Level).filter(Level.module_id == m.id, Level.level_code == level_code).first()
    if not l:
        l = Level(id=f"level-{level_code}", module_id=m.id, level_code=level_code, level_name=level_name, is_active=True)
        db.add(l)
        db.flush()
    return m, l


def _mock_exam(db, level_id, module_id, exam_id):
    e = CompetitionMockExam(
        id=exam_id, title="Rehearsal Exam", module_id=module_id, level_id=level_id,
        total_questions=2, duration_seconds=2 * SECTION_SECONDS, is_active=True,
    )
    db.add(e)
    db.flush()
    return e


def _question_with_options(db, mock_exam_id, section_number, question_number):
    qid = f"{mock_exam_id}-q-{section_number}-{question_number}"
    q = CompetitionMockQuestion(
        id=qid, mock_exam_id=mock_exam_id, section_number=section_number, question_number=question_number,
        display_type="VERTICAL", correct_answer="4", concept_family="Addition", marks=1,
    )
    db.add(q)
    db.flush()
    db.add_all(
        [
            CompetitionMockQuestionOption(id=f"{qid}-opt-a", mock_question_id=q.id, option_label="A", option_value="4", is_correct=True, display_order=1),
            CompetitionMockQuestionOption(id=f"{qid}-opt-b", mock_question_id=q.id, option_label="B", option_value="5", is_correct=False, display_order=2),
        ]
    )
    db.flush()
    return q


def _level_paper_with_timers(db, event_id, level_code, mock_exam_id, sections, level_paper_id):
    """sections: list of (mode, time_limit_seconds), one per section number."""
    p = CompetitionEventLevelPaper(
        id=level_paper_id, event_id=event_id, competition_level_code=level_code,
        mock_exam_id=mock_exam_id, status="READY",
    )
    db.add(p)
    db.flush()
    for i, (mode, seconds) in enumerate(sections, start=1):
        db.add(
            CompetitionEventSectionTimer(
                id=f"{level_paper_id}-timer-{i}", level_paper_id=p.id, section_number=i,
                section_title=f"Section {i} ({mode})", mode=mode, time_limit_seconds=seconds, display_order=i,
            )
        )
    db.flush()
    return p


def _assignment(db, assignment_id, event_id, student_id, level_code, slot_id):
    a = CompetitionEventAssignment(
        id=assignment_id, event_id=event_id, student_id=student_id,
        assigned_level_code=level_code, slot_id=slot_id, assignment_source="AUTO", is_active=True,
    )
    db.add(a)
    db.flush()
    return a


def _active_section_row(db, attempt_id):
    return (
        db.query(CompetitionEventAttemptSectionState)
        .filter(CompetitionEventAttemptSectionState.attempt_id == attempt_id, CompetitionEventAttemptSectionState.status == "ACTIVE")
        .one()
    )


def _collect_pdf_bytes(response) -> bytes:
    async def _collect() -> bytes:
        chunks: list[bytes] = []
        async for chunk in response.body_iterator:
            chunks.append(chunk if isinstance(chunk, (bytes, bytearray)) else chunk.encode())
        return b"".join(chunks)

    return asyncio.run(_collect())


def _simulate_disconnect_then_heartbeat(db, student, attempt_id, token, section_number, minutes_disconnected):
    """Backdates the active section's last_heartbeat_at by `minutes_disconnected`
    (simulating a real gap in server-received heartbeats -- a genuine
    network drop, not a synthetic remaining-seconds edit) and then sends one
    real heartbeat, exactly as a reconnecting client would. Returns the
    updated attempt payload so the caller can assert on the capped
    deduction."""
    section_row = _active_section_row(db, attempt_id)
    section_row.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(minutes=minutes_disconnected)
    db.commit()
    return engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, section_number)


# ---------------------------------------------------------------------------
# The rehearsal
# ---------------------------------------------------------------------------

def test_full_rehearsal_across_five_slots_with_disconnects_and_abandonment():
    db = _session()
    event = _event(db)
    admin = _admin(db)

    # Five slots: three offline, one online-India, one online-international
    # -- exactly REQUIREMENTS.md's own five, per pkg-09's checklist item 1.
    # One offline slot is deliberately still in the future, so the slot
    # gate itself gets exercised, not just assumed to work from Package 5's
    # own isolated tests.
    slot_off_1 = _slot(db, "slot-off-1", event.id, "OFFLINE", opens_in_hours=-2)
    slot_off_2 = _slot(db, "slot-off-2", event.id, "OFFLINE", opens_in_hours=-2)
    slot_off_3_not_open = _slot(db, "slot-off-3", event.id, "OFFLINE", opens_in_hours=3)
    slot_india = _slot(db, "slot-india", event.id, "ONLINE_INDIA", opens_in_hours=-2)
    slot_intl = _slot(db, "slot-intl", event.id, "ONLINE_INTL", opens_in_hours=-2)

    # One shared, identical paper for every student on this level -- the
    # "paper fairness" invariant this whole epic is built on. Two sections,
    # ABACUS then VISUAL, matching PM-L2's real default section types.
    module, level = _module_and_level(db, "PM", "PM-L2", "Preparatory Level 2")
    exam = _mock_exam(db, level.id, module.id, "exam-rehearsal")
    _question_with_options(db, exam.id, section_number=1, question_number=1)
    _question_with_options(db, exam.id, section_number=2, question_number=2)
    _level_paper_with_timers(
        db, event.id, "PM-L2", exam.id,
        sections=[("ABACUS", SECTION_SECONDS), ("VISUAL", SECTION_SECONDS)],
        level_paper_id="paper-rehearsal",
    )

    student_off_1 = _student(db, "s-off-1", "Offline One")     # will be abandoned -> reconciled
    student_off_2 = _student(db, "s-off-2", "Offline Two")     # clean, fast completion
    student_off_3 = _student(db, "s-off-3", "Offline Three")   # slot not open yet -- blocked
    student_india = _student(db, "s-india", "India Online")    # two disconnect-and-resumes
    student_intl = _student(db, "s-intl", "Intl Online")       # live at reconciliation time

    _assignment(db, "assign-off-1", event.id, student_off_1.id, "PM-L2", slot_off_1.id)
    _assignment(db, "assign-off-2", event.id, student_off_2.id, "PM-L2", slot_off_2.id)
    _assignment(db, "assign-off-3", event.id, student_off_3.id, "PM-L2", slot_off_3_not_open.id)
    _assignment(db, "assign-india", event.id, student_india.id, "PM-L2", slot_india.id)
    _assignment(db, "assign-intl", event.id, student_intl.id, "PM-L2", slot_intl.id)
    db.commit()

    # -----------------------------------------------------------------
    # 1. Slot gate: the student in the not-yet-open offline slot is
    #    rejected; the other four (across OFFLINE x2, ONLINE_INDIA,
    #    ONLINE_INTL) all start cleanly.
    # -----------------------------------------------------------------
    with pytest.raises(HTTPException) as exc_info:
        engine.StartCompetitionEventAttempt(db, student_off_3, event.id)
    assert exc_info.value.status_code == 403
    assert exc_info.value.detail["code"] == "COMPETITION_SLOT_NOT_OPEN_YET"
    assert db.query(CompetitionEventAttempt).filter(CompetitionEventAttempt.student_id == student_off_3.id).first() is None

    started_off_1 = engine.StartCompetitionEventAttempt(db, student_off_1, event.id)
    started_off_2 = engine.StartCompetitionEventAttempt(db, student_off_2, event.id)
    started_india = engine.StartCompetitionEventAttempt(db, student_india, event.id)
    started_intl = engine.StartCompetitionEventAttempt(db, student_intl, event.id)
    for started in (started_off_1, started_off_2, started_india, started_intl):
        assert started["status"] == "IN_PROGRESS"
        assert started["currentSectionNumber"] == 1
        assert started["sections"][0]["remainingSeconds"] == SECTION_SECONDS

    attempt_off_1 = started_off_1["attemptId"]  # abandoned right after this -- no session token ever used again
    attempt_off_2, token_off_2 = started_off_2["attemptId"], started_off_2["sessionToken"]
    attempt_india, token_india = started_india["attemptId"], started_india["sessionToken"]
    attempt_intl, token_intl = started_intl["attemptId"], started_intl["sessionToken"]

    # -----------------------------------------------------------------
    # 2. Genuine disconnect-and-resume for student_india, once per section
    #    type (ABACUS, then VISUAL) -- a real heartbeat gap, capped by the
    #    grace window, never the full disconnect duration.
    # -----------------------------------------------------------------
    result = _simulate_disconnect_then_heartbeat(db, student_india, attempt_india, token_india, section_number=1, minutes_disconnected=20)
    assert result["sections"][0]["remainingSeconds"] == SECTION_SECONDS - engine.HEARTBEAT_GRACE_SECONDS  # capped, not 20 min

    engine.SaveCompetitionEventAnswer(db, student_india, attempt_india, token_india, 1, f"{exam.id}-q-1-1", "4")  # correct
    engine.SubmitCompetitionEventSection(db, student_india, attempt_india, token_india, 1)  # -> section 2 (VISUAL) active

    result = _simulate_disconnect_then_heartbeat(db, student_india, attempt_india, token_india, section_number=2, minutes_disconnected=15)
    assert result["sections"][1]["remainingSeconds"] == SECTION_SECONDS - engine.HEARTBEAT_GRACE_SECONDS

    engine.SaveCompetitionEventAnswer(db, student_india, attempt_india, token_india, 2, f"{exam.id}-q-2-2", "4")  # correct
    final_india = engine.SubmitCompetitionEventSection(db, student_india, attempt_india, token_india, 2)
    assert final_india["status"] == "FINALIZED"  # last section closed -> scored via the Package 6 hook

    # -----------------------------------------------------------------
    # 3. student_off_2: clean, fast, no disconnects -- both questions
    #    correct, submitted immediately (0s recorded per section, since
    #    time is only ever debited by an actual heartbeat -- see the
    #    engine module's own docstring). This is the "nothing went wrong"
    #    control path every rehearsal also needs.
    # -----------------------------------------------------------------
    engine.SaveCompetitionEventAnswer(db, student_off_2, attempt_off_2, token_off_2, 1, f"{exam.id}-q-1-1", "4")  # correct
    engine.SubmitCompetitionEventSection(db, student_off_2, attempt_off_2, token_off_2, 1)
    engine.SaveCompetitionEventAnswer(db, student_off_2, attempt_off_2, token_off_2, 2, f"{exam.id}-q-2-2", "4")  # correct
    final_off_2 = engine.SubmitCompetitionEventSection(db, student_off_2, attempt_off_2, token_off_2, 2)
    assert final_off_2["status"] == "FINALIZED"

    # -----------------------------------------------------------------
    # 4. student_off_1 is abandoned: started, then never touched again --
    #    exactly the gap the plan's own lazy pattern can't cover on its
    #    own. Backdate its heartbeat well past the grace window so it
    #    reads as genuinely paused right now.
    # -----------------------------------------------------------------
    abandoned_section = _active_section_row(db, attempt_off_1)
    abandoned_section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(hours=3)
    db.commit()

    # student_intl heartbeats normally (recently, well within grace) and is
    # deliberately left IN_PROGRESS -- this is the "still actually
    # competing" attempt the reconciliation sweep must leave alone.
    live_result = engine.RecordCompetitionEventHeartbeat(db, student_intl, attempt_intl, token_intl, 1)
    assert live_result["status"] == "IN_PROGRESS"

    # -----------------------------------------------------------------
    # 5. Reconciliation sweep: catches student_off_1 (paused, abandoned),
    #    leaves student_intl (live) alone, and is idempotent on a second run.
    # -----------------------------------------------------------------
    swept = engine.ReconcileExpiredCompetitionEventAttempts(db)
    assert swept["reconciledCount"] == 1
    assert attempt_off_1 in swept["attemptIds"]
    assert attempt_intl not in swept["attemptIds"]

    db.refresh(db.get(CompetitionEventAttempt, attempt_off_1))
    reconciled_attempt = db.get(CompetitionEventAttempt, attempt_off_1)
    assert reconciled_attempt.status == "FINALIZED"  # force-closed all the way through, not left half-advanced
    assert db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == attempt_off_1).count() == 1

    swept_again = engine.ReconcileExpiredCompetitionEventAttempts(db)
    assert swept_again["reconciledCount"] == 0  # nothing left to do -- confirmed idempotent

    live_attempt = db.get(CompetitionEventAttempt, attempt_intl)
    assert live_attempt.status == "IN_PROGRESS"  # untouched by either sweep run

    # Now let student_intl actually finish, with one wrong answer, so
    # ranking below has a genuinely mixed field to sort.
    engine.SaveCompetitionEventAnswer(db, student_intl, attempt_intl, token_intl, 1, f"{exam.id}-q-1-1", "4")  # correct
    engine.SubmitCompetitionEventSection(db, student_intl, attempt_intl, token_intl, 1)
    engine.SaveCompetitionEventAnswer(db, student_intl, attempt_intl, token_intl, 2, f"{exam.id}-q-2-2", "5")  # wrong
    final_intl = engine.SubmitCompetitionEventSection(db, student_intl, attempt_intl, token_intl, 2)
    assert final_intl["status"] == "FINALIZED"

    # -----------------------------------------------------------------
    # 6. Full regression of the results pipeline (Packages 6 + 8) against
    #    attempts THIS rehearsal produced: rank, release, per-student
    #    reads, and a certificate for the reconciled/abandoned attempt.
    # -----------------------------------------------------------------
    ranked = scoring.RankCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode="PM-L2")
    assert ranked["rankedCount"] == 4  # off-1 (reconciled), off-2, india, intl -- off-3 never started, no result at all

    all_results = scoring.ListCompetitionEventResultsForAdmin(db, EventId=event.id)
    by_student = {row["studentId"]: row for row in all_results["rows"]}
    assert by_student[student_off_2.id]["accuracyPercentage"] == 100.0
    assert by_student[student_off_2.id]["timeTakenSeconds"] == 0  # never heartbeated -- instant submit
    assert by_student[student_india.id]["accuracyPercentage"] == 100.0
    assert by_student[student_india.id]["timeTakenSeconds"] == engine.HEARTBEAT_GRACE_SECONDS * 2  # one capped disconnect per section
    assert by_student[student_intl.id]["accuracyPercentage"] == 50.0
    assert by_student[student_off_1.id]["accuracyPercentage"] == 0.0  # abandoned -- both questions unanswered

    # Ranking: accuracy desc, then time asc among ties. off_2 (100%, 0s)
    # beats india (100%, 90s) beats intl (50%) beats the abandoned off_1 (0%).
    assert by_student[student_off_2.id]["rank"] == 1
    assert by_student[student_india.id]["rank"] == 2
    assert by_student[student_intl.id]["rank"] == 3
    assert by_student[student_off_1.id]["rank"] == 4

    scoring.ReleaseCompetitionEventResults(db, EventId=event.id, CompetitionLevelCode=None, ReleasedBy=admin)

    # Own-result-only visibility (Package 8's confirmed decision) holds
    # end-to-end: each student's own read shows only their own rank/score.
    own_read = scoring.GetCompetitionEventResultForStudent(db, student_off_1, attempt_off_1)
    assert own_read["released"] is True
    assert own_read["result"]["rank"] == 4

    # A certificate for the RECONCILED, never-voluntarily-submitted attempt
    # -- proving "every finalized participant is eligible" survives the
    # reconciliation path, not just a clean manual submit.
    cert_response = certificates.BuildAnnualCompetitionCertificateForStudent(db, student_off_1, attempt_off_1)
    pdf_bytes = _collect_pdf_bytes(cert_response)
    assert pdf_bytes[:4] == b"%PDF"
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    page_text = reader.pages[0].extract_text() or ""
    assert "Offline One" in page_text
    assert "Rank 4" in page_text
