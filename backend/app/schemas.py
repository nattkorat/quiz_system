from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str = Field(min_length=20, max_length=2000)
    password: str = Field(min_length=8, max_length=128)


class QuestionIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    type: str = "single"
    options: list[str] = Field(min_length=2, max_length=6)
    match_options: list[str] = Field(default_factory=list, max_length=6)
    correct_options: list[int] = Field(default_factory=list, max_length=6)
    time_limit_sec: int = Field(default=20, ge=5, le=300)
    points: int = Field(default=1000, ge=0, le=100000)

    @field_validator("type")
    @classmethod
    def valid_type(cls, value: str):
        if value not in {"single", "multi", "order", "matching"}:
            raise ValueError("unsupported question type")
        return value

    @field_validator("options")
    @classmethod
    def nonempty_options(cls, value: list[str]):
        if any(not item.strip() for item in value):
            raise ValueError("options cannot be blank")
        return [item.strip() for item in value]

    @field_validator("match_options")
    @classmethod
    def nonempty_match_options(cls, value: list[str]):
        if any(not item.strip() for item in value):
            raise ValueError("matching answers cannot be blank")
        return [item.strip() for item in value]

    @model_validator(mode="after")
    def valid_answer_shape(self):
        if self.type == "single" and len(self.correct_options) != 1:
            raise ValueError("single choice requires exactly one correct answer")
        if self.type == "multi" and not self.correct_options:
            raise ValueError("multiple choice requires at least one correct answer")
        if self.type == "order" and len(self.options) < 3:
            raise ValueError("ordering requires at least three items")
        if self.type == "matching" and len(self.match_options) != len(self.options):
            raise ValueError("matching requires one answer for every prompt")
        if self.type in {"order", "matching"} and self.correct_options:
            raise ValueError("interactive questions do not use correct_options")
        return self


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
