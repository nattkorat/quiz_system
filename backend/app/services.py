import random
from datetime import datetime

from sqlalchemy import Integer, cast, func, select
from sqlalchemy.orm import Session, selectinload

from .config import MAX_PARTICIPANTS_PER_SESSION
from .models import Answer, GameSession, Participant, Question, Quiz
from .realtime import manager


def iso(value: datetime | None) -> str | None:
    return f"{value.isoformat()}Z" if value else None


def get_full_session(db: Session, session_id: int) -> GameSession | None:
    return db.scalar(
        select(GameSession)
        .where(GameSession.id == session_id)
        .options(selectinload(GameSession.quiz).selectinload(Quiz.questions), selectinload(GameSession.participants))
    )


def session_snapshot(db: Session, game: GameSession, participant_id: int | None = None) -> dict:
    payload = {
        "type": "snapshot",
        "session": {
            "id": game.id,
            "pin": game.pin,
            "status": game.status,
            "quiz_title": game.quiz.title,
            "course_tag": game.quiz.course_tag,
            "current_question_index": game.current_question_index,
            "question_count": len(game.quiz.questions),
            "is_revealed": game.is_revealed,
            "participant_limit": MAX_PARTICIPANTS_PER_SESSION,
        },
        "participants": [{"id": p.id, "display_name": p.display_name} for p in game.participants],
    }
    if game.status == "live" and game.current_question_index is not None:
        question = game.quiz.questions[game.current_question_index]
        payload["question"] = question_payload(game, question)
        if participant_id is None:
            payload["response_count"] = db.scalar(
                select(func.count(Answer.id)).where(Answer.session_id == game.id, Answer.question_id == question.id)
            ) or 0
        if game.is_revealed:
            payload["reveal"] = reveal_payload(db, game, question)
    if participant_id:
        score = db.scalar(select(func.coalesce(func.sum(Answer.points_awarded), 0)).where(Answer.participant_id == participant_id))
        answered = None
        if game.current_question_index is not None:
            current = game.quiz.questions[game.current_question_index]
            answered = db.scalar(select(Answer).where(Answer.participant_id == participant_id, Answer.question_id == current.id))
        payload["me"] = {
            "participant_id": participant_id,
            "score": score or 0,
            "answered": bool(answered),
            "selected_options": answer.selected_options if (answer := answered) else [],
        }
        if answered and game.is_revealed:
            payload["me"]["current_result"] = {
                "is_correct": answered.is_correct,
                "points_awarded": answered.points_awarded,
            }
    if game.status == "ended" or game.is_revealed:
        payload["leaderboard"] = leaderboard(db, game.id, update_ranks=False)
    return payload


def question_payload(game: GameSession, question: Question) -> dict:
    payload = {
        "id": question.id,
        "position": question.position,
        "text": question.text,
        "type": question.type,
        "duration_sec": question.time_limit_sec,
        "points": question.points,
        "server_start_time": iso(game.question_started_at),
        "deadline": iso(game.question_deadline_at),
    }
    if question.type == "order":
        order = interaction_permutation(game, question)
        payload["items"] = [{"id": display_id, "text": question.options[original_id]} for display_id, original_id in enumerate(order)]
    elif question.type == "matching":
        order = interaction_permutation(game, question)
        right = question.match_options or []
        payload["left_items"] = [{"id": index, "text": text} for index, text in enumerate(question.options)]
        payload["right_items"] = [{"id": display_id, "text": right[original_id]} for display_id, original_id in enumerate(order)]
    else:
        payload["options"] = question.options
    return payload


def interaction_permutation(game: GameSession, question: Question) -> list[int]:
    order = list(range(len(question.options)))
    random.Random(f"quizforge:{game.id}:{question.id}").shuffle(order)
    if len(order) > 1 and order == list(range(len(order))):
        order = order[1:] + order[:1]
    return order


def expected_submission(game: GameSession, question: Question) -> list[int]:
    if question.type in {"single", "multi"}:
        return sorted(question.correct_options)
    permutation = interaction_permutation(game, question)
    display_id_by_original = {original_id: display_id for display_id, original_id in enumerate(permutation)}
    return [display_id_by_original[original_id] for original_id in range(len(question.options))]


def answer_distribution(db: Session, game: GameSession, question: Question) -> list[int]:
    if question.type not in {"single", "multi"}:
        return []
    distribution = [0] * len(question.options)
    answers = db.scalars(select(Answer).where(Answer.session_id == game.id, Answer.question_id == question.id)).all()
    for answer in answers:
        for index in answer.selected_options:
            if 0 <= index < len(distribution):
                distribution[index] += 1
    return distribution


def leaderboard(db: Session, session_id: int, update_ranks: bool = True) -> list[dict]:
    rows = db.execute(
        select(
            Participant.id,
            Participant.display_name,
            Participant.student_id,
            func.coalesce(func.sum(Answer.points_awarded), 0).label("score"),
            func.coalesce(func.sum(cast(Answer.is_correct, Integer)), 0).label("correct"),
        )
        .outerjoin(Answer, Answer.participant_id == Participant.id)
        .where(Participant.session_id == session_id)
        .group_by(Participant.id)
        .order_by(func.coalesce(func.sum(Answer.points_awarded), 0).desc(), Participant.joined_at.asc())
    ).all()
    previous = manager.last_ranks[session_id]
    result = []
    for rank, row in enumerate(rows, 1):
        old = previous.get(row.id, rank)
        result.append({"participant_id": row.id, "rank": rank, "rank_delta": old - rank, "display_name": row.display_name, "student_id": row.student_id, "score": int(row.score), "correct": int(row.correct)})
    if update_ranks:
        manager.last_ranks[session_id] = {item["participant_id"]: item["rank"] for item in result}
    return result


def reveal_payload(db: Session, game: GameSession, question: Question) -> dict:
    total = db.scalar(select(func.count(Answer.id)).where(Answer.session_id == game.id, Answer.question_id == question.id)) or 0
    payload = {
        "question_id": question.id,
        "question_type": question.type,
        "correct_options": question.correct_options,
        "distribution": answer_distribution(db, game, question),
        "response_count": total,
    }
    if question.type == "order":
        payload["correct_sequence"] = expected_submission(game, question)
    elif question.type == "matching":
        payload["correct_matches"] = expected_submission(game, question)
    return payload
