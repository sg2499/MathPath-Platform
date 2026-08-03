import json
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from typing import List, Dict, Any
from app.models.models import (
    Student, CompetitionMockResultSummary, AchievementBadge, StudentBadge,
    StudentAchievementStat, CompetitionMockExam, Level, Attempt,
)
from sqlalchemy import or_

# Attempt.status values that count as "this DPS sheet was completed" --
# matches the exact set attempt_service.py's submit_attempt() ever sets
# (see Attempt.status assignment there). A still-IN_PROGRESS attempt never
# reaches this file at all (only called from the post-submit hook), but the
# explicit filter is kept everywhere a fresh query is built, in case this
# method is ever called from a backfill/replay script against historic rows.
_DPS_COMPLETED_STATUSES = ("SUBMITTED", "AUTO_SUBMITTED")

def _make_aware(dt: datetime | None) -> datetime | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

# ============================================================================
# LEVEL MASTERY -- shared derivation, used by both seed_badges() (creates the
# 3 badge rows per active Level) and _evaluate_level_mastery() (detection).
# Re-implemented 2026-07-30: the original backend piece of this feature was
# designed and reportedly verified in an earlier session but never actually
# committed, so it silently never shipped -- the frontend icons/colors/3D
# environments for 15 of these 39 badges went live in production with no
# backend able to create or award them. This is the missing half.
#
# Naming convention (load-bearing -- must exactly match the frontend's
# badgeGlyphs.tsx / badgeVisuals.ts / dev preview harness, which were built
# against this exact contract):
#   level_code "YLM-L1" -> key "ylm_l1" -> badge code "level_mastery_ylm_l1"
#   -> icon_name "LevelMastery" + PascalKey ("YlmL1") + TierLabel
#   TierLabel: BASE -> "Cleared", SUPER -> "Mastered", LEGENDARY -> "Perfected"
#   display name: level_code with "-" -> " " (e.g. "YLM L1 -- Cleared")
# ============================================================================
_LEVEL_MASTERY_TIER_LABELS = {"BASE": "Cleared", "SUPER": "Mastered", "LEGENDARY": "Perfected"}
_LEVEL_MASTERY_REQUIRED_COUNT = {"BASE": 12, "SUPER": 20, "LEGENDARY": 30}

def _level_mastery_key(level_code: str) -> str:
    return level_code.strip().lower().replace("-", "_").replace(" ", "_")

def _level_mastery_pascal(level_code: str) -> str:
    return "".join(part.capitalize() for part in level_code.strip().replace(" ", "-").split("-") if part)

def _level_mastery_display(level_code: str) -> str:
    return level_code.strip().replace("-", " ")

def _level_mastery_description(tier: str, display: str) -> str:
    if tier == "BASE":
        return f"Complete at least 12 Mock Exams within {display}"
    if tier == "SUPER":
        return f"Complete at least 20 Mock Exams within {display}, averaging 85% or higher"
    return f"Complete at least 30 Mock Exams within {display}, averaging 95% or higher (or score 100% on at least one)"

