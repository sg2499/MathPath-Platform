"""Orchestrates the leaderboard rank-change / podium-placement notifications
(2026-09-01 feature). Wired into the two existing gamification hooks:

  - attempt_service.py's _process_attempt_gamification_side_effects() calls
    NotifyDpsLeaderboardRankChange(db, attempt) for a just-submitted DPS
    practice attempt.
  - competition_mock_attempt_service.py's _ProcessMockCompletionSideEffects()
    calls NotifyMockLeaderboardRankChange(db, attempt) for a just-submitted
    mock exam attempt.

Both are called AFTER the caller's own atomic gamification_processed_at
claim has already succeeded, so this file never needs its own idempotency
guard -- it only ever runs once per attempt, same as the XP award and badge
evaluation it sits alongside.

How "did the student move up, down, or stay" is computed
----------------------------------------------------------
Neither leaderboard has ever stored rank history anywhere in this schema --
every leaderboard endpoint has always computed rank live, on every request,
from the raw Attempt / CompetitionMockResultSummary rows. So "before" and
"after" are both computed by running leaderboard_service's shared ranking
queries live, twice: once normally (the "after" state, which naturally
includes the just-committed attempt, since submit_attempt()/
SubmitCompetitionMockAttempt() both commit the attempt before calling into
the gamification hook that leads here), and once with
`exclude_attempt_id=<this attempt's id>` (the "before" state, recomputed as
if this attempt had never been submitted at all -- its contribution is
removed from the pooled sums, not just filtered from the result rows).

If the student has no entry in the "before" leaderboard at all, this is
their first-ever qualifying result in that exact scope -- there is no
prior rank to compare against, so the outcome is FIRST_PLACEMENT rather
than a guessed up/down.

Podium (top 3) always wins over up/down/held framing, even if the student
was already in the podium before this attempt (e.g. 2nd -> 2nd is still
"PODIUM_2", not "HELD") -- Shailesh's explicit choice: podium placement
gets its own distinct message flavor per rank, ahead of the generic
improved/dropped/held framing.
"""
import logging

from app.services import leaderboard_service
from app.services.notification_service import CreateNotification, _json_loads
from app.services.rank_notification_messages import (
    STUDENT_MESSAGE_POOLS,
    TEACHER_PODIUM_MESSAGE_POOLS,
    XP_RANK_PROMOTION_MESSAGES,
    pick_message,
    spots_label,
)

_STUDENT_TITLES = {
    "PODIUM_1": "1st Place!",
    "PODIUM_2": "2nd Place!",
    "PODIUM_3": "3rd Place!",
    "IMPROVED": "You Moved Up!",
    "DROPPED": "Rank Update",
    "HELD": "Rank Held",
    "FIRST_PLACEMENT": "You're Ranked!",
}

_STUDENT_COLOR = {
    "PODIUM_1": "AMBER",
    "PODIUM_2": "AMBER",
    "PODIUM_3": "AMBER",
    "IMPROVED": "GREEN",
    "DROPPED": "BLUE",
    "HELD": "GRAY",
    "FIRST_PLACEMENT": "TEAL",
}


def _recent_template_ids(db, recipient_user_id: str, notif_type: str, dimension: str, outcome: str, limit: int = 5, scan: int = 30) -> set[int]:
    """Reads the recipient's own recent Notification rows of this exact
    type + dimension + outcome and returns the templateId values already
    shown, so pick_message() can steer away from repeating them. Scans a
    wider window (`scan`) than the ids actually returned (`limit`) since
    unrelated dimensions/outcomes of the same notification `type` are
    interleaved in a plain recency query and need to be skipped over."""
    from app.models.models import Notification

    rows = (
        db.query(Notification)
        .filter(Notification.recipient_user_id == recipient_user_id, Notification.type == notif_type)
        .order_by(Notification.created_at.desc())
        .limit(scan)
        .all()
    )
    ids: set[int] = set()
    for row in rows:
        meta = _json_loads(row.metadata_json)
        if meta.get("dimension") == dimension and meta.get("outcome") == outcome:
            template_id = meta.get("templateId")
            if isinstance(template_id, int):
                ids.add(template_id)
        if len(ids) >= limit:
            break
    return ids


