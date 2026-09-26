"""Platform administration, usage monitoring, and account controls."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import create_password_reset_token, current_admin
from ..config import PASSWORD_RESET_EXPIRE_MINUTES
from ..database import get_db
from ..game_service import finish_game
from ..models import Answer, GameSession, Participant, Quiz, User, utcnow
from ..schemas import AdminUserUpdate


router = APIRouter(prefix="/api/admin", tags=["administration"])


@router.get("/overview")
def overview(_admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    since = utcnow() - timedelta(hours=24)
    open_statuses = ("pending", "live")
    games = db.scalars(
        select(GameSession)
        .where(GameSession.status.in_(open_statuses))
        .options(selectinload(GameSession.quiz), selectinload(GameSession.host), selectinload(GameSession.participants))
        .order_by(GameSession.started_at.desc(), GameSession.id.desc())
        .limit(20)
    ).all()
    return {
        "metrics": {
            "registered_instructors": db.scalar(select(func.count(User.id))) or 0,
            "active_accounts": db.scalar(select(func.count(User.id)).where(User.is_active.is_(True))) or 0,
            "recent_logins": db.scalar(select(func.count(User.id)).where(User.last_login_at >= since)) or 0,
            "quizzes": db.scalar(select(func.count(Quiz.id)).where(Quiz.deleted_at.is_(None))) or 0,
            "played_sessions": db.scalar(select(func.count(GameSession.id)).where(GameSession.started_at.is_not(None))) or 0,
            "open_games": db.scalar(select(func.count(GameSession.id)).where(GameSession.status.in_(open_statuses))) or 0,
            "student_joins": db.scalar(select(func.count(Participant.id))) or 0,
            "answers": db.scalar(select(func.count(Answer.id))) or 0,
        },
        "open_sessions": [
            {
                "id": game.id,
                "pin": game.pin,
                "status": game.status,
                "quiz_title": game.quiz.title,
                "host": {"id": game.host.id, "name": game.host.name, "email": game.host.email} if game.host else None,
                "participant_count": len(game.participants),
                "started_at": game.started_at,
            }
            for game in games
        ],
    }


@router.get("/users")
def users(
    search: str = "",
    status: str = Query("all", pattern="^(all|active|suspended|admin)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=5, le=100),
    _admin: User = Depends(current_admin),
    db: Session = Depends(get_db),
):
    filters = []
    needle = search.strip().lower()
    if needle:
        filters.append(or_(func.lower(User.name).contains(needle), func.lower(User.email).contains(needle)))
    if status == "active":
        filters.append(User.is_active.is_(True))
    elif status == "suspended":
        filters.append(User.is_active.is_(False))
    elif status == "admin":
        filters.append(User.is_admin.is_(True))

    total = db.scalar(select(func.count(User.id)).where(*filters)) or 0
    quiz_count = select(func.count(Quiz.id)).where(Quiz.owner_id == User.id, Quiz.deleted_at.is_(None)).correlate(User).scalar_subquery()
    session_count = select(func.count(GameSession.id)).where(GameSession.host_id == User.id, GameSession.started_at.is_not(None)).correlate(User).scalar_subquery()
    student_count = (
        select(func.count(Participant.id))
        .join(GameSession, Participant.session_id == GameSession.id)
        .where(GameSession.host_id == User.id)
        .correlate(User)
        .scalar_subquery()
    )
    rows = db.execute(
        select(User, quiz_count.label("quiz_count"), session_count.label("session_count"), student_count.label("student_count"))
        .where(*filters)
        .order_by(User.created_at.desc(), User.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return {
        "items": [
            {
                "id": user.id,
                "name": user.name,
                "email": user.email,
                "is_admin": user.is_admin,
                "is_active": user.is_active,
                "created_at": user.created_at,
                "last_login_at": user.last_login_at,
                "quiz_count": int(quizzes or 0),
                "session_count": int(sessions or 0),
                "student_count": int(students or 0),
            }
            for user, quizzes, sessions, students in rows
        ],
        "page": page,
        "page_size": page_size,
        "total": total,
    }


@router.patch("/users/{user_id}")
def update_user(user_id: int, body: AdminUserUpdate, admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Instructor not found")
    if user.id == admin.id and not body.is_active:
        raise HTTPException(409, "You cannot suspend your own administrator account")
    user.is_active = body.is_active
    db.commit()
    return {"id": user.id, "is_active": user.is_active}


@router.post("/users/{user_id}/password-reset-link")
def create_user_password_reset_link(user_id: int, _admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "Instructor not found")
    expires_at = utcnow() + timedelta(minutes=PASSWORD_RESET_EXPIRE_MINUTES)
    return {
        "user": {"id": user.id, "name": user.name, "email": user.email, "is_active": user.is_active},
        "token": create_password_reset_token(user, PASSWORD_RESET_EXPIRE_MINUTES),
        "expires_at": expires_at,
    }


@router.post("/sessions/{session_id}/end")
async def end_session(session_id: int, _admin: User = Depends(current_admin), db: Session = Depends(get_db)):
    game = db.scalar(
        select(GameSession)
        .where(GameSession.id == session_id)
        .options(selectinload(GameSession.quiz).selectinload(Quiz.questions), selectinload(GameSession.participants))
    )
    if not game:
        raise HTTPException(404, "Session not found")
    if game.status == "ended":
        return {"id": game.id, "status": game.status}
    await finish_game(db, game)
    return {"id": game.id, "status": game.status}
