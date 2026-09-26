"""Game creation, lobby membership, history, and host controls."""

import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user
from ..config import MAX_PARTICIPANTS_PER_SESSION
from ..database import get_db
from ..game_service import accessible_session, advance_game, begin_question, finish_game, hosted_session, new_pin, reveal_game, session_json
from ..models import GameSession, Participant, Quiz, User, utcnow
from ..quiz_service import accessible_quiz
from ..realtime import manager
from ..schemas import JoinIn
from ..services import session_snapshot


router = APIRouter(prefix="/api", tags=["game sessions"])


@router.post("/quizzes/{quiz_id}/sessions", status_code=201)
def create_session(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    quiz = accessible_quiz(db, quiz_id, user.id)
    if not quiz.questions:
        raise HTTPException(422, "Add at least one question before launching")
    game = GameSession(quiz_id=quiz.id, host_id=user.id, pin=new_pin(db))
    db.add(game)
    db.commit()
    db.refresh(game)
    return session_json(game)


@router.get("/sessions/history")
def session_history(user: User = Depends(current_user), db: Session = Depends(get_db)):
    games = db.scalars(
        select(GameSession)
        .join(Quiz)
        .where(or_(GameSession.host_id == user.id, Quiz.owner_id == user.id), GameSession.started_at.is_not(None))
        .options(
            selectinload(GameSession.quiz).selectinload(Quiz.questions),
            selectinload(GameSession.quiz).selectinload(Quiz.owner),
            selectinload(GameSession.participants),
            selectinload(GameSession.host),
        )
        .order_by(GameSession.started_at.desc())
    ).unique().all()
    return [
        {
            "id": game.id,
            "quiz_id": game.quiz_id,
            "quiz_title": game.quiz.title,
            "course_tag": game.quiz.course_tag,
            "pin": game.pin,
            "status": game.status,
            "started_at": game.started_at,
            "ended_at": game.ended_at,
            "participant_count": len(game.participants),
            "question_count": len(game.quiz.questions),
            "host": {"id": (game.host or game.quiz.owner).id, "name": (game.host or game.quiz.owner).name, "email": (game.host or game.quiz.owner).email},
            "quiz_owner": {"id": game.quiz.owner.id, "name": game.quiz.owner.name},
            "hosted_by_me": (game.host_id or game.quiz.owner_id) == user.id,
            "used_my_quiz": game.quiz.owner_id == user.id and (game.host_id or game.quiz.owner_id) != user.id,
            "can_delete": (game.host_id or game.quiz.owner_id) == user.id,
        }
        for game in games
    ]


@router.get("/sessions/{session_id}")
def get_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return session_snapshot(db, accessible_session(db, session_id, user.id))


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = hosted_session(db, session_id, user.id)
    manager.cancel_session_tasks(game.id)
    db.delete(game)
    db.commit()


@router.post("/sessions/join")
async def join(body: JoinIn, db: Session = Depends(get_db)):
    game_id = db.scalar(select(GameSession.id).where(GameSession.pin == body.pin, GameSession.status != "ended"))
    db.close()
    if game_id is None:
        raise HTTPException(404, "No active session uses that PIN")

    async with manager.lock(game_id):
        game = db.scalar(
            select(GameSession)
            .where(GameSession.id == game_id, GameSession.status != "ended")
            .with_for_update()
        )
        if not game:
            raise HTTPException(404, "No active session uses that PIN")
        if body.resume_token:
            participant = db.scalar(
                select(Participant).where(
                    Participant.session_id == game.id,
                    Participant.resume_token == body.resume_token,
                )
            )
            if participant:
                return {
                    "session_id": game.id,
                    "participant_id": participant.id,
                    "resume_token": participant.resume_token,
                    "display_name": participant.display_name,
                }
        participant_count = db.scalar(select(func.count(Participant.id)).where(Participant.session_id == game.id)) or 0
        if participant_count >= MAX_PARTICIPANTS_PER_SESSION:
            raise HTTPException(409, f"Game is full (maximum {MAX_PARTICIPANTS_PER_SESSION} students)")
        participant = Participant(
            session_id=game.id,
            display_name=body.display_name.strip(),
            student_id=(body.student_id or "").strip() or None,
            resume_token=secrets.token_urlsafe(32),
        )
        db.add(participant)
        db.commit()
        db.refresh(participant)
        participants = db.scalars(
            select(Participant).where(Participant.session_id == game.id).order_by(Participant.joined_at)
        ).all()
        participant_list = [{"id": item.id, "display_name": item.display_name} for item in participants]
        result = {
            "session_id": game.id,
            "participant_id": participant.id,
            "resume_token": participant.resume_token,
            "display_name": participant.display_name,
        }
        db.close()

    await manager.broadcast(game_id, {"type": "player_joined", "participants": participant_list})
    return result


@router.post("/sessions/{session_id}/start")
async def start_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = hosted_session(db, session_id, user.id)
    if game.status != "pending":
        raise HTTPException(409, "Session is not in the lobby")
    game.started_at = utcnow()
    await begin_question(db, game, 0)
    return session_json(game)


@router.post("/sessions/{session_id}/reveal")
async def reveal(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = hosted_session(db, session_id, user.id)
    if game.status != "live" or game.current_question_index is None:
        raise HTTPException(409, "No live question")
    async with manager.lock(game.id):
        db.expire_all()
        game = hosted_session(db, session_id, user.id)
        return await reveal_game(db, game)


@router.post("/sessions/{session_id}/next")
async def next_question(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = hosted_session(db, session_id, user.id)
    if game.status != "live" or not game.is_revealed:
        raise HTTPException(409, "Reveal the current answer first")
    async with manager.lock(game.id):
        db.expire_all()
        game = hosted_session(db, session_id, user.id)
        if game.status != "live" or not game.is_revealed:
            raise HTTPException(409, "The session has already advanced")
        return await advance_game(db, game)


@router.post("/sessions/{session_id}/end")
async def finish_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = hosted_session(db, session_id, user.id)
    if game.status == "ended":
        return session_json(game)
    async with manager.lock(game.id):
        db.expire_all()
        return await finish_game(db, hosted_session(db, session_id, user.id))
