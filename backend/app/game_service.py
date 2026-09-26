"""Live-game state transitions and access rules."""

import asyncio
import random
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from .config import MAX_PARTICIPANTS_PER_SESSION, RESULT_DISPLAY_SECONDS
from .database import SessionLocal
from .models import Answer, GameSession, Quiz, utcnow
from .realtime import manager
from .services import iso, leaderboard, question_payload, reveal_payload


def new_pin(db: Session) -> str:
    for _ in range(20):
        pin = str(random.randint(100000, 999999))
        if not db.scalar(select(GameSession).where(GameSession.pin == pin, GameSession.status != "ended")):
            return pin
    raise HTTPException(503, "Could not allocate a game PIN")


def session_query(session_id: int):
    return (
        select(GameSession)
        .where(GameSession.id == session_id)
        .options(
            selectinload(GameSession.quiz).selectinload(Quiz.questions),
            selectinload(GameSession.quiz).selectinload(Quiz.owner),
            selectinload(GameSession.quiz).selectinload(Quiz.folder),
            selectinload(GameSession.participants),
            selectinload(GameSession.host),
        )
    )


def accessible_session(db: Session, session_id: int, user_id: int) -> GameSession:
    game = db.scalar(session_query(session_id))
    if not game or user_id not in {game.host_id or game.quiz.owner_id, game.quiz.owner_id}:
        raise HTTPException(404, "Session not found")
    return game


def hosted_session(db: Session, session_id: int, user_id: int) -> GameSession:
    game = db.scalar(session_query(session_id))
    if not game or (game.host_id or game.quiz.owner_id) != user_id:
        raise HTTPException(404, "Session not found")
    return game


def session_json(game: GameSession) -> dict:
    return {
        "id": game.id,
        "quiz_id": game.quiz_id,
        "host_id": game.host_id,
        "pin": game.pin,
        "status": game.status,
        "current_question_index": game.current_question_index,
        "is_revealed": game.is_revealed,
        "started_at": game.started_at,
        "ended_at": game.ended_at,
        "participant_limit": MAX_PARTICIPANTS_PER_SESSION,
    }


def load_session(db: Session, session_id: int) -> GameSession | None:
    return db.scalar(
        select(GameSession)
        .where(GameSession.id == session_id)
        .options(selectinload(GameSession.quiz).selectinload(Quiz.questions), selectinload(GameSession.participants))
    )


def schedule_reveal(session_id: int, question_id: int, delay: float):
    manager.set_task(session_id, "reveal", auto_reveal(session_id, question_id, delay))


def schedule_advance(session_id: int, question_id: int):
    manager.set_task(session_id, "advance", auto_advance(session_id, question_id, RESULT_DISPLAY_SECONDS))


async def auto_reveal(session_id: int, question_id: int, delay: float):
    await asyncio.sleep(max(0, delay))
    async with manager.lock(session_id):
        with SessionLocal() as db:
            game = load_session(db, session_id)
            if not game or game.status != "live" or game.is_revealed or game.current_question_index is None:
                return
            question = game.quiz.questions[game.current_question_index]
            if question.id != question_id:
                return
            await reveal_game(db, game)


async def auto_advance(session_id: int, question_id: int, delay: float):
    await asyncio.sleep(max(0, delay))
    async with manager.lock(session_id):
        with SessionLocal() as db:
            game = load_session(db, session_id)
            if not game or game.status != "live" or not game.is_revealed or game.current_question_index is None:
                return
            if game.quiz.questions[game.current_question_index].id != question_id:
                return
            await advance_game(db, game)


async def begin_question(db: Session, game: GameSession, index: int):
    manager.cancel_task(game.id, "advance")
    now = utcnow()
    question = game.quiz.questions[index]
    game.status = "live"
    game.current_question_index = index
    game.question_started_at = now
    game.question_deadline_at = now + timedelta(seconds=question.time_limit_sec)
    game.is_revealed = False
    db.commit()
    await manager.broadcast(
        game.id,
        {"type": "question_start", "question": question_payload(game, question), "question_count": len(game.quiz.questions)},
    )
    schedule_reveal(game.id, question.id, question.time_limit_sec)


async def reveal_game(db: Session, game: GameSession) -> dict:
    if game.is_revealed or game.current_question_index is None:
        question = game.quiz.questions[game.current_question_index or 0]
        return {"reveal": reveal_payload(db, game, question), "leaderboard": leaderboard(db, game.id, update_ranks=False)}
    manager.cancel_task(game.id, "reveal")
    game.is_revealed = True
    db.commit()
    question = game.quiz.questions[game.current_question_index]
    reveal_data = {
        **reveal_payload(db, game, question),
        "next_in_sec": RESULT_DISPLAY_SECONDS,
        "next_at": iso(utcnow() + timedelta(seconds=RESULT_DISPLAY_SECONDS)),
    }
    board = leaderboard(db, game.id)
    score_by_participant = {row["participant_id"]: row["score"] for row in board}
    answers = db.scalars(select(Answer).where(Answer.session_id == game.id, Answer.question_id == question.id)).all()
    answer_by_participant = {answer.participant_id: answer for answer in answers}
    personal_results = {}
    for participant in game.participants:
        answer = answer_by_participant.get(participant.id)
        personal_results[participant.id] = {
            "type": "player_result",
            "question_id": question.id,
            "is_correct": bool(answer and answer.is_correct),
            "points_awarded": answer.points_awarded if answer else 0,
            "selected_options": answer.selected_options if answer else [],
            "score": score_by_participant.get(participant.id, 0),
        }
    await manager.send_participant_payloads(game.id, personal_results)
    await manager.broadcast(game.id, {"type": "question_reveal", **reveal_data})
    await manager.broadcast(game.id, {"type": "leaderboard_update", "leaderboard": board})
    schedule_advance(game.id, question.id)
    return {"reveal": reveal_data, "leaderboard": board}


async def finish_game(db: Session, game: GameSession):
    manager.cancel_session_tasks(game.id)
    game.status, game.ended_at = "ended", utcnow()
    db.commit()
    board = leaderboard(db, game.id)
    await manager.broadcast(game.id, {"type": "session_end", "leaderboard": board})
    return session_json(game)


async def advance_game(db: Session, game: GameSession):
    next_index = (game.current_question_index or 0) + 1
    if next_index >= len(game.quiz.questions):
        return await finish_game(db, game)
    await begin_question(db, game, next_index)
    return session_json(game)
