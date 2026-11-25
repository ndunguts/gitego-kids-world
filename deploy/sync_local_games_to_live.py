#!/usr/bin/env python3
"""Sync custom games (and all their source files) from local SQLite DB to the live Render site."""
import os
import sqlite3
import sys
import httpx

LOCAL_DB = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "backend", "gitego_kids_world.db")
)
LIVE_URL = os.environ.get("LIVE_URL", "https://gitego-kids-world.onrender.com").rstrip("/")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@gitego.kids")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "Admin123!")


def load_local_games(db_path: str) -> list[dict]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cur = conn.cursor()
    games = []
    for g in cur.execute("SELECT * FROM games ORDER BY id ASC").fetchall():
        proj = cur.execute("SELECT * FROM game_projects WHERE game_id = ?", (g["id"],)).fetchone()
        files = []
        if proj:
            for f in cur.execute(
                "SELECT filename, language, content FROM game_files WHERE project_id = ? ORDER BY id ASC",
                (proj["id"],),
            ).fetchall():
                files.append(
                    {
                        "filename": f["filename"],
                        "language": f["language"],
                        "content": f["content"],
                    }
                )
        games.append(
            {
                "id": g["id"],
                "title": g["title"],
                "description": g["description"],
                "instructions": g["instructions"],
                "cover_image": g["cover_image"],
                "category_name": g["category_name"],
                "age_group": g["age_group"],
                "difficulty": g["difficulty"],
                "supported_languages": g["supported_languages"],
                "game_engine": g["game_engine"],
                "max_possible_score": g["max_possible_score"],
                "status": g["status"],
                "files": files,
            }
        )
    conn.close()
    return games


def main():
    local_games = load_local_games(LOCAL_DB)
    print(f"Found {len(local_games)} local games in {LOCAL_DB}")

    with httpx.Client(timeout=60.0) as client:
        print(f"Signing in to {LIVE_URL} as {ADMIN_EMAIL}...")
        login_res = client.post(
            f"{LIVE_URL}/api/v1/auth/login",
            json={"identifier": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        if login_res.status_code != 200:
            print(f"Login failed ({login_res.status_code}): {login_res.text}")
            sys.exit(1)
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        existing = client.get(f"{LIVE_URL}/api/v1/game-studio/projects", headers=headers)
        existing.raise_for_status()
        existing_titles = {g["title"].strip().lower() for g in existing.json()}
        print(f"Live site currently has {len(existing_titles)} games.")

        synced = 0
        for g in local_games:
            if g["title"].strip().lower() in existing_titles:
                print(f"  [SKIP] Already on live site: {g['title']}")
                continue
            print(f"  [UPLOAD] Creating '{g['title']}' ({g['game_engine']}, {len(g['files'])} files)...")
            create_res = client.post(
                f"{LIVE_URL}/api/v1/game-studio/projects",
                headers=headers,
                json={
                    "title": g["title"],
                    "description": g["description"],
                    "instructions": g["instructions"],
                    "cover_image": g["cover_image"],
                    "category_name": g["category_name"],
                    "age_group": g["age_group"],
                    "difficulty": g["difficulty"],
                    "supported_languages": g["supported_languages"],
                    "game_engine": g["game_engine"],
                    "max_possible_score": g["max_possible_score"],
                    "initial_files": g["files"],
                },
            )
            if create_res.status_code not in (200, 201):
                print(f"    ERROR creating '{g['title']}': {create_res.status_code} {create_res.text}")
                continue
            created = create_res.json()
            new_id = created["id"]

            if g["status"] == "Published":
                pub_res = client.post(
                    f"{LIVE_URL}/api/v1/game-studio/projects/{new_id}/publish",
                    headers=headers,
                    json={"changelog": "Migrated from local Gitego Kids World"},
                )
                if pub_res.status_code == 200:
                    print(f"    [PUBLISHED] '{g['title']}' is now LIVE for children!")
                else:
                    print(f"    [WARN] Created as Draft; publish returned {pub_res.status_code}: {pub_res.text}")
            synced += 1

        print(f"\nDone! Synced {synced} new game(s) to {LIVE_URL}.")


if __name__ == "__main__":
    main()