def _notify_one_dimension(
    db,
    *,
    dimension: str,
    after_leaderboard: list[dict],
    before_leaderboard: list[dict],
    student,
    student_user,
    scope_name: str,
    student_target_route: str,
    teacher_target_route: str,
    attempt_id: str,
    extra_metadata: dict,
) -> None:
    after_entry = leaderboard_service.find_entry(after_leaderboard, student.id)
    if not after_entry:
        # Shouldn't happen -- the attempt that triggered this call should
        # always produce an entry for its own student in the "after" state.
        # Fail closed (no notification) rather than guessing.
        return

    rank = after_entry["rank"]
    total = len(after_leaderboard)
    before_entry = leaderboard_service.find_entry(before_leaderboard, student.id)
    prev_rank = before_entry["rank"] if before_entry else None

    if rank in (1, 2, 3):
        outcome = f"PODIUM_{rank}"
    elif prev_rank is None:
        outcome = "FIRST_PLACEMENT"
    elif rank < prev_rank:
        outcome = "IMPROVED"
    elif rank > prev_rank:
        outcome = "DROPPED"
    else:
        outcome = "HELD"

    pool = STUDENT_MESSAGE_POOLS[(dimension, outcome)]
    notif_type = f"STUDENT_{'DPS' if dimension.startswith('DPS') else 'MOCK'}_LEADERBOARD_RANK"
    recent_ids = _recent_template_ids(db, student_user.id, notif_type, dimension, outcome)
    template, template_id = pick_message(pool, recent_ids)

    spots = spots_label(abs(rank - prev_rank)) if (prev_rank is not None and rank != prev_rank) else ""
    message = template.format(
        scope_name=scope_name,
        total=total,
        rank=rank,
        prev_rank=prev_rank if prev_rank is not None else "",
        spots_label=spots,
    )

    metadata = {"dimension": dimension, "outcome": outcome, "templateId": template_id, "rank": rank, "total": total}
    if prev_rank is not None:
        metadata["prevRank"] = prev_rank
    metadata.update(extra_metadata)

    CreateNotification(
        db,
        recipient_user_id=student_user.id,
        recipient_role="STUDENT",
        type=notif_type,
        category="LEADERBOARD",
        title=_STUDENT_TITLES[outcome],
        message=message,
        actor_user_id=student_user.id,
        actor_role="STUDENT",
        student_id=student.id,
        teacher_id=student.teacher_id,
        attempt_id=attempt_id,
        target_route=student_target_route,
        color_variant=_STUDENT_COLOR[outcome],
        metadata=metadata,
    )
    db.commit()

    if outcome in ("PODIUM_1", "PODIUM_2", "PODIUM_3") and student.teacher_id:
        _notify_teacher_podium(
            db,
            dimension=dimension,
            rank=rank,
            total=total,
            scope_name=scope_name,
            student=student,
            student_user=student_user,
            teacher_target_route=teacher_target_route,
            attempt_id=attempt_id,
            extra_metadata=extra_metadata,
        )


def _notify_teacher_podium(
    db,
    *,
    dimension: str,
    rank: int,
    total: int,
    scope_name: str,
    student,
    student_user,
    teacher_target_route: str,
    attempt_id: str,
    extra_metadata: dict,
) -> None:
    """Teacher notifications only ever fire for a podium placement (rank 1,
    2, or 3) -- Shailesh's explicit choice, 2026-09-01. Never fires for
    improved/dropped/held/first-placement."""
    from app.models.models import Teacher, User

    if not student.teacher_id:
        return
    teacher = db.get(Teacher, student.teacher_id)
    if not teacher:
        return
    teacher_user = db.get(User, teacher.user_id)
    if not teacher_user:
        return

    outcome = f"PODIUM_{rank}"
    pool = TEACHER_PODIUM_MESSAGE_POOLS[(dimension, rank)]
    notif_type = f"TEACHER_{'DPS' if dimension.startswith('DPS') else 'MOCK'}_LEADERBOARD_PODIUM"
    recent_ids = _recent_template_ids(db, teacher_user.id, notif_type, dimension, outcome)
    template, template_id = pick_message(pool, recent_ids)
    message = template.format(student_name=student_user.full_name, scope_name=scope_name, total=total)

    metadata = {"dimension": dimension, "outcome": outcome, "templateId": template_id, "rank": rank, "total": total, "studentId": student.id}
    metadata.update(extra_metadata)

    try:
        CreateNotification(
            db,
            recipient_user_id=teacher_user.id,
            recipient_role="TEACHER",
            type=notif_type,
            category="LEADERBOARD",
            title=f"{student_user.full_name} Made the Podium!",
            message=message,
            actor_user_id=student_user.id,
            actor_role="STUDENT",
            student_id=student.id,
            teacher_id=teacher.id,
            attempt_id=attempt_id,
            target_route=teacher_target_route,
            color_variant="AMBER",
            metadata=metadata,
        )
        db.commit()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to notify teacher of podium finish for student {student.id}: {e}")


