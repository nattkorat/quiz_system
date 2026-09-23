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


DATABASE_URL = required_env("DATABASE_URL")
JWT_SECRET = required_env("JWT_SECRET")
DEFAULT_INSTRUCTOR_NAME = required_env("DEFAULT_INSTRUCTOR_NAME")
DEFAULT_INSTRUCTOR_EMAIL = required_env("DEFAULT_INSTRUCTOR_EMAIL").lower()
DEFAULT_INSTRUCTOR_PASSWORD = required_env("DEFAULT_INSTRUCTOR_PASSWORD")
CORS_ORIGINS = [origin.strip() for origin in required_env("CORS_ORIGINS").split(",") if origin.strip()]
RESULT_DISPLAY_SECONDS = max(1, int(required_env("RESULT_DISPLAY_SECONDS")))

if len(JWT_SECRET) < 32:
    raise RuntimeError("JWT_SECRET must contain at least 32 characters")
