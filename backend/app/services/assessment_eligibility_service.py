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
        .order_by(Attempt.started_at.asc(), Attempt.id.asc())
        .all()
    )


class EligibilityPrefetch:
    """Loads everything the readiness payload needs for many students in a
    handful of queries (2026-10-14, Phase 2 speed work).

    Before this, every student cost two level queries plus one attempt query
    per DPS in the level -- about 50 queries a student, so the admin list of
    ~170 students took over 8,000 queries and 20+ seconds. The payload built
    from this is identical to the one built query by query."""

    def __init__(self, db: Session, students: list[Student], level_ids: list[str] | None = None):
        self.db = db
        self._bundles: dict[str, tuple] = {}
        self._users: dict[str, User] = {}
        self._attempts: dict[tuple[str, str], list[Attempt]] = {}

        UserIds = [student.user_id for student in students if student and student.user_id]
        if UserIds:
            for UserRow in db.query(User).filter(User.id.in_(UserIds)).all():
                self._users[UserRow.id] = UserRow

        WantedLevels = {level_id for level_id in (level_ids or []) if level_id}
        for level_id in WantedLevels:
            self.bundle(level_id)

        DpsIds = sorted({dps.id for bundle in self._bundles.values() for dps, _lesson in bundle[3]})
        StudentIds = sorted({student.id for student in students if student})
        if DpsIds and StudentIds:
            AttemptRows = (
                db.query(Attempt)
                .filter(
                    Attempt.student_id.in_(StudentIds),
                    Attempt.dps_id.in_(DpsIds),
                    Attempt.status.in_(COMPLETED_STATUSES),
                )
                .order_by(Attempt.started_at.asc(), Attempt.id.asc())
                .all()
            )
            for AttemptRow in AttemptRows:
                self._attempts.setdefault((AttemptRow.student_id, AttemptRow.dps_id), []).append(AttemptRow)
        self._loaded_dps = set(DpsIds)
        self._loaded_students = set(StudentIds)

    def bundle(self, level_id: str):
        if level_id not in self._bundles:
            self._bundles[level_id] = get_level_bundle(self.db, level_id)
        return self._bundles[level_id]

    def user(self, student: Student) -> User | None:
        if not student or not student.user_id:
            return None
        if student.user_id not in self._users:
            self._users[student.user_id] = self.db.get(User, student.user_id)
        return self._users[student.user_id]

    def attempts(self, student_id: str, dps_id: str) -> list[Attempt]:
        if student_id in self._loaded_students and dps_id in self._loaded_dps:
            return self._attempts.get((student_id, dps_id), [])
        return completed_attempts_for_dps(self.db, student_id, dps_id)


def latest_key(attempt: Attempt):
    return getattr(attempt, "submitted_at", None) or getattr(attempt, "started_at", None)


def dps_eligibility(db: Session, student_id: str, dps: DPS, lesson: Lesson, prefetch: "EligibilityPrefetch | None" = None) -> DpsEligibility:
    attempts = prefetch.attempts(student_id, dps.id) if prefetch else completed_attempts_for_dps(db, student_id, dps.id)

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


def assessment_eligibility_payload(
    db: Session,
    student: Student,
    level_id: str | None = None,
    prefetch: EligibilityPrefetch | None = None,
    compact: bool = False,
) -> dict[str, Any]:
    """`compact` (used by the multi-student lists) leaves out the
    missingDps / belowBenchmarkDps arrays. They repeat sheets already listed
    under `lessons`, no list screen reads them, and they were close to half
    of the list's download. Their counts stay in the payload."""
    target_level_id = level_id or student.current_level_id

    user = prefetch.user(student) if prefetch else student_user(db, student)

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

    level, module, lessons, dps_rows = prefetch.bundle(target_level_id) if prefetch else get_level_bundle(db, target_level_id)

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

    dps_statuses = [dps_eligibility(db, student.id, dps, lesson, prefetch) for dps, lesson in dps_rows]
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
        # 2026-10-07: was "The student must complete all DPS sheets in this
        # level before assessment assignment." Readiness is a guide, not a
        # gate (see app/core/config.py), and this line is also read by the
        # student on their own readiness page.
        message = "Some DPS sheets in this level are not completed yet."
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

    # Whole percent, rounded half up like every other page (was 2 decimals,
    # e.g. "6.67%" here against "7%" on Progress) -- 2026-10-14.
    progress = int((len(passed) / required) * 100 + 0.5) if required else 0

    payload_out = {
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
        "message": message,
    }
    if not compact:
        payload_out["missingDps"] = [dps_payload(item) for item in missing]
        payload_out["belowBenchmarkDps"] = [dps_payload(item) for item in below]
    return payload_out


def eligibility_for_students(db: Session, students: list[Student], level_id: str | None = None) -> list[dict[str, Any]]:
    Targets = [(student, level_id or student.current_level_id) for student in students]
    Targets = [(student, target_level_id) for student, target_level_id in Targets if target_level_id]
    prefetch = EligibilityPrefetch(db, [student for student, _ in Targets], [target_level_id for _, target_level_id in Targets])
    return [assessment_eligibility_payload(db, student, target_level_id, prefetch, compact=True) for student, target_level_id in Targets]
