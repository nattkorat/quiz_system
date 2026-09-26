"""QuizForge ASGI application assembly."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS, CORS_ORIGIN_REGEX
from .lifecycle import lifespan
from .routers import admin, auth, health, library, live, reports, sessions


app = FastAPI(title="QuizForge API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_origin_regex=CORS_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(library.router)
app.include_router(sessions.router)
app.include_router(reports.router)
app.include_router(live.router)
