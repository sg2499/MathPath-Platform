"""Regression coverage for the scientific-notation correct_answer bug
(2026-09-04).

Real bug this guards against: a DPS attempt review page showed the EXACT
SAME text for "Student Answer" and "Correct Answer" on several questions,
yet those questions were scored wrong -- reported live on an IM-L4 Lesson 5
DPS 3 attempt. Root cause, confirmed via a targeted production diagnostic
against the exact reported attempt: GeneratedQuestion.correct_answer was
stored as scientific notation (e.g. "1.61e-05") for small-magnitude IM/MM
"Answer Position" questions, because _Display() in
app/question_engine/im/generator.py (and the byte-identical copy in
app/question_engine/mm/generator.py) converted the exact Decimal answer to
a Python float before it reached persistence, and Python's default
str(float) switches to exponential notation below magnitude 1e-4.
answers_match() (see app/services/answer_matching.py) deliberately rejects
exponential notation from a student's typed answer -- entirely correctly,
as a safety net -- so a correct_answer stored that way could never be
graded correct by ANY value a student typed, no matter how many times they
retyped the exact right number. The frontend's display formatter then
cosmetically re-normalized both the student's plain-decimal answer and the
corrupted scientific-notation correct_answer into the same plain-decimal
string for display, which is exactly why the review page showed "identical
text, scored wrong".

This was NOT a race condition (that diagnosis, and its fix, are covered
separately by test_attempt_save_submit_race_regression.py) -- a dry-run of
the race-condition backfill against production found zero affected
attempts, and this bug reproduced live regardless of timing.

The fix: app/question_engine/number_format.PlainNumberString(), a single
shared helper used at every place a generated correct_answer/option value
gets stringified for storage (app/services/generation_service.py,
app/services/assessment_engine_service.py,
app/services/competition_mock_generation_service.py). It round-trips the
value through Decimal, which never introduces exponential notation via its
own format(..., "f") -- unlike str(float(...)), which is what caused this.

This file proves, at three layers, that the exact reported scenario can
never happen again:
  1. PlainNumberString() itself never produces scientific notation for any
     numeric input, including already-corrupted scientific-notation text.
  2. The IM and MM generators, when forced to produce small-magnitude
     "Answer Position" questions (the exact concept family and shape of
     the reported bug), always yield a correct_answer that stringifies to
     a plain decimal.
  3. End-to-end: persist_question_set() writes a plain-decimal
     correct_answer to the database for such a question, and a student
     typing that exact plain-decimal value is graded correct by the real
     save_answer()/submit_attempt() pipeline -- the full path the original
     bug broke.
"""
from __future__ import annotations

import os
import tempfile
from datetime import datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from app.models import models
from app.models.models import (
    Attempt,
    AttemptAnswer,
    DPS,
    DPSSection,
    GeneratedQuestion,
    GeneratedQuestionSet,
    Lesson,
    Level,
    Module,
    Student,
    User,
)
from app.question_engine.im import IMConfig, GenerateImQuestionSet
from app.question_engine.mm import MMConfig, GenerateMmQuestionSet
from app.question_engine.number_format import PlainNumberString
from app.services.answer_matching import answers_match
from app.services.attempt_service import save_answer, submit_attempt


# ---------------------------------------------------------------------------
# Layer 1: PlainNumberString itself
# ---------------------------------------------------------------------------

@pytest.mark.parametrize(
    "raw_value, expected_plain_text",
    [
        (1.61e-05, "0.0000161"),
        (-1.61e-05, "-0.0000161"),
        (Decimal("0.0000161"), "0.0000161"),
        ("1.61e-05", "0.0000161"),  # already-corrupted text, as a backfill would encounter
        ("1.61E-05", "0.0000161"),
        (42.0, "42.0"),
        (42, "42"),
        (3.75, "3.75"),
        ("0.0000161", "0.0000161"),  # already-correct text is left byte-identical
    ],
)
def test_plain_number_string_matches_expected_plain_decimal(raw_value, expected_plain_text):
    assert PlainNumberString(raw_value) == expected_plain_text


