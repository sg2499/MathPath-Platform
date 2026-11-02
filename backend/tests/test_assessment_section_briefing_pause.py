"""The upcoming-section slide pauses an assessment's timer (2026-11-02, Shailesh).

"when the upcoming section slide is shown, that should pause the overall timer
and resume it when the student actually starts that section". The screen
reports when a slide appears and when the section starts; the server moves the
paper's deadline on by the time in between -- once per section, capped at
ASSESSMENT_SECTION_BRIEFING_MAX_PAUSE_SECONDS -- and the time taken on the
paper leaves those pauses out.
"""
from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi import HTTPException

from app.services import assessment_engine_service as engine
from tests.test_assessment_typed_answers import db, setup  # noqa: F401  (fixtures)


def _start(db, setup):
    return engine.StartAssessmentAttempt(db, setup["student"], setup["assignment"].id)


def _at(monkeypatch, moment):
    monkeypatch.setattr(engine, "NowUtc", lambda: moment)


def test_slide_time_is_credited_once_per_section(db, setup, monkeypatch):
    attempt = _start(db, setup)
    deadline = engine.AwareUtc(attempt.expires_at)
    t0 = engine.AwareUtc(attempt.started_at)

    _at(monkeypatch, t0 + timedelta(minutes=5))
    engine.StartAssessmentSectionBriefing(db, setup["student"], attempt.id, 2)
    _at(monkeypatch, t0 + timedelta(minutes=5, seconds=8))
    reply = engine.EndAssessmentSectionBriefing(db, setup["student"], attempt.id, 2)
    assert reply["creditedSeconds"] == 8
    db.refresh(attempt)
    assert engine.AwareUtc(attempt.expires_at) == deadline + timedelta(seconds=8)

    # The same section again: nothing more.
    engine.StartAssessmentSectionBriefing(db, setup["student"], attempt.id, 2)
    _at(monkeypatch, t0 + timedelta(minutes=6))
    assert engine.EndAssessmentSectionBriefing(db, setup["student"], attempt.id, 2)["creditedSeconds"] == 0
    db.refresh(attempt)
    assert engine.AwareUtc(attempt.expires_at) == deadline + timedelta(seconds=8)


def test_a_pause_is_capped(db, setup, monkeypatch):
    attempt = _start(db, setup)
    deadline = engine.AwareUtc(attempt.expires_at)
    t0 = engine.AwareUtc(attempt.started_at)
    _at(monkeypatch, t0 + timedelta(minutes=1))
    engine.StartAssessmentSectionBriefing(db, setup["student"], attempt.id, 3)
    _at(monkeypatch, t0 + timedelta(minutes=9))
    reply = engine.EndAssessmentSectionBriefing(db, setup["student"], attempt.id, 3)
    assert reply["creditedSeconds"] == engine.ASSESSMENT_SECTION_BRIEFING_MAX_PAUSE_SECONDS
    db.refresh(attempt)
    assert engine.AwareUtc(attempt.expires_at) == deadline + timedelta(seconds=engine.ASSESSMENT_SECTION_BRIEFING_MAX_PAUSE_SECONDS)


def test_end_without_start_credits_nothing_and_bad_section_is_refused(db, setup):
    attempt = _start(db, setup)
    deadline = engine.AwareUtc(attempt.expires_at)
    assert engine.EndAssessmentSectionBriefing(db, setup["student"], attempt.id, 4)["creditedSeconds"] == 0
    db.refresh(attempt)
    assert engine.AwareUtc(attempt.expires_at) == deadline
    with pytest.raises(HTTPException) as error:
        engine.StartAssessmentSectionBriefing(db, setup["student"], attempt.id, 99)
    assert error.value.detail["code"] == "ASSESSMENT_SECTION_NOT_FOUND"


def test_time_taken_leaves_the_pauses_out(db, setup, monkeypatch):
    attempt = _start(db, setup)
    t0 = engine.AwareUtc(attempt.started_at)
    for number, minute in ((2, 2), (3, 4)):
        _at(monkeypatch, t0 + timedelta(minutes=minute))
        engine.StartAssessmentSectionBriefing(db, setup["student"], attempt.id, number)
        _at(monkeypatch, t0 + timedelta(minutes=minute, seconds=10))
        engine.EndAssessmentSectionBriefing(db, setup["student"], attempt.id, number)
    _at(monkeypatch, t0 + timedelta(minutes=20))
    submitted = engine.SubmitAssessmentAttempt(db, setup["student"], attempt.id)
    assert submitted.time_taken_seconds == 20 * 60 - 20


def test_brief_says_the_timer_pauses(db, setup):
    lines = engine.StudentAssessmentStartPayload(db, setup["student"], setup["assignment"].id)["instructions"]
    assert any("the timer pauses while it is on screen" in line for line in lines)
