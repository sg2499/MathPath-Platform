"""2026-10-07 (Shailesh): the screen before each section.

"when a student submits one section or the section gets auto submitted when
the timer runs out, the next section pops up and starts without any
intimation ... show a slide or a screen when the student starts the paper
showing the first section name and the method and when they go on
submitting each section then the next screen should show the section they
submitted and the one coming up."

The page cannot do that alone: a section's clock used to start the instant
the one before it closed, so a screen in between would have cost the child
those seconds (and they would have counted in time taken, the ranking
tie-break), and the next section's questions were served at once. These
tests pin the engine's side of it:

  * a section activated for a page that asked for the screen is HELD: no
    time is deducted, its questions are not sent, answers are refused;
  * BeginCompetitionEventSection starts it, and only then does time run;
  * time on the screen is never in time taken;
  * a page that did not ask (an older cached one) sees no change at all;
  * the off switch turns it off for everyone.
"""

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException

from app.core import config
from app.models import CompetitionEventAttempt, CompetitionEventAttemptSectionState, CompetitionEventResult
from app.services import annual_competition_attempt_service as engine
from app.services import annual_competition_monitoring_service as monitoring
from tests.test_annual_competition_attempt_service import _practice_bank_paper
from tests.test_annual_competition_student_screens_service import (
    _full_setup,
    _mock_exam,
    _module_and_level,
    _question_with_options,
    _session,
)


def _section(db, attempt_id, number):
    db.expire_all()
    return (
        db.query(CompetitionEventAttemptSectionState)
        .filter(
            CompetitionEventAttemptSectionState.attempt_id == attempt_id,
            CompetitionEventAttemptSectionState.section_number == number,
        )
        .one()
    )


def _age_last_heartbeat(db, attempt_id, number, seconds):
    section = _section(db, attempt_id, number)
    section.last_heartbeat_at = datetime.now(timezone.utc) - timedelta(seconds=seconds)
    db.commit()


def _code(call) -> str:
    with pytest.raises(HTTPException) as caught:
        call()
    return caught.value.detail["code"]


def _start(db, student, event, briefing=True):
    return engine.StartCompetitionEventAttempt(db, student, event.id, SupportsSectionBriefing=briefing)


# ---------------------------------------------------------------------------
# Start of the paper
# ---------------------------------------------------------------------------
def test_the_first_section_waits_behind_its_screen_with_its_full_time_and_no_questions():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))

    started = _start(db, student, event)
    first = started["sections"][0]
    assert first["status"] == "ACTIVE"            # still exactly one ACTIVE section
    assert first["briefingPending"] is True
    assert first["remainingSeconds"] == 600
    assert started["sectionBriefingSeconds"] == config.ANNUAL_SECTION_BRIEFING_SECONDS == 15

    page = engine.GetCompetitionEventAttemptForStudent(db, student, started["attemptId"])
    assert page["activeSectionQuestions"] == []   # cannot be read early from the screen
    assert [s["questionCount"] for s in page["sections"]] == [2, 2]   # what the screen shows
    assert page["sections"][0]["sectionTitle"] and page["sections"][0]["mode"]


def test_no_time_is_lost_on_the_screen_however_long_it_shows():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    # The page keeps heartbeating while the screen shows: seen, but not timed.
    for _ in range(3):
        _age_last_heartbeat(db, attempt_id, 1, seconds=7)
        beat = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
        assert beat["sections"][0]["remainingSeconds"] == 600
        assert beat["sections"][0]["briefingPending"] is True
    # Even a long absence on the screen (a disconnect) costs nothing.
    _age_last_heartbeat(db, attempt_id, 1, seconds=900)
    beat = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    assert beat["sections"][0]["remainingSeconds"] == 600
    # And the heartbeat did move "last seen", so the live board does not call them stuck.
    last_seen = _section(db, attempt_id, 1).last_heartbeat_at
    assert (datetime.now(timezone.utc) - last_seen.replace(tzinfo=timezone.utc)).total_seconds() < 5


def test_nothing_can_be_answered_or_submitted_before_the_section_is_started():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    assert _code(lambda: engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, "q-1-1", "4")) == "COMPETITION_SECTION_NOT_BEGUN"
    assert _code(lambda: engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)) == "COMPETITION_SECTION_NOT_BEGUN"
    assert _section(db, attempt_id, 1).status == "ACTIVE"


