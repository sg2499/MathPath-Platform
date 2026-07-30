import json
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Dict, Any
from app.models.models import (
    Student, CompetitionMockResultSummary, AchievementBadge, StudentBadge,
    StudentAchievementStat, CompetitionMockExam, Level,
)
from sqlalchemy import or_

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
