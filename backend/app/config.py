import os
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(PROJECT_ROOT / ".env")


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def required_bool_env(name: str) -> bool:
    value = required_env(name).lower()
    if value not in {"true", "false"}:
        raise RuntimeError(f"Environment variable {name} must be true or false")
    return value == "true"


def optional_bool_env(name: str, default: bool = False) -> bool:
    value = os.getenv(name, str(default)).strip().lower()
    if value not in {"true", "false"}:
        raise RuntimeError(f"Environment variable {name} must be true or false")
    return value == "true"


DATABASE_URL = required_env("DATABASE_URL")
JWT_SECRET = required_env("JWT_SECRET")
DEFAULT_INSTRUCTOR_NAME = required_env("DEFAULT_INSTRUCTOR_NAME")
DEFAULT_INSTRUCTOR_EMAIL = required_env("DEFAULT_INSTRUCTOR_EMAIL").lower()
DEFAULT_INSTRUCTOR_PASSWORD = required_env("DEFAULT_INSTRUCTOR_PASSWORD")
CORS_ORIGINS = [origin.strip() for origin in required_env("CORS_ORIGINS").split(",") if origin.strip()]
CORS_ORIGIN_REGEX = os.getenv("CORS_ORIGIN_REGEX", "").strip() or None
ALLOW_PUBLIC_REGISTRATION = required_bool_env("ALLOW_PUBLIC_REGISTRATION")
RESULT_DISPLAY_SECONDS = max(1, int(required_env("RESULT_DISPLAY_SECONDS")))
MAX_PARTICIPANTS_PER_SESSION = max(1, int(os.getenv("MAX_PARTICIPANTS_PER_SESSION", "150")))
PENDING_SESSION_EXPIRE_HOURS = max(1, int(os.getenv("PENDING_SESSION_EXPIRE_HOURS", "2")))
PASSWORD_RESET_ENABLED = optional_bool_env("PASSWORD_RESET_ENABLED")
PASSWORD_RESET_BASE_URL = os.getenv("PASSWORD_RESET_BASE_URL", "").strip().rstrip("/")
PASSWORD_RESET_EXPIRE_MINUTES = max(5, int(os.getenv("PASSWORD_RESET_EXPIRE_MINUTES", "30")))
SMTP_HOST = os.getenv("SMTP_HOST", "").strip()
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_SECURITY = os.getenv("SMTP_SECURITY", "starttls").strip().lower()
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "").strip()
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
MAIL_FROM = os.getenv("MAIL_FROM", "").strip()

if len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET must contain at least 32 characters")
if SMTP_SECURITY not in {"starttls", "ssl", "none"}:
    raise RuntimeError("SMTP_SECURITY must be starttls, ssl, or none")
if PASSWORD_RESET_ENABLED and not all([PASSWORD_RESET_BASE_URL, SMTP_HOST, MAIL_FROM]):
    raise RuntimeError("Password reset requires PASSWORD_RESET_BASE_URL, SMTP_HOST, and MAIL_FROM")
