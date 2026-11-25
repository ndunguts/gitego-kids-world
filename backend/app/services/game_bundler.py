import ast
import json
import re
from typing import Iterable


FORBIDDEN_PATTERNS = [
    (r"document\.cookie", "Games must not access document.cookie"),
    (r"window\.parent\.localStorage", "Games must not access parent localStorage"),
    (r"window\.top\.localStorage", "Games must not access top localStorage"),
    (r"parent\.document", "Games must not access parent DOM"),
    (r"top\.document", "Games must not access top DOM"),
    (r"/api/v1/admin", "Games must not call administrative endpoints"),
    (r"/api/v1/game-studio", "Games must not call Game Studio endpoints"),
]


def validate_game_files(engine_type: str, files: Iterable[dict]) -> list[str]:
    """Validate project files for security and syntax before preview or publish."""
    errors: list[str] = []
    file_list = list(files)
    if not file_list:
        errors.append("Project must contain at least one source file.")
        return errors

    filenames = {f["filename"] for f in file_list}
    if engine_type == "PYTHON_PYODIDE":
        if "main.py" not in filenames and not any(name.endswith(".py") for name in filenames):
            errors.append("Python game projects must include main.py (or a .py file).")

    for f in file_list:
        fname = f["filename"]
        content = f.get("content", "")
        lang = f.get("language", "").lower()

        for pattern, message in FORBIDDEN_PATTERNS:
            if re.search(pattern, content):
                errors.append(f"{fname}: Security violation — {message}")

        if lang == "python" or fname.endswith(".py"):
            try:
                tree = ast.parse(content, filename=fname)
                for node in ast.walk(tree):
                    if isinstance(node, (ast.Import, ast.ImportFrom)):
                        mod_names = (
                            [alias.name for alias in node.names]
                            if isinstance(node, ast.Import)
                            else [node.module or ""]
                        )
                        for m in mod_names:
                            top_mod = m.split(".")[0]
                            if top_mod in {"os", "subprocess", "socket", "shutil", "ctypes"}:
                                errors.append(
                                    f"{fname}: Module '{top_mod}' is restricted in the browser Python sandbox."
                                )
            except SyntaxError as exc:
                errors.append(f"{fname}: Python SyntaxError on line {exc.lineno}: {exc.msg}")

    return errors


def strip_typescript_types(ts_code: str) -> str:
    """Lightweight browser-safe TypeScript-to-JavaScript transpiler for game scripts."""
    code = re.sub(r"interface\s+\w+\s*\{[^}]*\}", "", ts_code, flags=re.MULTILINE)
    code = re.sub(r"type\s+\w+\s*=\s*[^;]+;", "", code, flags=re.MULTILINE)
    code = re.sub(
        r":\s*(?:number|string|boolean|any|void|Record<[^>]+>|Array<[^>]+>|\w+\[\])(?=\s*[=,)\];{])",
        "",
        code,
    )
    code = re.sub(r"\bas\s+(?:number|string|boolean|any|\w+)", "", code)
    return code