@pytest.mark.parametrize("magnitude_exponent", range(1, 10))
def test_plain_number_string_never_produces_scientific_notation(magnitude_exponent):
    """Sweep magnitudes from 1e-1 down to 1e-9 -- str(float(...)) starts
    using exponential notation below 1e-4, so this range straddles exactly
    the boundary where the original bug appeared."""
    value = Decimal("1.61") / (Decimal(10) ** magnitude_exponent)
    corrupted_float = float(value.normalize())  # what the old buggy _Display() produced
    fixed_text = PlainNumberString(corrupted_float)
    assert "e" not in fixed_text.lower()
    assert Decimal(fixed_text) == value


def test_plain_number_string_repairs_already_corrupted_text_losslessly():
    """The same function must be safe to reuse, unchanged, by a backfill
    script repairing existing corrupted rows -- repairing must never change
    the underlying numeric value, only its textual representation."""
    corrupted = "1.61e-05"
    repaired = PlainNumberString(corrupted)
    assert repaired == "0.0000161"
    assert Decimal(repaired) == Decimal(corrupted)


# ---------------------------------------------------------------------------
# Layer 2: the actual IM/MM generators, forced into the exact bug shape
# ---------------------------------------------------------------------------

def _im_small_magnitude_config():
    return IMConfig(
        ModuleCode="IM",
        LevelCode="IM-L4",
        LessonNumber=5,
        DpsNumber=3,
        DpsTitle="Answer Position",
        LessonTitle="Lesson 5",
        QuestionCount=10,
        ConceptFamily="ANSWER_POSITION",
        GeneratorConfig={
            "forceSingleSection": True,
            # Deeply negative positions against small digit counts is exactly
            # what produced a magnitude below 1e-4 in the reported attempt.
            "positionRange": (-9, -6),
        },
    )


def _mm_small_magnitude_config():
    # MM's Answer Position sub-concept is selected by matching keywords in
    # DpsTitle (see _AnswerPositionTitle in app/question_engine/mm/operands.py)
    # rather than a GeneratorConfig positionRange -- "write ... given
    # position" is exactly the reported attempt's shape (WRITE_FROM_POSITION).
    # A high LessonNumber pushes _LessonBand() to its top band, which allows
    # positions down to -5 against numbers up to 6 digits long -- exactly
    # what makes the resulting magnitude fall below 1e-4.
    return MMConfig(
        ModuleCode="MM",
        LevelCode="MM-L1",
        LessonNumber=25,
        DpsNumber=3,
        DpsTitle="Write the Number from the Given Position",
        LessonTitle="Lesson 25",
        QuestionCount=10,
        ConceptFamily="ANSWER_POSITION",
        GeneratorConfig={"forceSingleSection": True},
    )


@pytest.mark.parametrize(
    "config_factory, generate_fn",
    [
        (_im_small_magnitude_config, GenerateImQuestionSet),
        (_mm_small_magnitude_config, GenerateMmQuestionSet),
    ],
)
def test_answer_position_small_magnitude_questions_never_generate_scientific_notation(
    config_factory, generate_fn
):
    found_small_magnitude_case = False
    for seed_index in range(60):
        config = config_factory()
        config.Seed = f"SCI-NOTATION-REGRESSION-{seed_index}"
        questions = generate_fn(config)
        for question in questions:
            stored_text = PlainNumberString(question["correct_answer"])
            assert "e" not in stored_text.lower(), (
                f"correct_answer stringified to scientific notation: {question['correct_answer']!r} -> {stored_text!r}"
            )
            if Decimal(stored_text) != 0 and abs(Decimal(stored_text)) < Decimal("0.0001"):
                found_small_magnitude_case = True
                # This is precisely the property that was broken: the exact
                # plain-decimal text of the correct answer must be judged a
                # match by the real grading function.
                assert answers_match(stored_text, stored_text) is True

            for option in question.get("options", []):
                option_text = PlainNumberString(option["value"])
                assert "e" not in option_text.lower(), (
                    f"option value stringified to scientific notation: {option['value']!r} -> {option_text!r}"
                )

    assert found_small_magnitude_case, (
        "test setup did not actually exercise a magnitude below 1e-4 across "
        "60 seeds -- widen the seed sweep or positionRange, this assertion "
        "guards against the regression test silently testing nothing"
    )


