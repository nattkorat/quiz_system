"""Application startup, schema compatibility, and task restoration."""

from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import FastAPI
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import selectinload

from .auth import hash_password
from .config import DEFAULT_INSTRUCTOR_EMAIL, DEFAULT_INSTRUCTOR_NAME, DEFAULT_INSTRUCTOR_PASSWORD, PENDING_SESSION_EXPIRE_HOURS
from .database import Base, SessionLocal, engine
from .game_service import schedule_advance, schedule_lobby_expiry, schedule_reveal
from .models import GameSession, Quiz, User, utcnow
from .realtime import manager


def initialize_database():
    Base.metadata.create_all(engine)
    schema = inspect(engine)
    quiz_columns = {column["name"] for column in schema.get_columns("quizzes")}
    question_columns = {column["name"] for column in schema.get_columns("questions")}
    session_columns = {column["name"] for column in schema.get_columns("sessions")}
    user_columns = {column["name"] for column in schema.get_columns("users")}
    with engine.begin() as connection:
        timestamp_type = "DATETIME" if engine.dialect.name == "sqlite" else "TIMESTAMP"
        if "is_admin" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT FALSE"))
        if "is_active" not in user_columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE"))
        if "created_at" not in user_columns:
            connection.execute(text(f"ALTER TABLE users ADD COLUMN created_at {timestamp_type}"))
            connection.execute(text("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
        if "last_login_at" not in user_columns:
            connection.execute(text(f"ALTER TABLE users ADD COLUMN last_login_at {timestamp_type}"))
        if "folder_id" not in quiz_columns:
            connection.execute(text("ALTER TABLE quizzes ADD COLUMN folder_id INTEGER"))
        if "deleted_at" not in quiz_columns:
            connection.execute(text("ALTER TABLE quizzes ADD COLUMN deleted_at DATETIME"))
        if "host_id" not in session_columns:
            connection.execute(text("ALTER TABLE sessions ADD COLUMN host_id INTEGER"))
        if "created_at" not in session_columns:
            connection.execute(text(f"ALTER TABLE sessions ADD COLUMN created_at {timestamp_type}"))
            connection.execute(text("UPDATE sessions SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL"))
        if "match_options" not in question_columns:
            connection.execute(text("ALTER TABLE questions ADD COLUMN match_options JSON"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_quizzes_folder_id ON quizzes (folder_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_quizzes_deleted_at ON quizzes (deleted_at)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_sessions_host_id ON sessions (host_id)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions (created_at)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_users_is_admin ON users (is_admin)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users (last_login_at)"))
        connection.execute(text("UPDATE sessions SET host_id = (SELECT owner_id FROM quizzes WHERE quizzes.id = sessions.quiz_id) WHERE host_id IS NULL"))
        if engine.dialect.name == "sqlite":
            connection.execute(text("PRAGMA optimize"))
    with SessionLocal() as db:
        default_user = db.scalar(select(User).where(User.email == DEFAULT_INSTRUCTOR_EMAIL))
        if not default_user:
            db.add(
                User(
                    name=DEFAULT_INSTRUCTOR_NAME,
                    email=DEFAULT_INSTRUCTOR_EMAIL,
                    password_hash=hash_password(DEFAULT_INSTRUCTOR_PASSWORD),
                    is_admin=True,
                )
            )
            db.commit()
        elif not default_user.is_admin:
            default_user.is_admin = True
            db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    with SessionLocal() as db:
        active = db.scalars(
            select(GameSession)
            .where(GameSession.status.in_(("pending", "live")))
            .options(selectinload(GameSession.quiz).selectinload(Quiz.questions))
        ).all()
        for game in active:
            if game.status == "pending":
                expires_at = game.created_at + timedelta(hours=PENDING_SESSION_EXPIRE_HOURS)
                schedule_lobby_expiry(game.id, max(0.0, (expires_at - utcnow()).total_seconds()))
                continue
            if game.current_question_index is None:
                continue
            question = game.quiz.questions[game.current_question_index]
            if game.is_revealed:
                schedule_advance(game.id, question.id)
            else:
                remaining = max(0.0, ((game.question_deadline_at or utcnow()) - utcnow()).total_seconds())
                schedule_reveal(game.id, question.id, remaining)
    yield
    for session_id, _name in list(manager.tasks):
        manager.cancel_session_tasks(session_id)
