from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models import User, Student, Teacher
from app.core.security import verify_password, create_access_token
from app.core.errors import api_error


def public_profile_photo_url(user: User, stored_photo: str | None) -> str | None:
    if not stored_photo:
        return None
    if isinstance(stored_photo, str) and stored_photo.startswith("data:"):
        return f"/api/auth/profile-photo/{user.id}"
    return stored_photo


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
        "profilePhotoUrl": public_profile_photo_url(user, user.photo_url),
    }

    if student:
        data["profilePhotoUrl"] = public_profile_photo_url(user, student.photo_url or user.photo_url)
        data["student"] = {
            "id": student.id,
            "studentCode": student.student_code,
            "customId": student.custom_id,
            "currentModuleId": student.current_module_id,
            "currentLevelId": student.current_level_id,
            "photoUrl": public_profile_photo_url(user, student.photo_url),
            "signatureUrl": student.signature_url,
            "className": student.class_name,
            "section": student.section,
            "teacher": student.teacher,
        }

    if teacher:
        data["profilePhotoUrl"] = public_profile_photo_url(user, teacher.photo_url or user.photo_url)
        data["teacher"] = {
            "id": teacher.id,
            "teacherCode": teacher.teacher_code,
            "photoUrl": public_profile_photo_url(user, teacher.photo_url),
            "signatureUrl": teacher.signature_url,
            "designation": teacher.designation,
            "subjectSpecialization": teacher.subject_specialization,
        }

    return data


def login(db: Session, identifier: str, password: str) -> dict:
    cleaned_identifier = identifier.strip() if identifier else ""
    # Case-insensitive but exact -- deliberately not ilike(). ilike() treats
    # a raw, unescaped identifier as a SQL LIKE pattern, so a login attempt
    # containing "%" or "_" would be interpreted as a wildcard against every
    # email/code in the table instead of matched literally. func.lower(...)
    # == gives the same case-insensitive comparison without ever treating
    # user input as pattern syntax.
    lowered_identifier = cleaned_identifier.lower()
    user = db.query(User).filter(
        (func.lower(User.email) == lowered_identifier) | (User.phone == cleaned_identifier)
    ).first()

    if not user:
        student = db.query(Student).filter(func.lower(Student.student_code) == lowered_identifier).first()
        user = student.user if student else None

    if not user:
        teacher = db.query(Teacher).filter(func.lower(Teacher.teacher_code) == lowered_identifier).first()
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
