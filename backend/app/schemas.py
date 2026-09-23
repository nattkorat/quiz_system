from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class QuestionIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    type: str = "single"
    options: list[str] = Field(min_length=2, max_length=6)
    correct_options: list[int] = Field(min_length=1)
    time_limit_sec: int = Field(default=20, ge=5, le=300)
    points: int = Field(default=1000, ge=0, le=100000)

    @field_validator("type")
    @classmethod
    def valid_type(cls, value: str):
        if value not in {"single", "multi"}:
            raise ValueError("type must be single or multi")
        return value

    @field_validator("options")
    @classmethod
    def nonempty_options(cls, value: list[str]):
        if any(not item.strip() for item in value):
            raise ValueError("options cannot be blank")
        return [item.strip() for item in value]


class QuizIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    course_tag: str = Field(default="", max_length=80)
    folder_id: int | None = None
    questions: list[QuestionIn] = Field(default_factory=list)


class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    course_tag: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=500)


class FolderMemberIn(BaseModel):
    email: EmailStr


class JoinIn(BaseModel):
    pin: str = Field(min_length=4, max_length=6)
    display_name: str = Field(min_length=1, max_length=80)
    student_id: str | None = Field(default=None, max_length=120)
    resume_token: str | None = None


class SessionOut(BaseModel):
    id: int
    quiz_id: int
    pin: str
    status: str
    current_question_index: int | None
    is_revealed: bool
    started_at: datetime | None
    ended_at: datetime | None
