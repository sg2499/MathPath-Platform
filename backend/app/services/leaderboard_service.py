"""Shared ranking queries for all 4 leaderboard scopes -- DPS Overall
Journey, DPS Specific Level, Mock Overall Journey (cumulative), Mock
Specific Exam.

Extracted from routes_student.py (2026-09-01) so the student leaderboard
endpoints, the new teacher leaderboard endpoints, and the new rank-change
notification hooks (attempt_service.py's
_process_attempt_gamification_side_effects and
competition_mock_attempt_service.py's _ProcessMockCompletionSideEffects)
all compute rank off exactly the same query -- never three copies that can
silently drift apart the way get_cumulative_leaderboard() vs Mock
Performance Insights once did (see that function's own comment history).

Ranking metric, unchanged from the pre-extraction code (see
docs/project-memory/LEADERBOARD_REVAMP_SPEC_2026-08-25.md, "Decisions" item
1): pooled accuracy (sum correct / sum total across every qualifying
attempt in scope) descending, then average time taken ascending as
tiebreaker. Every function here returns the FULL ranked list (no top-N
cap) as plain dicts shaped like the shared LeaderboardEntry schema, with a
1-based "rank" field already attached -- callers layer their own framing on
top: "isCurrent"/"currentStudentRank" for a lone requesting student,
"isOwnStudent" for a teacher's own students, or a single-student before/
after diff for the rank-change notification hooks.

Every function accepts an optional `exclude_attempt_id`. Passing the
just-submitted attempt's own id recomputes the leaderboard as it stood
immediately BEFORE that attempt existed (its contribution is removed from
the pooled sums entirely, exactly as if it had never been submitted) --
this is how the notification hooks detect "did this submission move the
student up, down, or not at all" without any stored rank history existing
anywhere in this schema. Rank has always been computed live on every
request; there is nothing to snapshot, so a before/after diff is done by
running the same live query twice.
"""
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from app.models.models import (
    Student,
    User,
    DPS,
    Lesson,
    Level,
    Attempt,
    CompetitionMockResultSummary,
    CompetitionMockAttempt,
    CompetitionMockExam,
    CompetitionMockAssignment,
    StudentBadge,
    AchievementBadge,
)

# Mirrors achievements.py's own _DPS_COMPLETED_STATUSES and
# routes_student.py's original _DPS_LEADERBOARD_COMPLETED_STATUSES exactly --
# a DPS attempt only counts toward any leaderboard once it has actually been
# submitted (not abandoned mid-attempt). Keep these three definitions in
# sync if that bar ever changes.
DPS_LEADERBOARD_COMPLETED_STATUSES = ("SUBMITTED", "AUTO_SUBMITTED")

_TIER_SCORE = {"LEGENDARY": 3, "SUPER": 2, "BASE": 1}


def _attach_top_badges(db: Session, leaderboard: list[dict], *, dps_scope: bool) -> None:
    """Mutates each entry in `leaderboard` to add a `topBadges` list (top 3,
    LEGENDARY > SUPER > BASE). dps_scope=True includes only dps_* badge
    codes (a DPS-scoped leaderboard); dps_scope=False excludes them (a
    mock-exam-scoped leaderboard) -- see DPS_BADGE_COLOR_AUDIT_2026-08-03.md
    for why the two badge families are never shown side by side."""
    shown_student_ids = [entry["studentId"] for entry in leaderboard]
    if not shown_student_ids:
        return
    badge_query = db.query(AchievementBadge)
    if dps_scope:
        badge_query = badge_query.filter(AchievementBadge.code.like('dps\\_%', escape='\\'))
    else:
        badge_query = badge_query.filter(~AchievementBadge.code.like('dps\\_%', escape='\\'))
    all_badges = badge_query.all()
    badge_lookup = {
        b.id: {"id": b.id, "code": b.code, "name": b.name, "tier": b.tier, "iconName": b.icon_name}
        for b in all_badges
    }
    student_badge_rows = (
        db.query(StudentBadge)
        .filter(StudentBadge.student_id.in_(shown_student_ids))
        .all()
    )
    badges_by_student: dict = {}
    for sb in student_badge_rows:
        if sb.badge_id in badge_lookup:
            badges_by_student.setdefault(sb.student_id, []).append(badge_lookup[sb.badge_id])
    for entry in leaderboard:
        student_badges = badges_by_student.get(entry["studentId"], [])
        student_badges.sort(key=lambda x: _TIER_SCORE.get(x["tier"], 0), reverse=True)
        entry["topBadges"] = student_badges[:3]


