from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    ActivityLog,
    Game,
    GameCategory,
    GameFile,
    GameProject,
    GameVersion,
    User,
)
from app.security import require_roles
from app.services.game_bundler import compile_game_bundle, validate_game_files

router = APIRouter(prefix="/api/v1/game-studio", tags=["Game Studio (Admin IDE)"])


class CreateStudioGameRequest(BaseModel):
    title: str
    description: str
    instructions: str = "Tap Play to start!"
    cover_image: str = "🎮"
    category_name: str = "Arcade & Adventure"
    age_group: str = "6-8"
    difficulty: str = "Easy"
    supported_languages: str = "rw,fr,sw,en"
    game_engine: str = "HTML5_JS"  # HTML5_JS, PHASER, TYPESCRIPT, PYTHON_PYODIDE
    max_possible_score: int = 1000
    initial_files: Optional[list[dict]] = None


class UpdateGameMetadataRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    instructions: Optional[str] = None
    cover_image: Optional[str] = None
    category_name: Optional[str] = None
    age_group: Optional[str] = None
    difficulty: Optional[str] = None
    supported_languages: Optional[str] = None
    game_engine: Optional[str] = None
    max_possible_score: Optional[int] = None
    status: Optional[str] = None
    autosave_enabled: Optional[bool] = None


class CreateOrUpdateFileRequest(BaseModel):
    filename: str
    language: str = "javascript"
    content: str = ""


class RenameFileRequest(BaseModel):
    new_filename: str


class SaveProjectFilesRequest(BaseModel):
    files: list[CreateOrUpdateFileRequest]
    autosave: bool = False


class PublishGameRequest(BaseModel):
    version_number: Optional[str] = None
    changelog: str = "Published from Game Studio"


DEFAULT_TEMPLATES = {
    "HTML5_JS": [
        {
            "filename": "index.html",
            "language": "html",
            "content": '<div class="studio-game">\n  <h2 id="title">🎮 My Gitego Game</h2>\n  <button id="score-btn">Tap Me! (+10)</button>\n  <p id="readout">Score: 0</p>\n</div>',
        },
        {
            "filename": "style.css",
            "language": "css",
            "content": ".studio-game { text-align: center; padding: 24px; }\n#score-btn { background: #22c55e; color: #fff; border: none; padding: 14px 28px; font-size: 1.2rem; border-radius: 999px; font-weight: 800; cursor: pointer; }",
        },
        {
            "filename": "game.js",
            "language": "javascript",
            "content": "let score = 0;\ndocument.getElementById('score-btn').addEventListener('click', () => {\n  score += 10;\n  document.getElementById('readout').textContent = 'Score: ' + score;\n  if (window.GitegoGameAPI) window.GitegoGameAPI.submitScore(score, score >= 50);\n});",
        },
    ],
    "PHASER": [
        {
            "filename": "index.html",
            "language": "html",
            "content": '<div id="phaser-root"></div>',
        },
        {
            "filename": "style.css",
            "language": "css",
            "content": "#phaser-root { text-align: center; }",
        },
        {
            "filename": "game.js",
            "language": "javascript",
            "content": "let score = 0;\nnew Phaser.Game({\n  type: Phaser.AUTO,\n  width: 520,\n  height: 300,\n  parent: 'phaser-root',\n  backgroundColor: '#1e1b4b',\n  scene: {\n    create: function() {\n      const txt = this.add.text(20, 30, 'Phaser Score: 0', { fontSize: '20px', color: '#fde047' });\n      const ball = this.add.circle(260, 150, 26, 0x38bdf8);\n      this.input.on('pointerdown', (p) => {\n        ball.x = p.x; ball.y = p.y;\n        score += 15;\n        txt.setText('Phaser Score: ' + score);\n        if (window.GitegoGameAPI) window.GitegoGameAPI.submitScore(score, score >= 60);\n      });\n    }\n  }\n});",
        },
    ],
    "TYPESCRIPT": [
        {
            "filename": "index.html",
            "language": "html",
            "content": '<div id="ts-game"><button id="ts-btn">TypeScript Boost 🚀</button><p id="ts-out">0</p></div>',
        },
        {
            "filename": "style.css",
            "language": "css",
            "content": "#ts-game { text-align: center; padding: 20px; } #ts-btn { padding: 12px 24px; border-radius: 12px; background: #38bdf8; border: none; font-weight: 800; cursor: pointer; }",
        },
        {
            "filename": "game.ts",
            "language": "typescript",
            "content": "let points: number = 0;\nconst btn = document.getElementById('ts-btn');\nif (btn) {\n  btn.addEventListener('click', () => {\n    points += 25;\n    const out = document.getElementById('ts-out');\n    if (out) out.textContent = String(points);\n    if (window.GitegoGameAPI) window.GitegoGameAPI.submitScore(points, points >= 50);\n  });\n}",
        },
    ],
    "PYTHON_PYODIDE": [
        {
            "filename": "index.html",
            "language": "html",
            "content": '<div id="py-output"></div>',
        },
        {
            "filename": "main.py",
            "language": "python",
            "content": '# Browser-Sandboxed Python Game (Pyodide / Canvas Bridge)\n# Limitations: Runs inside browser sandbox only; server modules (os, subprocess, socket) are prohibited.\nTITLE = "Python Safari Quest"\nGOAL = 4\nPLAYER_EMOJI = "🦁"\nITEM_EMOJI = "🥩"\n\ndef calculate_bonus(level):\n    return level * 10\n',
        },
    ],
}


