"""Instructor, course-folder, and quiz-library endpoints."""

import base64
import hashlib
import hmac
import secrets
from datetime import timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import current_user
from ..config import JWT_SECRET
from ..database import get_db
from ..models import CourseFolder, FolderInvite, FolderMember, GameSession, Question, Quiz, QuizInvite, QuizMember, User, utcnow
from ..quiz_service import accessible_folder, accessible_quiz, owned_quiz, serialize_folder, serialize_quiz, validate_quiz
from ..realtime import manager
from ..schemas import FolderIn, FolderInviteIn, FolderMemberIn, QuizIn


router = APIRouter(prefix="/api", tags=["quiz library"])


def invite_token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def reusable_invite_token(invite_id: int) -> str:
    message = f"folder-invite:{invite_id}".encode("utf-8")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), message, hashlib.sha256).digest()[:24]
    encoded = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"v1.{invite_id}.{encoded}"


def signed_invite_id(token: str) -> int | None:
    try:
        version, raw_id, _signature = token.split(".", 2)
        invite_id = int(raw_id)
    except (TypeError, ValueError):
        return None
    if version != "v1" or not hmac.compare_digest(token, reusable_invite_token(invite_id)):
        return None
    return invite_id


def reusable_quiz_invite_token(invite_id: int) -> str:
    message = f"quiz-invite:{invite_id}".encode("utf-8")
    signature = hmac.new(JWT_SECRET.encode("utf-8"), message, hashlib.sha256).digest()[:24]
    encoded = base64.urlsafe_b64encode(signature).decode("ascii").rstrip("=")
    return f"v1.{invite_id}.{encoded}"


def signed_quiz_invite_id(token: str) -> int | None:
    try:
        version, raw_id, _signature = token.split(".", 2)
        invite_id = int(raw_id)
    except (TypeError, ValueError):
        return None
    if version != "v1" or not hmac.compare_digest(token, reusable_quiz_invite_token(invite_id)):
        return None
    return invite_id


def normalize_expiry(value):
    if value.tzinfo:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def valid_folder_invite(db: Session, token: str) -> FolderInvite:
    invite_id = signed_invite_id(token)
    token_filter = FolderInvite.id == invite_id if invite_id is not None else FolderInvite.token_hash == invite_token_hash(token)
    invite = db.scalar(select(FolderInvite).where(token_filter, FolderInvite.revoked_at.is_(None)).options(selectinload(FolderInvite.folder).selectinload(CourseFolder.owner)))
    if not invite:
        raise HTTPException(404, "Folder invitation not found")
    if invite.expires_at <= utcnow():
        raise HTTPException(410, "Folder invitation has expired")
    return invite


def valid_quiz_invite(db: Session, token: str) -> QuizInvite:
    invite_id = signed_quiz_invite_id(token)
    token_filter = QuizInvite.id == invite_id if invite_id is not None else QuizInvite.token_hash == invite_token_hash(token)
    invite = db.scalar(select(QuizInvite).where(token_filter, QuizInvite.revoked_at.is_(None)).options(selectinload(QuizInvite.quiz).selectinload(Quiz.owner), selectinload(QuizInvite.quiz).selectinload(Quiz.questions)))
    if not invite or invite.quiz.deleted_at is not None:
        raise HTTPException(404, "Quiz invitation not found")
    if invite.expires_at <= utcnow():
        raise HTTPException(410, "Quiz invitation has expired")
    return invite