def test_begin_starts_the_clock_and_sends_the_questions():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    _age_last_heartbeat(db, attempt_id, 1, seconds=14)      # fourteen seconds on the screen

    begun = engine.BeginCompetitionEventSection(db, student, attempt_id, token, 1)
    first = begun["sections"][0]
    assert first["briefingPending"] is False
    assert first["remainingSeconds"] == 600                 # the screen cost nothing
    assert len(begun["activeSectionQuestions"]) == 2        # one reply, no second request needed
    section = _section(db, attempt_id, 1)
    assert (datetime.now(timezone.utc) - section.started_at.replace(tzinfo=timezone.utc)).total_seconds() < 5

    # From here the clock runs exactly as it always has.
    _age_last_heartbeat(db, attempt_id, 1, seconds=10)
    beat = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    assert beat["sections"][0]["remainingSeconds"] == 590
    saved = engine.SaveCompetitionEventAnswer(db, student, attempt_id, token, 1, begun["activeSectionQuestions"][0]["questionId"], "4")
    assert saved["savedAnswer"]["savedAnswerText"] == "4"


def test_begin_twice_does_not_reset_a_running_clock():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    engine.BeginCompetitionEventSection(db, student, attempt_id, token, 1)
    _age_last_heartbeat(db, attempt_id, 1, seconds=30)
    engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)

    again = engine.BeginCompetitionEventSection(db, student, attempt_id, token, 1)   # a retry after a lost reply
    assert again["sections"][0]["remainingSeconds"] == 570
    assert len(again["activeSectionQuestions"]) == 2


def test_begin_has_the_same_guards_as_every_other_call():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    assert _code(lambda: engine.BeginCompetitionEventSection(db, student, attempt_id, "stale-token", 1)) == "COMPETITION_ATTEMPT_SESSION_SUPERSEDED"
    assert _code(lambda: engine.BeginCompetitionEventSection(db, student, attempt_id, token, 2)) == "COMPETITION_SECTION_NOT_ACTIVE"
    assert _section(db, attempt_id, 1).briefing_pending is True


# ---------------------------------------------------------------------------
# Between sections
# ---------------------------------------------------------------------------
def test_submitting_a_section_puts_the_next_one_behind_its_screen():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    first_ids = {q["questionId"] for q in engine.BeginCompetitionEventSection(db, student, attempt_id, token, 1)["activeSectionQuestions"]}

    after = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    assert after["currentSectionNumber"] == 2
    assert [s["status"] for s in after["sections"]] == ["COMPLETED", "ACTIVE"]
    assert after["sections"][1]["briefingPending"] is True
    assert after["sections"][1]["remainingSeconds"] == 300
    assert engine.GetCompetitionEventAttemptForStudent(db, student, attempt_id)["activeSectionQuestions"] == []

    _age_last_heartbeat(db, attempt_id, 2, seconds=12)
    begun = engine.BeginCompetitionEventSection(db, student, attempt_id, token, 2)
    assert begun["sections"][1]["remainingSeconds"] == 300
    second_ids = {q["questionId"] for q in begun["activeSectionQuestions"]}
    assert len(second_ids) == 2 and not (second_ids & first_ids)      # section 2's own questions


def test_a_section_that_runs_out_of_time_also_puts_the_next_one_behind_its_screen():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(20, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    engine.BeginCompetitionEventSection(db, student, attempt_id, token, 1)

    _age_last_heartbeat(db, attempt_id, 1, seconds=25)
    after = engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    assert [s["status"] for s in after["sections"]] == ["AUTO_SUBMITTED", "ACTIVE"]   # the page says "Time Is Up"
    assert after["sections"][1]["briefingPending"] is True
    assert after["sections"][1]["remainingSeconds"] == 300


def test_the_last_section_goes_straight_out_and_screen_time_is_not_in_time_taken():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    _age_last_heartbeat(db, attempt_id, 1, seconds=40)                      # 40 s on the first screen
    engine.BeginCompetitionEventSection(db, student, attempt_id, token, 1)
    _age_last_heartbeat(db, attempt_id, 1, seconds=30)                      # 30 s of real work
    engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)
    engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    _age_last_heartbeat(db, attempt_id, 2, seconds=40)                      # 40 s on the second screen
    engine.BeginCompetitionEventSection(db, student, attempt_id, token, 2)
    _age_last_heartbeat(db, attempt_id, 2, seconds=20)                      # 20 s of real work
    engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 2)

    done = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 2)
    assert done["status"] == "FINALIZED"
    assert all(s["briefingPending"] is False for s in done["sections"])
    result = db.query(CompetitionEventResult).filter(CompetitionEventResult.attempt_id == attempt_id).one()
    assert result.time_taken_seconds == 50                                  # 30 + 20, none of the 80 s of screens


