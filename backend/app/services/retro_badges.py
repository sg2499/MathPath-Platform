from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models.models import StudentBadge, Notification, StudentAchievementStat, User, Student, CompetitionMockResultSummary
import logging

def fix_false_unstoppable_badges() -> None:
    """Removes Unstoppable Streak badges falsely awarded due to retro script running multiple times."""
    db = SessionLocal()
    try:
        students = db.query(Student).all()
        for student in students:
            # count total mocks they ever submitted with > 90%
            mock_count = db.query(CompetitionMockResultSummary).filter(
                CompetitionMockResultSummary.student_id == student.id,
                CompetitionMockResultSummary.percentage >= 90
            ).count()
            
            # Reset the streak stat
            stat = db.query(StudentAchievementStat).filter(
                StudentAchievementStat.student_id == student.id,
                StudentAchievementStat.stat_key == "unstoppable_mock_streak"
            ).first()
            if stat and stat.stat_value > mock_count:
                stat.stat_value = mock_count
                
            # If they don't have enough mocks for BASE streak (2)
            if mock_count < 2:
                db.query(StudentBadge).filter(
                    StudentBadge.student_id == student.id,
                    StudentBadge.badge_code == "unstoppable_streak"
                ).delete()
                
                user = db.query(User).filter(User.id == student.user_id).first()
                if user:
                    db.query(Notification).filter(
                        Notification.recipient_user_id == user.id,
                        Notification.type == "BADGE_UNLOCKED",
                        Notification.title.ilike("%Unstoppable Streak%")
                    ).delete()
        
        db.commit()
    except Exception as e:
        db.rollback()
        logging.error(f"Failed to fix false unstoppable badges: {e}")
    finally:
        db.close()
