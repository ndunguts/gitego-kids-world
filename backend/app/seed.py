import datetime
import json
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    Answer,
    Category,
    ChildProfile,
    Game,
    GameCategory,
    GameFile,
    GameProject,
    GameVersion,
    Language,
    LearningSubject,
    Lesson,
    ParentChildRelationship,
    ParentProfile,
    PlatformSetting,
    Question,
    Quiz,
    Role,
    ScreenTimeSetting,
    Storybook,
    StorybookPage,
    StorybookTranslation,
    Subscription,
    User,
    Video,
)
from app.security import hash_password
from app.services.game_bundler import compile_game_bundle


def seed_database(db: Session):
    # Check if already seeded
    if db.query(Role).count() > 0:
        return

    # 1. Roles
    roles_data = [
        ("SUPER_ADMIN", "Full platform administrator with access to all users, studios, settings, and analytics."),
        ("CONTENT_ADMIN", "Content creator able to author and publish games, storybooks, cartoons, and lessons."),
        ("PARENT", "Parent/guardian who manages child profiles, screen-time limits, consent, and progress reports."),
        ("CHILD", "Child learner and player who accesses published games, storybooks, cartoons, and quizzes."),
    ]
    role_map = {}
    for name, desc in roles_data:
        r = Role(name=name, description=desc)
        db.add(r)
        db.flush()
        role_map[name] = r

    # 2. Users
    super_admin = User(
        email="admin@gitego.kids",
        username="superadmin",
        full_name="Gitego Super Admin",
        password_hash=hash_password("Admin123!"),
        role_id=role_map["SUPER_ADMIN"].id,
        role_name="SUPER_ADMIN",
    )
    content_admin = User(
        email="creator@gitego.kids",
        username="contentadmin",
        full_name="Aline Content Creator",
        password_hash=hash_password("Creator123!"),
        role_id=role_map["CONTENT_ADMIN"].id,
        role_name="CONTENT_ADMIN",
    )
    parent_user = User(
        email="parent@gitego.kids",
        username="mugabo_parent",
        full_name="Jean Mugabo (Umubyeyi)",
        password_hash=hash_password("Parent123!"),
        role_id=role_map["PARENT"].id,
        role_name="PARENT",
    )
    child_user_1 = User(
        email="keza@gitego.kids",
        username="keza_kid",
        full_name="Keza (Umwana)",
        password_hash=hash_password("Child123!"),
        role_id=role_map["CHILD"].id,
        role_name="CHILD",
    )
    db.add_all([super_admin, content_admin, parent_user, child_user_1])
    db.flush()

    # 3. Parent & Child Profiles
    parent_profile = ParentProfile(
        user_id=parent_user.id,
        phone_number="+250788000111",
        parental_consent_given=True,
        consent_timestamp=datetime.datetime.now(datetime.timezone.utc),
        pin_code="1234",
        preferred_language="rw",
    )
    db.add(parent_profile)
    db.flush()

    db.add(
        Subscription(
            parent_id=parent_profile.id,
            plan_name="Gitego Family Unlimited Plan",
            status="active",
            max_children=5,
        )
    )

    child_keza = ChildProfile(
        user_id=child_user_1.id,
        display_name="Keza",
        avatar="🦁",
        age=7,
        age_group="6-8",
        pin_code="1111",
        preferred_language="rw",
        total_stars=15,
        current_level=2,
        is_private=True,
        parent_consent_approved=True,
    )
    child_gisa = ChildProfile(
        user_id=None,
        display_name="Gisa",
        avatar="🚀",
        age=10,
        age_group="9-12",
        pin_code="2222",
        preferred_language="fr",
        total_stars=25,
        current_level=3,
        is_private=True,
        parent_consent_approved=True,
    )
    db.add_all([child_keza, child_gisa])
    db.flush()

    for ch in (child_keza, child_gisa):
        db.add(ParentChildRelationship(parent_id=parent_profile.id, child_id=ch.id))
        db.add(
            ScreenTimeSetting(
                child_id=ch.id,
                daily_limit_minutes=90,
                used_today_minutes=15,
                allowed_age_group=ch.age_group,
                restricted_categories_csv="",
            )
        )

    # 4. Multilingual Languages (KINYARWANDA, FRENCH, SWAHILI + ENGLISH)
    languages_data = [
        ("rw", "KINYARWANDA", "Ikinyarwanda", "🇷🇼"),
        ("fr", "FRENCH (FRANÇAIS)", "Français", "🇫🇷"),
        ("sw", "SWAHILI (KISWAHILI)", "Kiswahili", "🇹🇿"),
        ("en", "ENGLISH", "English", "🇬🇧"),
    ]
    for code, name, native, flag in languages_data:
        db.add(Language(code=code, name=name, native_name=native, flag_emoji=flag, is_active=True))

    # 5. Categories & GameCategories
    categories_data = [
        ("folktales", "Folktales & Stories", "Traditional and modern illustrated stories", "storybook", "📖", "#f59e0b"),
        ("animals-nature", "Animals & Nature", "Explore wildlife, forests, and oceans", "all", "🦁", "#10b981"),
        ("math-logic", "Mathematics & Logic", "Numbers, counting, and problem solving", "learning", "🔢", "#3b82f6"),
        ("cartoons-fun", "Animated Cartoons", "Safe educational animated episodes", "video", "🎬", "#ec4899"),
        ("music-rhythm", "Songs & Music", "Sing-along melodies and rhythm games", "all", "🎵", "#8b5cf6"),
        ("science-space", "Science & Space", "Planets, inventions, and curiosity quests", "all", "🚀", "#06b6d4"),
    ]
    for slug, name, desc, ctype, icon, color in categories_data:
        db.add(
            Category(
                slug=slug,
                name=name,
                description=desc,
                content_type=ctype,
                icon=icon,
                color=color,
            )
        )

    game_cats_data = [
        ("puzzle-memory", "Puzzle & Memory", "Brain-boosting matching and memory games", "🧩"),
        ("arcade-action", "Arcade & Adventure", "Fast, joyful kid-friendly action games", "🕹️"),
        ("math-coding", "Math & Coding", "STEM games that make numbers exciting", "🧮"),
        ("music-creative", "Music & Creative", "Interactive musical instruments and art", "🎹"),
    ]
    gcat_map = {}
    for slug, name, desc, icon in game_cats_data:
        gc = GameCategory(slug=slug, name=name, description=desc, icon=icon)
        db.add(gc)
        db.flush()
        gcat_map[slug] = gc

    # 6. Seed Games in Game Studio (HTML5_JS, PHASER, TYPESCRIPT, PYTHON_PYODIDE)
    games_seed = [
        {
            "title": "Guhuza Amashusho — Safari Memory Match",
            "description": "Birindura amakarita abiri asa kugira ngo ubone inyamaswa zo muri Pariki y'Akagera!",
            "instructions": "Tap any two cards to flip them. Match all pairs to win stars!",
            "cover_image": "🦁🃏",
            "category": gcat_map["puzzle-memory"],
            "age_group": "6-8",
            "difficulty": "Easy",
            "engine": "HTML5_JS",
            "status": "Published",
            "files": [
                {
                    "filename": "index.html",
                    "language": "html",
                    "content": """<div class="safari-wrap">
  <div class="safari-top">
    <h2>🦁 Safari Memory Match</h2>
    <div id="score-lbl">Score: 0</div>
  </div>
  <div id="board" class="board"></div>
  <button id="restart-btn" class="btn">Tangira Bushya / Restart 🔄</button>
</div>""",
                },
                {
                    "filename": "style.css",
                    "language": "css",
                    "content": """.safari-wrap { max-width: 480px; margin: 0 auto; text-align: center; }
.safari-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; background: #1e293b; padding: 10px 16px; border-radius: 14px; }
.safari-top h2 { margin: 0; font-size: 1.2rem; color: #fde047; }
.board { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 14px; }
.card { height: 74px; border-radius: 14px; border: 3px solid #38bdf8; background: #1e293b; color: #fff; font-size: 2rem; cursor: pointer; }
.card.open { background: #fef08a; border-color: #facc15; }
.card.done { background: #dcfce7; border-color: #22c55e; }
.btn { background: #22c55e; color: #fff; border: none; padding: 10px 18px; border-radius: 999px; font-weight: 800; cursor: pointer; }""",
                },
                {
                    "filename": "game.js",
                    "language": "javascript",
                    "content": """const icons = ['🦁', '🐘', '🦒', '🦓'];
let deck = [...icons, ...icons].sort(() => Math.random() - 0.5);
let openIdx = [];
let doneIdx = new Set();
let score = 0;

function render() {
  const board = document.getElementById('board');
  board.innerHTML = deck.map((ic, i) => {
    const isOpen = openIdx.includes(i);
    const isDone = doneIdx.has(i);
    return `<button class="card ${isOpen ? 'open' : ''} ${isDone ? 'done' : ''}" data-i="${i}">${(isOpen || isDone) ? ic : '❓'}</button>`;
  }).join('');
  board.querySelectorAll('.card').forEach(btn => {
    btn.addEventListener('click', () => flip(Number(btn.dataset.i)));
  });
}

function flip(i) {
  if (doneIdx.has(i) || openIdx.includes(i) || openIdx.length >= 2) return;
  openIdx.push(i);
  render();
  if (openIdx.length === 2) {
    const [a, b] = openIdx;
    if (deck[a] === deck[b]) {
      doneIdx.add(a); doneIdx.add(b);
      openIdx = [];
      score += 25;
      document.getElementById('score-lbl').textContent = 'Score: ' + score;
      render();
      if (window.GitegoGameAPI) {
        window.GitegoGameAPI.submitScore(score, doneIdx.size === deck.length);
      }
    } else {
      setTimeout(() => { openIdx = []; render(); }, 600);
    }
  }
}

document.getElementById('restart-btn').addEventListener('click', () => {
  deck = [...icons, ...icons].sort(() => Math.random() - 0.5);
  openIdx = []; doneIdx.clear(); score = 0;
  document.getElementById('score-lbl').textContent = 'Score: 0';
  render();
});
render();""",
                },
            ],
        },
        {
            "title": "Inyenyeri za Gitego — Phaser Star Catcher",
            "description": "Koresha Phaser.js ugafata inyenyeri zimanuka mu kirere cy'ijoro!",
            "instructions": "Move your pointer or tap the glowing yellow star to catch it and score points!",
            "cover_image": "🌟🚀",
            "category": gcat_map["arcade-action"],
            "age_group": "6-8",
            "difficulty": "Medium",
            "engine": "PHASER",
            "status": "Published",
            "files": [
                {
                    "filename": "index.html",
                    "language": "html",
                    "content": '<div id="phaser-stage"></div>',
                },
                {
                    "filename": "style.css",
                    "language": "css",
                    "content": "#phaser-stage { text-align: center; }",
                },
                {
                    "filename": "game.js",
                    "language": "javascript",
                    "content": """let score = 0;
let star, basket, scoreText;

const config = {
  type: Phaser.AUTO,
  width: 560,
  height: 320,
  parent: 'phaser-stage',
  backgroundColor: '#0f172a',
  scene: {
    create: function() {
      scoreText = this.add.text(20, 32, '⭐ Stars Score: 0', { fontSize: '20px', color: '#fde047' });
      star = this.add.circle(280, 60, 18, 0xfacc15);
      basket = this.add.rectangle(280, 285, 110, 20, 0x38bdf8);
      this.input.on('pointermove', (p) => { basket.x = p.x; });
      this.input.on('pointerdown', (p) => { basket.x = p.x; });
    },
    update: function() {
      star.y += 3.6;
      if (Math.abs(star.y - basket.y) < 24 && Math.abs(star.x - basket.x) < 65) {
        score += 20;
        scoreText.setText('⭐ Stars Score: ' + score);
        star.y = 30;
        star.x = 50 + Math.random() * 460;
        if (window.GitegoGameAPI) {
          window.GitegoGameAPI.submitScore(score, score >= 100);
        }
      } else if (star.y > 320) {
        star.y = 30;
        star.x = 50 + Math.random() * 460;
      }
    }
  }
};
new Phaser.Game(config);""",
                },
            ],
        },
        {
            "title": "Imibare Yihuse — TypeScript Rocket Math",
            "description": "Subiza ibibazo by'imibare kugira ngo icyogajuru cyawe kizamuke!",
            "instructions": "Solve each math question to boost your rocket higher into space!",
            "cover_image": "🧮🛸",
            "category": gcat_map["math-coding"],
            "age_group": "9-12",
            "difficulty": "Medium",
            "engine": "TYPESCRIPT",
            "status": "Published",
            "files": [
                {
                    "filename": "index.html",
                    "language": "html",
                    "content": """<div class="math-box">
  <h2>🚀 Rocket Math Mission</h2>
  <div id="question" class="q-text"></div>
  <div id="choices" class="choices"></div>
  <div id="status" class="status">Score: 0</div>
</div>""",
                },
                {
                    "filename": "style.css",
                    "language": "css",
                    "content": """.math-box { max-width: 440px; margin: 0 auto; text-align: center; background: #1e293b; padding: 20px; border-radius: 18px; }
.q-text { font-size: 2rem; font-weight: 900; color: #38bdf8; margin: 14px 0; }
.choices { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.choice-btn { padding: 14px; font-size: 1.3rem; font-weight: 800; border-radius: 14px; border: none; background: #334155; color: #fff; cursor: pointer; }
.choice-btn:hover { background: #22c55e; }
.status { margin-top: 14px; font-weight: 800; color: #fde047; }""",
                },
                {
                    "filename": "game.ts",
                    "language": "typescript",
                    "content": """interface MathProblem {
  a: number;
  b: number;
  answer: number;
}

let currentScore: number = 0;

function nextRound(): void {
  const a: number = Math.floor(Math.random() * 8) + 2;
  const b: number = Math.floor(Math.random() * 8) + 2;
  const answer: number = a + b;
  const qEl = document.getElementById('question');
  const cEl = document.getElementById('choices');
  if (qEl) qEl.textContent = `${a} + ${b} = ?`;
  const opts: number[] = [answer, answer + 2, Math.max(1, answer - 1)].sort(() => Math.random() - 0.5);
  if (cEl) {
    cEl.innerHTML = opts.map((n: number) => `<button class="choice-btn" data-val="${n}">${n}</button>`).join('');
    cEl.querySelectorAll('.choice-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const picked: number = Number((btn as any).dataset.val);
        if (picked === answer) {
          currentScore += 20;
          const st = document.getElementById('status');
          if (st) st.textContent = 'Score: ' + currentScore + ' ⭐';
          if (window.GitegoGameAPI) {
            window.GitegoGameAPI.submitScore(currentScore, currentScore >= 60);
          }
          nextRound();
        }
      });
    });
  }
}
nextRound();""",
                },
            ],
        },
        {
            "title": "Inzoka y'Imbuto — Python Fruit Quest",
            "description": "Agakino kanditswe muri Python gakoresha Pyodide/Browser Sandbox!",
            "instructions": "Use arrow keys or tap the canvas to help the friendly snake collect tasty fruits!",
            "cover_image": "🐍🍎",
            "category": gcat_map["math-coding"],
            "age_group": "9-12",
            "difficulty": "Easy",
            "engine": "PYTHON_PYODIDE",
            "status": "Published",
            "files": [
                {
                    "filename": "index.html",
                    "language": "html",
                    "content": '<div id="py-output"></div>',
                },
                {
                    "filename": "main.py",
                    "language": "python",
                    "content": """# Gitego Kids World - Browser Sandboxed Python Game
TITLE = "Inzoka y'Imbuto (Python Quest)"
GOAL = 5
PLAYER_EMOJI = "🐍"
ITEM_EMOJI = "🍎"

def on_collect(current_score):
    return current_score + 10
""",
                },
            ],
        },
    ]

    for gdata in games_seed:
        game = Game(
            title=gdata["title"],
            description=gdata["description"],
            instructions=gdata["instructions"],
            cover_image=gdata["cover_image"],
            category_id=gdata["category"].id,
            category_name=gdata["category"].name,
            age_group=gdata["age_group"],
            difficulty=gdata["difficulty"],
            game_engine=gdata["engine"],
            status=gdata["status"],
            published_version="1.0.0",
            play_count=12,
            created_by_id=super_admin.id,
        )
        db.add(game)
        db.flush()

        project = GameProject(
            game_id=game.id,
            entry_file="index.html",
            engine_type=gdata["engine"],
            autosave_enabled=True,
        )
        db.add(project)
        db.flush()

        for f in gdata["files"]:
            db.add(
                GameFile(
                    project_id=project.id,
                    filename=f["filename"],
                    language=f["language"],
                    content=f["content"],
                )
            )

        compiled = compile_game_bundle(gdata["engine"], gdata["files"])
        db.add(
            GameVersion(
                game_id=game.id,
                version_number="1.0.0",
                compiled_bundle=compiled,
                changelog="Initial published release",
                published_by_id=super_admin.id,
            )
        )

    # 7. Seed Multilingual Storybooks (KINYARWANDA, FRENCH, SWAHILI linked together)
    group_bakame = "story-group-bakame-bread"
    books_seed = [
        {
            "title": "Bakame n'Umugati Ushyushye",
            "description": "Inkuru y'urukundo no gusangira n'inshuti mu ishyamba ryiza.",
            "cover_image": "🐇🥖",
            "author": "Gitego Story Studio",
            "language_code": "rw",
            "category_name": "Folktales & Stories",
            "age_group": "6-8",
            "difficulty": "Easy",
            "status": "Published",
            "translation_group_id": group_bakame,
            "pages": [
                (
                    1,
                    "Umunsi umwe, Bakame yabonye umugati ushyushye mu ishyamba ryiza. Yarishimye cyane!",
                    "🌳 🐇 🥖",
                    [{"word": "Ishyamba", "meaning": "Forest / Forêt"}, {"word": "Umugati", "meaning": "Bread / Pain"}],
                    {"question": "Ni iki Bakame yabonye mu ishyamba?", "options": ["Umugati", "Umupira", "Imodoka"], "answer": "Umugati"},
                ),
                (
                    2,
                    "Mu nzira yahuye n'inshuti ze: Inyoni ntoya n'Akanyamasyo bari bashonje cyane.",
                    "🐇 🐦 🐢",
                    [{"word": "Inshuti", "meaning": "Friends / Amis"}],
                    None,
                ),
                (
                    3,
                    "Bakame yagabanye na bo umugati. Bose baraseka bati: 'Gusangira birashimisha!'",
                    "💛 🐇 🐦 🐢 ✨",
                    [{"word": "Gusangira", "meaning": "To share / Partager"}],
                    {"question": "Bakame yakoze iki ku mugati we?", "options": ["Yawusangiye n'inshuti", "Yawuhishe"], "answer": "Yawusangiye n'inshuti"},
                ),
            ],
        },
        {
            "title": "Bakame et le Pain Chaud",
            "description": "Une belle histoire sur le partage et l'amitié dans la forêt.",
            "cover_image": "🐇🥖",
            "author": "Gitego Story Studio",
            "language_code": "fr",
            "category_name": "Folktales & Stories",
            "age_group": "6-8",
            "difficulty": "Easy",
            "status": "Published",
            "translation_group_id": group_bakame,
            "pages": [
                (
                    1,
                    "Un beau jour, Bakame a trouvé un pain tout chaud dans la grande forêt verte.",
                    "🌳 🐇 🥖",
                    [{"word": "Forêt", "meaning": "Ishyamba / Forest"}],
                    {"question": "Qu'est-ce que Bakame a trouvé ?", "options": ["Un pain chaud", "Un vélo"], "answer": "Un pain chaud"},
                ),
                (
                    2,
                    "Sur le chemin, il a rencontré ses amis : le petit oiseau et la tortue qui avaient faim.",
                    "🐇 🐦 🐢",
                    [{"word": "Tortue", "meaning": "Akanyamasyo / Turtle"}],
                    None,
                ),
                (
                    3,
                    "Bakame a partagé son pain avec eux. Tout le monde a souri : « Partager rend heureux ! »",
                    "💛 🐇 🐦 🐢 ✨",
                    [{"word": "Partager", "meaning": "Gusangira / To share"}],
                    None,
                ),
            ],
        },
        {
            "title": "Bakame na Mkate wa Moto",
            "description": "Hadithi nzuri kuhusu kushirikiana na marafiki msituni.",
            "cover_image": "🐇🥖",
            "author": "Gitego Story Studio",
            "language_code": "sw",
            "category_name": "Folktales & Stories",
            "age_group": "6-8",
            "difficulty": "Easy",
            "status": "Published",
            "translation_group_id": group_bakame,
            "pages": [
                (
                    1,
                    "Siku moja, Bakame alipata mkate wa moto ndani ya msitu mzuri. Alifurahi sana!",
                    "🌳 🐇 🥖",
                    [{"word": "Msitu", "meaning": "Ishyamba / Forest"}],
                    {"question": "Bakame alipata nini msituni?", "options": ["Mkate wa moto", "Kitabu"], "answer": "Mkate wa moto"},
                ),
                (
                    2,
                    "Njiani alikutana na marafiki zake: Ndege mdogo na Kobe waliokuwa na njaa.",
                    "🐇 🐦 🐢",
                    [{"word": "Marafiki", "meaning": "Inshuti / Friends"}],
                    None,
                ),
                (
                    3,
                    "Bakame aligawana mkate nao. Wote walicheka na kusema: 'Kushirikiana ni furaha!'",
                    "💛 🐇 🐦 🐢 ✨",
                    [{"word": "Kushirikiana", "meaning": "Gusangira / Sharing"}],
                    None,
                ),
            ],
        },
        {
            "title": "Inyoni Keza Yigaga Kuguruka",
            "description": "Inyoni ntoya yitwa Keza yiga kudacika intege no kwizera ko ishoboye.",
            "cover_image": "🐦🌈",
            "author": "Aline Content Creator",
            "language_code": "rw",
            "category_name": "Animals & Nature",
            "age_group": "3-5",
            "difficulty": "Easy",
            "status": "Published",
            "translation_group_id": "story-group-keza-bird",
            "pages": [
                (1, "Inyoni ntoya yitwa Keza yashakaga kuguruka hejuru y'ibiti binini.", "🪺 🐦 🌲", [], None),
                (2, "Bwa mbere yaguye hasi buhoro, ariko nyina aramubwira ati: 'Ongera ugerageze, urashoboye!'", "🍃 🐦 💬", [], None),
                (3, "Keza yazamuye amababa ye, aguruka mu kirere cyiza cy'ubururu. Yatsinze!", "☀️ ☁️ 🐦 🌈", [], None),
            ],
        },
    ]

    created_books = []
    for bdata in books_seed:
        book = Storybook(
            title=bdata["title"],
            description=bdata["description"],
            cover_image=bdata["cover_image"],
            author=bdata["author"],
            language_code=bdata["language_code"],
            category_name=bdata["category_name"],
            age_group=bdata["age_group"],
            difficulty=bdata["difficulty"],
            status=bdata["status"],
            translation_group_id=bdata["translation_group_id"],
            read_count=9,
            created_by_id=content_admin.id,
        )
        db.add(book)
        db.flush()
        created_books.append(book)

        for pnum, text_c, illus, vocab, qobj in bdata["pages"]:
            db.add(
                StorybookPage(
                    storybook_id=book.id,
                    page_number=pnum,
                    text_content=text_c,
                    illustration_url=illus,
                    vocabulary_json=json.dumps(vocab),
                    interactive_question_json=json.dumps(qobj) if qobj else None,
                )
            )

    # Link translations for Bakame story (rw <-> fr <-> sw)
    bakame_books = [b for b in created_books if b.translation_group_id == group_bakame]
    source_bakame = bakame_books[0]
    for tb in bakame_books[1:]:
        db.add(
            StorybookTranslation(
                translation_group_id=group_bakame,
                source_book_id=source_bakame.id,
                translated_book_id=tb.id,
                language_code=tb.language_code,
            )
        )

    # 8. Seed Videos (YouTube IFrame API, Vimeo, Self-Hosted)
    videos_seed = [
        (
            "Indirimbo yo Kubara 1–10 (Kinyarwanda Cartoon)",
            "Ririmba kandi wige kubara kuva kuri rimwe kugeza ku icumi hamwe n'inyamaswa zishimishije.",
            "https://www.youtube.com/watch?v=DR-cfDsHCGA",
            "https://www.youtube.com/embed/DR-cfDsHCGA?enablejsapi=1",
            "youtube",
            True,
            "🔢🎬",
            "Songs & Music",
            "rw",
            "3-5",
            150,
        ),
        (
            "Les Animaux de la Savane — Documentaire Enfants",
            "Découvre les lions, les éléphants et les girafes d'Afrique de l'Est en français.",
            "https://www.youtube.com/watch?v=5qap5aO4i9A",
            "https://www.youtube.com/embed/5qap5aO4i9A?enablejsapi=1",
            "youtube",
            True,
            "🦁🌍",
            "Animals & Nature",
            "fr",
            "6-8",
            210,
        ),
        (
            "Hadithi za Sungura Mwerevu (Kiswahili Animation)",
            "Katuni ya kufurahisha kuhusu Sungura na wanyama wa mwituni.",
            "https://vimeo.com/76979871",
            "https://player.vimeo.com/video/76979871",
            "vimeo",
            True,
            "🐇🎥",
            "Animated Cartoons",
            "sw",
            "6-8",
            195,
        ),
    ]
    for title, desc, vurl, eurl, prov, supports_ev, thumb, cat, lang_c, age_g, dur in videos_seed:
        db.add(
            Video(
                title=title,
                description=desc,
                video_url=vurl,
                embed_url=eurl,
                provider=prov,
                provider_supports_events=supports_ev,
                thumbnail_url=thumb,
                category_name=cat,
                language_code=lang_c,
                age_group=age_g,
                duration_seconds=dur,
                status="Published",
                view_count=18,
            )
        )

    # 9. Seed Learning Center Subjects, Lessons & Quizzes (All 9 requested areas)
    subjects_seed = [
        ("mathematics", "Mathematics", "Kubara, guteranya, gukuramo n'imyitozo y'imibare.", "🔢", "#3b82f6", "rw"),
        ("english", "English", "Vocabulary, phonics, and fun conversational English.", "🇬🇧", "#ef4444", "en"),
        ("kinyarwanda", "Kinyarwanda", "Ikinyarwanda cy'abana: imigani, amagambo n'interuro.", "🇷🇼", "#10b981", "rw"),
        ("french", "French (Français)", "Mots de tous les jours, salutations et chansons en français.", "🇫🇷", "#6366f1", "fr"),
        ("swahili", "Swahili (Kiswahili)", "Maneno ya msingi, salamu na kuhesabu kwa Kiswahili.", "🇹🇿", "#f59e0b", "sw"),
        ("general-knowledge", "General Knowledge", "Imigabane, ibihugu, iminsi y'icyumweru n'umuco.", "🌍", "#14b8a6", "rw"),
        ("science", "Science", "Inyenyeri, imibumbe, ibimera n'inyamaswa.", "🔬", "#06b6d4", "en"),
        ("memory-exercises", "Memory Exercises", "Imyitozo yo kwibuka amabara, amashusho n'urutonde.", "🧠", "#a855f7", "rw"),
        ("interactive-quizzes", "Interactive Quizzes", "Ibibazo n'ibisubizo bishimishije ku bana bose.", "⚡", "#ec4899", "rw"),
    ]

    for slug, name, desc, icon, color, lcode in subjects_seed:
        subj = LearningSubject(
            slug=slug,
            name=name,
            description=desc,
            icon=icon,
            color=color,
            language_code=lcode,
        )
        db.add(subj)
        db.flush()

        lesson = Lesson(
            subject_id=subj.id,
            title=f"{name} — Isomo rya 1 (Starter Lesson)",
            description=f"Isomo ry'ibanze rya {name} ryateguriwe abana.",
            content_body=f"Murakaza neza mu isomo rya {name}! Soma neza hanyuma ukore ikizamini gito hasi kugira ngo ubone inyenyeri.",
            language_code=lcode,
            age_group="6-8",
            difficulty="Easy",
            image_url=icon,
            points_reward=10,
            status="Published",
        )
        db.add(lesson)
        db.flush()

        quiz = Quiz(
            lesson_id=lesson.id,
            title=f"Ikizamini cya {name}",
            passing_score=1,
        )
        db.add(quiz)
        db.flush()

        if slug == "mathematics":
            q = Question(quiz_id=quiz.id, prompt="4 + 3 bingana iki?", image_hint="🍎🍎🍎🍎 + 🍎🍎🍎", points=10, order_index=1)
            db.add(q)
            db.flush()
            db.add_all([
                Answer(question_id=q.id, answer_text="7", is_correct=True),
                Answer(question_id=q.id, answer_text="6", is_correct=False),
                Answer(question_id=q.id, answer_text="9", is_correct=False),
            ])
        elif slug == "swahili":
            q = Question(quiz_id=quiz.id, prompt="Ijambo 'Jambo / Habari' risobanura iki mu Kinyarwanda?", image_hint="👋", points=10, order_index=1)
            db.add(q)
            db.flush()
            db.add_all([
                Answer(question_id=q.id, answer_text="Muraho / Amakuru", is_correct=True),
                Answer(question_id=q.id, answer_text="Muramuke", is_correct=False),
            ])
        else:
            q = Question(quiz_id=quiz.id, prompt=f"Ese witeguye kwiga {name} neza?", image_hint=icon, points=10, order_index=1)
            db.add(q)
            db.flush()
            db.add_all([
                Answer(question_id=q.id, answer_text="Yego, nditeguye! ⭐", is_correct=True),
                Answer(question_id=q.id, answer_text="Oya", is_correct=False),
            ])

    # 10. Achievements
    achievements_seed = [
        ("FIRST_GAME", "Umukinnyi w'Intangarugero", "Kina agakino kawe ka mbere muri Gitego Kids World!", "🎮", 1, "games"),
        ("BOOKWORM", "Umusomyi w'Inshuti", "Soma inkuru yose uyirangize!", "📖", 5, "reading"),
        ("POLYGLOT_EXPLORER", "Umuhanga mu Ndimi", "Soma inkuru mu Kinyarwanda, Igifaransa cyangwa Igiswahili!", "🌍", 10, "languages"),
        ("QUIZ_CHAMPION", "Intyoza mu Masomo", "Tsinda ikizamini mu Kigo cy'Amasomo (Learning Center)!", "🏆", 15, "learning"),
        ("SUPER_STAR_25", "Inyenyeri ya Zahabu", "Kusanya inyenyeri 25 zose hamwe!", "🌟", 25, "general"),
    ]
    for code, title, desc, icon, thresh, cat in achievements_seed:
        db.add(
            Achievement(
                code=code,
                title=title,
                description=desc,
                badge_icon=icon,
                stars_threshold=thresh,
                category=cat,
            )
        )

    # 11. Platform Settings
    settings_seed = [
        ("platform_name", "GITEGO KIDS WORLD", "Display title of the platform"),
        ("platform_tagline", "Play • Watch • Read • Learn • Explore", "Main platform tagline"),
        ("default_daily_screen_time_minutes", "60", "Default daily screen time limit for new child profiles"),
        ("require_parental_consent", "true", "Require verified parent consent before child profile activation"),
        ("require_game_review_before_publish", "true", "Require Game Studio syntax & security checks before publishing"),
    ]
    for k, v, d in settings_seed:
        db.add(PlatformSetting(key=k, value=v, description=d))

    db.commit()
