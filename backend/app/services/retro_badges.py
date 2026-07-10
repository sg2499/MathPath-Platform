from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.models import StudentBadge, Notification, StudentAchievementStat, User, Student, CompetitionMockResultSummary
import logging

def fix_false_unstoppable_badges() -> None:
    """Removes Unstoppable Streak badges falsely awarded due to retro script running multiple times."""
    db = SessionLocal()
    try:
        # Wipe all unstoppable streak badges unconditionally (no one has legitimately earned it yet)
        db.query(StudentBadge).filter(
            StudentBadge.badge_code == "unstoppable_streak"
        ).delete()
        
        # Wipe all notifications related to unstoppable streak
        db.query(Notification).filter(
            Notification.type == "BADGE_UNLOCKED",
            Notification.title.ilike("%Unstoppable Streak%")
        ).delete()
        
        # Reset all unstoppable mock streak stats to 0
        db.query(StudentAchievementStat).filter(
            StudentAchievementStat.stat_name == "unstoppable_mock_streak"
        ).update({"stat_value": 0})
        
        db.commit()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to fix false unstoppable badges: {e}")
    finally:
        db.close()