# ---------------------------------------------------------------------------
# Coming back
# ---------------------------------------------------------------------------
def test_resuming_mid_section_goes_straight_back_in_with_no_screen():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id = started["attemptId"]
    engine.BeginCompetitionEventSection(db, student, attempt_id, started["sessionToken"], 1)
    _age_last_heartbeat(db, attempt_id, 1, seconds=30)
    engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, started["sessionToken"], 1)

    resumed = _start(db, student, event)        # the page reloads: Start is called again
    assert resumed["sections"][0]["briefingPending"] is False
    assert resumed["sections"][0]["remainingSeconds"] == 570
    assert len(engine.GetCompetitionEventAttemptForStudent(db, student, attempt_id)["activeSectionQuestions"]) == 2


def test_reloading_while_the_screen_is_showing_shows_the_screen_again_and_costs_nothing():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id = started["attemptId"]
    _age_last_heartbeat(db, attempt_id, 1, seconds=600)   # closed the laptop on the screen for ten minutes

    resumed = _start(db, student, event)
    assert resumed["sections"][0]["briefingPending"] is True
    assert resumed["sections"][0]["remainingSeconds"] == 600
    begun = engine.BeginCompetitionEventSection(db, student, attempt_id, resumed["sessionToken"], 1)
    assert begun["sections"][0]["remainingSeconds"] == 600


# ---------------------------------------------------------------------------
# A page that did not ask for the screen (an older cached one): no change
# ---------------------------------------------------------------------------
def test_a_page_that_does_not_ask_gets_exactly_the_old_behaviour():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = engine.StartCompetitionEventAttempt(db, student, event.id)      # no flag, as the old page calls it
    attempt_id, token = started["attemptId"], started["sessionToken"]

    assert started["sections"][0]["briefingPending"] is False
    assert len(engine.GetCompetitionEventAttemptForStudent(db, student, attempt_id)["activeSectionQuestions"]) == 2
    _age_last_heartbeat(db, attempt_id, 1, seconds=10)
    assert engine.RecordCompetitionEventHeartbeat(db, student, attempt_id, token, 1)["sections"][0]["remainingSeconds"] == 590
    after = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    assert after["sections"][1]["briefingPending"] is False                   # next section starts at once
    assert len(engine.GetCompetitionEventAttemptForStudent(db, student, attempt_id)["activeSectionQuestions"]) == 2


def test_an_old_page_taking_over_a_held_section_is_not_left_without_questions():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)                                     # new page: section 1 held
    attempt_id = started["attemptId"]
    _age_last_heartbeat(db, attempt_id, 1, seconds=120)

    taken_over = engine.StartCompetitionEventAttempt(db, student, event.id)   # old cached page resumes it
    assert taken_over["sections"][0]["briefingPending"] is False
    assert taken_over["sections"][0]["remainingSeconds"] == 600              # and the wait cost nothing
    assert len(engine.GetCompetitionEventAttemptForStudent(db, student, attempt_id)["activeSectionQuestions"]) == 2
    # ...and its later sections follow one another at once, as that page expects.
    after = engine.SubmitCompetitionEventSection(db, student, attempt_id, taken_over["sessionToken"], 1)
    assert after["sections"][1]["briefingPending"] is False


def test_a_new_page_taking_over_an_old_pages_attempt_gets_the_screen_from_the_next_section_on():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    engine.StartCompetitionEventAttempt(db, student, event.id)               # started by an old page
    resumed = _start(db, student, event)                                     # new page takes it over
    attempt_id, token = resumed["attemptId"], resumed["sessionToken"]

    assert resumed["sections"][0]["briefingPending"] is False                # already running: no screen now
    after = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    assert after["sections"][1]["briefingPending"] is True