def rank_mock_specific_exam(
    db: Session,
    exam_id: str,
    level_id: str,
    *,
    exclude_attempt_id: str | None = None,
    with_badges: bool = True,
) -> list[dict]:
    """Mock 'Specific Exam' leaderboard -- every student whose
    `current_level_id` is `level_id` with a result for `exam_id`. Mirrors
    the original get_mock_exam_leaderboard() query exactly; `level_id` was
    previously always implicitly the requesting student's own
    current_level_id -- it is now an explicit parameter so teachers and the
    notification hooks can pass any level."""
    query = (
        db.query(CompetitionMockResultSummary, Student, User)
        .join(Student, CompetitionMockResultSummary.student_id == Student.id)
        .join(User, Student.user_id == User.id)
        .filter(CompetitionMockResultSummary.mock_exam_id == exam_id)
        .filter(Student.current_level_id == level_id)
    )
    if exclude_attempt_id:
        query = query.filter(CompetitionMockResultSummary.mock_attempt_id != exclude_attempt_id)

    results = query.order_by(
        CompetitionMockResultSummary.percentage.desc(),
        CompetitionMockResultSummary.time_taken_seconds.asc(),
    ).all()

    leaderboard = []
    for idx, (res, st, user) in enumerate(results):
        leaderboard.append({
            "rank": idx + 1,
            "studentId": st.id,
            "name": user.full_name,
            "photoUrl": user.photo_url or st.photo_url,
            "percentage": res.percentage,
            "score": res.percentage,
            "accuracy": res.accuracy_percentage,
            "timeTakenSeconds": int(res.time_taken_seconds or 0),
        })

    if with_badges:
        _attach_top_badges(db, leaderboard, dps_scope=False)
    return leaderboard


def rank_mock_overall_journey(
    db: Session,
    level_id: str,
    *,
    exclude_attempt_id: str | None = None,
    with_badges: bool = True,
) -> list[dict]:
    """Mock 'Overall Journey' (cumulative) leaderboard -- pools every
    active-assignment mock result across every exam within `level_id`.
    Mirrors the original get_cumulative_leaderboard() query exactly,
    including its pooled-accuracy fix (sum(correct)/sum(total) from
    CompetitionMockAttempt, not an AVG() of stored per-attempt percentages)
    and its is_active assignment scoping."""
    total_questions_expr = case(
        (CompetitionMockAttempt.total_questions > 0, CompetitionMockAttempt.total_questions),
        else_=CompetitionMockAttempt.attempted_count + CompetitionMockAttempt.unanswered_count,
    )

    query = (
        db.query(
            Student.id.label("student_id"),
            Student.photo_url.label("student_photo"),
            User.full_name,
            User.photo_url,
            func.sum(CompetitionMockResultSummary.score).label("total_score"),
            func.sum(CompetitionMockResultSummary.max_score).label("total_max_score"),
            func.avg(CompetitionMockResultSummary.time_taken_seconds).label("avg_time_taken_seconds"),
            func.sum(CompetitionMockAttempt.correct_count).label("total_correct"),
            func.sum(total_questions_expr).label("total_questions_all"),
        )
        .join(Student, CompetitionMockResultSummary.student_id == Student.id)
        .join(User, Student.user_id == User.id)
        .join(CompetitionMockExam, CompetitionMockResultSummary.mock_exam_id == CompetitionMockExam.id)
        .join(CompetitionMockAttempt, CompetitionMockResultSummary.mock_attempt_id == CompetitionMockAttempt.id)
        .join(CompetitionMockAssignment, CompetitionMockAttempt.mock_assignment_id == CompetitionMockAssignment.id)
        .filter(CompetitionMockExam.level_id == level_id)
        .filter(CompetitionMockAssignment.is_active == True)  # noqa: E712
    )
    if exclude_attempt_id:
        query = query.filter(CompetitionMockAttempt.id != exclude_attempt_id)

    results = query.group_by(Student.id, Student.photo_url, User.full_name, User.photo_url).all()

    processed = []
    for r in results:
        percentage = (r.total_score / r.total_max_score * 100) if r.total_max_score and r.total_max_score > 0 else 0
        accuracy = (r.total_correct / r.total_questions_all * 100) if r.total_questions_all and r.total_questions_all > 0 else 0
        processed.append({
            "studentId": r.student_id,
            "name": r.full_name,
            "photoUrl": r.photo_url or r.student_photo,
            "percentage": round(percentage),
            "score": round(percentage),
            "accuracy": round(accuracy),
            "timeTakenSeconds": int(r.avg_time_taken_seconds or 0),
        })

    processed.sort(key=lambda x: (-x["percentage"], x["timeTakenSeconds"]))
    for idx, r in enumerate(processed):
        r["rank"] = idx + 1

    if with_badges:
        _attach_top_badges(db, processed, dps_scope=False)
    return processed


