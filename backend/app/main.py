from __future__ import annotations

import csv
import io
import os
import random
import secrets
from contextlib import asynccontextmanager
from datetime import timedelta

from fastapi import Depends, FastAPI, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from .auth import create_token, current_user, decode_user_id, hash_password, verify_password
from .database import Base, SessionLocal, engine, get_db
from .models import Answer, GameSession, Participant, Question, Quiz, User, utcnow
from .realtime import Client, manager
from .schemas import JoinIn, LoginIn, QuizIn, RegisterIn
from .services import answer_distribution, leaderboard, question_payload, reveal_payload, session_snapshot


def initialize_database():
    Base.metadata.create_all(engine)
    email = os.getenv("DEFAULT_INSTRUCTOR_EMAIL", "instructor@example.com").lower()
    password = os.getenv("DEFAULT_INSTRUCTOR_PASSWORD", "change-me-123")
    with SessionLocal() as db:
        if not db.scalar(select(User).where(User.email == email)):
            db.add(User(name="Course Instructor", email=email, password_hash=hash_password(password)))
            db.commit()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    initialize_database()
    yield


app = FastAPI(title="QuizForge API", version="1.0.0", lifespan=lifespan)
origins = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email already registered")
    user = User(name=body.name.strip(), email=body.email.lower(), password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_token(user), "user": {"id": user.id, "name": user.name, "email": user.email}}


