from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.models import Attempt, DPS, Lesson, Level, Module, Student, User

BENCHMARK_PERCENTAGE = 70.0
COMPLETED_STATUSES = ["SUBMITTED", "AUTO_SUBMITTED", "COMPLETED"]


@dataclass
class DpsEligibility:
    dps: DPS
    lesson: Lesson
    best_attempt: Attempt | None
    latest_attempt: Attempt | None
    best_accuracy: float | None
    latest_accuracy: float | None
    status: str


def _iso(value):
    if not value:
        return None
    return value.isoformat() if hasattr(value, "isoformat") else str(value)


def student_user(db: Session, student: Student) -> User | None:
    return db.get(User, student.user_id) if student and student.user_id else None


def get_level_bundle(db: Session, level_id: str):
    level = db.get(Level, level_id)
    if not level:
        return None, None, [], []

    module = db.get(Module, level.module_id) if level.module_id else None

    lessons = (
        db.query(Lesson)
        .filter(Lesson.level_id == level.id, Lesson.is_active == True)
        .order_by(Lesson.display_order.asc(), Lesson.lesson_number.asc())
        .all()
    )

    dps_items = (
        db.query(DPS, Lesson)
        .join(Lesson, DPS.lesson_id == Lesson.id)
        .filter(Lesson.level_id == level.id, Lesson.is_active == True, DPS.is_active == True)
        .order_by(Lesson.display_order.asc(), Lesson.lesson_number.asc(), DPS.dps_number.asc())
        .all()
    )

    return level, module, lessons, dps_items


def completed_attempts_for_dps(db: Session, student_id: str, dps_id: str) -> list[Attempt]:
    return (
        db.query(Attempt)
        .filter(
            Attempt.student_id == student_id,
            Attempt.dps_id == dps_id,
            Attempt.status.in_(COMPLETED_STATUSES),
        )
        .all()
    )


def latest_key(attempt: Attempt):
    return getattr(attempt, "submitted_at", None) or getattr(attempt, "started_at", None)


def dps_eligibility(db: Session, student_id: str, dps: DPS, lesson: Lesson) -> DpsEligibility:
    attempts = completed_attempts_for_dps(db, student_id, dps.id)

    if not attempts:
        return DpsEligibility(
            dps=dps,
            lesson=lesson,
            best_attempt=None,
            latest_attempt=None,
            best_accuracy=None,
            latest_accuracy=None,
            status="NOT_STARTED",
        )

    best_attempt = max(attempts, key=lambda attempt: float(attempt.accuracy_percentage or 0))
    latest_attempt = max(attempts, key=lambda attempt: latest_key(attempt) or "")

    best_accuracy = float(best_attempt.accuracy_percentage or 0)
    latest_accuracy = float(latest_attempt.accuracy_percentage or 0)
    status = "PASSED" if best_accuracy >= BENCHMARK_PERCENTAGE else "BELOW_BENCHMARK"

    return DpsEligibility(
        dps=dps,
        lesson=lesson,
        best_attempt=best_attempt,
        latest_attempt=latest_attempt,
        best_accuracy=best_accuracy,
        latest_accuracy=latest_accuracy,
        status=status,
    )


def dps_payload(item: DpsEligibility) -> dict[str, Any]:
    best = item.best_attempt
    latest = item.latest_attempt
    return {
        "dpsId": item.dps.id,
        "dpsNumber": item.dps.dps_number,
        "dpsTitle": item.dps.dps_title,
        "lessonId": item.lesson.id,
        "lessonNumber": item.lesson.lesson_number,
        "lessonTitle": item.lesson.lesson_title,
        "status": item.status,
        "isCompleted": item.status in ["PASSED", "BELOW_BENCHMARK"],
        "isPassed": item.status == "PASSED",
        "benchmarkPercentage": BENCHMARK_PERCENTAGE,
        "bestAccuracy": item.best_accuracy,
        "latestAccuracy": item.latest_accuracy,
        "bestAttemptId": best.id if best else None,
        "latestAttemptId": latest.id if latest else None,
        "latestStatus": latest.status if latest else None,
        "latestSubmittedAt": _iso(getattr(latest, "submitted_at", None)) if latest else None,
        "latestStartedAt": _iso(getattr(latest, "started_at", None)) if latest else None,
        "latestScore": float(latest.total_score or 0) if latest else None,
        "latestMaxScore": float(latest.max_score or 0) if latest else None,
    }