PHASER_SHIM_JS = r"""
// Offline-compatible Phaser 3 Minimal 2D Canvas Engine Shim for Sandboxed Games
window.Phaser = window.Phaser || (function() {
  const AUTO = 0, CANVAS = 1, WEBGL = 2;
  class Game {
    constructor(config) {
      this.config = config || {};
      const width = this.config.width || 640;
      const height = this.config.height || 400;
      const parentEl = (typeof this.config.parent === 'string' && document.getElementById(this.config.parent)) || document.body;
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.style.maxWidth = '100%';
      canvas.style.borderRadius = '16px';
      canvas.style.display = 'block';
      canvas.style.margin = '0 auto';
      parentEl.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      const sceneDef = Array.isArray(this.config.scene) ? this.config.scene[0] : (this.config.scene || {});
      const scene = {
        canvas,
        ctx,
        width,
        height,
        objects: [],
        pointer: { x: width / 2, y: height / 2, isDown: false },
        add: {
          text: (x, y, text, style) => {
            const obj = { type: 'text', x, y, text, style: style || {}, visible: true, setText(t) { this.text = t; } };
            scene.objects.push(obj);
            return obj;
          },
          circle: (x, y, radius, color) => {
            const obj = { type: 'circle', x, y, radius, color: color || 0xfacc15, vx: 0, vy: 0, visible: true };
            scene.objects.push(obj);
            return obj;
          },
          rectangle: (x, y, w, h, color) => {
            const obj = { type: 'rect', x, y, w, h, color: color || 0x38bdf8, vx: 0, vy: 0, visible: true };
            scene.objects.push(obj);
            return obj;
          }
        },
        input: {
          on: (event, cb) => {
            if (event === 'pointerdown') {
              canvas.addEventListener('pointerdown', (e) => {
                const r = canvas.getBoundingClientRect();
                const px = (e.clientX - r.left) * (canvas.width / r.width);
                const py = (e.clientY - r.top) * (canvas.height / r.height);
                cb({ x: px, y: py });
              });
            }
            if (event === 'pointermove') {
              canvas.addEventListener('pointermove', (e) => {
                const r = canvas.getBoundingClientRect();
                const px = (e.clientX - r.left) * (canvas.width / r.width);
                const py = (e.clientY - r.top) * (canvas.height / r.height);
                cb({ x: px, y: py });
              });
            }
          }
        }
      };

      canvas.addEventListener('pointermove', (e) => {
        const r = canvas.getBoundingClientRect();
        scene.pointer.x = (e.clientX - r.left) * (canvas.width / r.width);
        scene.pointer.y = (e.clientY - r.top) * (canvas.height / r.height);
      });

      if (typeof sceneDef.preload === 'function') sceneDef.preload.call(scene);
      if (typeof sceneDef.create === 'function') sceneDef.create.call(scene);

      const hexToCss = (c) => typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : (c || '#ffffff');
      let last = performance.now();
      const loop = (now) => {
        const dt = now - last;
        last = now;
        if (typeof sceneDef.update === 'function') sceneDef.update.call(scene, now, dt);
        ctx.fillStyle = this.config.backgroundColor || '#0f172a';
        ctx.fillRect(0, 0, width, height);
        for (const obj of scene.objects) {
          if (!obj.visible) continue;
          if (obj.type === 'circle') {
            ctx.beginPath();
            ctx.arc(obj.x, obj.y, obj.radius, 0, Math.PI * 2);
            ctx.fillStyle = hexToCss(obj.color);
            ctx.fill();
          } else if (obj.type === 'rect') {
            ctx.fillStyle = hexToCss(obj.color);
            ctx.fillRect(obj.x - obj.w / 2, obj.y - obj.h / 2, obj.w, obj.h);
          } else if (obj.type === 'text') {
            ctx.fillStyle = (obj.style && obj.style.color) || '#ffffff';
            ctx.font = `bold ${(obj.style && obj.style.fontSize) || '20px'} system-ui, sans-serif`;
            ctx.fillText(obj.text, obj.x, obj.y);
          }
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
  }
  return { AUTO, CANVAS, WEBGL, Game };
})();
"""