def _dps_pooled_query(db: Session, *, exclude_attempt_id: str | None = None):
    # Punctuality % (Shailesh, 2026-09-02): of every completed sheet that
    # actually HAD a schedule to be on time against (punctuality_status
    # ON_TIME or LATE -- NOT_SCHEDULED sheets, one-off assignments and
    # reattempts included, don't count toward this at all, per product
    # decision), what share were finished the same IST day they unlocked.
    # Both counts are computed off the same stored Attempt.punctuality_status
    # set once in attempt_service.py's submit_attempt() -- see that column's
    # comment in models.py -- so this can never drift from the punctuality
    # XP/coin bonus's own idea of "on time".
    punctual_count_expr = func.sum(case((Attempt.punctuality_status == "ON_TIME", 1), else_=0))
    scheduled_count_expr = func.sum(case((Attempt.punctuality_status.in_(["ON_TIME", "LATE"]), 1), else_=0))
    query = (
        db.query(
            Student.id.label("student_id"),
            Student.photo_url.label("student_photo"),
            User.full_name,
            User.photo_url,
            func.avg(Attempt.time_taken_seconds).label("avg_time_taken_seconds"),
            func.sum(Attempt.correct_count).label("total_correct"),
            func.sum(Attempt.total_questions).label("total_questions_all"),
            func.count(Attempt.id).label("sheets_completed"),
            punctual_count_expr.label("punctual_count"),
            scheduled_count_expr.label("scheduled_count"),
        )
        .join(Student, Attempt.student_id == Student.id)
        .join(User, Student.user_id == User.id)
        .join(DPS, Attempt.dps_id == DPS.id)
        .join(Lesson, DPS.lesson_id == Lesson.id)
        .join(Level, Lesson.level_id == Level.id)
        .filter(Attempt.status.in_(DPS_LEADERBOARD_COMPLETED_STATUSES))
        .filter(Attempt.submitted_at.isnot(None))
    )
    if exclude_attempt_id:
        query = query.filter(Attempt.id != exclude_attempt_id)
    return query


