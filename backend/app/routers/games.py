import datetime
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    Achievement,
    ActivityLog,
    ChildAchievement,
    ChildProfile,
    Game,
    GameCategory,
    GameScore,
    GameSession,
    GameVersion,
    Reward,
    User,
)
from app.routers.children import resolve_active_child
from app.security import get_current_user

router = APIRouter(prefix="/api/v1/games", tags=["Games Library & Child Player"])


class StartGameSessionRequest(BaseModel):
    child_id: Optional[int] = None


class SubmitScoreRequest(BaseModel):
    session_token: str
    score: int
    duration_seconds: int = 30
    completed: bool = True


def _serialize_public_game(g: Game) -> dict:
    """Serialize game metadata for children/public WITHOUT exposing source code files."""
    return {
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "instructions": g.instructions,
        "cover_image": g.cover_image,
        "category_id": g.category_id,
        "category_name": g.category_name,
        "age_group": g.age_group,
        "difficulty": g.difficulty,
        "supported_languages": [x.strip() for x in g.supported_languages.split(",") if x.strip()],
        "game_engine": g.game_engine,
        "published_version": g.published_version,
        "status": g.status,
        "play_count": g.play_count,
        "created_at": g.created_at.isoformat() if g.created_at else None,
        "updated_at": g.updated_at.isoformat() if g.updated_at else None,
    }


@router.get("")
def list_published_games(
    category: Optional[str] = None,
    age_group: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Game).filter(Game.status == "Published")
    if category:
        q = q.filter(Game.category_name.ilike(f"%{category}%"))
    if age_group:
        q = q.filter(Game.age_group == age_group)
    if difficulty:
        q = q.filter(Game.difficulty == difficulty)
    if search:
        q = q.filter((Game.title.ilike(f"%{search}%")) | (Game.description.ilike(f"%{search}%")))

    games = q.order_by(Game.play_count.desc(), Game.id.asc()).all()
    return [_serialize_public_game(g) for g in games]


@router.get("/categories")
def list_game_categories(db: Session = Depends(get_db)):
    cats = db.query(GameCategory).order_by(GameCategory.id.asc()).all()
    return [
        {
            "id": c.id,
            "slug": c.slug,
            "name": c.name,
            "description": c.description,
            "icon": c.icon,
        }
        for c in cats
    ]


@router.get("/{game_id}")
def get_game_details(game_id: int, db: Session = Depends(get_db)):
    g = db.query(Game).filter(Game.id == game_id, Game.status == "Published").first()
    if not g:
        raise HTTPException(status_code=404, detail="Published game not found")
    top_score = (
        db.query(func.max(GameScore.score))
        .filter(GameScore.game_id == g.id)
        .scalar()
        or 0
    )
    data = _serialize_public_game(g)
    data["highest_score"] = top_score
    return data