def _serialize_studio_game(g: Game) -> dict:
    files = []
    if g.project:
        files = [
            {
                "id": f.id,
                "filename": f.filename,
                "language": f.language,
                "content": f.content,
                "updated_at": f.updated_at.isoformat() if f.updated_at else None,
            }
            for f in g.project.files
        ]
    return {
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "instructions": g.instructions,
        "cover_image": g.cover_image,
        "category_name": g.category_name,
        "age_group": g.age_group,
        "difficulty": g.difficulty,
        "supported_languages": g.supported_languages,
        "game_engine": g.game_engine,
        "published_version": g.published_version,
        "status": g.status,
        "max_possible_score": g.max_possible_score,
        "play_count": g.play_count,
        "project": {
            "id": g.project.id if g.project else None,
            "entry_file": g.project.entry_file if g.project else "index.html",
            "engine_type": g.project.engine_type if g.project else g.game_engine,
            "autosave_enabled": g.project.autosave_enabled if g.project else True,
            "last_validation_errors": g.project.last_validation_errors if g.project else None,
            "files": files,
        },
        "versions": [
            {
                "id": v.id,
                "version_number": v.version_number,
                "changelog": v.changelog,
                "created_at": v.created_at.isoformat() if v.created_at else None,
            }
            for v in g.versions
        ],
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
    }


@router.get("/projects")
def list_studio_projects(
    status_filter: Optional[str] = None,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    q = db.query(Game)
    if status_filter:
        q = q.filter(Game.status == status_filter)
    games = q.order_by(Game.updated_at.desc(), Game.id.desc()).all()
    return [_serialize_studio_game(g) for g in games]


@router.get("/projects/{game_id}")
def get_studio_project(
    game_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    g = db.query(Game).filter(Game.id == game_id).first()
    if not g:
        raise HTTPException(status_code=404, detail="Game project not found")
    return _serialize_studio_game(g)


@router.post("/projects", status_code=status.HTTP_201_CREATED)
def create_studio_game(
    req: CreateStudioGameRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    gcat = db.query(GameCategory).filter(GameCategory.name == req.category_name).first()
    game = Game(
        title=req.title,
        description=req.description,
        instructions=req.instructions,
        cover_image=req.cover_image,
        category_id=gcat.id if gcat else None,
        category_name=req.category_name,
        age_group=req.age_group,
        difficulty=req.difficulty,
        supported_languages=req.supported_languages,
        game_engine=req.game_engine,
        status="Draft",
        published_version="0.1.0",
        max_possible_score=req.max_possible_score,
        created_by_id=admin.id,
    )
    db.add(game)
    db.flush()

    project = GameProject(
        game_id=game.id,
        entry_file="index.html",
        engine_type=req.game_engine,
        autosave_enabled=True,
    )
    db.add(project)
    db.flush()

    seed_files = req.initial_files or DEFAULT_TEMPLATES.get(req.game_engine, DEFAULT_TEMPLATES["HTML5_JS"])
    for f in seed_files:
        db.add(
            GameFile(
                project_id=project.id,
                filename=f["filename"],
                language=f.get("language", "javascript"),
                content=f.get("content", ""),
            )
        )

    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="CREATE_STUDIO_GAME",
            resource_type="game",
            resource_id=str(game.id),
            summary=f"Created new Game Studio project '{game.title}' ({game.game_engine})",
        )
    )
    db.commit()
    db.refresh(game)
    return _serialize_studio_game(game)


@router.patch("/projects/{game_id}")
def update_studio_game_metadata(
    game_id: int,
    req: UpdateGameMetadataRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    if req.status is not None and req.status not in {"Draft", "Review", "Published", "Archived"}:
        raise HTTPException(status_code=400, detail="Invalid game status")
    if req.max_possible_score is not None and req.max_possible_score < 1:
        raise HTTPException(status_code=400, detail="max_possible_score must be at least 1")

    for field in [
        "title",
        "description",
        "instructions",
        "cover_image",
        "category_name",
        "age_group",
        "difficulty",
        "supported_languages",
        "game_engine",
        "max_possible_score",
        "status",
    ]:
        val = getattr(req, field)
        if val is not None:
            setattr(game, field, val)

    if req.category_name is not None:
        gcat = db.query(GameCategory).filter(GameCategory.name == req.category_name).first()
        game.category_id = gcat.id if gcat else None
    if req.game_engine and game.project:
        game.project.engine_type = req.game_engine
    if req.autosave_enabled is not None and game.project:
        game.project.autosave_enabled = req.autosave_enabled

    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="UPDATE_STUDIO_GAME",
            resource_type="game",
            resource_id=str(game.id),
            summary=f"Updated game metadata/settings for '{game.title}'",
        )
    )
    db.commit()
    db.refresh(game)
    return _serialize_studio_game(game)