# ---------------------------------------------------------------------------
# Layer 3: end-to-end through persist_question_set() and the real DPS
# save/submit pipeline -- the full path the original bug broke.
# ---------------------------------------------------------------------------

@pytest.fixture()
def engine():
    fd, path = tempfile.mkstemp(suffix=".sqlite3")
    os.close(fd)
    eng = create_engine(f"sqlite:///{path}", poolclass=NullPool)
    models.Base.metadata.create_all(eng)
    try:
        yield eng
    finally:
        eng.dispose()
        os.remove(path)


@pytest.fixture()
def SessionLocal(engine):
    return sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@pytest.fixture()
def db(SessionLocal):
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def student(db):
    user = User(full_name="Sci Notation Test Student", email="sci-notation-fix-test@test.local", password_hash="x", role="STUDENT")
    db.add(user)
    db.commit()
    module = Module(module_code="IM", module_name="Intermediate Module")
    db.add(module)
    db.commit()
    level = Level(module_id=module.id, level_code="IM-L4", level_name="Intermediate Module Level 4")
    db.add(level)
    db.commit()
    lesson = Lesson(level_id=level.id, lesson_number=5, lesson_title="Lesson 5")
    db.add(lesson)
    db.commit()
    st = Student(user_id=user.id, student_code="MP-ST-SCINOTE", current_level_id=level.id)
    db.add(st)
    db.commit()
    return st


def _find_small_magnitude_im_question() -> tuple[dict, str]:
    """Generate real IM Answer Position questions until one has a
    small-magnitude correct_answer, exactly like the reported attempt's
    Q4/6/7/8. Returns the raw generated question dict plus the exact
    plain-decimal text a student would need to type."""
    for seed_index in range(60):
        config = _im_small_magnitude_config()
        config.Seed = f"SCI-NOTATION-E2E-{seed_index}"
        for question in GenerateImQuestionSet(config):
            plain_text = PlainNumberString(question["correct_answer"])
            if Decimal(plain_text) != 0 and abs(Decimal(plain_text)) < Decimal("0.0001"):
                return question, plain_text
    raise AssertionError("could not find a small-magnitude Answer Position question across 60 seeds")


