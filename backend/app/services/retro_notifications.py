from sqlalchemy.orm import Session
from app.database import SessionLocal, engine
from app.models.models import CompetitionMockResultSummary, User, Student, CompetitionMockAttempt, CompetitionMockExam, Notification
from app.services.notifications import CreateNotification
import logging

def ensure_mock_student_notifications_retroactive() -> None:
    """Retroactively create MOCK_EXAM_COMPLETED notifications for students."""
    db = SessionLocal()
    try:
        summaries = db.query(CompetitionMockResultSummary).all()
        for summary in summaries:
            attempt = db.get(CompetitionMockAttempt, summary.mock_attempt_id)
            if not attempt: continue
            student = db.get(Student, attempt.student_id)
            if not student: continue
            
            existing = db.query(Notification).filter_by(
                recipient_user_id=student.user_id,
                type="MOCK_EXAM_COMPLETED",
                attempt_id=attempt.id
            ).first()

            if not existing:
                exam = db.get(CompetitionMockExam, attempt.mock_exam_id) if attempt.mock_exam_id else None
                if exam:
                    try:
                        CreateNotification(
                            db,
                            recipient_user_id=student.user_id,
                            recipient_role="STUDENT",
                            type="MOCK_EXAM_COMPLETED",
                            category="COMPETITION_MOCK",
                            title="Mock Exam Completed",
                            message=f"You successfully submitted {exam.title or exam.mock_code}. Score: {int(round(attempt.total_score or 0))}/{int(round(attempt.max_score or 0))} ({int(round(attempt.percentage or 0))}%)",
                            actor_user_id=student.user_id,
                            actor_role="STUDENT",
                            student_id=student.id,
                            attempt_id=attempt.id,
                            color_variant="blue",
                            metadata={
                                "event": "MOCK_EXAM_COMPLETED"
                            }
                        )
                        db.commit()
                    except Exception as e:
                        db.rollback()
                        logging.error(f"Failed to create retro notification: {e}")
    except Exception as e:
        logging.error(f"Failed to retroactive mock notifications: {e}")
    finally:
        db.close()
