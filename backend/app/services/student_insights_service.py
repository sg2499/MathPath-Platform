"""Performance Reports > Student History > Summary (2026-10-21, Part 4).

A student's report at a glance, from the same report payload the rest of
Student History uses (routes_admin._admin_build_student_report), plus a few
reads of their own:

- profile: last active, active days and the practice streak;
- trend: accuracy week by week (practice and assessments);
- concepts: strengths and weak spots by DPS section (what a question
  practised), from the student's answers;
- timeline: levels started, assessments taken, promotions;
- competition: mock and annual competition headlines (their reports stay in
  Competition);
- parentReport: whether a parent report can be generated (a cleared level
  assessment), and for which level -- it is generated in Assessment Control.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from sqlalchemy.orm import Session

from app.models import (
    AttemptAnswer,
    CompetitionEvent,
    CompetitionEventResult,
    CompetitionMockAttempt,
    CompetitionMockExam,
    DPSSection,
    GeneratedQuestion,
)

COMPLETED = {"SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"}
INDIA = ZoneInfo("Asia/Kolkata")
TREND_WEEKS = 12
CONCEPT_MIN_QUESTIONS = 10
STRONG_FROM = 80
TIMELINE_LIMIT = 40


def _Parse(Value: Any) -> datetime | None:
    if not Value:
        return None
    if isinstance(Value, datetime):
        Stamp = Value
    else:
        try:
            Stamp = datetime.fromisoformat(str(Value).replace("Z", "+00:00"))
        except ValueError:
            return None
    return Stamp if Stamp.tzinfo else Stamp.replace(tzinfo=timezone.utc)


def _Done(Row: dict) -> datetime | None:
    if (Row.get("attemptStatus") or "").upper() not in COMPLETED and not Row.get("completedDate"):
        return None
    return _Parse(Row.get("completedDate") or Row.get("submittedAt"))


def _Day(Stamp: datetime) -> date:
    return Stamp.astimezone(INDIA).date()


def Profile(PracticeRows: list[dict], AssessmentRows: list[dict], Now: datetime) -> dict[str, Any]:
    Days = sorted({_Day(Stamp) for Stamp in (_Done(Row) for Row in [*PracticeRows, *AssessmentRows]) if Stamp})
    Today = _Day(Now)
    Streak = 0
    # the streak counts back from today, or from yesterday when today has no practice yet
    Cursor = Today if Today in Days else Today - timedelta(days=1)
    DaySet = set(Days)
    while Cursor in DaySet:
        Streak += 1
        Cursor -= timedelta(days=1)
    Last = max((Stamp for Stamp in (_Done(Row) for Row in [*PracticeRows, *AssessmentRows]) if Stamp), default=None)
    return {
        "lastActive": Last.isoformat() if Last else None,
        "daysSinceActive": (Today - _Day(Last)).days if Last else None,
        "streakDays": Streak,
        "activeDaysLast30": sum(1 for Day in Days if (Today - Day).days < 30),
        "practiceDays": len(Days),
    }


def Trend(PracticeRows: list[dict], AssessmentRows: list[dict], Now: datetime, Weeks: int = TREND_WEEKS) -> list[dict[str, Any]]:
    End = Now
    Buckets = [(End - timedelta(days=7 * (Index + 1)), End - timedelta(days=7 * Index)) for Index in range(Weeks)][::-1]

    def Average(Rows: list[dict], From: datetime, To: datetime) -> tuple[int | None, int]:
        Values = [float(Row.get("accuracyPercentage") or 0) for Row in Rows if (Stamp := _Done(Row)) and From <= Stamp < To]
        return (round(sum(Values) / len(Values)) if Values else None, len(Values))

    Out = []
    for From, To in Buckets:
        Practice, Attempts = Average(PracticeRows, From, To)
        Assessment, Taken = Average(AssessmentRows, From, To)
        Out.append({"from": From.isoformat(), "to": To.isoformat(), "practiceAccuracy": Practice, "attempts": Attempts, "assessmentAccuracy": Assessment, "assessments": Taken})
    return Out


def Concepts(Db: Session, AttemptIds: Iterable[str]) -> dict[str, list[dict[str, Any]]]:
    """Accuracy per DPS section title (e.g. "Squares (Visual)") over every
    answered question of these practice attempts."""
    Ids = [Value for Value in AttemptIds if Value]
    Totals: dict[str, list[int]] = defaultdict(lambda: [0, 0])
    for Chunk in range(0, len(Ids), 900):
        Rows = (
            Db.query(DPSSection.section_title, DPSSection.concept_family, AttemptAnswer.is_correct)
            .join(GeneratedQuestion, GeneratedQuestion.id == AttemptAnswer.question_id)
            .join(DPSSection, DPSSection.id == GeneratedQuestion.dps_section_id)
            .filter(AttemptAnswer.attempt_id.in_(Ids[Chunk:Chunk + 900]))
            .all()
        )
        for Title, Family, Correct in Rows:
            Label = (Title or Family or "").strip()
            if not Label:
                continue
            Totals[Label][0] += 1
            Totals[Label][1] += 1 if Correct else 0
    Items = [
        {"concept": Label, "questions": Asked, "correct": Right, "accuracy": round(100 * Right / Asked)}
        for Label, (Asked, Right) in Totals.items()
        if Asked >= CONCEPT_MIN_QUESTIONS
    ]
    Strong = sorted([Item for Item in Items if Item["accuracy"] >= STRONG_FROM], key=lambda Item: (-Item["accuracy"], -Item["questions"]))[:4]
    Weak = sorted([Item for Item in Items if Item["accuracy"] < 70], key=lambda Item: (Item["accuracy"], -Item["questions"]))[:4]
    return {"strengths": Strong, "weakSpots": Weak, "concepts": sorted(Items, key=lambda Item: Item["accuracy"]), "minQuestions": CONCEPT_MIN_QUESTIONS, "strongFrom": STRONG_FROM}


def Timeline(PracticeRows: list[dict], AssessmentRows: list[dict], PromotionRows: list[dict]) -> list[dict[str, Any]]:
    Events: list[dict[str, Any]] = []
    FirstByLevel: dict[str, tuple[datetime, dict]] = {}
    for Row in PracticeRows:
        Stamp = _Parse(Row.get("startedAt") or Row.get("completedDate"))
        if not Stamp or not Row.get("levelId"):
            continue
        if Row["levelId"] not in FirstByLevel or Stamp < FirstByLevel[Row["levelId"]][0]:
            FirstByLevel[Row["levelId"]] = (Stamp, Row)
    for Stamp, Row in FirstByLevel.values():
        Events.append({"kind": "STARTED", "at": Stamp.isoformat(), "title": f"Started {Row.get('levelCode') or 'a level'}", "detail": Row.get("levelName") or "", "levelCode": Row.get("levelCode"), "tone": "blue"})
    for Row in AssessmentRows:
        Stamp = _Done(Row)
        if not Stamp:
            continue
        Passed = (Row.get("benchmarkStatus") or "").upper() == "PASS" or Row.get("requiresAttention") is False
        Accuracy = Row.get("accuracyPercentage")
        Events.append({
            "kind": "ASSESSMENT",
            "at": Stamp.isoformat(),
            "title": f"{'Cleared' if Passed else 'Took'} the {Row.get('levelCode') or 'level'} assessment",
            "detail": " · ".join(Part for Part in [Row.get("attemptLabel"), f"{round(float(Accuracy))}% accuracy" if Accuracy is not None else None, None if Passed else "below the benchmark"] if Part),
            "levelCode": Row.get("levelCode"),
            "attemptId": Row.get("attemptId"),
            "tone": "green" if Passed else "amber",
        })
    for Row in PromotionRows:
        Stamp = _Parse(Row.get("promotedAt"))
        if not Stamp:
            continue
        Events.append({
            "kind": "PROMOTED",
            "at": Stamp.isoformat(),
            "title": f"Promoted to {Row.get('toLevelCode') or 'the next level'}",
            "detail": f"From {Row.get('fromLevelCode') or '—'}" + (f" · by {Row['promotedByName']}" if Row.get("promotedByName") else ""),
            "levelCode": Row.get("toLevelCode"),
            "tone": "purple",
        })
    Events.sort(key=lambda Item: Item["at"], reverse=True)
    return Events[:TIMELINE_LIMIT]


def Competition(Db: Session, StudentId: str) -> dict[str, Any]:
    Mocks = [Item for Item in Db.query(CompetitionMockAttempt).filter(CompetitionMockAttempt.student_id == StudentId).all() if Item.submitted_at]
    Mocks.sort(key=lambda Item: _Parse(Item.submitted_at) or datetime.min.replace(tzinfo=timezone.utc))
    Latest = Mocks[-1] if Mocks else None
    Best = max(Mocks, key=lambda Item: float(Item.percentage or 0)) if Mocks else None
    LatestExam = Db.get(CompetitionMockExam, Latest.mock_exam_id) if Latest else None
    Results = [Item for Item in Db.query(CompetitionEventResult).filter(CompetitionEventResult.student_id == StudentId, CompetitionEventResult.is_voided == False).all()]
    Official = [Item for Item in Results if (Item.attempt_type or "").upper() == "OFFICIAL"]
    LatestAnnual = max(Results, key=lambda Item: _Parse(Item.computed_at) or datetime.min.replace(tzinfo=timezone.utc)) if Results else None
    Event = Db.get(CompetitionEvent, LatestAnnual.event_id) if LatestAnnual and LatestAnnual.event_id else None
    return {
        "mocksTaken": len(Mocks),
        "mockBest": round(float(Best.percentage or 0)) if Best else None,
        "mockLatest": round(float(Latest.percentage or 0)) if Latest else None,
        "mockLatestTitle": LatestExam.title if LatestExam else None,
        "mockLatestAt": _Parse(Latest.submitted_at).isoformat() if Latest else None,
        "mockLatestAttemptId": Latest.id if Latest else None,
        "annualPapers": len(Results),
        "annualOfficial": len(Official),
        "annualLatest": round(float(LatestAnnual.percentage or 0)) if LatestAnnual else None,
        "annualLatestEvent": Event.name if Event else None,
        "annualLatestAttemptId": LatestAnnual.attempt_id if LatestAnnual else None,
        "annualLatestRank": LatestAnnual.rank if LatestAnnual and LatestAnnual.is_released else None,
        "annualLatestReleased": bool(LatestAnnual.is_released) if LatestAnnual else False,
    }


def ParentReport(AssessmentRows: list[dict]) -> dict[str, Any]:
    """Assessment Control generates a parent report for a cleared level
    assessment; the newest one is offered."""
    Cleared = [Row for Row in AssessmentRows if _Done(Row) and ((Row.get("benchmarkStatus") or "").upper() == "PASS" or Row.get("requiresAttention") is False)]
    if not Cleared:
        return {"available": False, "levelCode": None, "moduleCode": None}
    Latest = max(Cleared, key=lambda Row: _Done(Row))
    return {"available": True, "levelCode": Latest.get("levelCode"), "moduleCode": Latest.get("moduleCode")}


def BuildStudentInsights(Db: Session, Report: dict, Now: datetime | None = None) -> dict[str, Any]:
    Now = Now or datetime.now(timezone.utc)
    Practice = Report.get("dpsAttempts") or []
    Assessments = Report.get("assessmentHistory") or []
    Promotions = Report.get("promotionHistory") or []
    StudentId = (Report.get("student") or {}).get("studentId")
    Completed = [Row["attemptId"] for Row in Practice if _Done(Row) and Row.get("attemptId")]
    return {
        "profile": Profile(Practice, Assessments, Now),
        "trend": Trend(Practice, Assessments, Now),
        "concepts": Concepts(Db, Completed),
        "timeline": Timeline(Practice, Assessments, Promotions),
        "competition": Competition(Db, StudentId) if StudentId else None,
        "parentReport": ParentReport(Assessments),
    }