@router.get("/{game_id}/play-bundle", response_class=HTMLResponse)
def get_published_game_play_bundle(game_id: int, db: Session = Depends(get_db)):
    """Return the compiled sandboxed HTML bundle for execution inside a strict <iframe sandbox='allow-scripts'>."""
    g = db.query(Game).filter(Game.id == game_id, Game.status == "Published").first()
    if not g:
        raise HTTPException(status_code=404, detail="Published game not found")
    latest_version = (
        db.query(GameVersion)
        .filter(GameVersion.game_id == g.id)
        .order_by(GameVersion.id.desc())
        .first()
    )
    if not latest_version:
        raise HTTPException(status_code=404, detail="No published bundle found for this game")
    bundle = latest_version.compiled_bundle
    # Published bundles are snapshots. Apply the responsive canvas constraint at
    # delivery time too, so existing Python games receive the fit fix immediately.
    fit_canvas_style = """
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <style>
      html, body {
        width: 100%;
        height: 100%;
        height: 100dvh;
        min-height: 0;
        overflow: hidden;
        touch-action: manipulation;
        -webkit-tap-highlight-color: transparent;
      }
      canvas {
        max-width: 100% !important;
        max-height: 100% !important;
        touch-action: none;
      }
      #pygame-canvas {
        display: block;
        height: auto !important;
        max-width: 100% !important;
        max-height: calc(100dvh - 72px) !important;
        object-fit: contain;
      }
      @media (max-width: 768px) {
        .gta-app {
          padding: 3px !important;
          gap: 3px !important;
        }
        .gta-topbar {
          flex-wrap: nowrap !important;
          overflow-x: auto !important;
          -webkit-overflow-scrolling: touch;
          padding: 4px 6px !important;
          gap: 4px !important;
          border-radius: 8px !important;
          scrollbar-width: none;
        }
        .gta-topbar::-webkit-scrollbar { display: none; }
        .tb-left, .tb-center, .tb-right {
          flex-wrap: nowrap !important;
          gap: 4px !important;
          flex-shrink: 0;
        }
        .brand-badge, .mission-title, #districtBadge, #windReadout {
          display: none !important;
        }
        .hud-chip, .gta-btn {
          padding: 4px 7px !important;
          font-size: 0.7rem !important;
          white-space: nowrap !important;
        }
        .gta-viewport, .viewport-wrap, #gameWrap, .game-wrap, .stage {
          flex: 1 1 0 !important;
          min-height: 0 !important;
          width: 100% !important;
        }
        /* Gitego Piano mobile fix: stack single-column & put playable piano on top */
        body:has(.piano-app) {
          padding: 4px !important;
          overflow-y: auto !important;
          height: auto !important;
          min-height: 100dvh !important;
        }
        .piano-app {
          grid-template-columns: 1fr !important;
          height: auto !important;
          min-height: 0 !important;
          gap: 8px !important;
        }
        .piano-app > :not(.piano-sidebar) {
          order: -1 !important;
          min-height: 58dvh !important;
        }
        .piano-sidebar {
          max-height: 36dvh !important;
          overflow-y: auto !important;
          padding: 10px !important;
        }
      }
      /* Mobile Touch Controls for 3D Sniper / Shooter games — compact, translucent & non-blocking */
      .gitego-touch-hud {
        display: none;
        position: fixed;
        right: 8px;
        bottom: 44px;
        z-index: 25;
        flex-direction: column;
        gap: 6px;
        align-items: flex-end;
        pointer-events: none;
      }
      .gitego-dpad {
        display: none;
        position: fixed;
        left: 8px;
        bottom: 44px;
        z-index: 25;
        grid-template-columns: repeat(3, 38px);
        grid-template-rows: repeat(3, 38px);
        gap: 4px;
        pointer-events: none;
      }
      @media (pointer: coarse), (max-width: 900px) {
        .gitego-touch-hud.active:not(.hidden-by-ui) { display: flex; }
        .gitego-dpad.active:not(.hidden-by-ui) { display: grid; }
        /* Keep game HUD bars & quick controls completely clear of touch controls */
        #lockMouseBtn { display: none !important; }
        .gta-bars-dock {
          top: 6px !important;
          left: 8px !important;
          bottom: auto !important;
          width: 118px !important;
        }
        .quick-controls {
          bottom: 4px !important;
          left: 50% !important;
          right: auto !important;
          transform: translateX(-50%) !important;
          flex-wrap: nowrap !important;
          gap: 4px !important;
          max-width: 96vw !important;
          overflow-x: auto !important;
        }
        .quick-controls .gta-btn.small {
          padding: 3px 6px !important;
          font-size: 0.62rem !important;
          white-space: nowrap !important;
        }
      }
      .gitego-dbtn {
        pointer-events: auto;
        border: 1.5px solid rgba(255,255,255,0.28);
        border-radius: 10px;
        background: rgba(15, 23, 42, 0.44);
        backdrop-filter: blur(4px);
        color: #fff;
        font-size: 0.92rem;
        font-weight: 900;
        display: grid;
        place-items: center;
        touch-action: none;
        user-select: none;
      }
      .gitego-dbtn:active {
        background: rgba(99, 102, 241, 0.82);
        border-color: #fff;
      }
      .gitego-tbtn {
        pointer-events: auto;
        border: 1.5px solid rgba(255,255,255,0.32);
        border-radius: 999px;
        color: #fff;
        font-weight: 900;
        font-size: 0.72rem;
        padding: 6px 10px;
        background: rgba(15, 23, 42, 0.52);
        backdrop-filter: blur(4px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.35);
        touch-action: manipulation;
      }
      .gitego-tbtn.fire {
        width: 54px;
        height: 54px;
        font-size: 0.85rem;
        line-height: 1.05;
        background: radial-gradient(circle, rgba(239,68,68,0.88), rgba(185,28,28,0.88));
        border-color: rgba(252,165,165,0.8);
        display: grid;
        place-items: center;
        padding: 0;
      }
    </style>
    <script>
      window.addEventListener('load', () => {
        const canvas = document.getElementById('pygame-canvas');
        if (canvas) {
          const gameFrame = canvas.parentElement;
          const controls = gameFrame.querySelector('.pg-ctrl')?.parentElement;
          const fitCanvas = () => {
            const width = Math.max(1, gameFrame.clientWidth);
            const controlsHeight = controls ? controls.offsetHeight + 6 : 0;
            const height = Math.max(1, gameFrame.clientHeight - controlsHeight);
            const scale = Math.min(width / canvas.width, height / canvas.height);
            canvas.style.width = `${Math.floor(canvas.width * scale)}px`;
            canvas.style.height = `${Math.floor(canvas.height * scale)}px`;
          };
          window.addEventListener('resize', fitCanvas);
          if (window.ResizeObserver) new ResizeObserver(fitCanvas).observe(gameFrame);
          fitCanvas();
        }
        // Add dedicated Touch D-Pad (Move Forward/Back/Left/Right) + Fire/Scope/Reload for Sniper / GTA 3D games
        if (document.querySelector('.gta-app')) {
          const glCanvas = document.querySelector('canvas');
          const dpad = document.createElement('div');
          dpad.className = 'gitego-dpad active';
          dpad.innerHTML = '<div></div><button type="button" class="gitego-dbtn" data-key="w" aria-label="Forward">⬆️</button><div></div>'
            + '<button type="button" class="gitego-dbtn" data-key="a" aria-label="Left">⬅️</button>'
            + '<button type="button" class="gitego-dbtn" data-key="c" aria-label="Cover">🥷</button>'
            + '<button type="button" class="gitego-dbtn" data-key="d" aria-label="Right">➡️</button>'
            + '<div></div><button type="button" class="gitego-dbtn" data-key="s" aria-label="Backward">⬇️</button><div></div>';
          document.body.appendChild(dpad);
          dpad.querySelectorAll('.gitego-dbtn').forEach((btn) => {
            const k = btn.dataset.key;
            const press = (e) => {
              e.preventDefault();
              e.stopPropagation();
              window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
            };
            const release = (e) => {
              e.preventDefault();
              e.stopPropagation();
              window.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true }));
            };
            btn.addEventListener('pointerdown', press);
            btn.addEventListener('pointerup', release);
            btn.addEventListener('pointerleave', release);
            btn.addEventListener('pointercancel', release);
          });

          const hud = document.createElement('div');
          hud.className = 'gitego-touch-hud active';
          hud.innerHTML = '<button type="button" class="gitego-tbtn" id="gt-scope">🔭</button><button type="button" class="gitego-tbtn" id="gt-reload">🔄</button><button type="button" class="gitego-tbtn fire" id="gt-fire">🔥<br/>FIRE</button>';
          document.body.appendChild(hud);

          // Auto-hide touch controls whenever a modal (Mission Briefing / Missions List) is open, plus manual 🎮 toggle
          let userHidden = false;
          const syncTouchVisibility = () => {
            const modalOpen = Array.from(document.querySelectorAll('.overlay-modal')).some(
              (m) => !m.hidden && window.getComputedStyle(m).display !== 'none'
            );
            const hide = userHidden || modalOpen;
            dpad.classList.toggle('hidden-by-ui', hide);
            hud.classList.toggle('hidden-by-ui', hide);
          };
          const mo = new MutationObserver(syncTouchVisibility);
          document.querySelectorAll('.overlay-modal').forEach((m) => {
            mo.observe(m, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
          });
          const tbRight = document.querySelector('.tb-right');
          if (tbRight) {
            const toggleBtn = document.createElement('button');
            toggleBtn.type = 'button';
            toggleBtn.className = 'gta-btn';
            toggleBtn.textContent = '🎮 Pad';
            toggleBtn.title = 'Show / Hide Touch Controls';
            toggleBtn.addEventListener('click', () => {
              userHidden = !userHidden;
              toggleBtn.style.opacity = userHidden ? '0.55' : '1';
              syncTouchVisibility();
            });
            tbRight.appendChild(toggleBtn);
          }
          syncTouchVisibility();
          hud.querySelector('#gt-scope').addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            const sb = document.getElementById('scopeBtn');
            if (sb) sb.click();
          });
          hud.querySelector('#gt-reload').addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true }));
          });
          hud.querySelector('#gt-fire').addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            if (glCanvas) {
              const rect = glCanvas.getBoundingClientRect();
              glCanvas.dispatchEvent(new PointerEvent('pointerdown', {
                button: 0,
                clientX: rect.left + rect.width / 2,
                clientY: rect.top + rect.height / 2,
                bubbles: true
              }));
              setTimeout(() => window.dispatchEvent(new PointerEvent('pointerup', { button: 0, bubbles: true })), 80);
            }
          });
        }
      });
    </script>
    """
    if "</head>" in bundle.lower():
        head_end = bundle.lower().find("</head>")
        bundle = bundle[:head_end] + fit_canvas_style + bundle[head_end:]
    return HTMLResponse(
        content=bundle,
        headers={
            "X-Frame-Options": "SAMEORIGIN",
            "Content-Security-Policy": "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;",
        },
    )