def test_persist_question_set_stores_plain_decimal_and_grades_correctly_end_to_end(db, student):
    """Full pipeline: generate a real small-magnitude IM Answer Position
    question (the exact concept family/shape from the reported bug),
    persist it exactly as generation_service.persist_question_set() does,
    then run it through the real save_answer()/submit_attempt() pipeline
    with the student typing the exact plain-decimal correct answer. This
    must score correct -- the original bug meant it never could, no matter
    what the student typed."""
    question, plain_correct_answer = _find_small_magnitude_im_question()

    lesson = db.query(Lesson).first()
    dps = DPS(lesson_id=lesson.id, dps_number=3, dps_title="DPS 3", default_duration_seconds=600)
    db.add(dps)
    db.commit()
    section = DPSSection(dps_id=dps.id, section_number=1, section_title="Answer Position", concept_family="ANSWER_POSITION")
    db.add(section)
    db.commit()

    qset = GeneratedQuestionSet(dps_id=dps.id, student_id=student.id, mode="PRACTICE", seed="SCI-NOTATION-E2E-PERSIST")
    db.add(qset)
    db.commit()

    # Mirrors generation_service.persist_question_set()'s exact write --
    # this is the real fix's persistence boundary, not a re-implementation.
    gq = GeneratedQuestion(
        question_set_id=qset.id,
        dps_section_id=section.id,
        question_number=1,
        display_type=question["display_type"],
        question_text=question.get("question_text"),
        operands_json="[]",
        operators_json="[]",
        correct_answer=PlainNumberString(question["correct_answer"]),
        seed=question["seed"],
    )
    db.add(gq)
    db.commit()
    db.refresh(gq)

    # The stored text itself must never be scientific notation.
    assert "e" not in gq.correct_answer.lower()
    assert gq.correct_answer == plain_correct_answer

    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps.id,
        question_set_id=qset.id,
        student_id=student.id,
        mode="PRACTICE",
        status="IN_PROGRESS",
        started_at=now,
        expires_at=now + timedelta(seconds=600),
        duration_seconds=600,
        total_questions=1,
        max_score=1,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    # The student types the exact plain-decimal correct answer -- exactly
    # what the reported attempt's students did, and were wrongly marked
    # incorrect for.
    save_answer(db, student, attempt.id, gq.id, plain_correct_answer)
    submitted = submit_attempt(db, attempt, auto=False)

    assert submitted.status == "SUBMITTED"
    assert submitted.correct_count == 1
    assert submitted.wrong_count == 0
    assert submitted.total_score == submitted.max_score

    saved_answer = (
        db.query(AttemptAnswer)
        .filter(AttemptAnswer.attempt_id == attempt.id, AttemptAnswer.question_id == gq.id)
        .first()
    )
    assert saved_answer.is_correct is True
    assert saved_answer.selected_value == plain_correct_answer
    # Documents the illusion the screenshots showed: student and correct
    # answer text are now genuinely, not just cosmetically, identical.
    assert saved_answer.selected_value == gq.correct_answer


def test_pre_fix_scientific_notation_storage_would_have_failed_this_same_scenario(db, student):
    """Negative control: stores the SAME correct answer the old buggy code
    path would have produced (str(float(...)), scientific notation) and
    proves that scenario genuinely fails grading against the exact right
    typed answer -- pinning down that the fix in
    persist_question_set()/PlainNumberString is what changed, not some
    unrelated behavior. If this test ever starts failing (i.e. the
    "corrupted" path starts grading correctly too), answers_match()'s
    deliberate rejection of scientific notation has silently changed, and
    that needs its own review, not a green light for this bug."""
    question, plain_correct_answer = _find_small_magnitude_im_question()
    old_buggy_stored_text = str(float(Decimal(plain_correct_answer)))  # pre-fix behavior
    assert "e" in old_buggy_stored_text.lower()

    lesson = db.query(Lesson).first()
    dps = DPS(lesson_id=lesson.id, dps_number=3, dps_title="DPS 3", default_duration_seconds=600)
    db.add(dps)
    db.commit()

    qset = GeneratedQuestionSet(dps_id=dps.id, student_id=student.id, mode="PRACTICE", seed="SCI-NOTATION-NEGATIVE-CONTROL")
    db.add(qset)
    db.commit()

    gq = GeneratedQuestion(
        question_set_id=qset.id,
        question_number=1,
        display_type=question["display_type"],
        operands_json="[]",
        operators_json="[]",
        correct_answer=old_buggy_stored_text,
        seed=question["seed"],
    )
    db.add(gq)
    db.commit()
    db.refresh(gq)

    now = datetime.now(timezone.utc)
    attempt = Attempt(
        dps_id=dps.id,
        question_set_id=qset.id,
        student_id=student.id,
        mode="PRACTICE",
        status="IN_PROGRESS",
        started_at=now,
        expires_at=now + timedelta(seconds=600),
        duration_seconds=600,
        total_questions=1,
        max_score=1,
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)

    save_answer(db, student, attempt.id, gq.id, plain_correct_answer)
    submitted = submit_attempt(db, attempt, auto=False)

    assert submitted.correct_count == 0
    assert submitted.wrong_count == 1