PYTHON_BROWSER_RUNTIME_JS = r"""
// Safe Browser-Side Python & Pygame Game Runtime (Pyodide + Pygame HTML5 Canvas Bridge)
// Executes Python/Pygame game scripts purely in the sandboxed browser iframe (never on the backend server).
window.runSandboxedPythonGame = async function(pythonCode) {
  const out = document.getElementById('py-output') || document.body;

  // Detect if the Python script is a Pygame / Snake game (e.g. "import pygame" or "draw_snake")
  if (/import\s+pygame/.test(pythonCode) || /draw_snake|GITEGO SNAKE GAME/i.test(pythonCode)) {
    const parseTuple = (name, fallback) => {
      const m = pythonCode.match(new RegExp(name + '\\s*=\\s*\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)\\s*\\)'));
      return m ? `rgb(${m[1]}, ${m[2]}, ${m[3]})` : fallback;
    };
    const parseIntSetting = (name, fallback) => {
      const m = pythonCode.match(new RegExp('^\\s*' + name + '\\s*=\\s*(\\d+)', 'm'));
      return m ? parseInt(m[1], 10) : fallback;
    };
    const captionMatch = pythonCode.match(/set_caption\(\s*["']([^"']+)["']\s*\)/);
    const caption = captionMatch ? captionMatch[1] : 'GITEGO SNAKE GAME';

    const WIDTH = 900, HEIGHT = 650;
    const CELL = parseIntSetting('CELL', 25);
    const COLS = Math.floor((WIDTH - 40) / CELL);
    const ROWS = Math.floor((HEIGHT - 150) / CELL);
    const BOARD_X = 20, BOARD_Y = 105;
    const START_SPEED = parseIntSetting('START_SPEED', 8);
    const MAX_SPEED = parseIntSetting('MAX_SPEED', 18);

    const BG = parseTuple('BG', 'rgb(8, 14, 32)');
    const PANEL = parseTuple('PANEL', 'rgb(14, 25, 53)');
    const GRID = parseTuple('GRID', 'rgb(25, 48, 86)');
    const WHITE = parseTuple('WHITE', 'rgb(240, 246, 255)');
    const MUTED = parseTuple('MUTED', 'rgb(145, 165, 198)');
    const GREEN = parseTuple('GREEN', 'rgb(40, 230, 75)');
    const GREEN_DARK = parseTuple('GREEN_DARK', 'rgb(20, 155, 55)');
    const RED = parseTuple('RED', 'rgb(255, 65, 75)');
    const GOLD = parseTuple('GOLD', 'rgb(255, 205, 55)');
    const BLUE_DARK = parseTuple('BLUE_DARK', 'rgb(15, 55, 125)');

    out.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;height:calc(100vh - 16px);font-family:'DejaVu Sans',system-ui,sans-serif;user-select:none">
        <canvas id="pygame-canvas" width="${WIDTH}" height="${HEIGHT}" tabindex="0"
          style="display:block;width:auto;height:auto;max-width:100%;max-height:calc(100dvh - 72px) !important;aspect-ratio:${WIDTH} / ${HEIGHT};border-radius:12px;border:2px solid #38bdf8;box-shadow:0 8px 22px rgba(0,0,0,0.45);cursor:pointer;outline:none;flex:0 1 auto"></canvas>
        <div style="display:flex;justify-content:center;gap:6px;flex-wrap:wrap;flex-shrink:0">
          <button type="button" data-dir="0,-1" class="pg-ctrl" style="background:#1e293b;color:#fff;border:1px solid #38bdf8;border-radius:8px;padding:5px 10px;font-weight:800;font-size:12px;cursor:pointer">⬆️</button>
          <button type="button" data-dir="-1,0" class="pg-ctrl" style="background:#1e293b;color:#fff;border:1px solid #38bdf8;border-radius:8px;padding:5px 10px;font-weight:800;font-size:12px;cursor:pointer">⬅️</button>
          <button type="button" data-dir="0,1" class="pg-ctrl" style="background:#1e293b;color:#fff;border:1px solid #38bdf8;border-radius:8px;padding:5px 10px;font-weight:800;font-size:12px;cursor:pointer">⬇️</button>
          <button type="button" data-dir="1,0" class="pg-ctrl" style="background:#1e293b;color:#fff;border:1px solid #38bdf8;border-radius:8px;padding:5px 10px;font-weight:800;font-size:12px;cursor:pointer">➡️</button>
          <button type="button" id="pg-restart" style="background:#16a34a;color:#fff;border:none;border-radius:8px;padding:5px 10px;font-weight:800;font-size:12px;cursor:pointer">🔄 Restart</button>
        </div>
      </div>
    `;

    const canvas = document.getElementById('pygame-canvas');
    const ctx = canvas.getContext('2d');
    const gameFrame = canvas.parentElement;
    const gameControls = gameFrame.querySelector('.pg-ctrl')?.parentElement;
    function fitCanvasToFrame() {
      const availableWidth = Math.max(1, gameFrame.clientWidth);
      const controlsHeight = gameControls ? gameControls.offsetHeight + 6 : 0;
      const availableHeight = Math.max(1, gameFrame.clientHeight - controlsHeight);
      const scale = Math.min(availableWidth / WIDTH, availableHeight / HEIGHT);
      canvas.style.width = `${Math.floor(WIDTH * scale)}px`;
      canvas.style.height = `${Math.floor(HEIGHT * scale)}px`;
    }
    window.addEventListener('resize', fitCanvasToFrame);
    if (window.ResizeObserver) new ResizeObserver(fitCanvasToFrame).observe(gameFrame);
    fitCanvasToFrame();
    let highScore = 0;

    function randomFood(snake) {
      const occupied = new Set(snake.map(([x, y]) => `${x},${y}`));
      const empty = [];
      for (let x = 0; x < COLS; x++) {
        for (let y = 0; y < ROWS; y++) {
          if (!occupied.has(`${x},${y}`)) empty.push([x, y]);
        }
      }
      return empty.length ? empty[Math.floor(Math.random() * empty.length)] : null;
    }

    function newGame() {
      const sx = Math.floor(COLS / 2);
      const sy = Math.floor(ROWS / 2);
      const snake = [[sx, sy], [sx - 1, sy], [sx - 2, sy]];
      return {
        snake,
        direction: [1, 0],
        nextDirection: [1, 0],
        food: randomFood(snake),
        score: 0,
        state: 'ready',
        lastStep: performance.now(),
      };
    }

    let game = newGame();

    function setDirection(dx, dy) {
      const [cx, cy] = game.direction;
      if (dx !== -cx || dy !== -cy) {
        game.nextDirection = [dx, dy];
        if (game.state === 'ready') game.state = 'playing';
      }
    }

    function roundRect(x, y, w, h, r, fill, stroke, lineWidth = 2) {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
    }

    function drawText(text, size, bold, color, cx, cy) {
      ctx.fillStyle = color;
      ctx.font = `${bold ? 'bold ' : ''}${size}px 'DejaVu Sans', system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);
    }

    function update() {
      const snake = game.snake;
      game.direction = game.nextDirection;
      const [dx, dy] = game.direction;
      const head = [snake[0][0] + dx, snake[0][1] + dy];
      const eating = game.food && head[0] === game.food[0] && head[1] === game.food[1];
      const bodyToCheck = eating ? snake : snake.slice(0, -1);
      const hitWall = head[0] < 0 || head[0] >= COLS || head[1] < 0 || head[1] >= ROWS;
      const hitSelf = bodyToCheck.some(([bx, by]) => bx === head[0] && by === head[1]);

      if (hitWall || hitSelf) {
        game.state = 'over';
        if (game.score > highScore) highScore = game.score;
        if (window.GitegoGameAPI) window.GitegoGameAPI.submitScore(game.score, true);
        return;
      }

      snake.unshift(head);
      if (eating) {
        game.score += 10;
        if (game.score > highScore) highScore = game.score;
        if (window.GitegoGameAPI) window.GitegoGameAPI.submitScore(game.score, false);
        game.food = randomFood(snake);
        if (!game.food) game.state = 'won';
      } else {
        snake.pop();
      }
    }

    function draw() {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      // Header
      ctx.fillStyle = PANEL;
      ctx.fillRect(0, 0, WIDTH, 88);
      drawText(caption, 34, true, GREEN, WIDTH / 2, 42);
      drawText(`SCORE: ${game.score}`, 22, true, GOLD, 120, 44);
      drawText(`BEST: ${highScore}`, 22, true, WHITE, WIDTH - 125, 44);

      // Play board and grid
      roundRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL, 8, 'rgb(5, 10, 25)', null);
      ctx.strokeStyle = GRID;
      ctx.lineWidth = 1;
      for (let x = 0; x <= COLS; x++) {
        const px = BOARD_X + x * CELL;
        ctx.beginPath(); ctx.moveTo(px, BOARD_Y); ctx.lineTo(px, BOARD_Y + ROWS * CELL); ctx.stroke();
      }
      for (let y = 0; y <= ROWS; y++) {
        const py = BOARD_Y + y * CELL;
        ctx.beginPath(); ctx.moveTo(BOARD_X, py); ctx.lineTo(BOARD_X + COLS * CELL, py); ctx.stroke();
      }
      roundRect(BOARD_X, BOARD_Y, COLS * CELL, ROWS * CELL, 8, null, BLUE_DARK, 2);

      // Food
      if (game.food) {
        const [fx, fy] = game.food;
        const cx = BOARD_X + fx * CELL + CELL / 2;
        const cy = BOARD_Y + fy * CELL + CELL / 2;
        ctx.beginPath(); ctx.arc(cx, cy, CELL / 2 - 3, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill();
        ctx.beginPath(); ctx.arc(cx - 4, cy - 4, 3, 0, Math.PI * 2); ctx.fillStyle = 'rgb(255, 140, 145)'; ctx.fill();
        ctx.beginPath(); ctx.moveTo(cx, cy - 8); ctx.lineTo(cx + 3, cy - 13); ctx.strokeStyle = GREEN; ctx.lineWidth = 3; ctx.stroke();
      }

      // Snake
      game.snake.forEach(([sx, sy], index) => {
        const rx = BOARD_X + sx * CELL + 2;
        const ry = BOARD_Y + sy * CELL + 2;
        const rw = CELL - 4, rh = CELL - 4;
        roundRect(rx, ry, rw, rh, 7, index === 0 ? 'rgb(65, 255, 100)' : GREEN_DARK, null);
        if (index === 0) {
          const [dx, dy] = game.direction;
          const cx = rx + rw / 2, cy = ry + rh / 2;
          const e1 = [cx - 5 + dx * 3, cy - 4 + dy * 3];
          const e2 = [cx + 5 + dx * 3, cy - 4 + dy * 3];
          [e1, e2].forEach(([ex, ey]) => {
            ctx.beginPath(); ctx.arc(ex, ey, 3, 0, Math.PI * 2); ctx.fillStyle = WHITE; ctx.fill();
            ctx.beginPath(); ctx.arc(ex, ey, 1.2, 0, Math.PI * 2); ctx.fillStyle = BG; ctx.fill();
          });
        }
      });

      // Footer controls
      roundRect(20, 565, 150, 55, 13, BLUE_DARK, 'rgb(80, 155, 255)', 2);
      drawText('P  PAUSE', 20, true, WHITE, 95, 592);
      drawText('ARROW KEYS / WASD  •  SPACE: PAUSE  •  R: RESTART', 16, false, MUTED, WIDTH / 2 + 45, 592);
      drawText('Eat the red fruit. Avoid the walls and your own tail!', 16, false, MUTED, WIDTH / 2, 632);

      // State Overlays
      if (['ready', 'paused', 'over', 'won'].includes(game.state)) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.62)';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        let heading = 'READY TO PLAY?', sub = 'Click board or press ENTER / Arrow Key to start';
        if (game.state === 'paused') { heading = 'PAUSED'; sub = 'Press SPACE or click PAUSE to continue'; }
        else if (game.state === 'won') { heading = 'YOU WIN!'; sub = 'The board is full — press R to play again'; }
        else if (game.state === 'over') { heading = 'GAME OVER'; sub = 'Press R or click board to try again'; }
        drawText(heading, 46, true, game.state !== 'over' ? GOLD : RED, WIDTH / 2, HEIGHT / 2 - 32);
        drawText(sub, 22, true, WHITE, WIDTH / 2, HEIGHT / 2 + 20);
        if (game.state === 'over') {
          drawText(`Your score: ${game.score}`, 22, true, WHITE, WIDTH / 2, HEIGHT / 2 + 62);
        }
      }
    }

    window.addEventListener('keydown', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') setDirection(0, -1);
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') setDirection(0, 1);
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') setDirection(-1, 0);
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') setDirection(1, 0);
      else if (e.key === ' ' || e.key === 'p' || e.key === 'P') {
        if (game.state === 'playing') game.state = 'paused';
        else if (game.state === 'paused') game.state = 'playing';
      } else if (e.key === 'Enter') {
        if (game.state === 'ready') game.state = 'playing';
        else if (game.state === 'over' || game.state === 'won') { game = newGame(); game.state = 'playing'; }
      } else if (e.key === 'r' || e.key === 'R') {
        game = newGame();
        game.state = 'playing';
      }
    });

    canvas.addEventListener('pointerdown', (e) => {
      canvas.focus();
      const r = canvas.getBoundingClientRect();
      const px = (e.clientX - r.left) * (WIDTH / r.width);
      const py = (e.clientY - r.top) * (HEIGHT / r.height);
      if (px >= 20 && px <= 170 && py >= 565 && py <= 620) {
        if (game.state === 'playing') game.state = 'paused';
        else if (game.state === 'paused') game.state = 'playing';
        return;
      }
      if (game.state === 'ready' || game.state === 'over' || game.state === 'won') {
        if (game.state !== 'ready') game = newGame();
        game.state = 'playing';
        return;
      }
      // Steer snake toward tap location relative to snake head
      const [hx, hy] = game.snake[0];
      const headPx = BOARD_X + hx * CELL + CELL / 2;
      const headPy = BOARD_Y + hy * CELL + CELL / 2;
      const dx = px - headPx, dy = py - headPy;
      if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 1 : -1, 0);
      else setDirection(0, dy > 0 ? 1 : -1);
    });

    out.querySelectorAll('.pg-ctrl').forEach((btn) => {
      btn.addEventListener('click', () => {
        const [dx, dy] = btn.dataset.dir.split(',').map(Number);
        setDirection(dx, dy);
      });
    });
    const restartBtn = document.getElementById('pg-restart');
    if (restartBtn) {
      restartBtn.addEventListener('click', () => {
        game = newGame();
        game.state = 'playing';
      });
    }

    function loop(now) {
      if (game.state === 'playing') {
        const speed = Math.min(START_SPEED + Math.floor(game.score / 50), MAX_SPEED);
        const stepMs = 1000 / speed;
        if (now - game.lastStep >= stepMs) {
          update();
          game.lastStep = now;
        }
      }
      draw();
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
    return;
  }

  // Fallback simple Python collector game
  const lines = pythonCode.split('\n');
  let gameTitle = 'Python Kid Game';
  let targetGoal = 5;
  let emojiPlayer = '🐍';
  let emojiItem = '🍎';
  for (const raw of lines) {
    const line = raw.trim();
    let m = line.match(/^TITLE\s*=\s*["'](.+)["']/);
    if (m) gameTitle = m[1];
    m = line.match(/^GOAL\s*=\s*(\d+)/);
    if (m) targetGoal = parseInt(m[1], 10);
    m = line.match(/^PLAYER_EMOJI\s*=\s*["'](.+)["']/);
    if (m) emojiPlayer = m[1];
    m = line.match(/^ITEM_EMOJI\s*=\s*["'](.+)["']/);
    if (m) emojiItem = m[1];
  }
  out.innerHTML = `
    <div style="text-align:center;font-family:system-ui,sans-serif;padding:12px;color:#fff">
      <div style="display:flex;justify-content:space-between;align-items:center;max-width:520px;margin:0 auto 10px;background:#1e293b;padding:10px 16px;border-radius:14px">
        <strong>🐍 ${gameTitle} (Python Sandbox)</strong>
        <span id="py-score-badge" style="background:#22c55e;color:#fff;padding:4px 12px;border-radius:999px;font-weight:800">Score: 0 / ${targetGoal * 10}</span>
      </div>
      <canvas id="py-canvas" width="520" height="300" style="background:#0f172a;border:3px solid #38bdf8;border-radius:16px;cursor:pointer;max-width:100%"></canvas>
      <div style="margin-top:8px;font-size:13px;color:#cbd5e1">Tap or use Arrow Keys to guide ${emojiPlayer} to collect ${emojiItem}!</div>
    </div>
  `;
  const canvas = document.getElementById('py-canvas');
  const ctx = canvas.getContext('2d');
  let px = 260, py = 150, ix = 120, iy = 100, score = 0;
  function respawn() {
    ix = 40 + Math.random() * 440;
    iy = 40 + Math.random() * 220;
  }
  function stepTowards(tx, ty) {
    const dx = tx - px, dy = ty - py;
    const dist = Math.hypot(dx, dy) || 1;
    px += (dx / dist) * Math.min(28, dist);
    py += (dy / dist) * Math.min(28, dist);
    checkHit();
  }
  function checkHit() {
    if (Math.hypot(px - ix, py - iy) < 34) {
      score += 10;
      document.getElementById('py-score-badge').textContent = 'Score: ' + score + ' / ' + (targetGoal * 10);
      if (window.GitegoGameAPI) window.GitegoGameAPI.submitScore(score, score >= targetGoal * 10);
      respawn();
    }
  }
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    stepTowards((e.clientX - r.left) * (canvas.width / r.width), (e.clientY - r.top) * (canvas.height / r.height));
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') px = Math.max(24, px - 24);
    if (e.key === 'ArrowRight') px = Math.min(496, px + 24);
    if (e.key === 'ArrowUp') py = Math.max(24, py - 24);
    if (e.key === 'ArrowDown') py = Math.min(276, py + 24);
    checkHit();
  });
  function draw() {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = '30px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emojiItem, ix, iy);
    ctx.fillText(emojiPlayer, px, py);
    requestAnimationFrame(draw);
  }
  draw();
};
"""