# ---------------------------------------------------------------------------
# The off switch
# ---------------------------------------------------------------------------
def test_the_off_switch_turns_the_screens_off_for_every_page(monkeypatch):
    monkeypatch.setattr(config, "ANNUAL_SECTION_BRIEFING_ENABLED", False)
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)                                     # the page asks, the switch says no
    attempt_id, token = started["attemptId"], started["sessionToken"]

    assert started["sections"][0]["briefingPending"] is False
    assert len(engine.GetCompetitionEventAttemptForStudent(db, student, attempt_id)["activeSectionQuestions"]) == 2
    after = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    assert after["sections"][1]["briefingPending"] is False


def test_switching_off_mid_paper_still_lets_a_held_section_be_started(monkeypatch):
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    monkeypatch.setattr(config, "ANNUAL_SECTION_BRIEFING_ENABLED", False)    # switched off while a child is on the screen

    begun = engine.BeginCompetitionEventSection(db, student, started["attemptId"], started["sessionToken"], 1)
    assert begun["sections"][0]["briefingPending"] is False
    assert len(begun["activeSectionQuestions"]) == 2


# ---------------------------------------------------------------------------
# Practice papers use the same engine
# ---------------------------------------------------------------------------
def test_practice_papers_get_the_same_screens():
    db = _session()
    student, _event, _official_exam = _full_setup(db, section_seconds=(600,))
    module, level = _module_and_level(db, level_code="PM-L3", level_name="Preparatory Level 3")
    exam = _mock_exam(db, level.id, module.id, exam_id="practice-exam")
    for section_number in (1, 2):
        _question_with_options(db, exam.id, section_number, question_number=section_number * 10 + 1, qid=f"p-{section_number}")
    _practice_bank_paper(db, "PM-L3", exam.id, [120, 60], student.id)
    db.commit()

    started = engine.StartAnnualCompetitionPracticeAttempt(db, student, "PM-L3", SupportsSectionBriefing=True)
    attempt_id, token = started["attemptId"], started["sessionToken"]
    assert started["attemptType"] == "PRACTICE"
    assert started["sections"][0]["briefingPending"] is True
    engine.BeginCompetitionEventSection(db, student, attempt_id, token, 1)
    after = engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 1)
    assert after["sections"][1]["briefingPending"] is True
    engine.BeginCompetitionEventSection(db, student, attempt_id, token, 2)
    assert engine.SubmitCompetitionEventSection(db, student, attempt_id, token, 2)["status"] == "FINALIZED"


# ---------------------------------------------------------------------------
# Staff screens and safety nets
# ---------------------------------------------------------------------------
def test_the_live_board_knows_the_clock_is_held_and_does_not_call_the_student_stuck():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id, token = started["attemptId"], started["sessionToken"]

    row = monitoring.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id)["rows"][0]
    assert row["liveStatus"] == "IN_PROGRESS"
    assert row["clockHeld"] is True
    assert row["totalRemainingSecondsAtLastHeartbeat"] == 900
    assert row["currentSectionNumber"] == 1

    engine.BeginCompetitionEventSection(db, student, attempt_id, token, 1)
    row = monitoring.GetAnnualCompetitionLiveMonitoring(db, EventId=event.id)["rows"][0]
    assert row["clockHeld"] is False


def test_the_reconciliation_sweep_still_closes_a_paper_abandoned_on_the_screen():
    db = _session()
    student, event, _exam = _full_setup(db, section_seconds=(600, 300))
    started = _start(db, student, event)
    attempt_id = started["attemptId"]
    _age_last_heartbeat(db, attempt_id, 1, seconds=3600)

    swept = engine.ReconcileExpiredCompetitionEventAttempts(db, EventId=event.id)
    db.expire_all()
    assert db.get(CompetitionEventAttempt, attempt_id).status in ("SUBMITTED", "FINALIZED")
    assert swept
    # ...and no closed section is left marked as waiting behind a screen.
    assert not [n for n in (1, 2) if _section(db, attempt_id, n).briefing_pending]
