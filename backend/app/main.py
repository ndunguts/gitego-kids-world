from contextlib import asynccontextmanager
import os
from typing import Optional

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text
from sqlalchemy.orm import Session

from app.config import settings
from app.database import Base, SessionLocal, engine, get_db
from app.models import Game, Lesson, Storybook, Video
from app.routers import (
    admin,
    analytics,
    auth,
    categories,
    children,
    game_studio,
    games,
    languages,
    learning,
    parents,
    rewards,
    storybooks,
    users,
    videos,
)
from app.security import check_rate_limit
from app.seed import seed_database


def _ensure_child_profile_columns():
    inspector = inspect(engine)
    if "child_profiles" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("child_profiles")}
    needed = [
        ("is_suspended", "BOOLEAN NOT NULL DEFAULT 0"),
        ("suspended_until", "DATETIME"),
        ("suspension_reason", "VARCHAR(255)"),
        ("last_seen_at", "DATETIME"),
        ("current_activity", "VARCHAR(255)"),
        ("active_device_id", "VARCHAR(120)"),
    ]
    with engine.begin() as conn:
        for col_name, col_sql in needed:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE child_profiles ADD COLUMN {col_name} {col_sql}"))


def _ensure_video_columns():
    inspector = inspect(engine)
    if "videos" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("videos")}
    if "ad_settings_json" not in existing:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE videos ADD COLUMN ad_settings_json TEXT"))


def _ensure_lesson_columns():
    inspector = inspect(engine)
    if "lessons" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("lessons")}
    needed = [
        ("content_type", "VARCHAR(20) NOT NULL DEFAULT 'lesson'"),
        ("grade_level", "VARCHAR(20) NOT NULL DEFAULT 'P1'"),
        ("duration_minutes", "INTEGER NOT NULL DEFAULT 15"),
    ]
    with engine.begin() as conn:
        for col_name, col_sql in needed:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE lessons ADD COLUMN {col_name} {col_sql}"))