def NotifyDpsLeaderboardRankChange(db, attempt) -> None:
    """Call once per just-submitted DPS attempt (Attempt row, status already
    SUBMITTED/AUTO_SUBMITTED and committed) from attempt_service.py's
    gamification hook. Computes and notifies both DPS-scoped dimensions:
    Overall Journey (module-pooled) and Specific Level (level-pooled)."""
    try:
        from app.models.models import DPS, Lesson, Level, Module, Student, User

        dps = db.get(DPS, attempt.dps_id)
        if not dps:
            return
        lesson = db.get(Lesson, dps.lesson_id)
        if not lesson:
            return
        level = db.get(Level, lesson.level_id)
        if not level:
            return
        module = db.get(Module, level.module_id)
        if not module:
            return
        student = db.get(Student, attempt.student_id)
        if not student:
            return
        student_user = db.get(User, student.user_id)
        if not student_user:
            return

        _notify_one_dimension(
            db,
            dimension="DPS_OVERALL",
            after_leaderboard=leaderboard_service.rank_dps_overall_journey(db, module.id, with_badges=False),
            before_leaderboard=leaderboard_service.rank_dps_overall_journey(db, module.id, exclude_attempt_id=attempt.id, with_badges=False),
            student=student,
            student_user=student_user,
            scope_name=f"{module.module_name} DPS Overall Journey",
            student_target_route=f"/student/competition/dps-leaderboard?viewMode=OVERALL&moduleId={module.id}",
            teacher_target_route=f"/teacher/leaderboard/dps?viewMode=OVERALL&moduleId={module.id}&highlightStudentId={student.id}",
            attempt_id=attempt.id,
            extra_metadata={"moduleId": module.id},
        )
        _notify_one_dimension(
            db,
            dimension="DPS_SPECIFIC",
            after_leaderboard=leaderboard_service.rank_dps_specific_level(db, level.id, with_badges=False),
            before_leaderboard=leaderboard_service.rank_dps_specific_level(db, level.id, exclude_attempt_id=attempt.id, with_badges=False),
            student=student,
            student_user=student_user,
            scope_name=f"{level.level_name} DPS Leaderboard",
            student_target_route=f"/student/competition/dps-leaderboard?viewMode=SPECIFIC&levelId={level.id}",
            teacher_target_route=f"/teacher/leaderboard/dps?viewMode=SPECIFIC&levelId={level.id}&highlightStudentId={student.id}",
            attempt_id=attempt.id,
            extra_metadata={"levelId": level.id},
        )
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to send DPS leaderboard rank notifications for attempt {getattr(attempt, 'id', None)}: {e}")


