import secrets

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..auth import create_password_reset_token, create_token, current_user, decode_password_reset_token, hash_password, password_fingerprint, verify_password
from ..config import ALLOW_PUBLIC_REGISTRATION, PASSWORD_RESET_BASE_URL, PASSWORD_RESET_ENABLED, PASSWORD_RESET_EXPIRE_MINUTES
from ..database import get_db
from ..mailer import send_password_reset_email
from ..models import User, utcnow
from ..schemas import ForgotPasswordIn, LoginIn, RegisterIn, ResetPasswordIn


router = APIRouter(prefix="/api/auth", tags=["authentication"])


def user_json(user: User):
    return {"id": user.id, "name": user.name, "email": user.email, "is_admin": user.is_admin, "is_active": user.is_active}


@router.post("/register", status_code=201)
def register(body: RegisterIn, db: Session = Depends(get_db)):
    if not ALLOW_PUBLIC_REGISTRATION:
        raise HTTPException(403, "Instructor registration is disabled")
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "Email already registered")
    user = User(name=body.name.strip(), email=body.email.lower(), password_hash=hash_password(body.password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"access_token": create_token(user), "user": user_json(user)}


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "Incorrect email or password")
    if not user.is_active:
        raise HTTPException(403, "This account has been suspended. Contact your administrator.")
    user.last_login_at = utcnow()
    db.commit()
    return {"access_token": create_token(user), "user": user_json(user)}


@router.get("/me")
def me(user: User = Depends(current_user)):
    return user_json(user)


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordIn, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    if not PASSWORD_RESET_ENABLED:
        raise HTTPException(503, "Password reset email is not configured. Contact your administrator.")
    user = db.scalar(select(User).where(User.email == body.email.lower()))
    if user:
        token = create_password_reset_token(user, PASSWORD_RESET_EXPIRE_MINUTES)
        reset_url = f"{PASSWORD_RESET_BASE_URL}/reset-password?token={token}"
        background_tasks.add_task(send_password_reset_email, user.email, reset_url)
    return {"message": "If that instructor account exists, a reset link has been sent."}


@router.post("/reset-password")
def reset_password(body: ResetPasswordIn, db: Session = Depends(get_db)):
    user_id, expected_fingerprint = decode_password_reset_token(body.token)
    user = db.get(User, user_id)
    if not user or not secrets.compare_digest(password_fingerprint(user.password_hash), expected_fingerprint):
        raise HTTPException(400, "This password reset link is invalid or has already been used")
    user.password_hash = hash_password(body.password)
    db.commit()
    return {"message": "Password updated"}