@router.post("/projects/{game_id}/duplicate", status_code=status.HTTP_201_CREATED)
def duplicate_studio_game(
    game_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    src = db.query(Game).filter(Game.id == game_id).first()
    if not src:
        raise HTTPException(status_code=404, detail="Game project not found")

    clone = Game(
        title=f"{src.title} (Copy)",
        description=src.description,
        instructions=src.instructions,
        cover_image=src.cover_image,
        category_id=src.category_id,
        category_name=src.category_name,
        age_group=src.age_group,
        difficulty=src.difficulty,
        supported_languages=src.supported_languages,
        game_engine=src.game_engine,
        status="Draft",
        published_version="0.1.0",
        max_possible_score=src.max_possible_score,
        created_by_id=admin.id,
    )
    db.add(clone)
    db.flush()

    clone_project = GameProject(
        game_id=clone.id,
        entry_file=src.project.entry_file if src.project else "index.html",
        engine_type=src.project.engine_type if src.project else src.game_engine,
        autosave_enabled=src.project.autosave_enabled if src.project else True,
    )
    db.add(clone_project)
    db.flush()

    src_files = src.project.files if src.project else []
    if src_files:
        for f in src_files:
            db.add(
                GameFile(
                    project_id=clone_project.id,
                    filename=f.filename,
                    language=f.language,
                    content=f.content,
                )
            )
    else:
        for f in DEFAULT_TEMPLATES.get(src.game_engine, DEFAULT_TEMPLATES["HTML5_JS"]):
            db.add(
                GameFile(
                    project_id=clone_project.id,
                    filename=f["filename"],
                    language=f.get("language", "javascript"),
                    content=f.get("content", ""),
                )
            )

    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="DUPLICATE_STUDIO_GAME",
            resource_type="game",
            resource_id=str(clone.id),
            summary=f"Duplicated game '{src.title}' as '{clone.title}'",
        )
    )
    db.commit()
    db.refresh(clone)
    return _serialize_studio_game(clone)


@router.delete("/projects/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_studio_game(
    game_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game project not found")

    title = game.title
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="DELETE_STUDIO_GAME",
            resource_type="game",
            resource_id=str(game.id),
            summary=f"Deleted Game Studio project '{title}'",
        )
    )
    db.delete(game)
    db.commit()


