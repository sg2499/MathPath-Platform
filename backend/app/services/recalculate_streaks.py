from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import SessionLocal
from app.models.models import Student, CompetitionMockResultSummary, StudentAchievementStat, StudentBadge, AchievementBadge
import logging

def recalculate_unstoppable_streaks() -> None:
    """Properly recalculates the unstoppable_mock_streak by walking through historical exams chronologically."""
    db = SessionLocal()
    try:
        from app.services.achievements import AchievementEngine
        
        # Make sure base badges are seeded
        AchievementEngine.seed_badges(db)

        students = db.query(Student).all()
        for student in students:
            # Get all mock results chronologically. Note: this model has no
            # submitted_at column -- completed_at is the real chronological
            # field (see CompetitionMockResultSummary in models.py). This
            # was previously referencing a column that doesn't exist and
            # would have raised AttributeError on any call; fixed as part of
            # the full student-portal audit. Confirmed unused by any live
            # code path -- kept as a manual reconciliation tool in case the
            # live per-submission increment/reset logic in
            # AchievementEngine.evaluate_mock_exam_submission() ever drifts
            # from the true historical record.
            results = db.query(CompetitionMockResultSummary).filter(
                CompetitionMockResultSummary.student_id == student.id
            ).order_by(CompetitionMockResultSummary.completed_at.asc()).all()
            
            streak = 0
            for r in results:
                if r.percentage >= 90:
                    streak += 1
                else:
                    streak = 0
            
            # Update the streak stat
            stat = db.query(StudentAchievementStat).filter(
                StudentAchievementStat.student_id == student.id,
                StudentAchievementStat.stat_name == "unstoppable_mock_streak"
            ).first()
            
            if not stat:
                stat = StudentAchievementStat(
                    student_id=student.id,
                    stat_name="unstoppable_mock_streak",
                    stat_value=streak
                )
                db.add(stat)
            else:
                stat.stat_value = streak
                
            db.flush()
            
            newly_unlocked = []
            # Re-award the badge if they genuinely met the condition and don't have it
            if streak >= 2:
                AchievementEngine._award_badge_if_qualified(db, student.id, "unstoppable_streak", "BASE", streak, newly_unlocked)
            if streak >= 5:
                AchievementEngine._award_badge_if_qualified(db, student.id, "unstoppable_streak", "SUPER", streak, newly_unlocked)
            if streak >= 10:
                AchievementEngine._award_badge_if_qualified(db, student.id, "unstoppable_streak", "LEGENDARY", streak, newly_unlocked)
            
            for b in newly_unlocked:
                try:
                    from app.services.notifications import CreateNotification
                    CreateNotification(
                        db,
                        recipient_user_id=student.user_id,
                        recipient_role="STUDENT",
                        type="BADGE_UNLOCKED",
                        category="GAMIFICATION",
                        title=f"New Badge Unlocked: {b.name}",
                        message=f"You unlocked the {b.tier} tier '{b.name}' badge for: {b.description}!",
                        target_route=f"/student/achievements?badge={b.code}_{b.tier}",
                        color_variant="PURPLE",
                        metadata={"badgeId": b.id, "tier": b.tier, "code": b.code, "icon": b.icon_name}
                    )
                except Exception as ne:
                    logging.error(f"Failed retroactive badge notif: {ne}")
                
        db.commit()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to recalculate unstoppable streaks: {e}")
    finally:
        db.close()
