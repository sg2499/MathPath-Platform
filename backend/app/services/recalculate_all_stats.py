from sqlalchemy.orm import Session
from sqlalchemy import text
from app.database import SessionLocal
from app.models.models import Student, CompetitionMockResultSummary, Notification
from app.services.achievements import AchievementEngine
from app.services.notifications import CreateNotification
import logging

def recalculate_all_gamification_stats() -> None:
    """Holistic master reset of all gamification stats and badges."""
    db = SessionLocal()
    try:
        logging.info("Starting holistic gamification master reset...")
        
        # 1. Ensure basic badges exist
        AchievementEngine.seed_badges(db)
        
        # 2. Hard wipe all existing gamification tracking data
        db.execute(text("DELETE FROM student_achievement_stats"))
        db.execute(text("DELETE FROM student_badges"))
        db.commit() # Commit the wipe so evaluations start fresh
        
        # 3. Chronologically re-evaluate all students
        students = db.query(Student).all()
        for student in students:
            if not student.user_id:
                continue
                
            results = db.query(CompetitionMockResultSummary).filter(
                CompetitionMockResultSummary.student_id == student.id
            ).order_by(CompetitionMockResultSummary.submitted_at.asc()).all()
            
            for r in results:
                try:
                    # Feed it through the engine
                    newly_unlocked = AchievementEngine.evaluate_mock_exam_submission(db, student.id, r)
                    
                    # Safely handle notifications to prevent spam
                    for b in newly_unlocked:
                        try:
                            # Check if the user ALREADY received a notification for this exact badge
                            existing_notif = db.query(Notification).filter(
                                Notification.recipient_user_id == student.user_id,
                                Notification.type == "BADGE_UNLOCKED",
                                Notification.title.ilike(f"%{b.get('name')}%")
                            ).first()
                            
                            if not existing_notif:
                                CreateNotification(
                                    db,
                                    recipient_user_id=student.user_id,
                                    recipient_role="STUDENT",
                                    type="BADGE_UNLOCKED",
                                    category="GAMIFICATION",
                                    title=f"New Badge Unlocked: {b.get('name')}",
                                    message=f"You unlocked the {b.get('tier')} tier '{b.get('name')}' badge for: {b.get('description')}!",
                                    target_route=f"/student/achievements?badge={b.get('code')}_{b.get('tier')}",
                                    color_variant="PURPLE",
                                    metadata={"badgeId": b.get('id'), "tier": b.get('tier'), "code": b.get('code'), "icon": b.get('icon_name')}
                                )
                        except Exception as ne:
                            logging.error(f"Failed safe retro badge notif: {ne}")
                except Exception as eval_e:
                    logging.error(f"Failed to evaluate mock {r.id}: {eval_e}")
                    
        db.commit()
        logging.info("Master gamification reset complete.")
    except Exception as e:
        db.rollback()
        logging.error(f"Failed master gamification reset: {e}")
    finally:
        db.close()
