# GITEGO KIDS WORLD
**Tagline:** *Play • Watch • Read • Learn • Explore*

**GITEGO KIDS WORLD** is a full-stack children's digital entertainment and learning platform featuring a multi-engine **Game Studio IDE**, a multilingual **Storybook Studio & Digital Reader** (**Kinyarwanda**, **Français**, **Kiswahili**, plus dynamically added languages), a **Cartoon & Video Streaming Center** with official player active watch-time telemetry, a **Learning Center** with interactive quizzes, a **Parent & Guardian Control Portal**, and a **Super Admin Dashboard**.

---

## 1. Architecture & Technology Stack

- **Backend**: Python FastAPI, SQLAlchemy 2.0 (33 relational models), Alembic migrations, PostgreSQL (with SQLite automatic local development fallback), JWT access & refresh token authentication, RBAC (`SUPER_ADMIN`, `CONTENT_ADMIN`, `PARENT`, `CHILD`), rate limiting, and S3-compatible media asset storage.
- **Frontend**: Modular Vite + ES6 SPA with **4 distinct design systems**:
  1. **Children's World Interface (`.theme-child`)**: Playful, colorful, accessible large touch targets, zero source-code exposure.
  2. **Parent Portal Interface (`.theme-parent`)**: Screen-time limits, age restrictions, category blocks, parental consent, and per-child activity reports.
  3. **Enterprise Admin Dashboard (`.theme-admin`)**: 17 management modules (`Overview`, `Game Studio`, `Games Library`, `Storybook Studio`, `Books Library`, `Cartoon Studio`, `Video Library`, `Learning Center`, `Categories`, `Languages`, `Users`, `Parents`, `Children`, `Rewards`, `Reports`, `Analytics`, `Platform Settings`).
  4. **Game Studio IDE (`.studio-ide`)**: Multi-file explorer, line-numbered code editor, code search, formatting, autosave, syntax/security validator, and isolated `<iframe sandbox="allow-scripts">` preview runner supporting **HTML5/CSS3/JS**, **Phaser.js**, **TypeScript**, and **Browser-Sandboxed Python (Pyodide/Canvas)**.
- **Deployment**: Docker, Docker Compose (PostgreSQL 16, MinIO S3-compatible storage, FastAPI backend, frontend, and Nginx reverse proxy).

---

## 2. Environment Setup & Installation

### Copy `.env.example`
```bash
cp .env.example .env
```

### Backend Setup
```bash
cd backend
pip install -r requirements.txt
```

### Database Setup & Alembic Migrations
```bash
cd backend
alembic upgrade head
```
*(On startup, the FastAPI lifespan hook also ensures all 33 tables are created and seeds initial roles, demo accounts, languages, categories, sample games, multilingual storybooks, cartoons, and lessons.)*

---

## 3. Running in Development

### Start the Full-Stack Server (FastAPI + Mounted Frontend SPA)
```bash
cd backend
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- **Application UI**: `http://localhost:8000/`
- **OpenAPI / Swagger Documentation**: `http://localhost:8000/docs`

### Optional Separate Vite Frontend Dev Server
```bash
cd frontend
npm install
npm run dev
```

### Seeded Demo Accounts
| Role | Email / Username | Password | Capabilities |
| :--- | :--- | :--- | :--- |
| **SUPER_ADMIN** | `admin@gitego.kids` | `Admin123!` | Full platform access, Game Studio IDE, Storybook Studio, Users, Settings |
| **CONTENT_ADMIN** | `creator@gitego.kids` | `Creator123!` | Game Studio IDE, Storybook Studio, Cartoon Studio, Learning Center |
| **PARENT** | `parent@gitego.kids` | `Parent123!` | Manage children (**Keza** & **Gisa**), screen-time limits, reports |
| **CHILD** | `keza@gitego.kids` | `Child123!` | Play published games, read books, watch cartoons, earn stars (no admin/code access) |

---

## 4. Production Deployment (Docker Compose + Nginx)

```bash
docker compose up --build -d
```
This launches:
- `postgres` (PostgreSQL 16 database)
- `minio` (S3-compatible object storage for images and audio)
- `backend` (FastAPI + Alembic migrations on port `8000`)
- `frontend` (Static bundle container)
- `nginx` (Reverse proxy on port `80` with security headers)

---

## 5. How to Create and Publish Games in Game Studio

1. Sign in as **Super Admin** (`admin@gitego.kids`) or **Content Admin** (`creator@gitego.kids`) and open **💻 Game Studio (IDE)**.
2. Click **+ Create New Game** and enter:
   - **Game Title**, **Description**, **Child Instructions**, **Cover Emoji/Image**, **Category**, **Age Group** (`3-5`, `6-8`, `9-12`), **Difficulty** (`Easy`, `Medium`, `Hard`), and **Game Engine**:
     - `HTML5_JS` (HTML5 + CSS3 + JavaScript)
     - `PHASER` (Phaser.js 2D Canvas Engine)
     - `TYPESCRIPT` (TypeScript Game Runtime)
     - `PYTHON_PYODIDE` (Browser-Sandboxed Python Runtime)
3. Use the **File Explorer** to edit `index.html`, `style.css`, `game.js` / `game.ts` / `main.py`, or click **+ File** to add additional source files.
4. Report scores and completion from your game code using the isolated bridge:
   ```javascript
   window.GitegoGameAPI.submitScore(score, isCompleted);
   ```
5. Click **💾 Save Project** and **▶️ Run Preview** to test the game inside the live sandboxed `<iframe sandbox="allow-scripts">`.
6. Fix any security or syntax diagnostics reported in the **Game Studio Console** (e.g., forbidden `document.cookie`, parent DOM access, or restricted Python server modules like `os` / `subprocess`).
7. Click **📋 Submit for Review**, then **🚀 Publish Game**.
8. Switch to **🧒 Child World** — the newly published game immediately appears in the children's arcade where kids can play it fullscreen without ever seeing its source code.

---

## 6. How to Create and Publish Multilingual Storybooks

1. Open **🎨 Storybook Studio** in the Admin Dashboard.
2. Click **+ Create New Storybook** and select a primary language:
   - **🇷🇼 KINYARWANDA (`rw`)**
   - **🇫🇷 FRENCH / FRANÇAIS (`fr`)**
   - **🇹🇿 SWAHILI / KISWAHILI (`sw`)**
   - *(Or add new languages dynamically in the **🌍 Languages** section!)*
3. To link a translated version to an existing story, select the original story under **Link as Translation of**.
4. In the **Storybook Page Editor**, add or reorder pages, enter the story text, and provide illustration emojis or uploaded image URLs.
5. Click **💾 Save Pages** and **🚀 Publish Book**.
6. In **🧒 Child World -> 📖 Storybooks**, children can filter by language, read with page-turning animations, use **🔊 Read Aloud**, adjust font size (`A-` / `A+`), answer interactive comprehension questions, and switch between linked language translations.

---

## 7. Running Automated Tests

### Backend Unit, Integration & Security Tests (`pytest`)
```bash
cd backend
pytest -v
```

### Frontend Architecture & Sandbox Invariant Tests
```bash
node frontend/tests/frontend.test.mjs
```
