import base64
import os
import pytest
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = "sqlite:///./test_gitego_kids_world.db"

from app.database import Base, SessionLocal, engine
from app.main import app
from app.seed import seed_database


@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        seed_database(db)
    finally:
        db.close()
    yield
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_gitego_kids_world.db"):
        os.remove("./test_gitego_kids_world.db")


client = TestClient(app)


def get_auth_headers(identifier: str, password: str) -> dict:
    resp = client.post("/api/v1/auth/login", json={"identifier": identifier, "password": password})
    assert resp.status_code == 200, resp.text
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_health_and_seeded_languages():
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    assert r.json()["platform"] == "GITEGO KIDS WORLD"

    langs = client.get("/api/v1/languages").json()
    codes = {l["code"] for l in langs}
    # Must include KINYARWANDA (rw), FRENCH (fr), SWAHILI (sw)
    assert {"rw", "fr", "sw"}.issubset(codes)


def test_authentication_and_refresh_token():
    resp = client.post("/api/v1/auth/login", json={"identifier": "admin@gitego.kids", "password": "Admin123!"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["user"]["role"] == "SUPER_ADMIN"
    assert "access_token" in data
    assert "refresh_token" in data

    refresh_resp = client.post("/api/v1/auth/refresh", json={"refresh_token": data["refresh_token"]})
    assert refresh_resp.status_code == 200
    assert "access_token" in refresh_resp.json()


def test_child_cannot_access_admin_or_game_studio_or_source_code():
    child_headers = get_auth_headers("keza@gitego.kids", "Child123!")

    # Child cannot access Game Studio projects or source code
    r_studio = client.get("/api/v1/game-studio/projects", headers=child_headers)
    assert r_studio.status_code == 403

    # Child cannot access Admin Overview
    r_admin = client.get("/api/v1/admin/overview", headers=child_headers)
    assert r_admin.status_code == 403

    # Child cannot access Users Management
    r_users = client.get("/api/v1/users", headers=child_headers)
    assert r_users.status_code == 403

    # Public/Child game endpoint NEVER leaks project source files
    r_games = client.get("/api/v1/games", headers=child_headers)
    assert r_games.status_code == 200
    games_list = r_games.json()
    assert len(games_list) >= 4
    for g in games_list:
        assert "project" not in g
        assert "files" not in g


def test_game_studio_full_workflow_and_child_gameplay():
    admin_headers = get_auth_headers("admin@gitego.kids", "Admin123!")
    child_headers = get_auth_headers("keza@gitego.kids", "Child123!")

    # 1. Admin creates a new game in Game Studio
    create_resp = client.post(
        "/api/v1/game-studio/projects",
        headers=admin_headers,
        json={
            "title": "Akagera Drum Rhythm",
            "description": "Tap the traditional drums in rhythm to earn stars!",
            "instructions": "Click the drum buttons to score points.",
            "cover_image": "🥁🎶",
            "category_name": "Music & Creative",
            "age_group": "6-8",
            "difficulty": "Easy",
            "game_engine": "HTML5_JS",
            "max_possible_score": 500,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    game_id = create_resp.json()["id"]
    assert create_resp.json()["status"] == "Draft"

    # 2. Admin saves updated source files in the multi-file editor
    save_resp = client.put(
        f"/api/v1/game-studio/projects/{game_id}/files",
        headers=admin_headers,
        json={
            "autosave": False,
            "files": [
                {
                    "filename": "index.html",
                    "language": "html",
                    "content": '<div id="drum-app"><button id="beat">Beat Drum 🥁</button></div>',
                },
                {
                    "filename": "style.css",
                    "language": "css",
                    "content": "#beat { font-size: 20px; padding: 16px; background: #f59e0b; color: white; }",
                },
                {
                    "filename": "game.js",
                    "language": "javascript",
                    "content": "let s = 0; document.getElementById('beat').onclick = () => { s += 50; window.GitegoGameAPI.submitScore(s, true); };",
                },
            ],
        },
    )
    assert save_resp.status_code == 200
    assert save_resp.json()["validation_errors"] == []

    # 3. Admin runs preview
    preview_resp = client.get(f"/api/v1/game-studio/projects/{game_id}/preview", headers=admin_headers)
    assert preview_resp.status_code == 200
    assert "GitegoGameAPI" in preview_resp.text
    assert "Beat Drum" in preview_resp.text

    # 4. Submit for review & Publish game
    rev_resp = client.post(f"/api/v1/game-studio/projects/{game_id}/submit-review", headers=admin_headers)
    assert rev_resp.status_code == 200
    assert rev_resp.json()["status"] == "Review"

    pub_resp = client.post(
        f"/api/v1/game-studio/projects/{game_id}/publish",
        headers=admin_headers,
        json={"version_number": "1.0.0", "changelog": "First release of Akagera Drum Rhythm"},
    )
    assert pub_resp.status_code == 200
    assert pub_resp.json()["status"] == "Published"

    # 5. Child sees and plays the published game
    play_bundle = client.get(f"/api/v1/games/{game_id}/play-bundle", headers=child_headers)
    assert play_bundle.status_code == 200
    assert "Content-Security-Policy" in play_bundle.headers

    session_resp = client.post(f"/api/v1/games/{game_id}/sessions", headers=child_headers, json={})
    assert session_resp.status_code == 200
    session_token = session_resp.json()["session_token"]

    # Server rejects cheated score exceeding max_possible_score (500)
    cheat_resp = client.post(
        f"/api/v1/games/{game_id}/scores",
        headers=child_headers,
        json={"session_token": session_token, "score": 99999, "completed": True},
    )
    assert cheat_resp.status_code == 400

    # Valid score succeeds and awards stars
    score_resp = client.post(
        f"/api/v1/games/{game_id}/scores",
        headers=child_headers,
        json={"session_token": session_token, "score": 250, "duration_seconds": 45, "completed": True},
    )
    assert score_resp.status_code == 200
    assert score_resp.json()["verified"] is True
    assert score_resp.json()["stars_awarded"] == 5


def test_game_sandbox_security_blocks_malicious_code():
    admin_headers = get_auth_headers("admin@gitego.kids", "Admin123!")

    # Create Python game and attempt restricted import os / document.cookie
    create_resp = client.post(
        "/api/v1/game-studio/projects",
        headers=admin_headers,
        json={
            "title": "Untrusted Test Project",
            "description": "Testing sandbox validator",
            "game_engine": "PYTHON_PYODIDE",
        },
    )
    gid = create_resp.json()["id"]

    save_resp = client.put(
        f"/api/v1/game-studio/projects/{gid}/files",
        headers=admin_headers,
        json={
            "files": [
                {
                    "filename": "main.py",
                    "language": "python",
                    "content": "import os\nimport subprocess\nprint(document.cookie)\n",
                }
            ]
        },
    )
    assert save_resp.status_code == 200
    errors = save_resp.json()["validation_errors"]
    assert len(errors) >= 2

    # Publishing a game with security violations must fail with 400
    pub_resp = client.post(
        f"/api/v1/game-studio/projects/{gid}/publish",
        headers=admin_headers,
        json={"version_number": "1.0.0"},
    )
    assert pub_resp.status_code == 400


def test_multilingual_storybook_creation_and_child_reading():
    creator_headers = get_auth_headers("creator@gitego.kids", "Creator123!")
    child_headers = get_auth_headers("keza@gitego.kids", "Child123!")

    # 1. Create Kinyarwanda storybook
    rw_book = client.post(
        "/api/v1/storybooks",
        headers=creator_headers,
        json={
            "title": "Umwana w'Umuhanga",
            "description": "Inkuru y'umwana ukunda gusoma no kuvumbura.",
            "cover_image": "🧒📚",
            "language_code": "rw",
            "category_name": "Folktales & Stories",
            "age_group": "6-8",
            "status": "Published",
            "pages": [
                {
                    "page_number": 1,
                    "text_content": "Kera habayeho umwana ukunda ibitabo cyane.",
                    "illustration_url": "📚✨",
                    "vocabulary": [{"word": "Ibitabo", "meaning": "Books / Livres"}],
                },
                {
                    "page_number": 2,
                    "text_content": "Yize indimi nyinshi harimo Ikinyarwanda, Igifaransa n'Igiswahili!",
                    "illustration_url": "🌍🌟",
                    "vocabulary": [],
                },
            ],
        },
    )
    assert rw_book.status_code == 201
    rw_id = rw_book.json()["id"]

    # 2. Create linked French translation
    fr_book = client.post(
        "/api/v1/storybooks",
        headers=creator_headers,
        json={
            "title": "L'Enfant Intelligent",
            "description": "L'histoire d'un enfant qui aime lire et découvrir.",
            "cover_image": "🧒📚",
            "language_code": "fr",
            "category_name": "Folktales & Stories",
            "age_group": "6-8",
            "status": "Published",
            "linked_source_book_id": rw_id,
            "pages": [
                {
                    "page_number": 1,
                    "text_content": "Il était une fois un enfant qui aimait beaucoup les livres.",
                    "illustration_url": "📚✨",
                }
            ],
        },
    )
    assert fr_book.status_code == 201
    assert len(fr_book.json()["linked_translations"]) >= 1

    # 3. Child reads the Kinyarwanda storybook and saves completion progress
    prog = client.post(
        f"/api/v1/storybooks/{rw_id}/progress",
        headers=child_headers,
        json={"last_page_number": 2, "completed": True, "is_bookmarked": True},
    )
    assert prog.status_code == 200
    assert prog.json()["completed"] is True
    assert prog.json()["stars_awarded"] == 5


def test_video_watch_time_tracking_ignores_paused_and_background_tabs():
    child_headers = get_auth_headers("keza@gitego.kids", "Child123!")
    videos = client.get("/api/v1/videos").json()
    yt_video = next(v for v in videos if v["provider"] == "youtube")

    # Active visible playback counts watch time
    r1 = client.post(
        f"/api/v1/videos/{yt_video['id']}/sessions",
        headers=child_headers,
        json={
            "event_type": "play_started",
            "position_seconds": 15.0,
            "active_delta_seconds": 15.0,
            "is_tab_visible": True,
            "is_paused": False,
        },
    )
    assert r1.status_code == 200
    sid = r1.json()["session_id"]
    assert r1.json()["active_watch_seconds"] == 15.0

    # Background tab or paused event MUST NOT increase active_watch_seconds
    r2 = client.post(
        f"/api/v1/videos/{yt_video['id']}/sessions",
        headers=child_headers,
        json={
            "session_id": sid,
            "event_type": "progress",
            "position_seconds": 45.0,
            "active_delta_seconds": 30.0,
            "is_tab_visible": False,
            "is_paused": False,
        },
    )
    assert r2.status_code == 200
    assert r2.json()["counted_delta_seconds"] == 0.0
    assert r2.json()["active_watch_seconds"] == 15.0


def test_parent_child_controls_and_isolation():
    parent_headers = get_auth_headers("parent@gitego.kids", "Parent123!")

    # Parent lists their children
    kids = client.get("/api/v1/parents/children", headers=parent_headers).json()
    assert len(kids) >= 2
    keza_id = kids[0]["id"]

    # Parent updates screen-time limits & category restrictions
    upd = client.put(
        f"/api/v1/parents/children/{keza_id}/controls",
        headers=parent_headers,
        json={
            "daily_limit_minutes": 75,
            "allowed_age_group": "6-8",
            "restricted_categories": [],
            "bedtime_lock_enabled": False,
        },
    )
    assert upd.status_code == 200
    assert upd.json()["daily_limit_minutes"] == 75

    # Parent views child activity report
    rep = client.get(f"/api/v1/parents/children/{keza_id}/report", headers=parent_headers)
    assert rep.status_code == 200
    assert "games_played" in rep.json()
    assert "books_read" in rep.json()

    # Register a second unrelated parent and verify they CANNOT access Keza's profile (403)
    reg2 = client.post(
        "/api/v1/auth/register",
        json={
            "email": "otherparent@gitego.kids",
            "username": "otherparent",
            "full_name": "Other Parent",
            "password": "Password123!",
            "parental_consent_given": True,
        },
    )
    assert reg2.status_code == 201
    other_headers = {"Authorization": f"Bearer {reg2.json()['access_token']}"}
    forbidden_rep = client.get(f"/api/v1/parents/children/{keza_id}/report", headers=other_headers)
    assert forbidden_rep.status_code == 403


def test_duplicate_reward_claim_prevention_and_media_upload():
    child_headers = get_auth_headers("keza@gitego.kids", "Child123!")
    admin_headers = get_auth_headers("admin@gitego.kids", "Admin123!")

    claim_payload = {
        "activity_type": "lesson_completed",
        "reference_id": "lesson-101",
        "claim_key": "unique-lesson-claim-101",
    }
    c1 = client.post("/api/v1/rewards/claim", headers=child_headers, json=claim_payload)
    assert c1.status_code == 201

    # Duplicate claim with same claim_key must return 409 Conflict
    c2 = client.post("/api/v1/rewards/claim", headers=child_headers, json=claim_payload)
    assert c2.status_code == 409

    # Valid SVG upload succeeds
    svg_b64 = base64.b64encode(b'<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"></svg>').decode()
    up_ok = client.post(
        "/api/v1/admin/media/upload",
        headers=admin_headers,
        json={
            "filename": "badge.svg",
            "mime_type": "image/svg+xml",
            "media_type": "image",
            "content_base64": svg_b64,
        },
    )
    assert up_ok.status_code == 201

    # Disallowed MIME type is rejected
    up_bad = client.post(
        "/api/v1/admin/media/upload",
        headers=admin_headers,
        json={
            "filename": "script.exe",
            "mime_type": "application/x-msdownload",
            "media_type": "image",
            "content_base64": svg_b64,
        },
    )
    assert up_bad.status_code == 400


def test_parent_child_world_preview_does_not_occupy_child_account():
    parent_headers = get_auth_headers("parent@gitego.kids", "Parent123!")

    # Parent opens Child World dashboard -> must be Parent Preview, not a child account
    dash = client.get("/api/v1/children/dashboard", headers=parent_headers)
    assert dash.status_code == 200
    child_obj = dash.json()["child"]
    assert child_obj["is_preview"] is True
    assert child_obj["id"] is None
    assert "Parent Preview" in child_obj["display_name"]
    assert "Keza" not in child_obj["display_name"]

    # Parent heartbeat must not mark any child online
    hb = client.post(
        "/api/v1/children/heartbeat",
        headers=parent_headers,
        json={"activity": "Exploring Child World", "device_id": "parent-dev"},
    )
    assert hb.status_code == 200
    assert hb.json()["tracked"] is False

    # Parent rewards & bookshelf in preview mode must not expose a child's profile
    rw = client.get("/api/v1/rewards", headers=parent_headers)
    assert rw.status_code == 200
    assert rw.json()["is_preview"] is True
    assert rw.json()["child_id"] is None

    shelf = client.get("/api/v1/storybooks/bookshelf", headers=parent_headers)
    assert shelf.status_code == 200
    assert shelf.json()["recently_opened"] == []

    # Verify children remain offline and child can still log in without any conflict
    children = client.get("/api/v1/parents/children", headers=parent_headers).json()
    for ch in children:
        assert ch["live_status"]["is_online"] is False

    child_login = client.post(
        "/api/v1/auth/child-login",
        json={
            "parent_identifier": "parent@gitego.kids",
            "pin_code": children[0]["pin_code"],
            "device_id": "child-tablet-1",
        },
    )
    assert child_login.status_code == 200
    assert child_login.json()["user"]["role"] == "CHILD"