SAFE_BRIDGE_JS = r"""
// Strict Isolated Game API Bridge — exposes ONLY score, completion, and player-scoped game storage via postMessage.
// Never exposes parent cookies, tokens, or admin APIs.
(function() {
  const pendingLoads = new Map();
  let reqSeq = 0;

  window.addEventListener('message', function(event) {
    const msg = event.data;
    if (!msg || msg.type !== 'GITEGO_HOST_STORAGE') return;
    const resolver = pendingLoads.get(msg.requestId);
    if (resolver) {
      pendingLoads.delete(msg.requestId);
      resolver(msg.value);
    }
  });

  window.GitegoGameAPI = Object.freeze({
    submitScore: function(score, completed) {
      const safeScore = Math.max(0, Math.min(100000, Number(score) || 0));
      window.parent.postMessage({
        type: 'GITEGO_GAME_EVENT',
        event: 'SCORE_UPDATE',
        score: safeScore,
        completed: Boolean(completed)
      }, '*');
    },
    completeGame: function(finalScore) {
      this.submitScore(finalScore, true);
    },
    savePlayerData: function(key, value) {
      const safeKey = String(key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
      if (!safeKey) return;
      window.parent.postMessage({
        type: 'GITEGO_GAME_EVENT',
        event: 'STORAGE_SET',
        key: safeKey,
        value: value
      }, '*');
    },
    loadPlayerData: function(key) {
      const safeKey = String(key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
      if (!safeKey) return Promise.resolve(null);
      return new Promise(function(resolve) {
        const requestId = 'req_' + (++reqSeq) + '_' + Date.now();
        const timer = setTimeout(function() {
          if (pendingLoads.has(requestId)) {
            pendingLoads.delete(requestId);
            resolve(null);
          }
        }, 1500);
        pendingLoads.set(requestId, function(val) {
          clearTimeout(timer);
          resolve(val);
        });
        window.parent.postMessage({
          type: 'GITEGO_GAME_EVENT',
          event: 'STORAGE_GET',
          key: safeKey,
          requestId: requestId
        }, '*');
      });
    }
  });
})();
"""


