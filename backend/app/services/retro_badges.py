from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import SessionLocal
import logging

def fix_false_unstoppable_badges() -> None:
    """Removes Unstoppable Streak badges falsely awarded using bulletproof raw SQL."""
    db = SessionLocal()
    try:
        # 1. Wipe badges (Need to join with achievement_badges since student_badges only has badge_id)
        db.execute(text("""
            DELETE FROM student_badges 
            WHERE badge_id IN (
                SELECT id FROM achievement_badges WHERE code = 'unstoppable_streak'
            )
        """))
        
        # 2. Wipe notifications
        db.execute(text("DELETE FROM notifications WHERE type = 'BADGE_UNLOCKED' AND title ILIKE '%Unstoppable Streak%'"))
        
        # 3. Reset stats
        db.execute(text("UPDATE student_achievement_stats SET stat_value = 0 WHERE stat_name = 'unstoppable_mock_streak'"))
        
        db.commit()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to fix false unstoppable badges via raw SQL: {e}")
    finally:
        db.close()
