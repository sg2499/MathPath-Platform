from app.database import SessionLocal
from app.models.models import CompetitionMockResultSummary
from app.services.achievements import AchievementEngine

db = SessionLocal()
try:
    summary = db.query(CompetitionMockResultSummary).first()
    if summary:
        print("Evaluating...")
        badges = AchievementEngine.evaluate_mock_exam_submission(db, summary.student_id, summary)
        print("Success!", badges)
    else:
        print("No summary found")
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
