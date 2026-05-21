from sqlalchemy.orm import Session
from app.models import User, Student, Teacher
from app.core.security import verify_password, create_access_token
from app.core.errors import api_error


def user_login_id(user: User, student: Student | None = None, teacher: Teacher | None = None) -> str | None:
    if user.email:
        return user.email
    if user.phone:
        return user.phone
    if student and student.student_code:
        return student.student_code
    if teacher and teacher.teacher_code:
        return teacher.teacher_code
    return None


def user_payload(db: Session, user: User) -> dict:
    student = None
    teacher = None

    if user.role == "STUDENT":
        student = db.query(Student).filter(Student.user_id == user.id).first()

    if user.role == "TEACHER":
        teacher = db.query(Teacher).filter(Teacher.user_id == user.id).first()

    data = {
        "id": user.id,
        "fullName": user.full_name,
        "role": user.role,
        "email": user.email,
        "phone": user.phone,
        "loginId": user_login_id(user, student, teacher),
        "isActive": user.is_active,
        "profilePhotoUrl": user.photo_url,
    }

    if student:
        data["profilePhotoUrl"] = student.photo_url or user.photo_url
        data["student"] = {
            "id": student.id,
            "studentCode": student.student_code,
            "customId": student.custom_id,
            "currentModuleId": student.current_module_id,
            "currentLevelId": student.current_level_id,
            "photoUrl": student.photo_url,
            "signatureUrl": student.signature_url,
            "className": student.class_name,
            "section": student.section,
            "teacher": student.teacher,
        }

    if teacher:
        data["profilePhotoUrl"] = teacher.photo_url or user.photo_url
        data["teacher"] = {
            "id": teacher.id,
            "teacherCode": teacher.teacher_code,
            "photoUrl": teacher.photo_url,
            "signatureUrl": teacher.signature_url,
            "designation": teacher.designation,
            "subjectSpecialization": teacher.subject_specialization,
        }

    return data


def login(db: Session, identifier: str, password: str) -> dict:
    cleaned_identifier = identifier.strip() if identifier else ""
    user = db.query(User).filter((User.email == cleaned_identifier) | (User.phone == cleaned_identifier)).first()

    if not user:
        student = db.query(Student).filter(Student.student_code == cleaned_identifier).first()
        user = student.user if student else None

    if not user:
        teacher = db.query(Teacher).filter(Teacher.teacher_code == cleaned_identifier).first()
        user = teacher.user if teacher else None

    if not user or not verify_password(password, user.password_hash):
        api_error(401, "INVALID_CREDENTIALS", "Invalid login details.")

    if not user.is_active:
        api_error(403, "ACCOUNT_INACTIVE", "This account is inactive. Please contact the admin.")

    token = create_access_token(user.id, user.role)
    return {
        "accessToken": token,
        "tokenType": "Bearer",
        "user": user_payload(db, user),
    }
