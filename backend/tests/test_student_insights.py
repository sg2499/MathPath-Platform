"""Performance Reports > Student History > Summary (2026-10-21, Part 4)."""

from datetime import timedelta

from app.api import routes_admin as admin
from app.models import AttemptAnswer, CompetitionMockAttempt, DPSSection, GeneratedQuestion, GeneratedQuestionSet, StudentLevelPromotion
from app.services import student_insights_service as insights
from test_dps_chain_state import T0, _chain, db, world  # noqa: F401  (fixtures)


def _row(days, accuracy=80, level="IM-L1", **extra):
    stamp = (T0 + timedelta(days=days)).isoformat()
    return {"attemptStatus": "SUBMITTED", "completedDate": stamp, "startedAt": stamp, "accuracyPercentage": accuracy, "levelId": "l", "levelCode": level, "levelName": "IM L1", **extra}


def test_profile_counts_the_streak_back_from_today_or_yesterday():
    now = T0 + timedelta(days=10, hours=2)
    rows = [_row(7), _row(8), _row(9), _row(3)]  # 3 days running up to yesterday
    profile = insights.Profile(rows, [], now)
    assert profile["streakDays"] == 3 and profile["practiceDays"] == 4 and profile["daysSinceActive"] == 1
    assert insights.Profile(rows + [_row(10)], [], now)["streakDays"] == 4
    assert insights.Profile([_row(1)], [], now)["streakDays"] == 0
    assert insights.Profile([], [], now)["lastActive"] is None


def test_trend_is_weekly_and_keeps_practice_and_assessments_apart():
    now = T0 + timedelta(days=14)
    weeks = insights.Trend([_row(13, 60), _row(12, 80), _row(2, 50)], [_row(12, 90)], now, Weeks=3)
    assert [(week["practiceAccuracy"], week["attempts"]) for week in weeks] == [(None, 0), (50, 1), (70, 2)]
    assert weeks[-1]["assessmentAccuracy"] == 90


def test_timeline_and_the_parent_report():
    practice = [_row(1), _row(3)]
    failed = _row(4, 50, benchmarkStatus="BELOW_BENCHMARK", requiresAttention=True, attemptLabel="Original", attemptId="x1")
    passed = _row(6, 85, benchmarkStatus="PASS", requiresAttention=False, attemptLabel="Re-Attempt 1", attemptId="x2", moduleCode="IM")
    promoted = {"promotedAt": (T0 + timedelta(days=7)).isoformat(), "fromLevelCode": "IM-L1", "toLevelCode": "IM-L2", "promotedByName": "Admin"}
    events = insights.Timeline(practice, [failed, passed], [promoted])
    assert [event["kind"] for event in events] == ["PROMOTED", "ASSESSMENT", "ASSESSMENT", "STARTED"]
    assert events[0]["title"] == "Promoted to IM-L2" and events[1]["title"] == "Cleared the IM-L1 assessment"
    assert "below the benchmark" in events[2]["detail"]
    assert insights.ParentReport([failed]) == {"available": False, "levelCode": None, "moduleCode": None}
    assert insights.ParentReport([failed, passed]) == {"available": True, "levelCode": "IM-L1", "moduleCode": "IM"}


def test_concepts_from_the_students_answers(db, world):
    _chain(db, "s1", "d1", [40, 90])
    db.add(DPSSection(id="sec-a", dps_id="d1", section_number=1, section_title="Squares (Visual)", concept_family="SQUARES"))
    db.add(DPSSection(id="sec-b", dps_id="d1", section_number=2, section_title="BODMAS (Visual)", concept_family="BODMAS"))
    db.add(GeneratedQuestionSet(id="qs", dps_id="d1", student_id="s1", mode="PRACTICE", seed="x"))
    db.flush()
    attempt_ids = [row.id for row in db.query(admin.Attempt).filter(admin.Attempt.student_id == "s1").all()]
    for index in range(24):
        section = "sec-a" if index < 12 else "sec-b"
        db.add(GeneratedQuestion(id=f"q{index}", question_set_id="qs", dps_section_id=section, question_number=index + 1, correct_answer="1", seed="x"))
        db.flush()
        # Squares: 11 of 12 right; BODMAS: 3 of 12 right
        right = index < 11 or 12 <= index < 15
        db.add(AttemptAnswer(id=f"aa{index}", attempt_id=attempt_ids[index % len(attempt_ids)], question_id=f"q{index}", is_correct=right))
    db.commit()
    result = insights.Concepts(db, attempt_ids)
    assert result["strengths"] == [{"concept": "Squares (Visual)", "questions": 12, "correct": 11, "accuracy": 92}]
    assert result["weakSpots"] == [{"concept": "BODMAS (Visual)", "questions": 12, "correct": 3, "accuracy": 25}]


def test_the_endpoint_brings_it_together(db, world):
    _chain(db, "s1", "d1", [40, 90])
    db.add(StudentLevelPromotion(id="p1", student_id="s1", from_module_id="m", from_level_id="l", to_module_id="m", to_level_id="l", assessment_assignment_id="x", status="PROMOTED", promoted_at=T0 + timedelta(days=2)))
    db.add(CompetitionMockAttempt(id="mk1", mock_assignment_id="ma", mock_exam_id="me", student_id="s1", attempt_number=1, status="SUBMITTED", started_at=T0, expires_at=T0 + timedelta(hours=1), submitted_at=T0 + timedelta(minutes=30), duration_seconds=1800, percentage=72.4))
    db.commit()
    data = admin.student_results_insights("s1", "m", db, None)
    assert data["student"]["currentLevelCode"] == "IM-L1" and data["student"]["currentModuleCode"] == "IM"
    assert data["timeline"][0]["kind"] == "PROMOTED"
    assert data["competition"]["mocksTaken"] == 1 and data["competition"]["mockBest"] == 72
    assert data["parentReport"]["available"] is False
    assert len(data["trend"]) == insights.TREND_WEEKS
