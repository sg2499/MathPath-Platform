from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import List, Dict, Any
from app.models.models import Student, CompetitionMockResultSummary, AchievementBadge, StudentBadge, StudentAchievementStat
from sqlalchemy import or_

def _make_aware(dt: datetime | None) -> datetime | None:
    if not dt:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt

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

    @classmethod
    def evaluate_mock_exam_submission(cls, db: Session, student_id: str, result_summary: CompetitionMockResultSummary) -> list[dict[str, Any]]:
        newly_unlocked = []
        
        # 1. The Perfectionist
        if result_summary.percentage == 100:
            count = cls._increment_stat(db, student_id, "perfect_mock_scores")
            cls._award_badge_if_qualified(db, student_id, "perfectionist", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "perfectionist", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "perfectionist", "LEGENDARY", count, newly_unlocked)

        # 2. The Speed Demon
        if result_summary.percentage >= 80 and result_summary.time_utilization_percentage and result_summary.time_utilization_percentage < 50:
            count = cls._increment_stat(db, student_id, "speed_demon_scores")
            cls._award_badge_if_qualified(db, student_id, "speed_demon", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "speed_demon", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "speed_demon", "LEGENDARY", count, newly_unlocked)

        # 3. The Competitor (Participation)
        count = cls._increment_stat(db, student_id, "mock_exams_completed")
        cls._award_badge_if_qualified(db, student_id, "competitor", "BASE", count, newly_unlocked)
        cls._award_badge_if_qualified(db, student_id, "competitor", "SUPER", count, newly_unlocked)
        cls._award_badge_if_qualified(db, student_id, "competitor", "LEGENDARY", count, newly_unlocked)

        # 4. The Unstoppable Streak
        if result_summary.percentage > 90:
            streak = cls._increment_stat(db, student_id, "unstoppable_mock_streak")
            cls._award_badge_if_qualified(db, student_id, "unstoppable_streak", "BASE", streak, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "unstoppable_streak", "SUPER", streak, newly_unlocked)
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

        # 7. The Sharpshooter
        if result_summary.percentage == 100 and result_summary.time_utilization_percentage and result_summary.time_utilization_percentage > 90:
            count = cls._increment_stat(db, student_id, "sharpshooter_mocks")
            cls._award_badge_if_qualified(db, student_id, "sharpshooter", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "sharpshooter", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "sharpshooter", "LEGENDARY", count, newly_unlocked)

        # 8. The Underdog
        if previous_summary and previous_summary.percentage < 50 and result_summary.percentage > 80:
            count = cls._increment_stat(db, student_id, "underdog_mocks")
            cls._award_badge_if_qualified(db, student_id, "underdog", "BASE", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "underdog", "SUPER", count, newly_unlocked)
            cls._award_badge_if_qualified(db, student_id, "underdog", "LEGENDARY", count, newly_unlocked)

        # 9. The Polymath (Broad Mastery)
        if result_summary.percentage > 80 and result_summary.mock_assignment:
            level_id = result_summary.mock_assignment.level_id
            from app.models.models import MasterModuleLevel
            level = db.query(MasterModuleLevel).filter_by(id=level_id).first()
            if level:
                master_module_id = level.master_module_id
                stat_name = f"polymath_mod_{master_module_id}"
                
                # Check if this module is already recorded
                existing_stat = db.query(StudentAchievementStat).filter_by(student_id=student_id, stat_name=stat_name).first()
                if not existing_stat:
                    # Record this module as passed
                    cls._set_stat(db, student_id, stat_name, 1)
                    
                    # Count how many unique modules they have passed
                    polymath_count = db.query(StudentAchievementStat).filter(
                        StudentAchievementStat.student_id == student_id,
                        StudentAchievementStat.stat_name.like("polymath_mod_%")
                    ).count()
                    
                    # Also update a master count for the frontend to easily fetch progress
                    cls._set_stat(db, student_id, "polymath_count", polymath_count)
                    
                    cls._award_badge_if_qualified(db, student_id, "polymath", "BASE", polymath_count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "polymath", "SUPER", polymath_count, newly_unlocked)
                    cls._award_badge_if_qualified(db, student_id, "polymath", "LEGENDARY", polymath_count, newly_unlocked)

        db.commit()

        # Format output
        unlocked_list = []
        for b in newly_unlocked:
            unlocked_list.append({
                "id": b.id,
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

            # The Polymath
            ("polymath", "BASE", "The Polymath", "Score > 80% across 3 different Master Modules", "Brain", 3),
            ("polymath", "SUPER", "Super Polymath", "Score > 80% across 5 different Master Modules", "Lightbulb", 5),
            ("polymath", "LEGENDARY", "Legendary Polymath", "Score > 80% across 10 different Master Modules", "Library", 10),
        ]

        for code, tier, name, desc, icon, req in badges_data:
            try:
                existing = db.query(AchievementBadge).filter_by(code=code, tier=tier).first()
                if not existing:
                    b = AchievementBadge(code=code, tier=tier, name=name, description=desc, icon_name=icon, required_count=req)
                    db.add(b)
                else:
                    existing.icon_name = icon
                db.commit()
            except Exception as e:
                db.rollback()
                print(f"Failed to seed badge {code}-{tier}: {e}")
