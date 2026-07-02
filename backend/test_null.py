from app.database import SessionLocal
from app.models.models import CompetitionMockResultSummary
from app.services.achievements import AchievementEngine
import uuid

db = SessionLocal()
try:
    s1 = db.query(CompetitionMockResultSummary).first()
    s3 = CompetitionMockResultSummary(
        id=str(uuid.uuid4()),
        mock_attempt_id=str(uuid.uuid4()),
        mock_assignment_id=s1.mock_assignment_id,
        mock_exam_id=s1.mock_exam_id,
        student_id=s1.student_id,
        score=100,
        max_score=100,
        percentage=100,
        accuracy_percentage=100,
        time_taken_seconds=None,
        time_utilization_percentage=None,
        performance_band="A+"
    )
    db.add(s3)
    db.commit()
    print("Added third summary!")
    badges = AchievementEngine.evaluate_mock_exam_submission(db, s3.student_id, s3)
    print("Success:", badges)
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
