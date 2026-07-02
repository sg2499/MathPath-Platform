from app.database import SessionLocal
from app.models.models import Student, CompetitionMockResultSummary

db = SessionLocal()
try:
    student_model = db.query(Student).first()
    if student_model:
        all_summaries = (
            db.query(CompetitionMockResultSummary)
            .join(Student, CompetitionMockResultSummary.student_id == Student.id)
            .filter(Student.current_level_id == student_model.current_level_id)
            .order_by(
                CompetitionMockResultSummary.percentage.desc(),
                CompetitionMockResultSummary.time_taken_seconds.asc()
            )
            .all()
        )
        print("Success:", len(all_summaries))
except Exception as e:
    print("Error:", e)
finally:
    db.close()