@app.post("/api/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    return {"access_token": create_token(user), "user": {"id": user.id, "name": user.name, "email": user.email}}


def serialize_quiz(quiz: Quiz, include_answers: bool = True) -> dict:
    questions = []
    for q in quiz.questions:
        item = {"id": q.id, "position": q.position, "text": q.text, "type": q.type, "options": q.options, "time_limit_sec": q.time_limit_sec, "points": q.points}
        if include_answers:
            item["correct_options"] = q.correct_options
        questions.append(item)
    return {"id": quiz.id, "title": quiz.title, "course_tag": quiz.course_tag, "created_at": quiz.created_at, "questions": questions}


def owned_quiz(db: Session, quiz_id: int, user_id: int) -> Quiz:
    quiz = db.scalar(select(Quiz).where(Quiz.id == quiz_id, Quiz.owner_id == user_id).options(selectinload(Quiz.questions)))
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    return quiz


def validate_quiz(body: QuizIn):
    for index, question in enumerate(body.questions):
        valid = set(range(len(question.options)))
        if not set(question.correct_options).issubset(valid):
            raise HTTPException(422, f"Question {index + 1} has an invalid correct option")
        if question.type == "single" and len(question.correct_options) != 1:
            raise HTTPException(422, f"Question {index + 1} must have exactly one correct option")


@app.get("/api/quizzes")
def list_quizzes(user: User = Depends(current_user), db: Session = Depends(get_db)):
    quizzes = db.scalars(select(Quiz).where(Quiz.owner_id == user.id).options(selectinload(Quiz.questions)).order_by(Quiz.created_at.desc())).all()
    return [serialize_quiz(q) for q in quizzes]


@app.post("/api/quizzes", status_code=201)
def create_quiz(body: QuizIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_quiz(body)
    quiz = Quiz(owner_id=user.id, title=body.title.strip(), course_tag=body.course_tag.strip())
    quiz.questions = [Question(position=i, **q.model_dump()) for i, q in enumerate(body.questions)]
    db.add(quiz)
    db.commit()
    return serialize_quiz(owned_quiz(db, quiz.id, user.id))


@app.get("/api/quizzes/{quiz_id}")
def get_quiz(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return serialize_quiz(owned_quiz(db, quiz_id, user.id))


@app.put("/api/quizzes/{quiz_id}")
def update_quiz(quiz_id: int, body: QuizIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_quiz(body)
    quiz = owned_quiz(db, quiz_id, user.id)
    quiz.title, quiz.course_tag = body.title.strip(), body.course_tag.strip()
    quiz.questions.clear()
    db.flush()
    quiz.questions.extend(Question(position=i, **q.model_dump()) for i, q in enumerate(body.questions))
    db.commit()
    return serialize_quiz(owned_quiz(db, quiz_id, user.id))


@app.delete("/api/quizzes/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    quiz = owned_quiz(db, quiz_id, user.id)
    if db.scalar(select(func.count(GameSession.id)).where(GameSession.quiz_id == quiz.id)):
        raise HTTPException(409, "Quizzes with sessions cannot be deleted")
    db.delete(quiz)
    db.commit()


def new_pin(db: Session) -> str:
    for _ in range(20):
        pin = str(random.randint(100000, 999999))
        if not db.scalar(select(GameSession).where(GameSession.pin == pin, GameSession.status != "ended")):
            return pin
    raise HTTPException(503, "Could not allocate a game PIN")


def owned_session(db: Session, session_id: int, user_id: int) -> GameSession:
    game = db.scalar(select(GameSession).where(GameSession.id == session_id).options(selectinload(GameSession.quiz).selectinload(Quiz.questions), selectinload(GameSession.participants)))
    if not game or game.quiz.owner_id != user_id:
        raise HTTPException(404, "Session not found")
    return game


def session_json(game: GameSession) -> dict:
    return {"id": game.id, "quiz_id": game.quiz_id, "pin": game.pin, "status": game.status, "current_question_index": game.current_question_index, "is_revealed": game.is_revealed, "started_at": game.started_at, "ended_at": game.ended_at}


@app.post("/api/quizzes/{quiz_id}/sessions", status_code=201)
def create_session(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    quiz = owned_quiz(db, quiz_id, user.id)
    if not quiz.questions:
        raise HTTPException(422, "Add at least one question before launching")
    game = GameSession(quiz_id=quiz.id, pin=new_pin(db))
    db.add(game)
    db.commit()
    db.refresh(game)
    return session_json(game)


@app.get("/api/sessions/{session_id}")
def get_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = owned_session(db, session_id, user.id)
    return session_snapshot(db, game)


@app.post("/api/sessions/join")
async def join(body: JoinIn, db: Session = Depends(get_db)):
    game = db.scalar(select(GameSession).where(GameSession.pin == body.pin).options(selectinload(GameSession.quiz).selectinload(Quiz.questions), selectinload(GameSession.participants)))
    if not game or game.status == "ended":
        raise HTTPException(404, "No active session uses that PIN")
    if body.resume_token:
        participant = db.scalar(select(Participant).where(Participant.session_id == game.id, Participant.resume_token == body.resume_token))
        if participant:
            return {"session_id": game.id, "participant_id": participant.id, "resume_token": participant.resume_token, "display_name": participant.display_name}
    if game.status != "pending":
        raise HTTPException(409, "This quiz has already started")
    participant = Participant(session_id=game.id, display_name=body.display_name.strip(), student_id=(body.student_id or "").strip() or None, resume_token=secrets.token_urlsafe(32))
    db.add(participant)
    db.commit()
    db.refresh(participant)
    await manager.broadcast(game.id, {"type": "player_joined", "participants": [{"id": p.id, "display_name": p.display_name} for p in [*game.participants, participant]]})
    return {"session_id": game.id, "participant_id": participant.id, "resume_token": participant.resume_token, "display_name": participant.display_name}


@app.post("/api/sessions/{session_id}/start")
async def start_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = owned_session(db, session_id, user.id)
    if game.status != "pending":
        raise HTTPException(409, "Session is not in the lobby")
    now = utcnow()
    question = game.quiz.questions[0]
    game.status, game.current_question_index, game.started_at = "live", 0, now
    game.question_started_at, game.question_deadline_at = now, now + timedelta(seconds=question.time_limit_sec)
    game.is_revealed = False
    db.commit()
    await manager.broadcast(game.id, {"type": "question_start", "question": question_payload(game, question), "question_count": len(game.quiz.questions)})
    return session_json(game)


@app.post("/api/sessions/{session_id}/reveal")
async def reveal(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = owned_session(db, session_id, user.id)
    if game.status != "live" or game.current_question_index is None:
        raise HTTPException(409, "No live question")
    game.is_revealed = True
    db.commit()
    question = game.quiz.questions[game.current_question_index]
    reveal_data = reveal_payload(db, game, question)
    board = leaderboard(db, game.id)
    await manager.broadcast(game.id, {"type": "question_reveal", **reveal_data})
    await manager.broadcast(game.id, {"type": "leaderboard_update", "leaderboard": board})
    return {"reveal": reveal_data, "leaderboard": board}


@app.post("/api/sessions/{session_id}/next")
async def next_question(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = owned_session(db, session_id, user.id)
    if game.status != "live" or not game.is_revealed:
        raise HTTPException(409, "Reveal the current answer first")
    next_index = (game.current_question_index or 0) + 1
    if next_index >= len(game.quiz.questions):
        return await finish_session(session_id, user, db)
    now = utcnow()
    question = game.quiz.questions[next_index]
    game.current_question_index, game.question_started_at = next_index, now
    game.question_deadline_at, game.is_revealed = now + timedelta(seconds=question.time_limit_sec), False
    db.commit()
    await manager.broadcast(game.id, {"type": "question_start", "question": question_payload(game, question), "question_count": len(game.quiz.questions)})
    return session_json(game)


@app.post("/api/sessions/{session_id}/end")
async def finish_session(session_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = owned_session(db, session_id, user.id)
    if game.status == "ended":
        return session_json(game)
    game.status, game.ended_at = "ended", utcnow()
    db.commit()
    board = leaderboard(db, game.id)
    await manager.broadcast(game.id, {"type": "session_end", "leaderboard": board})
    return session_json(game)


def export_rows(db: Session, game: GameSession):
    board = leaderboard(db, game.id, update_ranks=False)
    rank_by_id = {row["participant_id"]: row for row in board}
    answers = db.scalars(select(Answer).where(Answer.session_id == game.id)).all()
    answer_map = {(a.participant_id, a.question_id): a for a in answers}
    rows = []
    for participant in game.participants:
        marks = []
        correct = 0
        for q in game.quiz.questions:
            answer = answer_map.get((participant.id, q.id))
            value = 1 if answer and answer.is_correct else 0
            marks.append(value)
            correct += value
        score = rank_by_id[participant.id]["score"]
        total = len(game.quiz.questions)
        rows.append([participant.display_name, participant.student_id or "", *marks, correct, round(correct / total * 100, 2) if total else 0, score, rank_by_id[participant.id]["rank"]])
    rows.sort(key=lambda row: row[-1])
    return rows


@app.get("/api/sessions/{session_id}/export")
def export(session_id: int, format: str = Query("xlsx", pattern="^(xlsx|csv)$"), user: User = Depends(current_user), db: Session = Depends(get_db)):
    game = owned_session(db, session_id, user.id)
    headers = ["Student Name", "Student ID", *[f"Q{i + 1}" for i in range(len(game.quiz.questions))], "Total Correct", "Accuracy %", "Total Score", "Rank"]
    rows = export_rows(db, game)
    stem = f"{game.quiz.course_tag or 'quiz'}-{game.pin}-results"
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(headers)
        writer.writerows(rows)
        return Response(output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="{stem}.csv"'})
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "Results"
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    for cell in sheet[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="16324F")
        cell.alignment = Alignment(horizontal="center")
    sheet.freeze_panes = "C2"
    sheet.auto_filter.ref = sheet.dimensions
    for column in sheet.columns:
        sheet.column_dimensions[column[0].column_letter].width = min(max(len(str(c.value or "")) for c in column) + 2, 32)
    binary = io.BytesIO()
    workbook.save(binary)
    return Response(binary.getvalue(), media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", headers={"Content-Disposition": f'attachment; filename="{stem}.xlsx"'})


@app.websocket("/ws/sessions/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: int, participant_token: str | None = None, access_token: str | None = None):
    db = SessionLocal()
    client = None
    try:
        game = db.scalar(select(GameSession).where(GameSession.id == session_id).options(selectinload(GameSession.quiz).selectinload(Quiz.questions), selectinload(GameSession.participants)))
        if not game:
            await websocket.close(code=4404)
            return
        participant = None
        role = "player"
        if participant_token:
            participant = db.scalar(select(Participant).where(Participant.session_id == session_id, Participant.resume_token == participant_token))
            if not participant:
                await websocket.close(code=4401)
                return
        elif access_token:
            try:
                user_id = decode_user_id(access_token)
            except HTTPException:
                await websocket.close(code=4401)
                return
            if game.quiz.owner_id != user_id:
                await websocket.close(code=4403)
                return
            role = "host"
        else:
            await websocket.close(code=4401)
            return
        client = Client(websocket, role, participant.id if participant else None)
        await manager.connect(session_id, client)
        await manager.send(websocket, session_snapshot(db, game, participant.id if participant else None))
        while True:
            data = await websocket.receive_json()
            if role != "player" or data.get("type") != "answer_submitted":
                continue
            db.expire_all()
            game = db.scalar(select(GameSession).where(GameSession.id == session_id).options(selectinload(GameSession.quiz).selectinload(Quiz.questions)))
            if game.status != "live" or game.is_revealed or game.current_question_index is None:
                await manager.send(websocket, {"type": "answer_rejected", "message": "No question is accepting answers"})
                continue
            question = game.quiz.questions[game.current_question_index]
            if data.get("question_id") != question.id:
                await manager.send(websocket, {"type": "answer_rejected", "message": "That question is no longer active"})
                continue
            now = utcnow()
            if not game.question_started_at or not game.question_deadline_at or now > game.question_deadline_at:
                await manager.send(websocket, {"type": "answer_rejected", "message": "Time is up"})
                continue
            selected = sorted(set(int(i) for i in data.get("selected_options", [])))
            if not selected or any(i < 0 or i >= len(question.options) for i in selected) or (question.type == "single" and len(selected) != 1):
                await manager.send(websocket, {"type": "answer_rejected", "message": "Invalid answer selection"})
                continue
            elapsed_ms = max(0, int((now - game.question_started_at).total_seconds() * 1000))
            is_correct = selected == sorted(question.correct_options)
            limit_ms = question.time_limit_sec * 1000
            speed_factor = max(0.5, 1.0 - 0.5 * min(elapsed_ms / limit_ms, 1.0))
            points = round(question.points * speed_factor) if is_correct else 0
            answer = Answer(session_id=session_id, participant_id=participant.id, question_id=question.id, selected_options=selected, is_correct=is_correct, response_time_ms=elapsed_ms, points_awarded=points)
            db.add(answer)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                await manager.send(websocket, {"type": "answer_rejected", "message": "Answer already submitted"})
                continue
            score = db.scalar(select(func.coalesce(func.sum(Answer.points_awarded), 0)).where(Answer.participant_id == participant.id)) or 0
            await manager.send(websocket, {"type": "answer_accepted", "question_id": question.id, "score": int(score)})
            count = db.scalar(select(func.count(Answer.id)).where(Answer.session_id == session_id, Answer.question_id == question.id)) or 0
            await manager.broadcast(session_id, {"type": "question_progress", "question_id": question.id, "response_count": count, "distribution": answer_distribution(db, game, question)}, role="host")
    except WebSocketDisconnect:
        pass
    finally:
        if client:
            manager.disconnect(session_id, websocket)
        db.close()
