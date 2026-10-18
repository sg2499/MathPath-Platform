"""Birthdays (2026-10-18, Shailesh).

Replaces the old portal's Birthday Students page. Plan:
`claude/mathpath-birthdays-plan-oct18.md` in the project.

  * birthday_wishes     the set of warm wishes a birthday greeting is drawn
                        from (seeded once, then edited by admins).
  * birthday_greetings  one row per student per year: the wish they got, as
                        it read on the day. The unique key on
                        (student_id, year) makes the morning job safe to run
                        again and again, from several workers at once.
"""
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.sql import func

from app.database import Base
from app.models.models import uuid_str


class BirthdayWish(Base):
    """One wish. `text` may use {name} (first name), {age} and {level}
    (the student's current level code). A wish with {level} is only given
    to a student who has a current level."""

    __tablename__ = "birthday_wishes"
    id = Column(String, primary_key=True, default=uuid_str)
    # stable key for seeded wishes ("warm-01"), so seeding never adds a
    # wish twice and never overwrites an admin's edit
    seed_key = Column(String(40), unique=True, nullable=True)
    text = Column(Text, nullable=False)
    style = Column(String(20), nullable=False)  # WARM, PLAYFUL, PROUD, MATHS, SHORT
    age_band = Column(String(20), nullable=False, default="ALL")  # ALL, YOUNG, MIDDLE, OLDER
    needs_level = Column(Boolean, nullable=False, default=False)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    updated_by_user_id = Column(String, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


class BirthdayGreeting(Base):
    """A student's greeting for one year's birthday."""

    __tablename__ = "birthday_greetings"
    id = Column(String, primary_key=True, default=uuid_str)
    student_id = Column(String, ForeignKey("students.id", ondelete="CASCADE"), nullable=False, index=True)
    year = Column(Integer, nullable=False)
    # the day it was celebrated: 28 Feb for a 29 Feb birthday in other years
    birthday_date = Column(Date, nullable=False, index=True)
    wish_id = Column(String, ForeignKey("birthday_wishes.id", ondelete="SET NULL"), nullable=True, index=True)
    # the wish as the student read it (editing a wish later changes nothing here)
    rendered_text = Column(Text, nullable=False)
    age = Column(Integer, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    notified_student_at = Column(DateTime(timezone=True), nullable=True)
    notified_teacher_at = Column(DateTime(timezone=True), nullable=True)
    seen_at = Column(DateTime(timezone=True), nullable=True)
    dismissed_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (UniqueConstraint("student_id", "year", name="uq_birthday_greeting_student_year"),)