def assessment_eligibility_payload(db: Session, student: Student, level_id: str | None = None) -> dict[str, Any]:
    target_level_id = level_id or student.current_level_id

    user = student_user(db, student)

    if not target_level_id:
        return {
            "studentId": student.id,
            "studentName": user.full_name if user else "",
            "studentCode": student.student_code,
            "className": student.class_name,
            "section": student.section,
            "levelId": None,
            "levelCode": None,
            "levelName": None,
            "moduleId": None,
            "moduleCode": None,
            "moduleName": None,
            "benchmarkPercentage": BENCHMARK_PERCENTAGE,
            "eligible": False,
            "status": "NO_LEVEL",
            "statusLabel": "No level assigned",
            "requiredDpsCount": 0,
            "completedDpsCount": 0,
            "passedDpsCount": 0,
            "missingDpsCount": 0,
            "belowBenchmarkDpsCount": 0,
            "progressPercentage": 0,
            "lessons": [],
            "missingDps": [],
            "belowBenchmarkDps": [],
            "message": "No level is currently assigned to this student.",
        }

    level, module, lessons, dps_rows = get_level_bundle(db, target_level_id)

    if not level:
        return {
            "studentId": student.id,
            "studentName": user.full_name if user else "",
            "studentCode": student.student_code,
            "className": student.class_name,
            "section": student.section,
            "levelId": target_level_id,
            "levelCode": None,
            "levelName": None,
            "moduleId": None,
            "moduleCode": None,
            "moduleName": None,
            "benchmarkPercentage": BENCHMARK_PERCENTAGE,
            "eligible": False,
            "status": "LEVEL_NOT_FOUND",
            "statusLabel": "Level not found",
            "requiredDpsCount": 0,
            "completedDpsCount": 0,
            "passedDpsCount": 0,
            "missingDpsCount": 0,
            "belowBenchmarkDpsCount": 0,
            "progressPercentage": 0,
            "lessons": [],
            "missingDps": [],
            "belowBenchmarkDps": [],
            "message": "The selected level could not be found.",
        }

    dps_statuses = [dps_eligibility(db, student.id, dps, lesson) for dps, lesson in dps_rows]
    required = len(dps_statuses)
    passed = [item for item in dps_statuses if item.status == "PASSED"]
    missing = [item for item in dps_statuses if item.status == "NOT_STARTED"]
    below = [item for item in dps_statuses if item.status == "BELOW_BENCHMARK"]
    completed = [item for item in dps_statuses if item.status in ["PASSED", "BELOW_BENCHMARK"]]

    eligible = required > 0 and len(missing) == 0 and len(below) == 0
    if eligible:
        status = "ASSESSMENT_READY"
        status_label = "Assessment Ready"
        message = "All required DPS sheets are complete and passed. This student is ready for the level assessment."
    elif required == 0:
        status = "NO_DPS_IN_LEVEL"
        status_label = "No DPS configured"
        message = "This level has no active DPS sheets configured yet."
    elif missing:
        status = "PRACTICE_INCOMPLETE"
        status_label = "Practice Incomplete"
        message = "The student must complete all DPS sheets in this level before assessment assignment."
    else:
        status = "NEEDS_DPS_REATTEMPT"
        status_label = "Needs DPS Re-Attempt"
        message = "The student has completed all DPS sheets, but one or more sheets are below the 70% benchmark."

    lesson_map: dict[str, dict[str, Any]] = {}
    for lesson in lessons:
        lesson_map[lesson.id] = {
            "lessonId": lesson.id,
            "lessonNumber": lesson.lesson_number,
            "lessonTitle": lesson.lesson_title,
            "requiredDpsCount": 0,
            "completedDpsCount": 0,
            "passedDpsCount": 0,
            "missingDpsCount": 0,
            "belowBenchmarkDpsCount": 0,
            "dps": [],
        }

    for item in dps_statuses:
        payload = dps_payload(item)
        lesson_payload = lesson_map.setdefault(
            item.lesson.id,
            {
                "lessonId": item.lesson.id,
                "lessonNumber": item.lesson.lesson_number,
                "lessonTitle": item.lesson.lesson_title,
                "requiredDpsCount": 0,
                "completedDpsCount": 0,
                "passedDpsCount": 0,
                "missingDpsCount": 0,
                "belowBenchmarkDpsCount": 0,
                "dps": [],
            },
        )
        lesson_payload["requiredDpsCount"] += 1
        lesson_payload["completedDpsCount"] += 1 if payload["isCompleted"] else 0
        lesson_payload["passedDpsCount"] += 1 if payload["isPassed"] else 0
        lesson_payload["missingDpsCount"] += 1 if payload["status"] == "NOT_STARTED" else 0
        lesson_payload["belowBenchmarkDpsCount"] += 1 if payload["status"] == "BELOW_BENCHMARK" else 0
        lesson_payload["dps"].append(payload)

    progress = round((len(passed) / required) * 100, 2) if required else 0

    return {
        "studentId": student.id,
        "studentName": user.full_name if user else "",
        "studentCode": student.student_code,
        "className": student.class_name,
        "section": student.section,
        "levelId": level.id,
        "levelCode": level.level_code,
        "levelName": level.level_name,
        "moduleId": module.id if module else None,
        "moduleCode": module.module_code if module else None,
        "moduleName": module.module_name if module else None,
        "benchmarkPercentage": BENCHMARK_PERCENTAGE,
        "eligible": eligible,
        "status": status,
        "statusLabel": status_label,
        "requiredDpsCount": required,
        "completedDpsCount": len(completed),
        "passedDpsCount": len(passed),
        "missingDpsCount": len(missing),
        "belowBenchmarkDpsCount": len(below),
        "progressPercentage": progress,
        "lessons": list(lesson_map.values()),
        "missingDps": [dps_payload(item) for item in missing],
        "belowBenchmarkDps": [dps_payload(item) for item in below],
        "message": message,
    }


def eligibility_for_students(db: Session, students: list[Student], level_id: str | None = None) -> list[dict[str, Any]]:
    payloads = []
    for student in students:
        target_level_id = level_id or student.current_level_id
        if target_level_id:
            payloads.append(assessment_eligibility_payload(db, student, target_level_id))
    return payloads