def compile_game_bundle(engine_type: str, files: Iterable[dict]) -> str:
    """Compile multi-file project into a self-contained sandboxed HTML document for iframe execution."""
    file_list = list(files)
    html_files = [f for f in file_list if f["filename"].endswith(".html")]
    css_files = [f for f in file_list if f["filename"].endswith(".css")]
    js_files = [f for f in file_list if f["filename"].endswith(".js")]
    ts_files = [f for f in file_list if f["filename"].endswith(".ts")]
    py_files = [f for f in file_list if f["filename"].endswith(".py")]

    base_html = (
        html_files[0]["content"]
        if html_files
        else '<div id="game-root"></div><div id="py-output"></div>'
    )
    combined_css = "\n".join(f.get("content", "") for f in css_files)
    combined_js = "\n".join(f.get("content", "") for f in js_files)
    for tsf in ts_files:
        combined_js += "\n" + strip_typescript_types(tsf.get("content", ""))

    extra_runtime = ""
    if engine_type == "PHASER":
        extra_runtime = PHASER_SHIM_JS
    elif engine_type == "PYTHON_PYODIDE":
        py_source = "\n".join(f.get("content", "") for f in py_files)
        extra_runtime = (
            PYTHON_BROWSER_RUNTIME_JS
            + f"\nwindow.addEventListener('DOMContentLoaded', () => window.runSandboxedPythonGame({json.dumps(py_source)}));"
        )

    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:;" />
  <style>
    *, *::before, *::after {{ box-sizing: border-box; }}
    html {{ width: 100%; height: 100%; }}
    body {{
      margin: 0;
      padding: 10px;
      width: 100%;
      min-height: 100%;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: radial-gradient(circle at 50% 0%, #1e293b 0%, #0b1120 75%);
      color: #f8fafc;
      overflow: auto;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      touch-action: manipulation;
      -webkit-tap-highlight-color: transparent;
    }}
    canvas {{
      max-width: 100% !important;
      max-height: calc(100vh - 28px);
      height: auto;
      object-fit: contain;
      display: block;
      margin: 0 auto;
    }}
    button {{ touch-action: manipulation; }}
    {combined_css}
  </style>
</head>
<body>
  {base_html}
  <script>
    {SAFE_BRIDGE_JS}
    // Prevent arrow keys & spacebar from scrolling the game iframe while playing
    window.addEventListener('keydown', function(e) {{
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toUpperCase() : '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', ' '].includes(e.key)) {{
        e.preventDefault();
      }}
    }}, {{ passive: false }});
    // Notify parent when game DOM is ready so host can focus the frame smoothly
    window.addEventListener('load', function() {{
      try {{ window.focus(); }} catch (_) {{}}
      window.parent.postMessage({{ type: 'GITEGO_GAME_EVENT', event: 'GAME_READY' }}, '*');
    }});
    {extra_runtime}
    try {{
      {combined_js}
    }} catch (err) {{
      window.parent.postMessage({{ type: 'GITEGO_GAME_EVENT', event: 'RUNTIME_ERROR', message: String(err) }}, '*');
    }}
  </script>
</body>
</html>"""
