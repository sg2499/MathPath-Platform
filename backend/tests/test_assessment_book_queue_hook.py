"""Billing Release 2 (2026-11-27): a cleared level assessment hands the
student to the book queue (UAT 4); a failed one does not, and a billing
error never stops the result."""
from __future__ import annotations

import pytest

from app.services.assessment_engine_service import SaveAssessmentAnswer, StartAssessmentAttempt, SubmitAssessmentAttempt
from app.services.payments import book_invoices
from tests.test_assessment_typed_answers import _questions, db, setup  # noqa: F401 -- pytest fixtures


def _sit(db, setup, correct: bool):  # noqa: F811
    student = setup["student"]
    attempt = StartAssessmentAttempt(db, student, setup["assignment"].id)
    for question in _questions(db, setup["version"]):
        SaveAssessmentAnswer(db, student, attempt.id, question.id, AnswerText=str(question.correct_answer) if correct else "999999")
    SubmitAssessmentAttempt(db, student, attempt.id)
    db.refresh(attempt)
    return attempt


def test_a_cleared_assessment_goes_to_the_book_queue(db, setup, monkeypatch):  # noqa: F811
    calls = []
    monkeypatch.setattr(book_invoices, "_Queue", lambda Db, Attempt, Assignment: calls.append((Attempt.id, Assignment.id)))
    attempt = _sit(db, setup, correct=True)
    assert attempt.status == "CLEARED"
    assert calls == [(attempt.id, setup["assignment"].id)]


def test_a_failed_assessment_does_not(db, setup, monkeypatch):  # noqa: F811
    calls = []
    monkeypatch.setattr(book_invoices, "_Queue", lambda *args: calls.append(args))
    attempt = _sit(db, setup, correct=False)
    assert attempt.status == "NEEDS_RE_ATTEMPT"
    assert calls == []


def test_a_billing_error_never_stops_the_result(db, setup, monkeypatch):  # noqa: F811
    def boom(*args):
        raise RuntimeError("billing is down")

    monkeypatch.setattr(book_invoices, "_Queue", boom)
    attempt = _sit(db, setup, correct=True)
    assert attempt.status == "CLEARED" and attempt.result_status == "CLEARED"