def NotifyMockLeaderboardRankChange(db, attempt) -> None:
    """Call once per just-submitted mock attempt (CompetitionMockAttempt
    row, status already SUBMITTED/AUTO_SUBMITTED, its
    CompetitionMockResultSummary already committed) from
    competition_mock_attempt_service.py's gamification hook. Computes and
    notifies both Mock-scoped dimensions: Overall Journey (cumulative,
    level-pooled) and Specific Exam (this one exam).

    Both dimensions are scoped by the exam's own level -- Mock Specific
    Exam mirrors the original get_mock_exam_leaderboard() behavior of only
    ever comparing students at the same current_level_id as the exam
    itself."""
    try:
        from app.models.models import CompetitionMockExam, Level, Student, User

        exam = db.get(CompetitionMockExam, attempt.mock_exam_id)
        if not exam:
            return
        level = db.get(Level, exam.level_id)
        if not level:
            return
        student = db.get(Student, attempt.student_id)
        if not student:
            return
        student_user = db.get(User, student.user_id)
        if not student_user:
            return

        _notify_one_dimension(
            db,
            dimension="MOCK_OVERALL",
            after_leaderboard=leaderboard_service.rank_mock_overall_journey(db, level.id, with_badges=False),
            before_leaderboard=leaderboard_service.rank_mock_overall_journey(db, level.id, exclude_attempt_id=attempt.id, with_badges=False),
            student=student,
            student_user=student_user,
            scope_name=f"{level.level_name} Mock Overall Journey",
            student_target_route=f"/student/competition/leaderboard?viewMode=CUMULATIVE&levelId={level.id}",
            teacher_target_route=f"/teacher/leaderboard/mock?viewMode=CUMULATIVE&levelId={level.id}&highlightStudentId={student.id}",
            attempt_id=attempt.id,
            extra_metadata={"levelId": level.id},
        )
        _notify_one_dimension(
            db,
            dimension="MOCK_SPECIFIC",
            after_leaderboard=leaderboard_service.rank_mock_specific_exam(db, exam.id, level.id, with_badges=False),
            before_leaderboard=leaderboard_service.rank_mock_specific_exam(db, exam.id, level.id, exclude_attempt_id=attempt.id, with_badges=False),
            student=student,
            student_user=student_user,
            scope_name=f"{exam.title or exam.mock_code} Leaderboard",
            student_target_route=f"/student/competition/leaderboard?viewMode=INDIVIDUAL&levelId={level.id}&examId={exam.id}",
            teacher_target_route=f"/teacher/leaderboard/mock?viewMode=INDIVIDUAL&levelId={level.id}&examId={exam.id}&highlightStudentId={student.id}",
            attempt_id=attempt.id,
            extra_metadata={"levelId": level.id, "examId": exam.id},
        )
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to send mock leaderboard rank notifications for attempt {getattr(attempt, 'id', None)}: {e}")


def _humanize_rank_tier(tier: str | None) -> str:
    """'COPPER_V' -> 'Copper V', 'CHAMPION' -> 'Champion'. Only used for
    notification text -- the fancier cinematic-overlay tier presentation
    (RankCinematicOverlay.tsx) is a separate, already-shipped frontend
    concern and isn't duplicated here."""
    if not tier:
        return "—"
    parts = str(tier).split("_")
    if len(parts) == 1:
        return parts[0].title()
    base = parts[0].title()
    numeral = "_".join(parts[1:]).upper()
    return f"{base} {numeral}"


def NotifyXpRankTierUp(db, user_id: str, old_rank: str, new_rank: str) -> None:
    """Persisted-notification companion to the existing RankCinematicOverlay
    live animation (see EconomyService.award_xp_and_coins, the single
    shared insertion point for DPS/mock/assessment XP awards alike) --
    Shailesh's explicit instruction, 2026-09-01: "for xp rank tier
    promotions if a student ranks up we need to show that notification to
    them as well along with the ranking up animation." This is additive,
    not a replacement -- the cinematic overlay still fires exactly as
    before; this just also leaves a durable notification in the bell so a
    rank-up isn't lost if the student closes the tab before the animation
    is seen (or is viewing from a different device later)."""
    try:
        from app.models.models import User

        user = db.get(User, user_id)
        if not user:
            return

        from app.models.models import Notification

        rows = (
            db.query(Notification)
            .filter(Notification.recipient_user_id == user_id, Notification.type == "STUDENT_XP_RANK_TIER_UP")
            .order_by(Notification.created_at.desc())
            .limit(5)
            .all()
        )
        recent_ids: set[int] = set()
        for row in rows:
            template_id = _json_loads(row.metadata_json).get("templateId")
            if isinstance(template_id, int):
                recent_ids.add(template_id)

        template, template_id = pick_message(XP_RANK_PROMOTION_MESSAGES, recent_ids)
        message = template.format(old_tier=_humanize_rank_tier(old_rank), new_tier=_humanize_rank_tier(new_rank))

        CreateNotification(
            db,
            recipient_user_id=user.id,
            recipient_role=(user.role or "STUDENT"),
            type="STUDENT_XP_RANK_TIER_UP",
            category="XP_RANK",
            title="New Rank Tier!",
            message=message,
            actor_user_id=user.id,
            actor_role=(user.role or "STUDENT"),
            target_route="/student/dashboard",
            color_variant="INDIGO",
            metadata={"templateId": template_id, "oldTier": old_rank, "newTier": new_rank},
        )
        db.commit()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to send XP rank-tier-up notification for user {user_id}: {e}")