@router.put("/projects/{game_id}/files")
def save_all_project_files(
    game_id: int,
    req: SaveProjectFilesRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game or not game.project:
        raise HTTPException(status_code=404, detail="Game project not found")

    raw_files = [
        {"filename": f.filename, "language": f.language, "content": f.content}
        for f in req.files
    ]
    errors = validate_game_files(game.game_engine, raw_files)
    game.project.last_validation_errors = "\n".join(errors) if errors else None

    # Replace project files atomically
    db.query(GameFile).filter(GameFile.project_id == game.project.id).delete()
    db.flush()
    for f in req.files:
        db.add(
            GameFile(
                project_id=game.project.id,
                filename=f.filename,
                language=f.language,
                content=f.content,
            )
        )
    db.commit()
    db.refresh(game)
    return {
        "saved": True,
        "autosave": req.autosave,
        "validation_errors": errors,
        "project": _serialize_studio_game(game)["project"],
    }


@router.post("/projects/{game_id}/files", status_code=status.HTTP_201_CREATED)
def create_or_update_single_file(
    game_id: int,
    req: CreateOrUpdateFileRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game or not game.project:
        raise HTTPException(status_code=404, detail="Game project not found")
    existing = (
        db.query(GameFile)
        .filter(
            GameFile.project_id == game.project.id,
            GameFile.filename == req.filename,
        )
        .first()
    )
    if existing:
        existing.language = req.language
        existing.content = req.content
    else:
        existing = GameFile(
            project_id=game.project.id,
            filename=req.filename,
            language=req.language,
            content=req.content,
        )
        db.add(existing)
    db.commit()
    db.refresh(game)
    return _serialize_studio_game(game)


@router.patch("/projects/{game_id}/files/{file_id}/rename")
def rename_project_file(
    game_id: int,
    file_id: int,
    req: RenameFileRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game or not game.project:
        raise HTTPException(status_code=404, detail="Game project not found")
    gf = (
        db.query(GameFile)
        .filter(GameFile.id == file_id, GameFile.project_id == game.project.id)
        .first()
    )
    if not gf:
        raise HTTPException(status_code=404, detail="File not found in project")
    gf.filename = req.new_filename
    db.commit()
    db.refresh(game)
    return _serialize_studio_game(game)


@router.delete("/projects/{game_id}/files/{file_id}")
def delete_project_file(
    game_id: int,
    file_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game or not game.project:
        raise HTTPException(status_code=404, detail="Game project not found")
    gf = (
        db.query(GameFile)
        .filter(GameFile.id == file_id, GameFile.project_id == game.project.id)
        .first()
    )
    if not gf:
        raise HTTPException(status_code=404, detail="File not found")
    db.delete(gf)
    db.commit()
    db.refresh(game)
    return _serialize_studio_game(game)


@router.get("/projects/{game_id}/preview", response_class=HTMLResponse)
def preview_studio_game(
    game_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    """Compile and return live preview bundle for the Game Studio sandboxed iframe."""
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game or not game.project:
        raise HTTPException(status_code=404, detail="Game project not found")
    files = [
        {"filename": f.filename, "language": f.language, "content": f.content}
        for f in game.project.files
    ]
    bundle = compile_game_bundle(game.game_engine, files)
    return HTMLResponse(
        content=bundle,
        headers={
            "X-Frame-Options": "SAMEORIGIN",
            "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;",
        },
    )


@router.post("/projects/{game_id}/submit-review")
def submit_game_for_review(
    game_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game or not game.project:
        raise HTTPException(status_code=404, detail="Game project not found")
    files = [
        {"filename": f.filename, "language": f.language, "content": f.content}
        for f in game.project.files
    ]
    errors = validate_game_files(game.game_engine, files)
    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Fix validation errors before submitting for review", "errors": errors},
        )
    game.status = "Review"
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="SUBMIT_GAME_REVIEW",
            resource_type="game",
            resource_id=str(game.id),
            summary=f"Submitted game '{game.title}' for review",
        )
    )
    db.commit()
    return _serialize_studio_game(game)


@router.post("/projects/{game_id}/publish")
def publish_studio_game(
    game_id: int,
    req: PublishGameRequest,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game or not game.project:
        raise HTTPException(status_code=404, detail="Game project not found")

    files = [
        {"filename": f.filename, "language": f.language, "content": f.content}
        for f in game.project.files
    ]
    errors = validate_game_files(game.game_engine, files)
    if errors:
        raise HTTPException(
            status_code=400,
            detail={"message": "Cannot publish game with security or syntax errors", "errors": errors},
        )

    compiled = compile_game_bundle(game.game_engine, files)
    next_version = req.version_number or f"1.{len(game.versions)}.0"
    game.published_version = next_version
    game.status = "Published"

    db.add(
        GameVersion(
            game_id=game.id,
            version_number=next_version,
            compiled_bundle=compiled,
            changelog=req.changelog,
            published_by_id=admin.id,
        )
    )
    db.add(
        ActivityLog(
            actor_user_id=admin.id,
            action_type="PUBLISH_GAME",
            resource_type="game",
            resource_id=str(game.id),
            summary=f"Published game '{game.title}' v{next_version}",
        )
    )
    db.commit()
    db.refresh(game)
    return _serialize_studio_game(game)


@router.post("/projects/{game_id}/archive")
def archive_studio_game(
    game_id: int,
    admin: User = Depends(require_roles(["SUPER_ADMIN", "CONTENT_ADMIN"])),
    db: Session = Depends(get_db),
):
    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    game.status = "Archived"
    db.commit()
    return _serialize_studio_game(game)