@router.get("/instructors")
def list_instructors(search: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(User).where(User.id != user.id)
    if search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.where(or_(func.lower(User.name).like(term), func.lower(User.email).like(term)))
    instructors = db.scalars(query.order_by(User.name).limit(20)).all()
    return [{"id": instructor.id, "name": instructor.name, "email": instructor.email} for instructor in instructors]


@router.get("/folders")
def list_folders(user: User = Depends(current_user), db: Session = Depends(get_db)):
    member_folders = select(FolderMember.folder_id).where(FolderMember.user_id == user.id)
    folders = db.scalars(
        select(CourseFolder)
        .where(or_(CourseFolder.owner_id == user.id, CourseFolder.id.in_(member_folders)))
        .options(
            selectinload(CourseFolder.owner),
            selectinload(CourseFolder.members).selectinload(FolderMember.user),
            selectinload(CourseFolder.quizzes),
        )
        .order_by(CourseFolder.name)
    ).all()
    return [serialize_folder(folder, user.id) for folder in folders]


@router.post("/folders", status_code=201)
def create_folder(body: FolderIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    folder = CourseFolder(owner_id=user.id, name=body.name.strip(), course_tag=body.course_tag.strip(), description=body.description.strip())
    db.add(folder)
    db.commit()
    return serialize_folder(accessible_folder(db, folder.id, user.id), user.id)


@router.put("/folders/{folder_id}")
def update_folder(folder_id: int, body: FolderIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    folder = accessible_folder(db, folder_id, user.id, owner_only=True)
    folder.name, folder.course_tag, folder.description = body.name.strip(), body.course_tag.strip(), body.description.strip()
    db.commit()
    return serialize_folder(accessible_folder(db, folder.id, user.id), user.id)


@router.delete("/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    folder = accessible_folder(db, folder_id, user.id, owner_only=True)
    for quiz in folder.quizzes:
        quiz.folder_id = None
    db.flush()
    db.delete(folder)
    db.commit()


@router.post("/folders/{folder_id}/members", status_code=201)
def add_folder_member(folder_id: int, body: FolderMemberIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    folder = accessible_folder(db, folder_id, user.id, owner_only=True)
    member = db.scalar(select(User).where(User.email == body.email.lower()))
    if not member:
        raise HTTPException(404, "Instructor must create an account before being invited")
    if member.id == user.id:
        raise HTTPException(409, "Folder owner already has access")
    if db.get(FolderMember, (folder.id, member.id)):
        raise HTTPException(409, "Instructor already has access")
    db.add(FolderMember(folder_id=folder.id, user_id=member.id))
    db.commit()
    return serialize_folder(accessible_folder(db, folder.id, user.id), user.id)


@router.delete("/folders/{folder_id}/members/{member_id}", status_code=204)
def remove_folder_member(folder_id: int, member_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    folder = accessible_folder(db, folder_id, user.id, owner_only=True)
    membership = db.get(FolderMember, (folder.id, member_id))
    if not membership:
        raise HTTPException(404, "Folder member not found")
    db.delete(membership)
    db.commit()


@router.get("/folders/{folder_id}/invites")
def list_folder_invites(folder_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    accessible_folder(db, folder_id, user.id, owner_only=True)
    invites = db.scalars(
        select(FolderInvite)
        .where(
            FolderInvite.folder_id == folder_id,
            FolderInvite.revoked_at.is_(None),
            FolderInvite.expires_at > utcnow(),
        )
        .order_by(FolderInvite.expires_at.desc())
    ).all()
    return [{"id": invite.id, "token": reusable_invite_token(invite.id), "created_at": invite.created_at, "expires_at": invite.expires_at} for invite in invites]


@router.post("/folders/{folder_id}/invites", status_code=201)
def create_folder_invite(
    folder_id: int,
    body: FolderInviteIn,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    folder = accessible_folder(db, folder_id, user.id, owner_only=True)
    expires_at = normalize_expiry(body.expires_at)
    now = utcnow()
    if expires_at <= now:
        raise HTTPException(422, "Expiration must be in the future")
    if expires_at > now + timedelta(days=365):
        raise HTTPException(422, "Expiration cannot be more than one year away")
    invite = FolderInvite(folder_id=folder.id, token_hash=invite_token_hash(secrets.token_urlsafe(32)), expires_at=expires_at)
    db.add(invite)
    db.flush()
    token = reusable_invite_token(invite.id)
    invite.token_hash = invite_token_hash(token)
    db.commit()
    db.refresh(invite)
    return {"id": invite.id, "token": token, "created_at": invite.created_at, "expires_at": invite.expires_at}


@router.delete("/folders/{folder_id}/invites/{invite_id}", status_code=204)
def revoke_folder_invite(
    folder_id: int,
    invite_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    accessible_folder(db, folder_id, user.id, owner_only=True)
    invite = db.scalar(select(FolderInvite).where(FolderInvite.id == invite_id, FolderInvite.folder_id == folder_id))
    if not invite:
        raise HTTPException(404, "Folder invitation not found")
    invite.revoked_at = utcnow()
    db.commit()


@router.get("/folder-invites/{token}")
def preview_folder_invite(token: str, db: Session = Depends(get_db)):
    invite = valid_folder_invite(db, token)
    return {
        "folder": {"name": invite.folder.name, "course_tag": invite.folder.course_tag, "description": invite.folder.description},
        "owner": {"name": invite.folder.owner.name},
        "expires_at": invite.expires_at,
    }


@router.post("/folder-invites/{token}/accept")
def accept_folder_invite(token: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    invite = valid_folder_invite(db, token)
    folder = invite.folder
    if folder.owner_id != user.id and not db.get(FolderMember, (folder.id, user.id)):
        db.add(FolderMember(folder_id=folder.id, user_id=user.id))
        db.commit()
    return serialize_folder(accessible_folder(db, folder.id, user.id), user.id)


@router.get("/quizzes/{quiz_id}/invites")
def list_quiz_invites(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_quiz(db, quiz_id, user.id)
    invites = db.scalars(
        select(QuizInvite)
        .where(QuizInvite.quiz_id == quiz_id, QuizInvite.revoked_at.is_(None), QuizInvite.expires_at > utcnow())
        .order_by(QuizInvite.expires_at.desc())
    ).all()
    return [{"id": invite.id, "token": reusable_quiz_invite_token(invite.id), "created_at": invite.created_at, "expires_at": invite.expires_at} for invite in invites]


@router.post("/quizzes/{quiz_id}/invites", status_code=201)
def create_quiz_invite(quiz_id: int, body: FolderInviteIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    quiz = owned_quiz(db, quiz_id, user.id)
    expires_at = normalize_expiry(body.expires_at)
    now = utcnow()
    if expires_at <= now:
        raise HTTPException(422, "Expiration must be in the future")
    if expires_at > now + timedelta(days=365):
        raise HTTPException(422, "Expiration cannot be more than one year away")
    invite = QuizInvite(quiz_id=quiz.id, token_hash=invite_token_hash(secrets.token_urlsafe(32)), expires_at=expires_at)
    db.add(invite)
    db.flush()
    token = reusable_quiz_invite_token(invite.id)
    invite.token_hash = invite_token_hash(token)
    db.commit()
    db.refresh(invite)
    return {"id": invite.id, "token": token, "created_at": invite.created_at, "expires_at": invite.expires_at}


@router.delete("/quizzes/{quiz_id}/invites/{invite_id}", status_code=204)
def revoke_quiz_invite(quiz_id: int, invite_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_quiz(db, quiz_id, user.id)
    invite = db.scalar(select(QuizInvite).where(QuizInvite.id == invite_id, QuizInvite.quiz_id == quiz_id))
    if not invite:
        raise HTTPException(404, "Quiz invitation not found")
    invite.revoked_at = utcnow()
    db.commit()


@router.get("/quiz-invites/{token}")
def preview_quiz_invite(token: str, db: Session = Depends(get_db)):
    invite = valid_quiz_invite(db, token)
    quiz = invite.quiz
    return {
        "quiz": {"id": quiz.id, "title": quiz.title, "course_tag": quiz.course_tag, "question_count": len(quiz.questions)},
        "owner": {"name": quiz.owner.name},
        "expires_at": invite.expires_at,
    }


@router.post("/quiz-invites/{token}/accept")
def accept_quiz_invite(token: str, user: User = Depends(current_user), db: Session = Depends(get_db)):
    invite = valid_quiz_invite(db, token)
    quiz = invite.quiz
    if quiz.owner_id != user.id and not db.get(QuizMember, (quiz.id, user.id)):
        db.add(QuizMember(quiz_id=quiz.id, user_id=user.id))
        db.commit()
    return serialize_quiz(accessible_quiz(db, quiz.id, user.id), viewer_id=user.id)


@router.get("/quizzes")
def list_quizzes(search: str = "", user: User = Depends(current_user), db: Session = Depends(get_db)):
    member_folders = select(FolderMember.folder_id).where(FolderMember.user_id == user.id)
    member_quizzes = select(QuizMember.quiz_id).where(QuizMember.user_id == user.id)
    query = (
        select(Quiz)
        .join(Quiz.owner)
        .where(Quiz.deleted_at.is_(None), or_(Quiz.owner_id == user.id, Quiz.folder.has(CourseFolder.owner_id == user.id), Quiz.folder_id.in_(member_folders), Quiz.id.in_(member_quizzes)))
        .options(selectinload(Quiz.questions), selectinload(Quiz.owner), selectinload(Quiz.folder))
    )
    if search.strip():
        term = f"%{search.strip().lower()}%"
        query = query.where(or_(func.lower(Quiz.title).like(term), func.lower(Quiz.course_tag).like(term), func.lower(User.name).like(term)))
    quizzes = db.scalars(query.order_by(Quiz.created_at.desc())).unique().all()
    owned_quiz_ids = [quiz.id for quiz in quizzes if quiz.owner_id == user.id]
    shared_quiz_ids = [quiz.id for quiz in quizzes if quiz.owner_id != user.id]
    owned_play_counts = dict(
        db.execute(
            select(GameSession.quiz_id, func.count(GameSession.id))
            .where(GameSession.quiz_id.in_(owned_quiz_ids), GameSession.started_at.is_not(None))
            .group_by(GameSession.quiz_id)
        ).all()
    ) if owned_quiz_ids else {}
    shared_play_counts = dict(
        db.execute(
            select(GameSession.quiz_id, func.count(GameSession.id))
            .where(
                GameSession.quiz_id.in_(shared_quiz_ids),
                GameSession.host_id == user.id,
                GameSession.started_at.is_not(None),
            )
            .group_by(GameSession.quiz_id)
        ).all()
    ) if shared_quiz_ids else {}
    result = []
    for quiz in quizzes:
        item = serialize_quiz(quiz, viewer_id=user.id)
        owner_view = quiz.owner_id == user.id
        item["play_count"] = (owned_play_counts if owner_view else shared_play_counts).get(quiz.id, 0)
        item["play_count_scope"] = "all" if owner_view else "mine"
        result.append(item)
    return result


@router.post("/quizzes", status_code=201)
def create_quiz(body: QuizIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_quiz(body)
    if body.folder_id is not None:
        accessible_folder(db, body.folder_id, user.id)
    quiz = Quiz(owner_id=user.id, folder_id=body.folder_id, title=body.title.strip(), course_tag=body.course_tag.strip())
    quiz.questions = [Question(position=index, **question.model_dump()) for index, question in enumerate(body.questions)]
    db.add(quiz)
    db.commit()
    return serialize_quiz(owned_quiz(db, quiz.id, user.id), viewer_id=user.id)


@router.post("/quizzes/{quiz_id}/copy", status_code=201)
def copy_quiz(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    source = accessible_quiz(db, quiz_id, user.id)
    folder_id = None
    if source.folder_id is not None:
        member_folder = db.scalar(select(FolderMember).where(FolderMember.folder_id == source.folder_id, FolderMember.user_id == user.id))
        if source.folder.owner_id == user.id or member_folder:
            folder_id = source.folder_id
    copy = Quiz(
        owner_id=user.id,
        folder_id=folder_id,
        title=f"{source.title} (Copy)",
        course_tag=source.course_tag,
    )
    copy.questions = [
        Question(
            position=question.position,
            text=question.text,
            type=question.type,
            options=list(question.options),
            match_options=list(question.match_options or []),
            correct_options=list(question.correct_options),
            time_limit_sec=question.time_limit_sec,
            points=question.points,
        )
        for question in source.questions
    ]
    db.add(copy)
    db.commit()
    return serialize_quiz(owned_quiz(db, copy.id, user.id), viewer_id=user.id)


@router.get("/quizzes/{quiz_id}/usage")
def quiz_usage(
    quiz_id: int,
    scope: str = Query("all", pattern="^(all|mine)$"),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    quiz = accessible_quiz(db, quiz_id, user.id)
    viewer_is_owner = quiz.owner_id == user.id
    effective_scope = scope if viewer_is_owner else "mine"
    query = (
        select(GameSession)
        .where(GameSession.quiz_id == quiz.id, GameSession.started_at.is_not(None))
        .options(selectinload(GameSession.host), selectinload(GameSession.participants))
        .order_by(GameSession.started_at.desc())
    )
    if effective_scope == "mine":
        mine_filter = GameSession.host_id == user.id
        if viewer_is_owner:
            mine_filter = or_(mine_filter, GameSession.host_id.is_(None))
        query = query.where(mine_filter)
    games = db.scalars(query).all()
    instructor_ids = {game.host_id or quiz.owner_id for game in games}
    summary = {
        "plays": len(games),
        "participants": sum(len(game.participants) for game in games),
    }
    if viewer_is_owner and effective_scope == "all":
        summary["instructors"] = len(instructor_ids)
    return {
        "quiz": {"id": quiz.id, "title": quiz.title, "owner_id": quiz.owner_id},
        "viewer_is_owner": viewer_is_owner,
        "scope": effective_scope,
        "summary": summary,
        "sessions": [
            {
                "id": game.id,
                "pin": game.pin,
                "status": game.status,
                "started_at": game.started_at,
                "ended_at": game.ended_at,
                "participant_count": len(game.participants),
                "host": {
                    "id": (game.host or quiz.owner).id,
                    "name": (game.host or quiz.owner).name,
                    "email": (game.host or quiz.owner).email,
                },
                "can_view_results": user.id in {quiz.owner_id, game.host_id or quiz.owner_id},
            }
            for game in games
        ],
    }


@router.get("/quizzes/{quiz_id}")
def get_quiz(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    return serialize_quiz(accessible_quiz(db, quiz_id, user.id), viewer_id=user.id)


@router.put("/quizzes/{quiz_id}")
def update_quiz(quiz_id: int, body: QuizIn, user: User = Depends(current_user), db: Session = Depends(get_db)):
    validate_quiz(body)
    quiz = owned_quiz(db, quiz_id, user.id)
    if db.scalar(select(func.count(GameSession.id)).where(GameSession.quiz_id == quiz.id, GameSession.started_at.is_not(None))):
        raise HTTPException(409, "Played quizzes are locked to preserve result history. Create a new quiz version instead.")
    if body.folder_id is not None:
        accessible_folder(db, body.folder_id, user.id)
    quiz.title, quiz.course_tag, quiz.folder_id = body.title.strip(), body.course_tag.strip(), body.folder_id
    quiz.questions.clear()
    db.flush()
    quiz.questions.extend(Question(position=index, **question.model_dump()) for index, question in enumerate(body.questions))
    db.commit()
    return serialize_quiz(owned_quiz(db, quiz_id, user.id), viewer_id=user.id)


@router.delete("/quizzes/{quiz_id}", status_code=204)
def delete_quiz(quiz_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)):
    quiz = owned_quiz(db, quiz_id, user.id)
    pending_sessions = db.scalars(select(GameSession).where(GameSession.quiz_id == quiz.id, GameSession.started_at.is_(None))).all()
    for game in pending_sessions:
        manager.cancel_session_tasks(game.id)
        db.delete(game)
    quiz.deleted_at = utcnow()
    db.commit()
