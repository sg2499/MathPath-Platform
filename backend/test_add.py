from app.database import SessionLocal
from app.models.models import CompetitionMockResultSummary
import uuid

db = SessionLocal()
try:
    s1 = db.query(CompetitionMockResultSummary).first()
    s2 = CompetitionMockResultSummary(
        id=str(uuid.uuid4()),
        mock_attempt_id=str(uuid.uuid4()),
        mock_assignment_id=s1.mock_assignment_id,
        mock_exam_id=s1.mock_exam_id,
        student_id=s1.student_id,
        score=100,
        max_score=100,
        percentage=100,
        accuracy_percentage=100,
        time_taken_seconds=50,
        time_utilization_percentage=20,
        performance_band="A+"
    )
    db.add(s2)
    db.commit()
    print("Added second summary!")
except Exception as e:
    print("Error:", e)
finally:
    db.close()