class AchievementEngine:
    @staticmethod
    def _increment_stat(db: Session, student_id: str, stat_name: str, increment: int = 1) -> int:
        stat = db.query(StudentAchievementStat).filter_by(student_id=student_id, stat_name=stat_name).first()
        if not stat:
            stat = StudentAchievementStat(student_id=student_id, stat_name=stat_name, stat_value=0)
            db.add(stat)
        stat.stat_value += increment
        db.flush()
        return stat.stat_value

    @staticmethod
    def _set_stat(db: Session, student_id: str, stat_name: str, value: int) -> int:
        stat = db.query(StudentAchievementStat).filter_by(student_id=student_id, stat_name=stat_name).first()
        if not stat:
            stat = StudentAchievementStat(student_id=student_id, stat_name=stat_name, stat_value=value)
            db.add(stat)
        else:
            stat.stat_value = value
        db.flush()
        return stat.stat_value

    @staticmethod
    def _award_badge_if_qualified(db: Session, student_id: str, badge_code: str, required_tier: str, current_count: int, newly_unlocked: list):
        # find the badge
        badge = db.query(AchievementBadge).filter_by(code=badge_code, tier=required_tier).first()
        if not badge:
            return
        # check if they meet the requirement
        if current_count >= badge.required_count:
            # check if they already have it
            existing = db.query(StudentBadge).filter_by(student_id=student_id, badge_id=badge.id).first()
            if not existing:
                sb = StudentBadge(student_id=student_id, badge_id=badge.id)
                db.add(sb)
                newly_unlocked.append(badge)

    @staticmethod
    def _has_badge(db: Session, student_id: str, badge_code: str, tier: str) -> bool:
        badge = db.query(AchievementBadge).filter_by(code=badge_code, tier=tier).first()
        if not badge:
            return False
        return db.query(StudentBadge).filter_by(student_id=student_id, badge_id=badge.id).first() is not None

    @staticmethod
    def _get_stat(db: Session, student_id: str, stat_name: str) -> int:
        """Read-only counterpart to _increment_stat/_set_stat -- returns 0 for
        a stat that doesn't exist yet, never creates a row (unlike the other
        two). Needed by the DPS badge families below, which have to inspect a
        previously-stored value (a week marker, a streak) before deciding
        whether to bump it, rather than unconditionally incrementing."""
        stat = db.query(StudentAchievementStat).filter_by(student_id=student_id, stat_name=stat_name).first()
        return stat.stat_value if stat else 0

    @classmethod
    def _award_all_tiers(cls, db: Session, student_id: str, badge_code: str, count: int, newly_unlocked: list):
        """Shared tail call for every monotonic-counter DPS badge family below
        -- same pattern already used for every mock-exam badge family above
        (perfectionist, speed_demon, competitor, etc.): each tier's threshold
        is just a bigger number on the same counter, so calling all 4 tiers
        with the same value every time is sufficient -- no explicit cascade
        check needed (a student can't reach the SUPER count without already
        having passed BASE's smaller count on some earlier call). This is
        deliberately NOT used for Level Mastery above, which has an
        independent score gate layered on top of its count and needs the
        explicit cascade guard instead."""
        for tier in ("BASE", "SUPER", "LEGENDARY", "MYTHIC"):
            cls._award_badge_if_qualified(db, student_id, badge_code, tier, count, newly_unlocked)

    # ========================================================================
    # DPS BADGES -- detection logic for the 10 families whose definitions
    # were seeded into seed_badges() on 2026-07-31 (PR #416) with a full
    # frontend/audio treatment shipped alongside them (PR #415, #417), but
    # with ZERO evaluation logic anywhere in the backend -- confirmed by
    # grepping this file and attempt_service.py before this fix: the 40
    # seeded badge rows had no code path that could ever set is_unlocked for
    # any of them. Every DPS student would have seen 40 permanently-locked
    # badges in the Trophy Room's "DPS Sheets" tab, worse than the honest
    # "Coming Soon" placeholder it replaced. See OPEN_ISSUES.md's matching
    # 2026-07-31/08-02 entry for the full incident writeup.
    #
    # Wired from attempt_service.py's _process_attempt_gamification_side_effects(),
    # the same atomically-claimed, exactly-once-per-attempt hook that already
    # awards DPS XP/coins -- mirrors evaluate_mock_exam_submission()'s shape
    # exactly (same _award_badge_if_qualified/_increment_stat primitives,
    # same {id, code, name, description, icon_name, tier} return shape) so
    # the calling code and the notification loop can treat both the same way.
    #
    # IMPORTANT -- several of these families were seeded with a real-world
    # description (e.g. "4 consecutive weeks", "immediately use a retry")
    # that the schema doesn't literally store a flag for. Every interpretation
    # below is documented at its definition and is a reasonable, defensible
    # reading of the seeded description against the fields DPS Attempt
    # actually has (see models.py's Attempt class) -- but none of these were
    # confirmed with Shailesh before being built, unlike every other
    # gamification threshold in this file (Level Mastery's cascade rule,
    # the Phase 2 families, etc., which all have an explicit sign-off
    # documented in COWORK_HANDOFF.md). Flagged in OPEN_ISSUES.md as needing
    # a product-owner read-through before being treated as final.
    # ========================================================================

    @classmethod
    def _dps_week_start(cls, dt: datetime) -> datetime:
        """Monday 00:00 UTC of dt's calendar week. Used only to bucket DPS
        completions into weeks for Ironclad Discipline -- deliberately keyed
        off a plain 7-day-aligned epoch rather than an ISO (year, week)
        tuple, so there's no year-boundary wraparound bug to reason about
        (ISO week 52/53 -> week 1 would otherwise need special-casing to
        detect "consecutive"). Evaluated in UTC, not the student's local
        time zone -- this app has no per-student timezone field anywhere
        else either, so this matches the platform's existing convention
        (e.g. Midnight Oil below), not a new limitation introduced here."""
        start = dt - timedelta(days=dt.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0)

    @classmethod
    def _evaluate_dps_discipline(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """1. Ironclad Discipline -- consecutive weeks with all 5 DPS sheets
        (5 distinct dps_id) completed. "Complete all 5 DPS sheets in a
        single week" is read as: at least 5 distinct DPS sheets completed
        (any accuracy) within one Mon-Sun week -- not tied to a specific
        lesson's own 5-sheet structure, since the badge description doesn't
        say "for one lesson" and a lesson's 5 sheets are typically done well
        within a week anyway once a student is active. Re-evaluates the
        current week's distinct-sheet count on every submission but only
        ever advances the streak once per week (guarded by
        dps_discipline_last_counted_week_epoch), so submitting sheet #6 or
        #7 in an already-qualifying week doesn't double-count."""
        submitted = _make_aware(attempt.submitted_at)
        if not submitted:
            return
        week_start = cls._dps_week_start(submitted)
        week_epoch = int(week_start.timestamp())

        last_counted = cls._get_stat(db, student_id, "dps_discipline_last_counted_week_epoch")
        if last_counted == week_epoch:
            return

        week_end = week_start + timedelta(days=7)
        distinct_sheets = (
            db.query(Attempt.dps_id)
            .filter(
                Attempt.student_id == student_id,
                Attempt.status.in_(_DPS_COMPLETED_STATUSES),
                Attempt.submitted_at >= week_start,
                Attempt.submitted_at < week_end,
            )
            .distinct()
            .count()
        )
        if distinct_sheets < 5:
            return

        prior_week_epoch = cls._get_stat(db, student_id, "dps_discipline_prior_week_epoch")
        streak = cls._get_stat(db, student_id, "dps_discipline_streak")
        streak = streak + 1 if prior_week_epoch == week_epoch - 7 * 86400 else 1
        cls._set_stat(db, student_id, "dps_discipline_streak", streak)
        cls._set_stat(db, student_id, "dps_discipline_prior_week_epoch", week_epoch)
        cls._set_stat(db, student_id, "dps_discipline_last_counted_week_epoch", week_epoch)
        cls._award_all_tiers(db, student_id, "dps_discipline", streak, newly_unlocked)

    @classmethod
    def _evaluate_dps_crystal(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """2. Pure Crystal -- 100% accuracy on N distinct DPS sheets (lifetime,
        not consecutive). Recomputed as a live distinct-sheet count each time
        (same "don't trust a drifting counter" discipline Level Mastery uses
        above), not an incremented stat -- a student can score 100% on the
        same sheet across several retries and that must only count once."""
        if float(attempt.accuracy_percentage or 0) != 100:
            return
        distinct_count = (
            db.query(Attempt.dps_id)
            .filter(
                Attempt.student_id == student_id,
                Attempt.status.in_(_DPS_COMPLETED_STATUSES),
                Attempt.accuracy_percentage == 100,
            )
            .distinct()
            .count()
        )
        cls._award_all_tiers(db, student_id, "dps_crystal", distinct_count, newly_unlocked)

    @classmethod
    def _evaluate_dps_tome(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """3. Boundless Tome -- lifetime DPS sheets completed. Mirrors
        Competitor's mock-exam pattern exactly: every completed attempt
        (original or retry) increments a simple running counter, matching
        the seeded "Complete N DPS sheets" wording (volume of effort, not
        distinct sheets -- retries of the same sheet still represent real
        completed work)."""
        count = cls._increment_stat(db, student_id, "dps_tome_completed")
        cls._award_all_tiers(db, student_id, "dps_tome", count, newly_unlocked)

    @classmethod
    def _evaluate_dps_quill(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """4. Lightning Quill -- finished in under 50% of the allocated time
        with >90% accuracy. Direct DPS analogue of the mock-exam Speed Demon
        family. duration_seconds is this attempt's allocated time (same
        field EconomyService already keys reward calculation off of, per
        attempt_service.py's own comment); time_taken_seconds is the real
        elapsed time."""
        allocated = float(attempt.duration_seconds or 0)
        if allocated <= 0:
            return
        taken = float(attempt.time_taken_seconds or 0)
        accuracy = float(attempt.accuracy_percentage or 0)
        if (taken / allocated) < 0.5 and accuracy > 90:
            count = cls._increment_stat(db, student_id, "dps_quill_count")
            cls._award_all_tiers(db, student_id, "dps_quill", count, newly_unlocked)

    @classmethod
    def _evaluate_dps_sage(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """5. Sage's Eye -- used almost the entire allocated time (>=95%) and
        still scored a flawless 100%. Direct DPS analogue of the mock-exam
        Sharpshooter family (100% + high time-utilization), just with DPS's
        raw time_taken/duration ratio in place of mocks' stored
        time_utilization_percentage field."""
        allocated = float(attempt.duration_seconds or 0)
        if allocated <= 0:
            return
        taken = float(attempt.time_taken_seconds or 0)
        accuracy = float(attempt.accuracy_percentage or 0)
        if (taken / allocated) >= 0.95 and accuracy == 100:
            count = cls._increment_stat(db, student_id, "dps_sage_count")
            cls._award_all_tiers(db, student_id, "dps_sage", count, newly_unlocked)

    @classmethod
    def _evaluate_dps_chain(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """6. Unbroken Chain -- consecutive DPS sheets with zero unanswered
        questions. Direct DPS analogue of the mock-exam Unstoppable Streak
        family's streak-with-reset pattern: a qualifying submission extends
        the streak, any other submission resets it to 0 rather than just
        skipping (an unanswered question is a real break, not a
        non-qualifying-but-harmless attempt)."""
        if (attempt.unanswered_count or 0) == 0:
            streak = cls._increment_stat(db, student_id, "dps_chain_streak")
            cls._award_all_tiers(db, student_id, "dps_chain", streak, newly_unlocked)
        else:
            cls._set_stat(db, student_id, "dps_chain_streak", 0)

    @classmethod
    def _evaluate_dps_phoenix(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """7. Rising Phoenix -- a sub-50% DPS immediately followed by the
        student's very next DPS submission (any sheet) scoring >90%. Direct
        DPS analogue of the mock-exam Comeback Kid family's "previous
        submission" lookup, just with fixed absolute floors (<50 then >90)
        instead of Comeback Kid's relative +20-point jump, matching the
        seeded description literally. Not restricted to the same dps_id or
        the same retry chain -- "your very next DPS" is read as the next
        DPS submission chronologically, on any sheet, same scope Comeback
        Kid already uses for mocks."""
        accuracy = float(attempt.accuracy_percentage or 0)
        if accuracy <= 90 or not attempt.submitted_at:
            return
        previous = (
            db.query(Attempt)
            .filter(
                Attempt.student_id == student_id,
                Attempt.status.in_(_DPS_COMPLETED_STATUSES),
                Attempt.id != attempt.id,
                Attempt.submitted_at.isnot(None),
                Attempt.submitted_at < attempt.submitted_at,
            )
            .order_by(Attempt.submitted_at.desc())
            .first()
        )
        if previous and float(previous.accuracy_percentage or 0) < 50:
            count = cls._increment_stat(db, student_id, "dps_phoenix_count")
            cls._award_all_tiers(db, student_id, "dps_phoenix", count, newly_unlocked)

    @classmethod
    def _evaluate_dps_anvil(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """8. Master's Anvil -- failed a DPS attempt, then the very next
        retry in that SAME attempt chain scores 100%. Unlike Phoenix above,
        this one is explicitly scoped to one retry chain (attempt_group_id)
        per the seeded description's "immediately use a retry" -- a retry
        is a same-sheet, same-chain concept on this platform (see
        attempt_chain_service.py), not just the next DPS chronologically.
        "Fail" is read as the platform's own pass/fail line (benchmark_status
        != CLEARED, i.e. < 70%, per attempt_service.BENCHMARK_PERCENTAGE),
        not the <50% floor Phoenix uses for its unrelated "low score" case."""
        if int(attempt.attempt_number or 0) <= 0 or not attempt.attempt_group_id:
            return
        if float(attempt.accuracy_percentage or 0) != 100:
            return
        previous = (
            db.query(Attempt)
            .filter(
                Attempt.attempt_group_id == attempt.attempt_group_id,
                Attempt.student_id == student_id,
                Attempt.attempt_number == attempt.attempt_number - 1,
            )
            .first()
        )
        if previous and previous.benchmark_status != "CLEARED":
            count = cls._increment_stat(db, student_id, "dps_anvil_count")
            cls._award_all_tiers(db, student_id, "dps_anvil", count, newly_unlocked)

    @classmethod
    def _evaluate_dps_midnight(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """9. Midnight Oil -- DPS sheets completed on a weekend. Evaluated
        against submitted_at's UTC weekday (Saturday=5, Sunday=6) -- see
        _dps_week_start()'s docstring above for why this app has no
        per-student local time zone to evaluate "weekend" against instead;
        this is an approximation flagged the same way, not a silent gap."""
        submitted = _make_aware(attempt.submitted_at)
        if not submitted or submitted.weekday() < 5:
            return
        count = cls._increment_stat(db, student_id, "dps_midnight_count")
        cls._award_all_tiers(db, student_id, "dps_midnight", count, newly_unlocked)

    @classmethod
    def _evaluate_dps_compass(cls, db: Session, student_id: str, attempt: Attempt, newly_unlocked: list):
        """10. Golden Compass -- scored >90% on the very first attempt (no
        retry needed) for N different DPS sheets. attempt_number == 0 is
        this platform's own definition of "first/original attempt" (see
        attempt_chain_service.ATTEMPT_SOURCE_ORIGINAL) -- each qualifying
        sheet has exactly one attempt_number==0 row, so a simple increment
        per qualifying submission already counts distinct sheets without a
        separate dedup query."""
        if int(attempt.attempt_number or 0) != 0:
            return
        if float(attempt.accuracy_percentage or 0) <= 90:
            return
        count = cls._increment_stat(db, student_id, "dps_compass_count")
        cls._award_all_tiers(db, student_id, "dps_compass", count, newly_unlocked)

    @classmethod
    def evaluate_dps_attempt_submission(cls, db: Session, student_id: str, attempt: Attempt) -> list[dict[str, Any]]:
        """Entry point for the 10 DPS badge families above -- call exactly
        once per completed DPS attempt, from the same atomically-claimed
        hook attempt_service.py already uses for DPS XP/coins
        (_process_attempt_gamification_side_effects), so this can never
        double-fire for the same attempt any more than the economy award
        can. Returns the same {id, code, name, description, icon_name, tier}
        shape evaluate_mock_exam_submission() does, so callers can reuse the
        exact same BADGE_UNLOCKED notification loop."""
        newly_unlocked: list = []
        if attempt.status not in _DPS_COMPLETED_STATUSES:
            return []

        cls._evaluate_dps_discipline(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_crystal(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_tome(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_quill(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_sage(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_chain(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_phoenix(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_anvil(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_midnight(db, student_id, attempt, newly_unlocked)
        cls._evaluate_dps_compass(db, student_id, attempt, newly_unlocked)

        db.commit()

        unlocked_list = []
        for b in newly_unlocked:
            unlocked_list.append({
                "id": b.id,
                "code": b.code,
                "name": b.name,
                "description": b.description,
                "icon_name": b.icon_name,
                "tier": b.tier,
            })
        return unlocked_list

    @classmethod
    def _evaluate_level_mastery(cls, db: Session, student_id: str, result_summary: CompetitionMockResultSummary, newly_unlocked: list):
        """Level Mastery -- one badge family per active Level, 3 tiers each,
        volume-based with a score floor on SUPER/LEGENDARY. Strict cascade
        gating: SUPER can only be awarded once BASE is already held, and
        LEGENDARY only once SUPER is already held -- an independent score
        gate layered on top of a count threshold would otherwise let a
        student skip straight to a higher tier (e.g. 29 low-scoring mocks
        plus one 100% run could hit LEGENDARY's "avg>=95 OR one 100%" clause
        without ever having averaged 85%+ across 20 mocks for SUPER). Per
        Shailesh's explicit instruction: "nothing can be skipped in order to
        get something that comes after it."
        """
        mock_exam = result_summary.mock_exam
        level = mock_exam.level if mock_exam else None
        if not level or not level.level_code:
            return
        key = _level_mastery_key(level.level_code)
        badge_code = f"level_mastery_{key}"

        # Live aggregate across every completed mock this student has ever
        # taken within this level (not a running stat counter -- avoids any
        # drift between a stored counter and reality, and this table is
        # small enough per student/level that a fresh query each submission
        # is cheap, same pattern already used above for Podium Finisher).
        summaries = (
            db.query(CompetitionMockResultSummary)
            .join(CompetitionMockExam, CompetitionMockResultSummary.mock_exam_id == CompetitionMockExam.id)
            .filter(
                CompetitionMockResultSummary.student_id == student_id,
                CompetitionMockExam.level_id == level.id,
                CompetitionMockResultSummary.completed_at.isnot(None),
            )
            .all()
        )
        count = len(summaries)
        if count == 0:
            return
        avg_pct = sum(s.percentage for s in summaries) / count
        has_perfect = any(s.percentage == 100 for s in summaries)

        # BASE -- pure volume gate, no cascade dependency (it's the floor).
        cls._award_badge_if_qualified(db, student_id, badge_code, "BASE", count, newly_unlocked)

        # SUPER -- volume + average score, only once BASE is already held.
        if (cls._has_badge(db, student_id, badge_code, "BASE")
                and count >= _LEVEL_MASTERY_REQUIRED_COUNT["SUPER"] and avg_pct >= 85):
            cls._award_badge_if_qualified(db, student_id, badge_code, "SUPER", count, newly_unlocked)

        # LEGENDARY -- volume + (average >=95 OR at least one 100%), only
        # once SUPER is already held.
        if (cls._has_badge(db, student_id, badge_code, "SUPER")
                and count >= _LEVEL_MASTERY_REQUIRED_COUNT["LEGENDARY"] and (avg_pct >= 95 or has_perfect)):
            cls._award_badge_if_qualified(db, student_id, badge_code, "LEGENDARY", count, newly_unlocked)

    @classmethod
    def evaluate_mock_exam_submission(cls, db: Session, student_id: str, result_summary: CompetitionMockResultSummary) -> list[dict[str, Any]]:
        newly_unlocked = []
        
        # 1. The Perfectionist
        if result_summary.percentage == 100:
            count = cls._increment_stat(db, student_id, "perfect_mock_scores")
            cls._award_badge_if_qualified(db, student_id, "perfectionist", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "perfectionist", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "perfectionist", "LEGENDARY", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "perfectionist", "MYTHIC", count, newly_unlocked)

        # 2. The Speed Demon
        if result_summary.percentage >= 80 and result_summary.time_utilization_percentage and result_summary.time_utilization_percentage < 50:
            count = cls._increment_stat(db, student_id, "speed_demon_scores")
            cls._award_badge_if_qualified(db, student_id, "speed_demon", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "speed_demon", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "speed_demon", "LEGENDARY", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "speed_demon", "MYTHIC", count, newly_unlocked)

        # 3. The Competitor (Participation)
        count = cls._increment_stat(db, student_id, "mock_exams_completed")
        cls._award_badge_if_qualified(db, student_id, "competitor", "BASE", count, newly_unlocked)
        cls._award_badge_if_qualified(db, student_id, "competitor", "SUPER", count, newly_unlocked)
        cls._award_badge_if_qualified(db, student_id, "competitor", "LEGENDARY", count, newly_unlocked)
        cls._award_badge_if_qualified(db, student_id, "competitor", "MYTHIC", count, newly_unlocked)

        # 4. The Unstoppable Streak
        if result_summary.percentage > 90:
            streak = cls._increment_stat(db, student_id, "unstoppable_mock_streak")
            cls._award_badge_if_qualified(db, student_id, "unstoppable_streak", "BASE", streak, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "unstoppable_streak", "SUPER", streak, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "unstoppable_streak", "LEGENDARY", streak, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "unstoppable_streak", "MYTHIC", streak, newly_unlocked)
        else:
            cls._set_stat(db, student_id, "unstoppable_mock_streak", 0)

        # 5. Early Bird
        # If difference between assigned_at and completed_at < 24 hours
        if result_summary.mock_assignment and result_summary.completed_at and result_summary.mock_assignment.assigned_at:
            aware_completed = _make_aware(result_summary.completed_at)
            aware_assigned = _make_aware(result_summary.mock_assignment.assigned_at)
            if aware_completed and aware_assigned:
                delta = aware_completed - aware_assigned
                if delta.total_seconds() <= 86400:
                    count = cls._increment_stat(db, student_id, "early_bird_mocks")
                    cls._award_badge_if_qualified(db, student_id, "early_bird", "BASE", count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "early_bird", "SUPER", count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "early_bird", "LEGENDARY", count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "early_bird", "MYTHIC", count, newly_unlocked)

        # The Comeback Kid (improvement)
        # Fetch previous attempt
        previous_summary = db.query(CompetitionMockResultSummary).filter(
            CompetitionMockResultSummary.student_id == student_id,
            CompetitionMockResultSummary.id != result_summary.id,
            CompetitionMockResultSummary.completed_at != None
        ).order_by(CompetitionMockResultSummary.completed_at.desc()).first()

        if previous_summary and result_summary.percentage - previous_summary.percentage >= 20:
            count = cls._increment_stat(db, student_id, "comeback_kid_mocks")
            cls._award_badge_if_qualified(db, student_id, "comeback_kid", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "comeback_kid", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "comeback_kid", "LEGENDARY", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "comeback_kid", "MYTHIC", count, newly_unlocked)

        # 6. Podium Finisher
        # Calculate rank dynamically against peers in the same level
        from app.models.models import Student
        student_model = db.query(Student).filter_by(id=student_id).first()
        if student_model:
            all_summaries = (
                db.query(CompetitionMockResultSummary)
                .join(Student, CompetitionMockResultSummary.student_id == Student.id)
                .filter(CompetitionMockResultSummary.mock_exam_id == result_summary.mock_exam_id)
                .filter(Student.current_level_id == student_model.current_level_id)
                .order_by(
                    CompetitionMockResultSummary.percentage.desc(),
                    CompetitionMockResultSummary.time_taken_seconds.asc()
                )
                .all()
            )
            
            rank = None
            for idx, summ in enumerate(all_summaries):
                if summ.id == result_summary.id:
                    rank = idx + 1
                    break
            
            if rank and rank <= 3:
                count = cls._increment_stat(db, student_id, "podium_finisher_mocks")
                cls._award_badge_if_qualified(db, student_id, "podium_finisher", "BASE", count, newly_unlocked)
                cls._award_badge_if_qualified(db, student_id, "podium_finisher", "SUPER", count, newly_unlocked)
                
                if rank == 1:
                    champ_count = cls._increment_stat(db, student_id, "champion_mocks")
                    cls._award_badge_if_qualified(db, student_id, "podium_finisher", "LEGENDARY", champ_count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "podium_finisher", "MYTHIC", champ_count, newly_unlocked)

        # 7. The Sharpshooter
        if result_summary.percentage == 100 and result_summary.time_utilization_percentage and result_summary.time_utilization_percentage > 90:
            count = cls._increment_stat(db, student_id, "sharpshooter_mocks")
            cls._award_badge_if_qualified(db, student_id, "sharpshooter", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "sharpshooter", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "sharpshooter", "LEGENDARY", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "sharpshooter", "MYTHIC", count, newly_unlocked)

        # 8. The Underdog
        if previous_summary and previous_summary.percentage < 50 and result_summary.percentage > 80:
            count = cls._increment_stat(db, student_id, "underdog_mocks")
            cls._award_badge_if_qualified(db, student_id, "underdog", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "underdog", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "underdog", "LEGENDARY", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "underdog", "MYTHIC", count, newly_unlocked)

        # 9. The High Achiever (formerly Polymath)
        if result_summary.percentage > 80 and result_summary.mock_exam:
            # Just increment the count for scoring > 80% on any mock exam
            count = cls._increment_stat(db, student_id, "polymath_count")

            cls._award_badge_if_qualified(db, student_id, "polymath", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "polymath", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "polymath", "LEGENDARY", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "polymath", "MYTHIC", count, newly_unlocked)

        # ====================================================================
        # PHASE 2 (2026-07-28) -- 5 brand-new skill-badge families, 4 tiers
        # each. See docs/GAMIFICATION_BADGE_CATALOG_PROPOSAL_2026-07-25.md
        # Section 1a for the full design rationale.
        # ====================================================================

        # 10. Marathoner -- cumulative time invested across every mock attempt,
        # lifetime. Stat is stored in raw seconds (StudentAchievementStat.
        # stat_value is an Integer column, and time_taken_seconds already is
        # one, so this avoids any float-precision drift) -- required_count on
        # the seeded badge rows is therefore also in seconds, not hours.
        # Revised 2026-07-28 from the original "3+ mocks in one calendar day"
        # design: mock assignment on this platform is fully manual/ad-hoc and
        # bulk-to-a-level (see CompetitionMockAssignment / AssignCompetitionMockExams),
        # so a student essentially never has 3+ mocks available to complete in
        # a single day. Cumulative time-on-task is immune to that -- it
        # accumulates regardless of how bursty or sparse assignment is.
        if result_summary.time_taken_seconds:
            total_seconds = cls._increment_stat(db, student_id, "marathoner_seconds", result_summary.time_taken_seconds)
            cls._award_badge_if_qualified(db, student_id, "marathoner", "BASE", total_seconds, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "marathoner", "SUPER", total_seconds, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "marathoner", "LEGENDARY", total_seconds, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "marathoner", "MYTHIC", total_seconds, newly_unlocked)

        # 11. Iron Wall -- consistency across a run of mocks, distinct from
        # Unstoppable Streak (fixed >90% floor). Each tier has BOTH its own
        # score floor AND its own run length (60%/70%/75%/80%,
        # 5/10/20/40 mocks), so a single shared streak counter would be wrong
        # -- e.g. a 12-mock run that's all >=60% but dips to 65% partway
        # through still qualifies for BASE but must NOT silently count toward
        # SUPER's >=70% requirement. Four fully independent streak stats,
        # each evaluated against the same submission sequence, is the correct
        # (and simplest) way to keep the tiers from leaking into each other.
        _IRON_WALL_TIERS = (("BASE", 60), ("SUPER", 70), ("LEGENDARY", 75), ("MYTHIC", 80))
        for _tier_name, _floor in _IRON_WALL_TIERS:
            _stat_name = f"iron_wall_streak_{_tier_name.lower()}"
            if result_summary.percentage >= _floor:
                _streak = cls._increment_stat(db, student_id, _stat_name)
                cls._award_badge_if_qualified(db, student_id, "iron_wall", _tier_name, _streak, newly_unlocked)
            else:
                cls._set_stat(db, student_id, _stat_name, 0)

        # 12. The Veteran -- lifetime question volume across all mocks
        # (rewards sheer time/effort invested, distinct from Competitor's raw
        # mock COUNT and from Marathoner's raw TIME -- this one counts
        # individual questions answered). mock_exam.total_questions is the
        # exam's fixed question count, already relied on elsewhere in this
        # same method (see the High Achiever block above).
        if result_summary.mock_exam and result_summary.mock_exam.total_questions:
            total_questions_lifetime = cls._increment_stat(db, student_id, "veteran_questions", result_summary.mock_exam.total_questions)
            cls._award_badge_if_qualified(db, student_id, "veteran", "BASE", total_questions_lifetime, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "veteran", "SUPER", total_questions_lifetime, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "veteran", "LEGENDARY", total_questions_lifetime, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "veteran", "MYTHIC", total_questions_lifetime, newly_unlocked)

        # 13. Last-Minute Hero -- submits within the final 10% of the
        # assignment window and still scores >=80% (mirror of Early Bird).
        # Only fires when the assignment actually has a due_at -- many
        # assignments don't set one (nullable), in which case there is no
        # "window" to be late/early against and this family simply never
        # fires for that submission, same pattern Early Bird already uses for
        # assignments with no assigned_at.
        if (result_summary.percentage >= 80 and result_summary.mock_assignment
                and result_summary.mock_assignment.assigned_at and result_summary.mock_assignment.due_at
                and result_summary.completed_at):
            _completed = _make_aware(result_summary.completed_at)
            _assigned = _make_aware(result_summary.mock_assignment.assigned_at)
            _due = _make_aware(result_summary.mock_assignment.due_at)
            if _completed and _assigned and _due and _due > _assigned:
                _window = (_due - _assigned).total_seconds()
                _remaining = (_due - _completed).total_seconds()
                # In the final 10% of the window, and not submitted after the
                # deadline (remaining < 0 means late, not "last-minute").
                if 0 <= _remaining <= _window * 0.1:
                    count = cls._increment_stat(db, student_id, "last_minute_hero_mocks")
                    cls._award_badge_if_qualified(db, student_id, "last_minute_hero", "BASE", count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "last_minute_hero", "SUPER", count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "last_minute_hero", "LEGENDARY", count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "last_minute_hero", "MYTHIC", count, newly_unlocked)

        # 14. Section Specialist -- 100% on every question of one
        # concept/section within a mock, at least N times across different
        # mocks. concept_performance_json is populated at grading time (see
        # competition_mock_attempt_service.py) as a list of
        # {"concept", "correct", "total", "percentage"} -- a clean section
        # clear is total > 0 and correct == total. Counts once per QUALIFYING
        # MOCK (any one clean section is enough), not once per clean section,
        # matching the family's "N times across different mocks" wording.
        if result_summary.concept_performance_json:
            try:
                _concept_perf = json.loads(result_summary.concept_performance_json)
            except (TypeError, ValueError):
                _concept_perf = []
            if isinstance(_concept_perf, list) and any(
                isinstance(_c, dict) and _c.get("total", 0) > 0 and _c.get("correct", 0) == _c.get("total", 0)
                for _c in _concept_perf
            ):
                count = cls._increment_stat(db, student_id, "section_specialist_mocks")
                cls._award_badge_if_qualified(db, student_id, "section_specialist", "BASE", count, newly_unlocked)
                cls._award_badge_if_qualified(db, student_id, "section_specialist", "SUPER", count, newly_unlocked)
                cls._award_badge_if_qualified(db, student_id, "section_specialist", "LEGENDARY", count, newly_unlocked)
                cls._award_badge_if_qualified(db, student_id, "section_specialist", "MYTHIC", count, newly_unlocked)

        # ====================================================================
        # PHASE 3 (2026-07-30, re-implemented) -- Level Mastery: one badge
        # family per active Level (BASE/SUPER/LEGENDARY), dynamically derived
        # rather than a hardcoded list so a newly-added Level never needs a
        # code change here. See _evaluate_level_mastery() above.
        # ====================================================================
        cls._evaluate_level_mastery(db, student_id, result_summary, newly_unlocked)

        db.commit()

        # Format output
        unlocked_list = []
        for b in newly_unlocked:
            unlocked_list.append({
                "id": b.id,
                "code": b.code,
                "name": b.name,
                "description": b.description,
                "icon_name": b.icon_name,
                "tier": b.tier
            })
        return unlocked_list

    @classmethod
    def seed_badges(cls, db: Session):
        badges_data = [
            # Perfectionist
            ("perfectionist", "BASE", "The Perfectionist", "Score 100% on a Mock Exam", "Target", 1),
            ("perfectionist", "SUPER", "Super Perfectionist", "Score 100% on 5 Mock Exams", "Focus", 5),
            ("perfectionist", "LEGENDARY", "Legendary Perfectionist", "Score 100% on 10 Mock Exams", "Scan", 10),
            
            # Speed Demon
            ("speed_demon", "BASE", "Speed Demon", "Finish under 50% time with > 80% accuracy", "Zap", 1),
            ("speed_demon", "SUPER", "Super Speed Demon", "Achieve Speed Demon 5 times", "FastForward", 5),
            ("speed_demon", "LEGENDARY", "Legendary Speed Demon", "Achieve Speed Demon 15 times", "Rocket", 15),

            # Competitor
            ("competitor", "BASE", "The Competitor", "Complete your 1st Mock Exam", "Medal", 1),
            ("competitor", "SUPER", "Super Competitor", "Complete 10 Mock Exams", "Flag", 10),
            ("competitor", "LEGENDARY", "Legendary Competitor", "Complete 50 Mock Exams", "Crown", 50),

            # Unstoppable Streak
            ("unstoppable_streak", "BASE", "Unstoppable Streak", "Score > 90% on 2 consecutive Mock Exams", "Flame", 2),
            ("unstoppable_streak", "SUPER", "Super Unstoppable Streak", "Score > 90% on 5 consecutive Mock Exams", "Activity", 5),
            ("unstoppable_streak", "LEGENDARY", "Legendary Streak", "Score > 90% on 10 consecutive Mock Exams", "Infinity", 10),

            # Early Bird
            ("early_bird", "BASE", "Early Bird", "Submit a Mock Exam within 24 hours of assignment", "Clock", 1),
            ("early_bird", "SUPER", "Super Early Bird", "Submit early 5 times", "Sun", 5),
            ("early_bird", "LEGENDARY", "Legendary Early Bird", "Submit early 10 times", "AlarmClock", 10),

            # Comeback Kid
            ("comeback_kid", "BASE", "The Comeback Kid", "Improve your score by > 20% compared to previous exam", "TrendingUp", 1),
            ("comeback_kid", "SUPER", "Super Comeback Kid", "Achieve 3 comeback improvements", "ArrowUpRight", 3),
            ("comeback_kid", "LEGENDARY", "Legendary Comeback Kid", "Achieve 5 comeback improvements", "ChevronsUp", 5),

            # Podium Finisher
            ("podium_finisher", "BASE", "Podium Finisher", "Rank in the Top 3 of any Mock Exam", "Trophy", 1),
            ("podium_finisher", "SUPER", "Super Podium Finisher", "Rank in the Top 3 for 5 Mock Exams", "Star", 5),
            ("podium_finisher", "LEGENDARY", "The Champion", "Rank 1st Place on 5 Mock Exams", "Sparkles", 5),

            # The Sharpshooter
            ("sharpshooter", "BASE", "The Sharpshooter", "Score 100% accuracy while using > 90% of your time", "Crosshair", 1),
            ("sharpshooter", "SUPER", "Super Sharpshooter", "Achieve Sharpshooter 3 times", "Aperture", 3),
            ("sharpshooter", "LEGENDARY", "Legendary Sharpshooter", "Achieve Sharpshooter 10 times", "Radar", 10),

            # The Underdog
            ("underdog", "BASE", "The Underdog", "Score > 80% on an exam immediately after scoring < 50%", "Shield", 1),
            ("underdog", "SUPER", "Super Underdog", "Achieve Underdog 3 times", "Anchor", 3),
            ("underdog", "LEGENDARY", "Legendary Underdog", "Achieve Underdog 5 times", "Mountain", 5),

            # The High Achiever (formerly Polymath)
            ("polymath", "BASE", "The High Achiever", "Score > 80% on 3 Mock Exams", "Brain", 3),
            ("polymath", "SUPER", "Super Achiever", "Score > 80% on 15 Mock Exams", "Lightbulb", 15),
            ("polymath", "LEGENDARY", "Legendary Achiever", "Score > 80% on 30 Mock Exams", "Library", 30),

            # ================================================================
            # MYTHIC TIER (2026-07-28, Phase 1 of the 69-badge build-out) --
            # a 4th tier above Legendary for all 10 existing families, roughly
            # 2-3x each family's Legendary threshold per
            # docs/GAMIFICATION_BADGE_CATALOG_PROPOSAL_2026-07-25.md. Every
            # icon_name below is a brand-new string (verified against every
            # icon_name above) so none of the 30 existing badges change
            # appearance. "perfectionist"/MYTHIC reuses "PerfectionistGemMythic",
            # the glyph/environment/colour already built and signed off in the
            # reference batch -- the other 9 are new frontend work.
            # ================================================================
            ("perfectionist", "MYTHIC", "Mythic Perfectionist", "Score 100% on 25 Mock Exams", "PerfectionistGemMythic", 25),
            ("speed_demon", "MYTHIC", "Mythic Speed Demon", "Achieve Speed Demon 40 times", "SpeedCometMythic", 40),
            ("competitor", "MYTHIC", "Mythic Competitor", "Complete 150 Mock Exams", "CrownMythic", 150),
            ("unstoppable_streak", "MYTHIC", "Mythic Streak", "Score > 90% on 25 consecutive Mock Exams", "InfinityMythic", 25),
            ("early_bird", "MYTHIC", "Mythic Early Bird", "Submit early 30 times", "DawnBreakMythic", 30),
            ("comeback_kid", "MYTHIC", "Mythic Comeback Kid", "Achieve 12 comeback improvements", "PhoenixSurgeMythic", 12),
            ("podium_finisher", "MYTHIC", "The Immortal", "Rank 1st Place on 15 Mock Exams", "LaurelCrownMythic", 15),
            ("sharpshooter", "MYTHIC", "Mythic Sharpshooter", "Achieve Sharpshooter 25 times", "PrecisionCoreMythic", 25),
            ("underdog", "MYTHIC", "Mythic Underdog", "Achieve Underdog 12 times", "SummitMythic", 12),
            ("polymath", "MYTHIC", "Mythic Achiever", "Score > 80% on 75 Mock Exams", "OracleMythic", 75),

            # ================================================================
            # PHASE 2 (2026-07-28) -- 5 brand-new skill-badge families, all 4
            # tiers each, per docs/GAMIFICATION_BADGE_CATALOG_PROPOSAL_2026-07-25.md
            # Section 1a. icon_name strings are final bespoke marks (this
            # project's established convention after the mock-exam elevation
            # batches -- no badge resolves through a stock lucide icon
            # anymore), not placeholders to be swapped later.
            # ================================================================

            # Marathoner -- cumulative time invested (seconds; see the
            # matching comment in evaluate_mock_exam_submission for why
            # required_count is in raw seconds rather than hours).
            ("marathoner", "BASE", "Marathoner", "Spend 3 hours total completing Mock Exams", "MarathonTrail", 10800),
            ("marathoner", "SUPER", "Super Marathoner", "Spend 10 hours total completing Mock Exams", "MarathonSurge", 36000),
            ("marathoner", "LEGENDARY", "Legendary Marathoner", "Spend 25 hours total completing Mock Exams", "MarathonHorizon", 90000),
            ("marathoner", "MYTHIC", "Mythic Marathoner", "Spend 60 hours total completing Mock Exams", "MarathonEternal", 216000),

            # Iron Wall -- escalating consistency floor + run length.
            ("iron_wall", "BASE", "Iron Wall", "Never score below 60% across 5 straight Mock Exams", "IronWallBrick", 5),
            ("iron_wall", "SUPER", "Super Iron Wall", "Never score below 70% across 10 straight Mock Exams", "IronWallBastion", 10),
            ("iron_wall", "LEGENDARY", "Legendary Iron Wall", "Never score below 75% across 20 straight Mock Exams", "IronWallRampart", 20),
            ("iron_wall", "MYTHIC", "Mythic Iron Wall", "Never score below 80% across 40 straight Mock Exams", "IronWallCitadel", 40),

            # The Veteran -- lifetime question volume.
            ("veteran", "BASE", "The Veteran", "Answer 250 questions across all Mock Exams", "VeteranChevron", 250),
            ("veteran", "SUPER", "Super Veteran", "Answer 1,000 questions across all Mock Exams", "VeteranMedallion", 1000),
            ("veteran", "LEGENDARY", "Legendary Veteran", "Answer 3,000 questions across all Mock Exams", "VeteranStandard", 3000),
            ("veteran", "MYTHIC", "Mythic Veteran", "Answer 7,500 questions across all Mock Exams", "VeteranLegacy", 7500),

            # Last-Minute Hero -- mirror of Early Bird.
            ("last_minute_hero", "BASE", "Last-Minute Hero", "Submit in the final 10% of the assignment window and score 80%+", "LastMinuteSpark", 1),
            ("last_minute_hero", "SUPER", "Super Last-Minute Hero", "Achieve Last-Minute Hero 5 times", "LastMinuteFlash", 5),
            ("last_minute_hero", "LEGENDARY", "Legendary Last-Minute Hero", "Achieve Last-Minute Hero 15 times", "LastMinuteBlaze", 15),
            ("last_minute_hero", "MYTHIC", "Mythic Last-Minute Hero", "Achieve Last-Minute Hero 30 times", "LastMinuteEclipse", 30),

            # Section Specialist -- a clean 100% section within a mock.
            ("section_specialist", "BASE", "Section Specialist", "Score 100% on one full concept/section within a Mock Exam, 3 times", "SectionSpecialistNode", 3),
            ("section_specialist", "SUPER", "Super Section Specialist", "Achieve Section Specialist 10 times", "SectionSpecialistGrid", 10),
            ("section_specialist", "LEGENDARY", "Legendary Section Specialist", "Achieve Section Specialist 25 times", "SectionSpecialistMatrix", 25),
            ("section_specialist", "MYTHIC", "Mythic Section Specialist", "Achieve Section Specialist 50 times", "SectionSpecialistNexus", 50),

            # 1. The Ironclad Discipline
            ("dps_discipline", "BASE", "Ironclad Discipline", "Complete all 5 DPS sheets in a single week", "DpsIronAnvil", 1),
            ("dps_discipline", "SUPER", "Super Ironclad Discipline", "Complete all 5 DPS sheets for 4 consecutive weeks", "DpsSteelAnvil", 4),
            ("dps_discipline", "LEGENDARY", "Legendary Ironclad Discipline", "Complete all 5 DPS sheets for 12 consecutive weeks", "DpsObsidianAnvil", 12),
            ("dps_discipline", "MYTHIC", "Mythic Ironclad Discipline", "Complete all 5 DPS sheets for 36 consecutive weeks", "DpsCelestialAnvil", 36),

            # 2. The Pure Crystal
            ("dps_crystal", "BASE", "Pure Crystal", "Score 100% on 5 different DPS sheets", "DpsQuartzCrystal", 5),
            ("dps_crystal", "SUPER", "Super Pure Crystal", "Score 100% on 25 different DPS sheets", "DpsSapphireCrystal", 25),
            ("dps_crystal", "LEGENDARY", "Legendary Pure Crystal", "Score 100% on 75 different DPS sheets", "DpsRubyCrystal", 75),
            ("dps_crystal", "MYTHIC", "Mythic Pure Crystal", "Score 100% on 200 different DPS sheets", "DpsDiamondCrystal", 200),

            # 3. The Boundless Tome
            ("dps_tome", "BASE", "Boundless Tome", "Complete 25 DPS sheets", "DpsLeatherTome", 25),
            ("dps_tome", "SUPER", "Super Boundless Tome", "Complete 100 DPS sheets", "DpsSilverTome", 100),
            ("dps_tome", "LEGENDARY", "Legendary Boundless Tome", "Complete 350 DPS sheets", "DpsAstralTome", 350),
            ("dps_tome", "MYTHIC", "Mythic Boundless Tome", "Complete 500 DPS sheets", "DpsBoundlessTome", 500),

            # 4. The Lightning Quill
            ("dps_quill", "BASE", "Lightning Quill", "Finish 5 DPS sheets in under 50% of the allocated time with >90% accuracy", "DpsBronzeQuill", 5),
            ("dps_quill", "SUPER", "Super Lightning Quill", "Achieve Lightning Quill on 25 DPS sheets", "DpsSilverQuill", 25),
            ("dps_quill", "LEGENDARY", "Legendary Lightning Quill", "Achieve Lightning Quill on 75 DPS sheets", "DpsRadiantQuill", 75),
            ("dps_quill", "MYTHIC", "Mythic Lightning Quill", "Achieve Lightning Quill on 150 DPS sheets", "DpsLightningQuill", 150),

            # 5. The Sage's Eye
            ("dps_sage", "BASE", "Sage's Eye", "Use >95% of the allocated time and score exactly 100% accuracy on 5 DPS sheets", "DpsBronzeHourglass", 5),
            ("dps_sage", "SUPER", "Super Sage's Eye", "Achieve Sage's Eye on 20 DPS sheets", "DpsSilverHourglass", 20),
            ("dps_sage", "LEGENDARY", "Legendary Sage's Eye", "Achieve Sage's Eye on 50 DPS sheets", "DpsGoldenHourglass", 50),
            ("dps_sage", "MYTHIC", "Mythic Sage's Eye", "Achieve Sage's Eye on 100 DPS sheets", "DpsCelestialEye", 100),

            # 6. The Unbroken Chain
            ("dps_chain", "BASE", "Unbroken Chain", "Attempt 100% of the questions (zero unanswered) on 10 consecutive DPS sheets", "DpsIronChain", 10),
            ("dps_chain", "SUPER", "Super Unbroken Chain", "Attempt 100% of the questions on 50 consecutive DPS sheets", "DpsSteelChain", 50),
            ("dps_chain", "LEGENDARY", "Legendary Unbroken Chain", "Attempt 100% of the questions on 120 consecutive DPS sheets", "DpsDiamondChain", 120),
            ("dps_chain", "MYTHIC", "Mythic Unbroken Chain", "Attempt 100% of the questions on 250 consecutive DPS sheets", "DpsUnbrokenMechanism", 250),

            # 7. The Rising Phoenix
            ("dps_phoenix", "BASE", "Rising Phoenix", "Score <50% on a DPS, then score >90% on your very next DPS", "DpsAshFeather", 1),
            ("dps_phoenix", "SUPER", "Super Rising Phoenix", "Achieve The Phoenix 5 times", "DpsEmberWing", 5),
            ("dps_phoenix", "LEGENDARY", "Legendary Rising Phoenix", "Achieve The Phoenix 15 times", "DpsSolarRebirth", 15),
            ("dps_phoenix", "MYTHIC", "Mythic Rising Phoenix", "Achieve The Phoenix 30 times", "DpsGoldenPhoenix", 30),

            # 8. The Master's Anvil
            ("dps_anvil", "BASE", "Master's Anvil", "Fail a DPS attempt, but immediately use a retry and score 100%", "DpsResilienceHammer", 1),
            ("dps_anvil", "SUPER", "Super Master's Anvil", "Achieve Master's Anvil 10 times", "DpsResilienceAnvil", 10),
            ("dps_anvil", "LEGENDARY", "Legendary Master's Anvil", "Achieve Master's Anvil 30 times", "DpsResilienceForge", 30),
            ("dps_anvil", "MYTHIC", "Mythic Master's Anvil", "Achieve Master's Anvil 60 times", "DpsResilienceCore", 60),

            # 9. The Midnight Oil
            ("dps_midnight", "BASE", "Midnight Oil", "Complete 5 DPS sheets on a weekend (Saturday/Sunday)", "DpsMidnightLantern", 5),
            ("dps_midnight", "SUPER", "Super Midnight Oil", "Complete 25 DPS sheets on weekends", "DpsMidnightStar", 25),
            ("dps_midnight", "LEGENDARY", "Legendary Midnight Oil", "Complete 75 DPS sheets on weekends", "DpsMidnightMoon", 75),
            ("dps_midnight", "MYTHIC", "Mythic Midnight Oil", "Complete 150 DPS sheets on weekends", "DpsMidnightGalaxy", 150),

            # 10. The Golden Compass
            ("dps_compass", "BASE", "Golden Compass", "Score >90% on the very first attempt (no retries) for 10 DPS sheets", "DpsCompassBronze", 10),
            ("dps_compass", "SUPER", "Super Golden Compass", "Score >90% on the very first attempt for 40 DPS sheets", "DpsCompassSilver", 40),
            ("dps_compass", "LEGENDARY", "Legendary Golden Compass", "Score >90% on the very first attempt for 100 DPS sheets", "DpsCompassGold", 100),
            ("dps_compass", "MYTHIC", "Mythic Golden Compass", "Score >90% on the very first attempt for 250 DPS sheets", "DpsCompassAstral", 250),

        ]

        for code, tier, name, desc, icon, req in badges_data:
            try:
                existing = db.query(AchievementBadge).filter_by(code=code, tier=tier).first()
                if not existing:
                    b = AchievementBadge(code=code, tier=tier, name=name, description=desc, icon_name=icon, required_count=req)
                    db.add(b)
                else:
                    existing.name = name
                    existing.description = desc
                    existing.icon_name = icon
                    existing.required_count = req
                db.commit()
            except Exception as e:
                db.rollback()
                print(f"Failed to seed badge {code}-{tier}: {e}")

        # ====================================================================
        # PHASE 3 (2026-07-30, re-implemented) -- Level Mastery, seeded
        # dynamically from the Level table rather than a hardcoded list, so
        # this never needs a code change when a Level is added (e.g. future
        # MM levels beyond MM-L1). One row per tier per active Level -- today
        # that's 13 active Levels (YLM x3, PM x4, BM x1, IM x4, MM x1) x 3
        # tiers = 39 badges. icon_name/code derivation must exactly match
        # what the frontend (badgeGlyphs.tsx / badgeVisuals.ts / the dev
        # preview harness) was built against -- see the derivation helpers
        # above this class.
        # ====================================================================
        active_levels = db.query(Level).filter(Level.is_active == True).all()
        for level in active_levels:
            if not level.level_code:
                continue
            key = _level_mastery_key(level.level_code)
            pascal = _level_mastery_pascal(level.level_code)
            display = _level_mastery_display(level.level_code)
            code = f"level_mastery_{key}"
            for tier, tier_label in _LEVEL_MASTERY_TIER_LABELS.items():
                try:
                    name = f"{display} -- {tier_label}"
                    desc = _level_mastery_description(tier, display)
                    icon = f"LevelMastery{pascal}{tier_label}"
                    req = _LEVEL_MASTERY_REQUIRED_COUNT[tier]
                    existing = db.query(AchievementBadge).filter_by(code=code, tier=tier).first()
                    if not existing:
                        b = AchievementBadge(code=code, tier=tier, name=name, description=desc, icon_name=icon, required_count=req)
                        db.add(b)
                    else:
                        existing.name = name
                        existing.description = desc
                        existing.icon_name = icon
                        existing.required_count = req
                    db.commit()
                except Exception as e:
                    db.rollback()
                    print(f"Failed to seed level mastery badge {code}-{tier}: {e}")