def _ensure_user_columns():
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {col["name"] for col in inspector.get_columns("users")}
    needed = [
        ("is_suspended", "BOOLEAN NOT NULL DEFAULT 0"),
        ("suspended_until", "DATETIME"),
        ("suspension_reason", "VARCHAR(255)"),
        ("warning_count", "INTEGER NOT NULL DEFAULT 0"),
        ("last_active_at", "DATETIME"),
        ("current_activity", "VARCHAR(255)"),
    ]
    with engine.begin() as conn:
        for col_name, col_sql in needed:
            if col_name not in existing:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_sql}"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    _ensure_user_columns()
    _ensure_child_profile_columns()
    _ensure_video_columns()
    _ensure_lesson_columns()
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=f"{settings.PROJECT_NAME} — {settings.TAGLINE}. Production children's digital entertainment and learning platform API.",
    version="1.0.0",
    lifespan=lifespan,
    dependencies=[Depends(check_rate_limit)],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def security_headers_middleware(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    return response


# Register all 14 modular API routers
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(parents.router)
app.include_router(children.router)
app.include_router(games.router)
app.include_router(game_studio.router)
app.include_router(storybooks.router)
app.include_router(videos.router)
app.include_router(learning.router)
app.include_router(rewards.router)
app.include_router(analytics.router)
app.include_router(categories.router)
app.include_router(languages.router)
app.include_router(admin.router)


@app.get("/api/v1/health", tags=["Health & Discovery"])
def health_check():
    return {
        "status": "healthy",
        "platform": settings.PROJECT_NAME,
        "tagline": settings.TAGLINE,
    }


@app.get("/api/v1/search", tags=["Global Search & Content Discovery"])
def global_search(
    q: Optional[str] = None,
    language: Optional[str] = None,
    age_group: Optional[str] = None,
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    sort_by: str = "popularity",  # popularity, recent
    db: Session = Depends(get_db),
):
    """Global discovery search across Games, Storybooks, Cartoons/Videos, and Lessons."""
    games_q = db.query(Game).filter(Game.status == "Published")
    books_q = db.query(Storybook).filter(Storybook.status == "Published")
    videos_q = db.query(Video).filter(Video.status == "Published")
    lessons_q = db.query(Lesson).filter(Lesson.status == "Published")

    if q:
        games_q = games_q.filter((Game.title.ilike(f"%{q}%")) | (Game.description.ilike(f"%{q}%")))
        books_q = books_q.filter((Storybook.title.ilike(f"%{q}%")) | (Storybook.description.ilike(f"%{q}%")))
        videos_q = videos_q.filter((Video.title.ilike(f"%{q}%")) | (Video.description.ilike(f"%{q}%")))
        lessons_q = lessons_q.filter((Lesson.title.ilike(f"%{q}%")) | (Lesson.description.ilike(f"%{q}%")))

    if language:
        games_q = games_q.filter(Game.supported_languages.ilike(f"%{language}%"))
        books_q = books_q.filter(Storybook.language_code == language)
        videos_q = videos_q.filter(Video.language_code == language)
        lessons_q = lessons_q.filter(Lesson.language_code == language)

    if age_group:
        games_q = games_q.filter(Game.age_group == age_group)
        books_q = books_q.filter(Storybook.age_group == age_group)
        videos_q = videos_q.filter(Video.age_group == age_group)
        lessons_q = lessons_q.filter(Lesson.age_group == age_group)

    if category:
        games_q = games_q.filter(Game.category_name.ilike(f"%{category}%"))
        books_q = books_q.filter(Storybook.category_name.ilike(f"%{category}%"))
        videos_q = videos_q.filter(Video.category_name.ilike(f"%{category}%"))

    if difficulty:
        games_q = games_q.filter(Game.difficulty == difficulty)
        books_q = books_q.filter(Storybook.difficulty == difficulty)
        lessons_q = lessons_q.filter(Lesson.difficulty == difficulty)

    if sort_by == "recent":
        games_list = games_q.order_by(Game.created_at.desc()).all()
        books_list = books_q.order_by(Storybook.created_at.desc()).all()
        videos_list = videos_q.order_by(Video.created_at.desc()).all()
    else:
        games_list = games_q.order_by(Game.play_count.desc()).all()
        books_list = books_q.order_by(Storybook.read_count.desc()).all()
        videos_list = videos_q.order_by(Video.view_count.desc()).all()
    lessons_list = lessons_q.order_by(Lesson.id.asc()).all()

    return {
        "games": [
            {
                "id": g.id,
                "title": g.title,
                "description": g.description,
                "cover_image": g.cover_image,
                "category_name": g.category_name,
                "age_group": g.age_group,
                "difficulty": g.difficulty,
                "game_engine": g.game_engine,
                "play_count": g.play_count,
            }
            for g in games_list
        ],
        "storybooks": [
            {
                "id": b.id,
                "title": b.title,
                "description": b.description,
                "cover_image": b.cover_image,
                "language_code": b.language_code,
                "category_name": b.category_name,
                "age_group": b.age_group,
                "difficulty": b.difficulty,
                "read_count": b.read_count,
            }
            for b in books_list
        ],
        "videos": [
            {
                "id": v.id,
                "title": v.title,
                "description": v.description,
                "thumbnail_url": v.thumbnail_url,
                "provider": v.provider,
                "language_code": v.language_code,
                "category_name": v.category_name,
                "age_group": v.age_group,
                "view_count": v.view_count,
            }
            for v in videos_list
        ],
        "lessons": [
            {
                "id": l.id,
                "title": l.title,
                "description": l.description,
                "image_url": l.image_url,
                "language_code": l.language_code,
                "age_group": l.age_group,
                "difficulty": l.difficulty,
            }
            for l in lessons_list
        ],
    }


# Mount media uploads directory
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

# Serve frontend SPA if present
FRONTEND_DIR = os.path.abspath(
    os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend")
)
if os.path.isdir(os.path.join(FRONTEND_DIR, "src")):
    app.mount("/src", StaticFiles(directory=os.path.join(FRONTEND_DIR, "src")), name="frontend_src")
if os.path.isdir(os.path.join(FRONTEND_DIR, "icons")):
    app.mount("/icons", StaticFiles(directory=os.path.join(FRONTEND_DIR, "icons")), name="frontend_icons")


@app.get("/manifest.webmanifest", include_in_schema=False)
def serve_pwa_manifest():
    p = os.path.join(FRONTEND_DIR, "manifest.webmanifest")
    if os.path.isfile(p):
        return FileResponse(p, media_type="application/manifest+json")
    return {}


@app.get("/sw.js", include_in_schema=False)
def serve_service_worker():
    p = os.path.join(FRONTEND_DIR, "sw.js")
    if os.path.isfile(p):
        return FileResponse(p, media_type="application/javascript")
    return ""


@app.get("/", include_in_schema=False)
def serve_spa_index():
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(index_path):
        return FileResponse(index_path)
    return {"message": "GITEGO KIDS WORLD API is running. Visit /docs for OpenAPI documentation."}
