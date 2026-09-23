from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(512))
    quizzes: Mapped[list[Quiz]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    folders_owned: Mapped[list[CourseFolder]] = relationship(back_populates="owner", cascade="all, delete-orphan")
    folder_memberships: Mapped[list[FolderMember]] = relationship(back_populates="user", cascade="all, delete-orphan")


class CourseFolder(Base):
    __tablename__ = "course_folders"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(160))
    course_tag: Mapped[str] = mapped_column(String(80), default="")
    description: Mapped[str] = mapped_column(String(500), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    owner: Mapped[User] = relationship(back_populates="folders_owned")
    members: Mapped[list[FolderMember]] = relationship(back_populates="folder", cascade="all, delete-orphan")
    quizzes: Mapped[list[Quiz]] = relationship(back_populates="folder")


class FolderMember(Base):
    __tablename__ = "folder_members"
    __table_args__ = (Index("idx_folder_member_user_folder", "user_id", "folder_id"),)

    folder_id: Mapped[int] = mapped_column(ForeignKey("course_folders.id"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    folder: Mapped[CourseFolder] = relationship(back_populates="members")
    user: Mapped[User] = relationship(back_populates="folder_memberships")


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    folder_id: Mapped[int | None] = mapped_column(ForeignKey("course_folders.id"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    course_tag: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    owner: Mapped[User] = relationship(back_populates="quizzes")
    folder: Mapped[CourseFolder | None] = relationship(back_populates="quizzes")
    questions: Mapped[list[Question]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", order_by="Question.position"
    )


class Question(Base):
    __tablename__ = "questions"
    __table_args__ = (UniqueConstraint("quiz_id", "position", name="uq_question_position"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id"), index=True)
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(Text)
    type: Mapped[str] = mapped_column(String(16), default="single")
    options: Mapped[list[str]] = mapped_column(JSON)
    correct_options: Mapped[list[int]] = mapped_column(JSON)
    time_limit_sec: Mapped[int] = mapped_column(Integer, default=20)
    points: Mapped[int] = mapped_column(Integer, default=1000)
    quiz: Mapped[Quiz] = relationship(back_populates="questions")


class GameSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    quiz_id: Mapped[int] = mapped_column(ForeignKey("quizzes.id"), index=True)
    host_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    pin: Mapped[str] = mapped_column(String(6), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    current_question_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    question_started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    question_deadline_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_revealed: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    quiz: Mapped[Quiz] = relationship()
    host: Mapped[User | None] = relationship()
    participants: Mapped[list[Participant]] = relationship(back_populates="session", cascade="all, delete-orphan")


class Participant(Base):
    __tablename__ = "participants"
    __table_args__ = (
        UniqueConstraint("session_id", "resume_token", name="uq_participant_resume"),
        Index("idx_participant_session_joined", "session_id", "joined_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    display_name: Mapped[str] = mapped_column(String(80))
    student_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    resume_token: Mapped[str] = mapped_column(String(64))
    joined_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    session: Mapped[GameSession] = relationship(back_populates="participants")
    answers: Mapped[list[Answer]] = relationship(back_populates="participant", cascade="all, delete-orphan")


class Answer(Base):
    __tablename__ = "answers"
    __table_args__ = (
        UniqueConstraint("participant_id", "question_id", name="uq_participant_question_answer"),
        Index("idx_answer_session_question", "session_id", "question_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("sessions.id"))
    participant_id: Mapped[int] = mapped_column(ForeignKey("participants.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("questions.id"))
    selected_options: Mapped[list[int]] = mapped_column(JSON)
    is_correct: Mapped[bool] = mapped_column(Boolean)
    response_time_ms: Mapped[int] = mapped_column(Integer)
    points_awarded: Mapped[int] = mapped_column(Integer)
    participant: Mapped[Participant] = relationship(back_populates="answers")
    question: Mapped[Question] = relationship()
