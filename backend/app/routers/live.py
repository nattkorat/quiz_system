"""Real-time host/player WebSocket protocol."""

import secrets
import time

from fastapi import APIRouter, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from ..auth import decode_user_id
from ..database import SessionLocal
from ..game_service import schedule_reveal
from ..models import Answer, GameSession, Participant, Quiz, User, utcnow
from ..realtime import Client, manager
from ..services import expected_submission, session_snapshot


REACTION_EMOJIS = {"👏", "🔥", "😂", "🤯", "❤️", "👍"}
REACTION_MIN_INTERVAL_SECONDS = 0.75

router = APIRouter(tags=["live gameplay"])


@router.websocket("/ws/sessions/{session_id}")
async def websocket_session(
    websocket: WebSocket,
    session_id: int,
    participant_token: str | None = None,
    access_token: str | None = None,
):
    db = SessionLocal()
    client = None
    try:
        game = db.scalar(
            select(GameSession)
            .where(GameSession.id == session_id)
            .options(selectinload(GameSession.quiz).selectinload(Quiz.questions), selectinload(GameSession.participants))
        )
        if not game:
            db.close()
            await websocket.close(code=4404)
            return
        participant = None
        role = "player"
        if participant_token:
            participant = db.scalar(
                select(Participant).where(
                    Participant.session_id == session_id,
                    Participant.resume_token == participant_token,
                )
            )
            if not participant:
                db.close()
                await websocket.close(code=4401)
                return
        elif access_token:
            try:
                user_id = decode_user_id(access_token)
            except HTTPException:
                db.close()
                await websocket.close(code=4401)
                return
            host_user = db.get(User, user_id)
            if not host_user or not host_user.is_active:
                db.close()
                await websocket.close(code=4403)
                return
            if (game.host_id or game.quiz.owner_id) != user_id:
                db.close()
                await websocket.close(code=4403)
                return
            role = "host"
        else:
            db.close()
            await websocket.close(code=4401)
            return

        participant_id = participant.id if participant else None
        participant_name = participant.display_name if participant else None
        snapshot = session_snapshot(db, game, participant_id)
        db.close()
        client = Client(websocket, role, participant_id)
        await manager.connect(session_id, client)
        await manager.send(websocket, snapshot)
        last_reaction_at = 0.0

        while True:
            data = await websocket.receive_json()
            if role != "player":
                continue
            if data.get("type") == "reaction_send":
                last_reaction_at = await handle_reaction(
                    db,
                    websocket,
                    session_id,
                    participant_id,
                    participant_name,
                    data,
                    last_reaction_at,
                )
                continue
            if data.get("type") == "answer_submitted":
                await handle_answer(db, websocket, session_id, participant_id, data)
    except WebSocketDisconnect:
        pass
    finally:
        if client:
            manager.disconnect(session_id, websocket)
        db.close()


async def handle_reaction(db, websocket, session_id, participant_id, participant_name, data, last_reaction_at):
    now_monotonic = time.monotonic()
    if now_monotonic - last_reaction_at < REACTION_MIN_INTERVAL_SECONDS:
        await manager.send(websocket, {"type": "reaction_rejected", "message": "Slow down a little"})
        return last_reaction_at
    db.expire_all()
    current_status = db.scalar(select(GameSession.status).where(GameSession.id == session_id))
    db.close()
    kind = data.get("kind")
    content = str(data.get("content", "")).strip()
    if kind == "chat":
        content = " ".join(content.split())[:80]
    valid = current_status in {"pending", "live"} and (
        (kind == "emoji" and content in REACTION_EMOJIS) or (kind == "chat" and bool(content))
    )
    if not valid:
        await manager.send(websocket, {"type": "reaction_rejected", "message": "That reaction could not be sent"})
        return last_reaction_at
    await manager.broadcast(
        session_id,
        {
            "type": "reaction",
            "event_id": secrets.token_hex(6),
            "participant_id": participant_id,
            "display_name": participant_name,
            "kind": kind,
            "content": content,
            "x": secrets.randbelow(70) + 15,
        },
    )
    return now_monotonic


async def handle_answer(db, websocket, session_id, participant_id, data):
    db.expire_all()
    game = db.scalar(
        select(GameSession)
        .where(GameSession.id == session_id)
        .options(selectinload(GameSession.quiz).selectinload(Quiz.questions))
    )
    if not game or game.status != "live" or game.is_revealed or game.current_question_index is None:
        db.close()
        await manager.send(websocket, {"type": "answer_rejected", "message": "No question is accepting answers"})
        return
    question = game.quiz.questions[game.current_question_index]
    if data.get("question_id") != question.id:
        db.close()
        await manager.send(websocket, {"type": "answer_rejected", "message": "That question is no longer active"})
        return
    now = utcnow()
    if not game.question_started_at or not game.question_deadline_at or now > game.question_deadline_at:
        db.close()
        await manager.send(websocket, {"type": "answer_rejected", "message": "Time is up"})
        return
    try:
        submitted = [int(index) for index in data.get("selected_options", [])]
    except (TypeError, ValueError):
        submitted = []
    if question.type in {"order", "matching"}:
        selected = submitted
        valid_answer = len(selected) == len(question.options) and sorted(selected) == list(range(len(question.options)))
    else:
        selected = sorted(set(submitted))
        valid_answer = bool(selected) and all(0 <= index < len(question.options) for index in selected)
        valid_answer = valid_answer and (question.type != "single" or len(selected) == 1)
    if not valid_answer:
        db.close()
        await manager.send(websocket, {"type": "answer_rejected", "message": "Invalid answer selection"})
        return

    elapsed_ms = max(0, int((now - game.question_started_at).total_seconds() * 1000))
    is_correct = selected == expected_submission(game, question)
    limit_ms = question.time_limit_sec * 1000
    speed_factor = max(0.5, 1.0 - 0.5 * min(elapsed_ms / limit_ms, 1.0))
    points = round(question.points * speed_factor) if is_correct else 0
    db.add(
        Answer(
            session_id=session_id,
            participant_id=participant_id,
            question_id=question.id,
            selected_options=selected,
            is_correct=is_correct,
            response_time_ms=elapsed_ms,
            points_awarded=points,
        )
    )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        db.close()
        await manager.send(websocket, {"type": "answer_rejected", "message": "Answer already submitted"})
        return
    score = db.scalar(select(func.coalesce(func.sum(Answer.points_awarded), 0)).where(Answer.participant_id == participant_id)) or 0
    await manager.send(websocket, {"type": "answer_accepted", "question_id": question.id, "score": int(score)})
    count = db.scalar(
        select(func.count(Answer.id)).where(Answer.session_id == session_id, Answer.question_id == question.id)
    ) or 0
    await manager.broadcast(
        session_id,
        {"type": "question_progress", "question_id": question.id, "response_count": count},
        role="host",
    )
    participant_count = db.scalar(select(func.count(Participant.id)).where(Participant.session_id == session_id)) or 0
    db.close()
    if participant_count and count >= participant_count:
        schedule_reveal(session_id, question.id, 0)
