"""Quiz and course-folder access rules shared by HTTP routers."""

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from .models import CourseFolder, FolderMember, Quiz, QuizMember
from .schemas import QuizIn


def serialize_quiz(quiz: Quiz, include_answers: bool = True, viewer_id: int | None = None) -> dict:
    questions = []
    for question in quiz.questions:
        item = {
            "id": question.id,
            "position": question.position,
            "text": question.text,
            "type": question.type,
            "options": question.options,
            "match_options": question.match_options or [],
            "time_limit_sec": question.time_limit_sec,
            "points": question.points,
        }
        if include_answers:
            item["correct_options"] = question.correct_options
        questions.append(item)
    return {
        "id": quiz.id,
        "title": quiz.title,
        "course_tag": quiz.course_tag,
        "created_at": quiz.created_at,
        "questions": questions,
        "owner": {"id": quiz.owner.id, "name": quiz.owner.name, "email": quiz.owner.email},
        "folder": {"id": quiz.folder.id, "name": quiz.folder.name, "course_tag": quiz.folder.course_tag} if quiz.folder else None,
        "can_edit": viewer_id == quiz.owner_id if viewer_id else False,
    }


def owned_quiz(db: Session, quiz_id: int, user_id: int) -> Quiz:
    quiz = db.scalar(
        select(Quiz)
        .where(Quiz.id == quiz_id, Quiz.owner_id == user_id, Quiz.deleted_at.is_(None))
        .options(selectinload(Quiz.questions), selectinload(Quiz.owner), selectinload(Quiz.folder))
    )
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    return quiz


def accessible_folder(db: Session, folder_id: int, user_id: int, owner_only: bool = False) -> CourseFolder:
    query = (
        select(CourseFolder)
        .where(CourseFolder.id == folder_id)
        .options(
            selectinload(CourseFolder.owner),
            selectinload(CourseFolder.members).selectinload(FolderMember.user),
            selectinload(CourseFolder.quizzes),
        )
    )
    if owner_only:
        query = query.where(CourseFolder.owner_id == user_id)
    else:
        member_folders = select(FolderMember.folder_id).where(FolderMember.user_id == user_id)
        query = query.where(or_(CourseFolder.owner_id == user_id, CourseFolder.id.in_(member_folders)))
    folder = db.scalar(query)
    if not folder:
        raise HTTPException(404, "Course folder not found")
    return folder


def accessible_quiz(db: Session, quiz_id: int, user_id: int) -> Quiz:
    member_folders = select(FolderMember.folder_id).where(FolderMember.user_id == user_id)
    member_quizzes = select(QuizMember.quiz_id).where(QuizMember.user_id == user_id)
    quiz = db.scalar(
        select(Quiz)
        .where(
            Quiz.id == quiz_id,
            Quiz.deleted_at.is_(None),
            or_(
                Quiz.owner_id == user_id,
                Quiz.folder.has(CourseFolder.owner_id == user_id),
                Quiz.folder_id.in_(member_folders),
                Quiz.id.in_(member_quizzes),
            ),
        )
        .options(selectinload(Quiz.questions), selectinload(Quiz.owner), selectinload(Quiz.folder))
    )
    if not quiz:
        raise HTTPException(404, "Quiz not found")
    return quiz


def serialize_folder(folder: CourseFolder, viewer_id: int) -> dict:
    return {
        "id": folder.id,
        "name": folder.name,
        "course_tag": folder.course_tag,
        "description": folder.description,
        "created_at": folder.created_at,
        "owner": {"id": folder.owner.id, "name": folder.owner.name, "email": folder.owner.email},
        "is_owner": folder.owner_id == viewer_id,
        "quiz_count": sum(1 for quiz in folder.quizzes if quiz.deleted_at is None),
        "members": [
            {"id": membership.user.id, "name": membership.user.name, "email": membership.user.email}
            for membership in folder.members
        ],
    }


def validate_quiz(body: QuizIn):
    for index, question in enumerate(body.questions):
        valid = set(range(len(question.options)))
        if not set(question.correct_options).issubset(valid):
            raise HTTPException(422, f"Question {index + 1} has an invalid correct option")