@router.post("/{game_id}/sessions")
def start_game_session(
    game_id: int,
    req: StartGameSessionRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    g = db.query(Game).filter(Game.id == game_id, Game.status == "Published").first()
    if not g:
        raise HTTPException(status_code=404, detail="Published game not found")

    child = resolve_active_child(req.child_id, user, db)
    if child.screen_time and child.screen_time.used_today_minutes >= child.screen_time.daily_limit_minutes:
        raise HTTPException(
            status_code=403,
            detail="Daily screen-time limit reached for this child profile.",
        )

    token = str(uuid.uuid4())
    session = GameSession(
        game_id=g.id,
        child_id=child.id,
        session_token=token,
        duration_seconds=0,
        completed=False,
    )
    g.play_count += 1
    db.add(session)
    db.commit()
    db.refresh(session)
    return {
        "session_id": session.id,
        "session_token": session.session_token,
        "game_id": g.id,
        "child_id": child.id,
        "max_possible_score": g.max_possible_score,
    }


@router.post("/{game_id}/scores")
def submit_game_score(
    game_id: int,
    req: SubmitScoreRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Server-validated score submission tied to an active GameSession."""
    session = (
        db.query(GameSession)
        .filter(
            GameSession.game_id == game_id,
            GameSession.session_token == req.session_token,
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=400, detail="Invalid or expired game session token")

    game = db.query(Game).filter(Game.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # Server-side score validation: reject negative or impossibly inflated scores
    if req.score < 0 or req.score > game.max_possible_score:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid score {req.score}: exceeds game maximum ({game.max_possible_score})",
        )

    session.duration_seconds = max(session.duration_seconds, max(1, min(3600, req.duration_seconds)))
    session.completed = req.completed
    session.ended_at = datetime.datetime.now(datetime.timezone.utc)

    score_entry = GameScore(
        game_id=game.id,
        child_id=session.child_id,
        session_id=session.id,
        score=req.score,
        verified=True,
    )
    db.add(score_entry)

    child = db.query(ChildProfile).filter(ChildProfile.id == session.child_id).first()
    stars_awarded = 0
    if child and req.completed:
        claim_key = f"game_session:{session.session_token}"
        existing_reward = (
            db.query(Reward)
            .filter(Reward.child_id == child.id, Reward.claim_key == claim_key)
            .first()
        )
        if not existing_reward:
            stars_awarded = 5
            child.total_stars += stars_awarded
            child.current_level = 1 + (child.total_stars // 15)
            db.add(
                Reward(
                    child_id=child.id,
                    activity_type="game_completed",
                    reference_id=str(game.id),
                    claim_key=claim_key,
                    stars_earned=stars_awarded,
                    badge_name="Game Finisher ⭐",
                )
            )
            # Unlock FIRST_GAME achievement if not yet unlocked
            ach = db.query(Achievement).filter(Achievement.code == "FIRST_GAME").first()
            if ach:
                has_ach = (
                    db.query(ChildAchievement)
                    .filter(
                        ChildAchievement.child_id == child.id,
                        ChildAchievement.achievement_id == ach.id,
                    )
                    .first()
                )
                if not has_ach:
                    db.add(ChildAchievement(child_id=child.id, achievement_id=ach.id))

    db.add(
        ActivityLog(
            actor_user_id=user.id,
            child_id=session.child_id,
            action_type="GAME_SCORE_SUBMITTED",
            resource_type="game",
            resource_id=str(game.id),
            summary=f"Submitted verified score {req.score} on '{game.title}'",
        )
    )
    db.commit()

    highest = (
        db.query(func.max(GameScore.score))
        .filter(GameScore.game_id == game.id)
        .scalar()
        or req.score
    )
    return {
        "verified": True,
        "score": req.score,
        "highest_score": highest,
        "stars_awarded": stars_awarded,
        "child_total_stars": child.total_stars if child else 0,
    }