def _process_dps_results(db: Session, results, *, with_badges: bool) -> list[dict]:
    processed = []
    for r in results:
        accuracy = (r.total_correct / r.total_questions_all * 100) if r.total_questions_all and r.total_questions_all > 0 else 0
        scheduled_count = int(getattr(r, "scheduled_count", 0) or 0)
        punctual_count = int(getattr(r, "punctual_count", 0) or 0)
        # None (not a 0%) when this student has no scheduled sheets at all in
        # this scope -- "no schedule to be on time against" is a different,
        # honest answer from "always late", and the leaderboard column
        # renders it as a dash rather than a misleading 0%.
        punctuality_percent = round(punctual_count / scheduled_count * 100) if scheduled_count > 0 else None
        processed.append({
            "studentId": r.student_id,
            "name": r.full_name,
            "photoUrl": r.photo_url or r.student_photo,
            "percentage": round(accuracy),
            "score": round(accuracy),
            "accuracy": round(accuracy),
            "timeTakenSeconds": int(r.avg_time_taken_seconds or 0),
            "sheetsCompleted": int(r.sheets_completed or 0),
            "punctualityPercent": punctuality_percent,
        })
    processed.sort(key=lambda x: (-x["percentage"], x["timeTakenSeconds"]))
    for idx, r in enumerate(processed):
        r["rank"] = idx + 1
    if with_badges:
        _attach_top_badges(db, processed, dps_scope=True)
    return processed


def rank_dps_overall_journey(
    db: Session,
    module_id: str,
    *,
    exclude_attempt_id: str | None = None,
    with_badges: bool = True,
) -> list[dict]:
    """DPS 'Overall Journey' leaderboard -- pools every completed DPS
    practice attempt across every level within `module_id`."""
    query = _dps_pooled_query(db, exclude_attempt_id=exclude_attempt_id).filter(Level.module_id == module_id)
    results = query.group_by(Student.id, Student.photo_url, User.full_name, User.photo_url).all()
    return _process_dps_results(db, results, with_badges=with_badges)


def rank_dps_specific_level(
    db: Session,
    level_id: str,
    *,
    exclude_attempt_id: str | None = None,
    with_badges: bool = True,
) -> list[dict]:
    """DPS 'Specific Level' leaderboard -- pools every completed DPS
    practice attempt within a single level (every sheet, every lesson)."""
    query = _dps_pooled_query(db, exclude_attempt_id=exclude_attempt_id).filter(Level.id == level_id)
    results = query.group_by(Student.id, Student.photo_url, User.full_name, User.photo_url).all()
    return _process_dps_results(db, results, with_badges=with_badges)


def find_entry(leaderboard: list[dict], student_id: str) -> dict | None:
    """Returns the ranked entry for `student_id` in an already-computed
    leaderboard list, or None if that student has no qualifying result in
    this scope (e.g. the 'before' leaderboard on a student's very first
    qualifying attempt in this scope)."""
    for entry in leaderboard:
        if entry["studentId"] == student_id:
            return entry
    return None


def wrap_for_student(leaderboard: list[dict], requesting_student_id: str) -> dict:
    """Adds the isCurrent/currentStudentRank/currentStudentEntry framing the
    4 existing student leaderboard endpoints have always returned, without
    mutating the shared list (isCurrent is per-request, not part of the
    cacheable ranking itself)."""
    entries = []
    current_rank = None
    current_entry = None
    for entry in leaderboard:
        row = dict(entry)
        row["isCurrent"] = row["studentId"] == requesting_student_id
        if row["isCurrent"]:
            current_rank = row["rank"]
            current_entry = row
        entries.append(row)
    return {
        "leaderboard": entries,
        "currentStudentRank": current_rank,
        "currentStudentEntry": current_entry,
        "totalParticipants": len(entries),
    }


def wrap_for_teacher(leaderboard: list[dict], own_student_ids: set[str]) -> dict:
    """Same full leaderboard every student sees (per Shailesh's explicit
    call, 2026-09-01), with the requesting teacher's own students flagged
    via isOwnStudent so the frontend can visually highlight them -- this is
    NOT a leaderboard scoped down to only the teacher's own students."""
    entries = []
    for entry in leaderboard:
        row = dict(entry)
        row["isOwnStudent"] = row["studentId"] in own_student_ids
        entries.append(row)
    return {
        "leaderboard": entries,
        "totalParticipants": len(entries),
    }
