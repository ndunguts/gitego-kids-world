import { api } from '../api.js';
import { mountVideoWithAds } from '../components/videoAdPlayer.js';

const ADMIN_SECTIONS = [
  { id: 'overview', icon: '📊', label: 'Overview' },
  { id: 'game-studio', icon: '💻', label: 'Game Studio (IDE)' },
  { id: 'games-library', icon: '🎮', label: 'Games Library' },
  { id: 'storybook-studio', icon: '🎨', label: 'Storybook Studio' },
  { id: 'books-library', icon: '📖', label: 'Books Library' },
  { id: 'cartoon-studio', icon: '🎬', label: 'Cartoon Studio' },
  { id: 'video-library', icon: '📺', label: 'Video Library' },
  { id: 'learning-center', icon: '🧠', label: 'Learning Center' },
  { id: 'categories', icon: '🗂️', label: 'Categories' },
  { id: 'languages', icon: '🌍', label: 'Languages' },
  { id: 'users', icon: '👥', label: 'Users / Parents / Children' },
  { id: 'rewards', icon: '🏆', label: 'Rewards' },
  { id: 'reports', icon: '📈', label: 'Reports / Analytics' },
  { id: 'settings', icon: '⚙️', label: 'Platform Settings' },
];

let adminState = {
  section: 'game-studio',
  studioProjects: [],
  activeProjectId: null,
  activeFileIdx: 0,
  autosaveTimer: null,
  consoleLogs: ['[Game Studio Ready] Isolated sandbox execution enabled.'],
  storybooks: [],
  activeBookId: null,
  gamesLibrary: {
    search: '',
    status: 'ALL',
    category: 'ALL',
    ageGroup: 'ALL',
    engine: 'ALL',
    sortBy: 'updated',
  },
  booksLibrary: {
    search: '',
    status: 'ALL',
    language: 'ALL',
    category: 'ALL',
    ageGroup: 'ALL',
    sortBy: 'updated',
  },
  videoLibrary: {
    search: '',
    status: 'ALL',
    category: 'ALL',
    provider: 'ALL',
    language: 'ALL',
    ageGroup: 'ALL',
    sortBy: 'newest',
  },
  learningCenter: {
    tab: 'all', // all | lesson | exam
    cycle: 'ALL', // ALL | materineri | primary | o_level | high_school
    grade: 'ALL',
    subjectId: 'ALL',
    search: '',
  },
  usersPanel: {
    tab: 'admins', // admins | creators | parents | children | rules
    search: '',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function isImageCover(value) {
  const s = String(value || '').trim();
  return s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/');
}

function renderCoverVisual(coverValue, altText = 'Game cover') {
  if (isImageCover(coverValue)) {
    return `<img src="${escapeHtml(coverValue)}" alt="${escapeHtml(altText)}" class="gl-cover-img" />`;
  }
  return `<span class="gl-cover-emoji">${escapeHtml(coverValue || '🎮')}</span>`;
}

async function uploadAdminImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '');
        const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        const res = await api.request('/api/v1/admin/media/upload', {
          method: 'POST',
          body: JSON.stringify({
            filename: file.name || 'game_cover.png',
            mime_type: file.type || 'image/png',
            media_type: 'image',
            content_base64: base64Part,
          }),
        });
        resolve(res.public_url);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export async function renderAdminView(container) {
  const user = api.getCurrentUser();
  if (!user || user.role === 'CHILD' || user.role === 'PARENT') {
    container.innerHTML = `<div style="padding:32px;color:#b91c1c;font-weight:800">⛔ Access Denied: Role '${user ? user.role : 'Guest'}' is prohibited from accessing the Admin Dashboard or Game Studio source code.</div>`;
    return;
  }

  container.innerHTML = `
    <div class="theme-admin">
      <aside class="admin-sidebar" aria-label="Admin Navigation">
        <div style="padding:6px 10px 10px;border-bottom:1px solid #1e293b;margin-bottom:6px">
          <div style="font-weight:900;color:#fff;font-size:0.95rem;letter-spacing:0.02em">🛡️ GITEGO ADMIN</div>
          <div style="font-size:0.76rem;color:#38bdf8;margin-top:3px;font-weight:700">${user.full_name} (${user.role})</div>
        </div>
        ${ADMIN_SECTIONS.map(
          (sec) => `
          <button class="admin-nav-item ${adminState.section === sec.id ? 'active' : ''}" data-sec="${sec.id}" type="button">
            <span>${sec.icon}</span>
            <span>${sec.label}</span>
          </button>
        `
        ).join('')}
      </aside>
      <main class="admin-main" id="admin-section-body"></main>
    </div>
  `;

  container.querySelectorAll('.admin-nav-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      stopAdminUsersLiveRefresh();
      adminState.section = btn.dataset.sec;
      renderAdminView(container);
    });
  });

  const bodyEl = container.querySelector('#admin-section-body');
  const sec = adminState.section;
  if (sec === 'overview' || sec === 'reports' || sec === 'analytics') await renderAdminOverview(bodyEl);
  else if (sec === 'game-studio') await renderGameStudioSection(bodyEl);
  else if (sec === 'games-library') await renderGamesLibrarySection(bodyEl, container);
  else if (sec === 'storybook-studio') await renderStorybookStudioSection(bodyEl);
  else if (sec === 'books-library') await renderBooksLibrarySection(bodyEl, container);
  else if (sec === 'cartoon-studio') await renderCartoonStudioSection(bodyEl);
  else if (sec === 'video-library') await renderVideoLibrarySection(bodyEl, container);
  else if (sec === 'learning-center') await renderLearningAdminSection(bodyEl);
  else if (sec === 'categories') await renderCategoriesAdminSection(bodyEl);
  else if (sec === 'languages') await renderLanguagesAdminSection(bodyEl);
  else if (sec === 'users' || sec === 'parents' || sec === 'children') {
    if (sec === 'parents') adminState.usersPanel.tab = 'parents';
    else if (sec === 'children') adminState.usersPanel.tab = 'children';
    await renderUsersAdminSection(bodyEl);
  }
  else if (sec === 'rewards') await renderRewardsAdminSection(bodyEl);
  else if (sec === 'settings') await renderSettingsAdminSection(bodyEl);
}

/* ==========================================================================
   GAMES LIBRARY (All Games Catalog, Edit Details, Game Settings, Preview & Delete)
   ========================================================================== */
async function renderGamesLibrarySection(bodyEl, rootContainer, notice = null) {
  const [projects, gameCats, dynCats, langs] = await Promise.all([
    api.request('/api/v1/game-studio/projects'),
    api.request('/api/v1/games/categories').catch(() => []),
    api.request('/api/v1/categories?content_type=game').catch(() => []),
    api.request('/api/v1/languages').catch(() => []),
  ]);
  adminState.studioProjects = projects;

  const filters = adminState.gamesLibrary;
  const categoryNames = Array.from(
    new Set([
      ...gameCats.map((c) => c.name),
      ...dynCats.map((c) => c.name),
      ...projects.map((p) => p.category_name).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const langOptions = langs.length
    ? langs
    : [
        { code: 'rw', name: 'Kinyarwanda', flag_emoji: '🇷🇼' },
        { code: 'fr', name: 'Français', flag_emoji: '🇫🇷' },
        { code: 'sw', name: 'Kiswahili', flag_emoji: '🇹🇿' },
        { code: 'en', name: 'English', flag_emoji: '🇬🇧' },
      ];

  const publishedCount = projects.filter((p) => p.status === 'Published').length;
  const draftReviewCount = projects.filter((p) => p.status === 'Draft' || p.status === 'Review').length;
  const archivedCount = projects.filter((p) => p.status === 'Archived').length;
  const totalPlays = projects.reduce((sum, p) => sum + (Number(p.play_count) || 0), 0);

  const q = filters.search.trim().toLowerCase();
  const filteredGames = projects
    .filter((g) => {
      if (filters.status !== 'ALL' && g.status !== filters.status) return false;
      if (filters.category !== 'ALL' && g.category_name !== filters.category) return false;
      if (filters.ageGroup !== 'ALL' && g.age_group !== filters.ageGroup) return false;
      if (filters.engine !== 'ALL' && g.game_engine !== filters.engine) return false;
      if (q) {
        const hay = `${g.title} ${g.description} ${g.instructions || ''} ${g.category_name} ${g.game_engine}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'plays') return (b.play_count || 0) - (a.play_count || 0);
      if (filters.sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (filters.sortBy === 'score') return (b.max_possible_score || 0) - (a.max_possible_score || 0);
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

  const statusBadgeClass = (st) => {
    if (st === 'Published') return 'gl-status-published';
    if (st === 'Review') return 'gl-status-review';
    if (st === 'Archived') return 'gl-status-archived';
    return 'gl-status-draft';
  };

  bodyEl.innerHTML = `
    <div class="gl-header">
      <div>
        <h2 style="margin:0">🎮 Games Library (${projects.length})</h2>
        <small style="color:var(--text-3)">Manage all games — edit titles, descriptions, instructions, cover images, game settings, preview, publish/archive, duplicate, or delete.</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="gl-open-studio-new-btn" class="btn-primary" type="button">+ Create New Game</button>
      </div>
    </div>

    ${
      notice
        ? `<div class="gl-notice ${notice.type === 'error' ? 'gl-notice-error' : 'gl-notice-success'}">${escapeHtml(notice.text)}</div>`
        : ''
    }

    <div class="admin-kpi-grid">
      <div class="admin-kpi"><small>All Games</small><div class="num">${projects.length}</div></div>
      <div class="admin-kpi"><small>Published (Live)</small><div class="num" style="color:#4ade80">${publishedCount}</div></div>
      <div class="admin-kpi"><small>Draft / Review</small><div class="num" style="color:#fbbf24">${draftReviewCount}</div></div>
      <div class="admin-kpi"><small>Archived</small><div class="num" style="color:#94a3b8">${archivedCount}</div></div>
      <div class="admin-kpi"><small>Total Plays</small><div class="num" style="color:#38bdf8">${totalPlays}</div></div>
    </div>

    <div class="admin-card gl-filter-bar">
      <input id="gl-search" type="search" value="${escapeHtml(filters.search)}" placeholder="🔍 Search games by title, description, category..." />
      <select id="gl-filter-status" aria-label="Filter by status">
        <option value="ALL" ${filters.status === 'ALL' ? 'selected' : ''}>All Statuses</option>
        <option value="Published" ${filters.status === 'Published' ? 'selected' : ''}>✅ Published</option>
        <option value="Draft" ${filters.status === 'Draft' ? 'selected' : ''}>📝 Draft</option>
        <option value="Review" ${filters.status === 'Review' ? 'selected' : ''}>📋 Review</option>
        <option value="Archived" ${filters.status === 'Archived' ? 'selected' : ''}>📦 Archived</option>
      </select>
      <select id="gl-filter-category" aria-label="Filter by category">
        <option value="ALL" ${filters.category === 'ALL' ? 'selected' : ''}>All Categories</option>
        ${categoryNames
          .map((c) => `<option value="${escapeHtml(c)}" ${filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
          .join('')}
      </select>
      <select id="gl-filter-age" aria-label="Filter by age group">
        <option value="ALL" ${filters.ageGroup === 'ALL' ? 'selected' : ''}>All Ages</option>
        <option value="3-5" ${filters.ageGroup === '3-5' ? 'selected' : ''}>Ages 3–5</option>
        <option value="6-8" ${filters.ageGroup === '6-8' ? 'selected' : ''}>Ages 6–8</option>
        <option value="9-12" ${filters.ageGroup === '9-12' ? 'selected' : ''}>Ages 9–12</option>
      </select>
      <select id="gl-filter-engine" aria-label="Filter by engine">
        <option value="ALL" ${filters.engine === 'ALL' ? 'selected' : ''}>All Engines</option>
        <option value="HTML5_JS" ${filters.engine === 'HTML5_JS' ? 'selected' : ''}>HTML5 + JS</option>
        <option value="PHASER" ${filters.engine === 'PHASER' ? 'selected' : ''}>Phaser.js</option>
        <option value="TYPESCRIPT" ${filters.engine === 'TYPESCRIPT' ? 'selected' : ''}>TypeScript</option>
        <option value="PYTHON_PYODIDE" ${filters.engine === 'PYTHON_PYODIDE' ? 'selected' : ''}>Python (Pyodide)</option>
      </select>
      <select id="gl-sort" aria-label="Sort games">
        <option value="updated" ${filters.sortBy === 'updated' ? 'selected' : ''}>Sort: Recently Updated</option>
        <option value="plays" ${filters.sortBy === 'plays' ? 'selected' : ''}>Sort: Most Played</option>
        <option value="title" ${filters.sortBy === 'title' ? 'selected' : ''}>Sort: Title A–Z</option>
        <option value="score" ${filters.sortBy === 'score' ? 'selected' : ''}>Sort: Max Score</option>
      </select>
    </div>

    ${
      filteredGames.length === 0
        ? `<div class="admin-card" style="text-align:center;padding:36px;color:var(--text-3)">
             <div style="font-size:2rem;margin-bottom:8px">🎮</div>
             <strong>No games match your current filters.</strong>
             <div style="margin-top:12px"><button id="gl-reset-filters-btn" class="btn-secondary" type="button">Reset Filters</button></div>
           </div>`
        : `<div class="gl-grid">
            ${filteredGames
              .map(
                (g) => `
              <article class="gl-card" data-gid="${g.id}">
                <div class="gl-card-top">
                  <div class="gl-cover-box">${renderCoverVisual(g.cover_image, g.title)}</div>
                  <div class="gl-card-head">
                    <div class="gl-card-badges">
                      <span class="gl-status-badge ${statusBadgeClass(g.status)}">${escapeHtml(g.status)}</span>
                      <span class="gl-ver-badge">v${escapeHtml(g.published_version || '0.1.0')}</span>
                      <span class="gl-engine-badge">${escapeHtml(g.game_engine)}</span>
                    </div>
                    <h3 class="gl-card-title">${escapeHtml(g.title)}</h3>
                    <p class="gl-card-desc">${escapeHtml(g.description)}</p>
                  </div>
                </div>

                <div class="gl-meta-chips">
                  <span>🗂️ ${escapeHtml(g.category_name)}</span>
                  <span>🧒 Ages ${escapeHtml(g.age_group)}</span>
                  <span>⚡ ${escapeHtml(g.difficulty)}</span>
                  <span>🏆 Max ${g.max_possible_score}</span>
                  <span>▶️ ${g.play_count} plays</span>
                  <span>🌍 ${escapeHtml((g.supported_languages || '').toUpperCase())}</span>
                  <span>📄 ${(g.project?.files || []).length} files</span>
                </div>

                <div class="gl-card-actions">
                  <button class="btn-primary gl-edit-btn" data-gid="${g.id}" type="button">✏️ Edit</button>
                  <button class="btn-secondary gl-settings-btn" data-gid="${g.id}" type="button">⚙️ Settings</button>
                  <button class="btn-secondary gl-preview-btn" data-gid="${g.id}" type="button">▶️ Preview</button>
                  <button class="btn-secondary gl-ide-btn" data-gid="${g.id}" type="button">💻 IDE</button>
                  ${
                    g.status === 'Published'
                      ? `<button class="btn-secondary gl-archive-btn" data-gid="${g.id}" type="button">📦 Archive</button>`
                      : `<button class="btn-success gl-publish-btn" data-gid="${g.id}" type="button">🚀 Publish</button>`
                  }
                  <button class="btn-secondary gl-duplicate-btn" data-gid="${g.id}" type="button" title="Duplicate game">📋 Clone</button>
                  <button class="btn-danger gl-delete-btn" data-gid="${g.id}" type="button">🗑️ Delete</button>
                </div>
              </article>
            `
              )
              .join('')}
          </div>`
    }

    <!-- Edit / Settings Modal -->
    <div id="gl-modal-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal" role="dialog" aria-modal="true" aria-labelledby="gl-modal-title">
        <div class="gl-modal-header">
          <div>
            <h3 id="gl-modal-title" style="margin:0">Edit Game</h3>
            <small id="gl-modal-subtitle" style="color:var(--text-3)"></small>
          </div>
          <button id="gl-modal-close" class="btn-secondary" type="button">✕ Close</button>
        </div>

        <div class="gl-modal-tabs">
          <button id="gl-tab-edit" class="gl-tab-btn active" type="button">✏️ Edit Details</button>
          <button id="gl-tab-settings" class="gl-tab-btn" type="button">⚙️ Game Settings</button>
        </div>

        <form id="gl-edit-form" class="gl-modal-body">
          <!-- Tab 1: Edit Details -->
          <div id="gl-pane-edit">
            <div class="form-grid">
              <label class="form-control">
                Game Title
                <input name="title" required maxlength="200" placeholder="Enter game title" />
              </label>
              <label class="form-control">
                Category
                <input name="category_name" list="gl-category-datalist" required maxlength="100" placeholder="e.g. Arcade & Adventure" />
                <datalist id="gl-category-datalist">
                  ${categoryNames.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('')}
                </datalist>
              </label>
            </div>

            <label class="form-control" style="margin-top:10px">
              Description
              <textarea name="description" rows="3" required placeholder="Describe what children will do in this game..."></textarea>
            </label>

            <label class="form-control" style="margin-top:10px">
              Child Instructions (How to Play)
              <textarea name="instructions" rows="2" placeholder="Tap or use Arrow Keys to play!"></textarea>
            </label>

            <div class="gl-cover-editor">
              <div id="gl-cover-preview" class="gl-cover-box" style="width:72px;height:72px"></div>
              <div style="flex:1;min-width:220px">
                <div class="form-grid" style="margin-bottom:6px">
                  <label class="form-control">
                    Cover Emoji or Image URL
                    <input name="cover_image" id="gl-cover-input" maxlength="500" placeholder="🎮 or /uploads/image/..." />
                  </label>
                  <label class="form-control">
                    Upload Cover Image
                    <input id="gl-cover-upload" type="file" accept="image/*" />
                  </label>
                </div>
                <small id="gl-cover-upload-status" style="color:#4ade80;font-weight:700"></small>
              </div>
            </div>
          </div>

          <!-- Tab 2: Game Settings -->
          <div id="gl-pane-settings" style="display:none">
            <div class="form-grid">
              <label class="form-control">
                Visibility / Status
                <select name="status">
                  <option value="Published">✅ Published (Visible to Children)</option>
                  <option value="Draft">📝 Draft (Hidden)</option>
                  <option value="Review">📋 In Review</option>
                  <option value="Archived">📦 Archived (Hidden)</option>
                </select>
              </label>
              <label class="form-control">
                Target Age Group
                <select name="age_group">
                  <option value="3-5">Ages 3–5</option>
                  <option value="6-8">Ages 6–8</option>
                  <option value="9-12">Ages 9–12</option>
                </select>
              </label>
              <label class="form-control">
                Difficulty Level
                <select name="difficulty">
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </label>
              <label class="form-control">
                Max Possible Score (Anti-Cheat Cap)
                <input name="max_possible_score" type="number" min="1" max="1000000" required />
              </label>
              <label class="form-control">
                Game Engine
                <select name="game_engine">
                  <option value="HTML5_JS">HTML5 + CSS3 + JavaScript</option>
                  <option value="PHASER">Phaser.js 2D Canvas</option>
                  <option value="TYPESCRIPT">TypeScript Runtime</option>
                  <option value="PYTHON_PYODIDE">Python (Pyodide Sandbox)</option>
                </select>
              </label>
              <label class="form-control" style="justify-content:center">
                <span>IDE Autosave</span>
                <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer;font-weight:600">
                  <input name="autosave_enabled" type="checkbox" style="width:auto;height:auto" />
                  <span>Enable automatic code saving</span>
                </label>
              </label>
            </div>

            <div style="margin-top:12px">
              <label class="form-control">Supported Languages</label>
              <div id="gl-lang-checkboxes" class="gl-lang-checks">
                ${langOptions
                  .map(
                    (l) => `
                  <label class="gl-lang-pill">
                    <input type="checkbox" class="gl-lang-cb" value="${escapeHtml(l.code)}" />
                    <span>${escapeHtml(l.flag_emoji || '🌍')} ${escapeHtml(l.name)} (${escapeHtml(l.code.toUpperCase())})</span>
                  </label>
                `
                  )
                  .join('')}
              </div>
              <input name="supported_languages" id="gl-langs-text" type="text" placeholder="rw,fr,sw,en" style="margin-top:6px;width:100%" />
            </div>

            <div class="gl-versions-box">
              <strong>📦 Published Version History</strong>
              <div id="gl-versions-list" style="margin-top:6px"></div>
            </div>

            <div class="gl-danger-zone">
              <div>
                <strong>⚠️ Danger Zone</strong>
                <div style="font-size:0.8rem;color:var(--text-3)">Permanently delete this game, its source files, versions, sessions, and scores.</div>
              </div>
              <button id="gl-modal-delete-btn" class="btn-danger" type="button">🗑️ Delete Game</button>
            </div>
          </div>

          <div class="gl-modal-footer">
            <button id="gl-modal-publish-btn" class="btn-success" type="button">🚀 Publish New Version</button>
            <div style="display:flex;gap:8px">
              <button id="gl-modal-cancel-btn" class="btn-secondary" type="button">Cancel</button>
              <button class="btn-primary" type="submit">💾 Save Changes</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Live Sandboxed Preview Modal -->
    <div id="gl-preview-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal gl-preview-modal" role="dialog" aria-modal="true" aria-labelledby="gl-preview-title">
        <div class="gl-modal-header">
          <div>
            <h3 id="gl-preview-title" style="margin:0">▶️ Game Preview</h3>
            <small style="color:#4ade80">Isolated Sandbox • CSP Enforced</small>
          </div>
          <div style="display:flex;gap:8px">
            <button id="gl-preview-reload" class="btn-secondary" type="button">↻ Reload</button>
            <button id="gl-preview-close" class="btn-secondary" type="button">✕ Close</button>
          </div>
        </div>
        <iframe id="gl-preview-iframe" class="gl-preview-iframe" sandbox="allow-scripts" title="Games Library Sandbox Preview"></iframe>
      </div>
    </div>
  `;

  // Wire search, filters, and sort
  const rerenderFilters = () => renderGamesLibrarySection(bodyEl, rootContainer);
  const searchInput = bodyEl.querySelector('#gl-search');
  let searchDebounce = null;
  searchInput.addEventListener('input', (e) => {
    filters.search = e.target.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      await rerenderFilters();
      const nextSearch = bodyEl.querySelector('#gl-search');
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    }, 220);
  });
  bodyEl.querySelector('#gl-filter-status').addEventListener('change', (e) => {
    filters.status = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#gl-filter-category').addEventListener('change', (e) => {
    filters.category = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#gl-filter-age').addEventListener('change', (e) => {
    filters.ageGroup = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#gl-filter-engine').addEventListener('change', (e) => {
    filters.engine = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#gl-sort').addEventListener('change', (e) => {
    filters.sortBy = e.target.value;
    rerenderFilters();
  });

  const resetBtn = bodyEl.querySelector('#gl-reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      adminState.gamesLibrary = {
        search: '',
        status: 'ALL',
        category: 'ALL',
        ageGroup: 'ALL',
        engine: 'ALL',
        sortBy: 'updated',
      };
      renderGamesLibrarySection(bodyEl, rootContainer);
    });
  }

  // Create New Game -> navigate to Game Studio
  bodyEl.querySelector('#gl-open-studio-new-btn').addEventListener('click', () => {
    adminState.section = 'game-studio';
    renderAdminView(rootContainer);
  });

  // Modal state & helpers
  let editingGame = null;
  const modalBackdrop = bodyEl.querySelector('#gl-modal-backdrop');
  const editForm = bodyEl.querySelector('#gl-edit-form');
  const paneEdit = bodyEl.querySelector('#gl-pane-edit');
  const paneSettings = bodyEl.querySelector('#gl-pane-settings');
  const tabEdit = bodyEl.querySelector('#gl-tab-edit');
  const tabSettings = bodyEl.querySelector('#gl-tab-settings');
  const coverInput = bodyEl.querySelector('#gl-cover-input');
  const coverPreview = bodyEl.querySelector('#gl-cover-preview');
  const coverUpload = bodyEl.querySelector('#gl-cover-upload');
  const coverUploadStatus = bodyEl.querySelector('#gl-cover-upload-status');
  const langsText = bodyEl.querySelector('#gl-langs-text');

  function setModalTab(tab) {
    const isEdit = tab === 'edit';
    paneEdit.style.display = isEdit ? 'block' : 'none';
    paneSettings.style.display = isEdit ? 'none' : 'block';
    tabEdit.classList.toggle('active', isEdit);
    tabSettings.classList.toggle('active', !isEdit);
  }

  function openGameModal(gameId, initialTab = 'edit') {
    const g = projects.find((p) => p.id === Number(gameId));
    if (!g) return;
    editingGame = g;

    bodyEl.querySelector('#gl-modal-title').textContent = `${g.title}`;
    bodyEl.querySelector('#gl-modal-subtitle').textContent = `Game #${g.id} • ${g.status} • v${g.published_version || '0.1.0'} • ${g.play_count} plays`;

    editForm.elements.namedItem('title').value = g.title || '';
    editForm.elements.namedItem('category_name').value = g.category_name || '';
    editForm.elements.namedItem('description').value = g.description || '';
    editForm.elements.namedItem('instructions').value = g.instructions || '';
    coverInput.value = g.cover_image || '🎮';
    coverPreview.innerHTML = renderCoverVisual(g.cover_image, g.title);
    coverUploadStatus.textContent = '';

    editForm.elements.namedItem('status').value = g.status || 'Draft';
    editForm.elements.namedItem('age_group').value = g.age_group || '6-8';
    editForm.elements.namedItem('difficulty').value = g.difficulty || 'Easy';
    editForm.elements.namedItem('max_possible_score').value = g.max_possible_score || 1000;
    editForm.elements.namedItem('game_engine').value = g.game_engine || 'HTML5_JS';
    editForm.elements.namedItem('autosave_enabled').checked = g.project ? Boolean(g.project.autosave_enabled) : true;

    const currentLangs = new Set(
      String(g.supported_languages || '')
        .split(',')
        .map((x) => x.trim().toLowerCase())
        .filter(Boolean)
    );
    langsText.value = g.supported_languages || 'rw,fr,sw,en';
    bodyEl.querySelectorAll('.gl-lang-cb').forEach((cb) => {
      cb.checked = currentLangs.has(cb.value.toLowerCase());
    });

    const versionsList = bodyEl.querySelector('#gl-versions-list');
    if (g.versions && g.versions.length) {
      versionsList.innerHTML = g.versions
        .slice()
        .reverse()
        .map(
          (v) =>
            `<div class="gl-version-row"><code>v${escapeHtml(v.version_number)}</code> <span>${escapeHtml(v.changelog || 'Published')}</span> <small>${v.created_at ? new Date(v.created_at).toLocaleString() : ''}</small></div>`
        )
        .join('');
    } else {
      versionsList.innerHTML = `<small style="color:var(--text-3)">No published versions yet. Click "🚀 Publish New Version" to compile and publish.</small>`;
    }

    setModalTab(initialTab);
    modalBackdrop.style.display = 'flex';
  }

  function closeGameModal() {
    modalBackdrop.style.display = 'none';
    editingGame = null;
  }

  tabEdit.addEventListener('click', () => setModalTab('edit'));
  tabSettings.addEventListener('click', () => setModalTab('settings'));
  bodyEl.querySelector('#gl-modal-close').addEventListener('click', closeGameModal);
  bodyEl.querySelector('#gl-modal-cancel-btn').addEventListener('click', closeGameModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeGameModal();
  });

  coverInput.addEventListener('input', () => {
    coverPreview.innerHTML = renderCoverVisual(coverInput.value.trim(), editingGame?.title || 'Cover');
  });

  coverUpload.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    coverUploadStatus.textContent = '⏳ Uploading cover image...';
    try {
      const url = await uploadAdminImageFile(file);
      coverInput.value = url;
      coverPreview.innerHTML = renderCoverVisual(url, editingGame?.title || 'Cover');
      coverUploadStatus.textContent = '✅ Cover uploaded! Click "Save Changes" to apply.';
    } catch (err) {
      coverUploadStatus.textContent = `❌ Upload failed: ${err.message}`;
    }
  });

  bodyEl.querySelectorAll('.gl-lang-cb').forEach((cb) => {
    cb.addEventListener('change', () => {
      const checked = Array.from(bodyEl.querySelectorAll('.gl-lang-cb:checked')).map((el) => el.value);
      const extras = langsText.value
        .split(',')
        .map((x) => x.trim())
        .filter((x) => x && !langOptions.some((lo) => lo.code === x));
      langsText.value = [...checked, ...extras].join(',');
    });
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingGame) return;
    const fd = new FormData(editForm);
    const payload = {
      title: String(fd.get('title') || '').trim(),
      category_name: String(fd.get('category_name') || '').trim(),
      description: String(fd.get('description') || '').trim(),
      instructions: String(fd.get('instructions') || '').trim(),
      cover_image: String(fd.get('cover_image') || '🎮').trim() || '🎮',
      status: String(fd.get('status') || editingGame.status),
      age_group: String(fd.get('age_group') || '6-8'),
      difficulty: String(fd.get('difficulty') || 'Easy'),
      max_possible_score: Math.max(1, Number(fd.get('max_possible_score')) || 1000),
      game_engine: String(fd.get('game_engine') || editingGame.game_engine),
      supported_languages: String(fd.get('supported_languages') || 'rw,fr,sw,en').trim() || 'rw,fr,sw,en',
      autosave_enabled: Boolean(editForm.elements.namedItem('autosave_enabled').checked),
    };
    try {
      await api.request(`/api/v1/game-studio/projects/${editingGame.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const savedTitle = payload.title;
      closeGameModal();
      renderGamesLibrarySection(bodyEl, rootContainer, {
        type: 'success',
        text: `✅ Updated "${savedTitle}" successfully.`,
      });
    } catch (err) {
      window.alert(`Could not save game changes: ${err.message}`);
    }
  });

  bodyEl.querySelector('#gl-modal-publish-btn').addEventListener('click', async () => {
    if (!editingGame) return;
    try {
      const pub = await api.request(`/api/v1/game-studio/projects/${editingGame.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ changelog: 'Published from Games Library' }),
      });
      closeGameModal();
      renderGamesLibrarySection(bodyEl, rootContainer, {
        type: 'success',
        text: `🚀 Published "${pub.title}" v${pub.published_version}! Now live for children.`,
      });
    } catch (err) {
      window.alert(`Publish failed: ${err.message}`);
    }
  });

  async function handleDeleteGame(game) {
    const confirmed = window.confirm(
      `Delete "${game.title}" permanently?\n\nThis removes the game, its source files, published versions, sessions, and scores. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await api.request(`/api/v1/game-studio/projects/${game.id}`, { method: 'DELETE' });
      if (adminState.activeProjectId === game.id) {
        adminState.activeProjectId = null;
        adminState.activeFileIdx = 0;
      }
      closeGameModal();
      renderGamesLibrarySection(bodyEl, rootContainer, {
        type: 'success',
        text: `🗑️ Deleted "${game.title}".`,
      });
    } catch (err) {
      renderGamesLibrarySection(bodyEl, rootContainer, {
        type: 'error',
        text: `❌ Could not delete "${game.title}": ${err.message}`,
      });
    }
  }

  bodyEl.querySelector('#gl-modal-delete-btn').addEventListener('click', () => {
    if (editingGame) handleDeleteGame(editingGame);
  });

  // Preview Modal
  let previewGameId = null;
  const previewBackdrop = bodyEl.querySelector('#gl-preview-backdrop');
  const previewIframe = bodyEl.querySelector('#gl-preview-iframe');

  async function openPreviewModal(gameId) {
    const g = projects.find((p) => p.id === Number(gameId));
    if (!g) return;
    previewGameId = g.id;
    bodyEl.querySelector('#gl-preview-title').textContent = `▶️ Preview: ${g.title}`;
    previewBackdrop.style.display = 'flex';
    const html = await api.request(`/api/v1/game-studio/projects/${g.id}/preview`);
    previewIframe.srcdoc = html;
  }

  function closePreviewModal() {
    previewBackdrop.style.display = 'none';
    previewIframe.srcdoc = '';
    previewGameId = null;
  }

  bodyEl.querySelector('#gl-preview-close').addEventListener('click', closePreviewModal);
  previewBackdrop.addEventListener('click', (e) => {
    if (e.target === previewBackdrop) closePreviewModal();
  });
  bodyEl.querySelector('#gl-preview-reload').addEventListener('click', () => {
    if (previewGameId) openPreviewModal(previewGameId);
  });

  // Wire per-card actions
  bodyEl.querySelectorAll('.gl-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openGameModal(btn.dataset.gid, 'edit'));
  });

  bodyEl.querySelectorAll('.gl-settings-btn').forEach((btn) => {
    btn.addEventListener('click', () => openGameModal(btn.dataset.gid, 'settings'));
  });

  bodyEl.querySelectorAll('.gl-preview-btn').forEach((btn) => {
    btn.addEventListener('click', () => openPreviewModal(btn.dataset.gid));
  });

  bodyEl.querySelectorAll('.gl-ide-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      adminState.activeProjectId = Number(btn.dataset.gid);
      adminState.activeFileIdx = 0;
      adminState.section = 'game-studio';
      renderAdminView(rootContainer);
    });
  });

  bodyEl.querySelectorAll('.gl-publish-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const g = projects.find((p) => p.id === Number(btn.dataset.gid));
      if (!g) return;
      try {
        const pub = await api.request(`/api/v1/game-studio/projects/${g.id}/publish`, {
          method: 'POST',
          body: JSON.stringify({ changelog: 'Published from Games Library' }),
        });
        renderGamesLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `🚀 Published "${pub.title}" v${pub.published_version}!`,
        });
      } catch (err) {
        renderGamesLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Publish failed for "${g.title}": ${err.message}`,
        });
      }
    });
  });

  bodyEl.querySelectorAll('.gl-archive-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const g = projects.find((p) => p.id === Number(btn.dataset.gid));
      if (!g) return;
      try {
        await api.request(`/api/v1/game-studio/projects/${g.id}/archive`, { method: 'POST' });
        renderGamesLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `📦 Archived "${g.title}". It is now hidden from children.`,
        });
      } catch (err) {
        renderGamesLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Could not archive "${g.title}": ${err.message}`,
        });
      }
    });
  });

  bodyEl.querySelectorAll('.gl-duplicate-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const g = projects.find((p) => p.id === Number(btn.dataset.gid));
      if (!g) return;
      try {
        const clone = await api.request(`/api/v1/game-studio/projects/${g.id}/duplicate`, { method: 'POST' });
        renderGamesLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `📋 Duplicated "${g.title}" as "${clone.title}" (Draft).`,
        });
      } catch (err) {
        renderGamesLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Could not duplicate "${g.title}": ${err.message}`,
        });
      }
    });
  });

  bodyEl.querySelectorAll('.gl-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const g = projects.find((p) => p.id === Number(btn.dataset.gid));
      if (g) handleDeleteGame(g);
    });
  });
}

/* ==========================================================================
   GAME STUDIO IDE (Multi-file Editor, Sandboxed Preview, Review & Publish)
   ========================================================================== */
async function renderGameStudioSection(bodyEl) {
  const [projects, gameCats, dynCats] = await Promise.all([
    api.request('/api/v1/game-studio/projects'),
    api.request('/api/v1/games/categories').catch(() => []),
    api.request('/api/v1/categories?content_type=game').catch(() => []),
  ]);
  const gameCategoryNames = Array.from(
    new Set([
      ...dynCats.map((c) => c.name),
      ...gameCats.map((c) => c.name),
    ])
  );
  if (!gameCategoryNames.length) gameCategoryNames.push('Arcade & Adventure');
  adminState.studioProjects = projects;
  if (!adminState.activeProjectId && projects.length) {
    adminState.activeProjectId = projects[0].id;
  }
  const activeGame = projects.find((p) => p.id === adminState.activeProjectId) || projects[0];
  const files = activeGame?.project?.files || [];
  if (adminState.activeFileIdx >= files.length) adminState.activeFileIdx = 0;
  const currentFile = files[adminState.activeFileIdx] || { filename: 'index.html', language: 'html', content: '' };

  bodyEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px">
      <div>
        <h2 style="margin:0">💻 Game Studio — Multi-Engine Source Code IDE &amp; Publisher</h2>
        <small style="color:var(--text-3)">Develop games in HTML5, CSS3, JavaScript, Phaser.js, TypeScript, or Browser-Sandboxed Python (Pyodide).</small>
      </div>
      <div style="display:flex;gap:8px;align-items:center">
        <select id="studio-project-select" style="padding:8px 12px;border-radius:8px;border:1px solid var(--line-2);font-weight:700">
          ${projects.map((p) => `<option value="${p.id}" ${p.id === activeGame?.id ? 'selected' : ''}>${p.cover_image} ${p.title} [${p.game_engine} • ${p.status}]</option>`).join('')}
        </select>
        ${activeGame ? '<button id="edit-game-details-btn" class="btn-secondary" type="button">✏️ Edit Game</button><button id="delete-game-btn" class="btn-warning" type="button">🗑️ Delete Game</button>' : ''}
        <button id="toggle-new-game-btn" class="btn-primary" type="button">+ Create New Game</button>
      </div>
    </div>

    ${activeGame ? `
    <form id="edit-game-details-form" class="admin-card" style="display:none;border:1px solid rgba(99,102,241,0.45);margin-bottom:16px">
      <h3 style="margin-top:0">Edit Game Details</h3>
      <div class="form-grid">
        <label class="form-control">Title <input name="title" required maxlength="200" /></label>
        <label class="form-control">Cover Emoji / Image <input name="cover_image" maxlength="500" /></label>
        <label class="form-control">Category <input name="category_name" maxlength="100" /></label>
        <label class="form-control">Age Group
          <select name="age_group"><option value="3-5">Ages 3–5</option><option value="6-8">Ages 6–8</option><option value="9-12">Ages 9–12</option></select>
        </label>
        <label class="form-control">Difficulty
          <select name="difficulty"><option>Easy</option><option>Medium</option><option>Hard</option></select>
        </label>
        <label class="form-control">Game Engine
          <select name="game_engine"><option value="HTML5_JS">HTML5 + JavaScript</option><option value="PHASER">Phaser.js</option><option value="TYPESCRIPT">TypeScript</option><option value="PYTHON_PYODIDE">Python</option></select>
        </label>
        <label class="form-control">Description <textarea name="description" rows="2" required></textarea></label>
        <label class="form-control">Instructions <textarea name="instructions" rows="2"></textarea></label>
      </div>
      <button class="btn-success" type="submit">💾 Save Game Details</button>
      <button id="cancel-game-details-btn" class="btn-secondary" type="button">Cancel</button>
    </form>` : ''}

    <!-- Step 1-6: Create New Game Form -->
    <div id="new-game-modal" class="admin-card" style="display:none;border:1px solid rgba(99,102,241,0.45)">
      <h3 style="margin-top:0">Create New Game Project (Workflow Steps 1–6)</h3>
      <div class="form-grid">
        <label class="form-control">1. Game Title <input id="ng-title" type="text" placeholder="e.g. Virunga Volcano Jumper" /></label>
        <label class="form-control">2. Cover Emoji / URL <input id="ng-cover" type="text" value="🌋🦍" /></label>
        <label class="form-control">3. Category
          <select id="ng-cat">
            ${gameCategoryNames.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
        </label>
        <label class="form-control">4. Age Group
          <select id="ng-age">
            <option value="3-5">Ages 3–5</option>
            <option value="6-8" selected>Ages 6–8</option>
            <option value="9-12">Ages 9–12</option>
          </select>
        </label>
        <label class="form-control">5. Difficulty
          <select id="ng-diff">
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </label>
        <label class="form-control">6. Game Engine
          <select id="ng-engine">
            <option value="HTML5_JS">HTML5 + CSS3 + JavaScript</option>
            <option value="PHASER">Phaser.js 2D Canvas Engine</option>
            <option value="TYPESCRIPT">TypeScript Game Runtime</option>
            <option value="PYTHON_PYODIDE">Python (Pyodide Browser Sandbox)</option>
          </select>
        </label>
      </div>
      <div class="form-grid">
        <label class="form-control">Description <input id="ng-desc" type="text" placeholder="Fun adventure in Rwanda's volcanoes!" /></label>
        <label class="form-control">Child Instructions <input id="ng-inst" type="text" value="Tap or use Arrow Keys to score points!" /></label>
      </div>
      <button id="create-game-submit" class="btn-success" type="button">Initialize Project &amp; Open Code Editor ➡️</button>
    </div>

    ${
      activeGame
        ? `
    <!-- IDE Workspace -->
    <div class="studio-ide">
      <div class="studio-toolbar">
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <strong>${activeGame.cover_image} ${activeGame.title}</strong>
          <span style="background:#1f6feb;color:#fff;padding:3px 9px;border-radius:999px;font-size:0.75rem;font-weight:800">${activeGame.game_engine}</span>
          <span style="background:${activeGame.status === 'Published' ? '#238636' : '#9e6a03'};color:#fff;padding:3px 9px;border-radius:999px;font-size:0.75rem;font-weight:800">Status: ${activeGame.status} (v${activeGame.published_version})</span>
          <span id="autosave-badge" style="font-size:0.76rem;color:#8b949e">✓ Autosave Enabled</span>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="code-search-input" type="text" placeholder="🔍 Search in code..." style="background:#0d1117;color:#c9d1d9;border:1px solid #30363d;padding:5px 10px;border-radius:6px;font-size:0.8rem" />
          <button id="format-code-btn" class="btn-secondary" type="button">{ } Format</button>
          <button id="save-project-btn" class="btn-primary" type="button">💾 Save Project</button>
          <button id="run-preview-btn" class="btn-secondary" type="button">▶️ Run Preview</button>
          <button id="submit-review-btn" class="btn-warning" type="button">📋 Submit for Review</button>
          <button id="publish-game-btn" class="btn-success" type="button">🚀 Publish Game</button>
        </div>
      </div>

      <div class="studio-workspace">
        <!-- File Explorer -->
        <div class="studio-explorer">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;font-size:0.78rem;color:#8b949e;font-weight:800">
            <span>FILES (${files.length})</span>
            <button id="add-file-btn" style="background:#238636;color:#fff;border:none;border-radius:4px;padding:2px 7px;cursor:pointer;font-size:0.75rem">+ File</button>
          </div>
          <div id="new-file-inline" style="display:none;margin-bottom:8px">
            <input id="new-filename-input" type="text" placeholder="helper.js" style="width:100%;padding:5px;background:#0d1117;color:#fff;border:1px solid #30363d;border-radius:4px;font-size:0.8rem;margin-bottom:4px" />
            <button id="confirm-add-file-btn" class="btn-success" style="width:100%;padding:4px" type="button">Create File</button>
          </div>
          ${files
            .map(
              (f, idx) => `
            <div class="studio-file-btn ${idx === adminState.activeFileIdx ? 'active' : ''}" data-idx="${idx}">
              <span>📄 ${f.filename}</span>
              ${
                files.length > 1
                  ? `<span class="del-file-x" data-fid="${f.id}" title="Delete file" style="color:#f85149;padding:0 4px">×</span>`
                  : ''
              }
            </div>
          `
            )
            .join('')}

          <div class="studio-rules-box">
            <strong style="color:#58a6ff;display:block;margin-bottom:4px">🛡️ Sandbox Rules:</strong>
            • Isolated Iframe:<br/>
            <code>sandbox="allow-scripts"</code><br/>
            • Score Bridge:<br/>
            <code>GitegoGameAPI</code><br/>
            <code>.submitScore(s, done)</code><br/>
            • Browser Python sandbox.
          </div>
        </div>

        <!-- Code Editor -->
        <div class="studio-editor-pane">
          <div style="background:#161b22;padding:6px 14px;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;align-items:center;font-size:0.8rem">
            <span>Editing: <strong>${currentFile.filename}</strong> (${currentFile.language})</span>
            <span id="search-match-readout" style="color:#d29922"></span>
          </div>
          <div class="studio-code-wrap">
            <div id="editor-line-numbers" class="studio-line-numbers">1</div>
            <textarea id="studio-code-editor" class="studio-textarea" spellcheck="false">${currentFile.content}</textarea>
          </div>
        </div>

        <!-- Sandboxed Live Preview & Diagnostic Console -->
        <div class="studio-preview-pane">
          <div style="padding:6px 12px;background:#0d1117;border-bottom:1px solid #30363d;font-size:0.8rem;font-weight:700;display:flex;justify-content:space-between">
            <span>🕹️ Live Isolated Sandbox Preview</span>
            <span style="color:#3fb950">CSP Enforced</span>
          </div>
          <iframe
            id="studio-preview-iframe"
            class="studio-preview-iframe"
            sandbox="allow-scripts"
            title="Game Studio Sandbox Preview"
          ></iframe>
          <div class="studio-console" id="studio-console">
            ${adminState.consoleLogs.map((l) => `<div>${l}</div>`).join('')}
          </div>
        </div>
      </div>
    </div>
    `
        : ''
    }
  `;

  // Wire Create New Game Modal
  bodyEl.querySelector('#toggle-new-game-btn').addEventListener('click', () => {
    const m = bodyEl.querySelector('#new-game-modal');
    m.style.display = m.style.display === 'none' ? 'block' : 'none';
  });

  bodyEl.querySelector('#create-game-submit').addEventListener('click', async () => {
    const title = bodyEl.querySelector('#ng-title').value.trim() || 'New Gitego Game';
    const created = await api.request('/api/v1/game-studio/projects', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: bodyEl.querySelector('#ng-desc').value.trim() || 'Created in Game Studio',
        instructions: bodyEl.querySelector('#ng-inst').value.trim(),
        cover_image: bodyEl.querySelector('#ng-cover').value.trim() || '🎮',
        category_name: bodyEl.querySelector('#ng-cat').value,
        age_group: bodyEl.querySelector('#ng-age').value,
        difficulty: bodyEl.querySelector('#ng-diff').value,
        game_engine: bodyEl.querySelector('#ng-engine').value,
      }),
    });
    adminState.activeProjectId = created.id;
    adminState.activeFileIdx = 0;
    adminState.consoleLogs.push(`[Created] Project '${created.title}' (${created.game_engine}) initialized.`);
    renderGameStudioSection(bodyEl);
  });

  bodyEl.querySelector('#studio-project-select').addEventListener('change', (e) => {
    adminState.activeProjectId = Number(e.target.value);
    adminState.activeFileIdx = 0;
    renderGameStudioSection(bodyEl);
  });

  if (activeGame) {
    const detailsForm = bodyEl.querySelector('#edit-game-details-form');
    for (const [name, value] of Object.entries(activeGame)) {
      const input = detailsForm.elements.namedItem(name);
      if (input) input.value = value ?? '';
    }
    bodyEl.querySelector('#edit-game-details-btn').addEventListener('click', () => {
      detailsForm.style.display = detailsForm.style.display === 'none' ? 'block' : 'none';
    });
    bodyEl.querySelector('#cancel-game-details-btn').addEventListener('click', () => {
      detailsForm.style.display = 'none';
    });
    detailsForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const details = Object.fromEntries(new FormData(detailsForm).entries());
      try {
        await api.request(`/api/v1/game-studio/projects/${activeGame.id}`, {
          method: 'PATCH',
          body: JSON.stringify(details),
        });
        adminState.consoleLogs.push(`✏️ Updated game details for '${details.title}'.`);
        renderGameStudioSection(bodyEl);
      } catch (err) {
        window.alert(`Game details could not be saved: ${err.message}`);
      }
    });
    bodyEl.querySelector('#delete-game-btn').addEventListener('click', async () => {
      const confirmed = window.confirm(`Delete "${activeGame.title}" and all of its files, versions, and scores? This cannot be undone.`);
      if (!confirmed) return;
      try {
        await api.request(`/api/v1/game-studio/projects/${activeGame.id}`, { method: 'DELETE' });
        adminState.activeProjectId = null;
        adminState.activeFileIdx = 0;
        adminState.consoleLogs.push(`🗑️ Deleted game '${activeGame.title}'.`);
        renderGameStudioSection(bodyEl);
      } catch (err) {
        window.alert(`Game could not be deleted: ${err.message}`);
      }
    });
  }

  if (!activeGame) return;

  const editor = bodyEl.querySelector('#studio-code-editor');
  const lineNums = bodyEl.querySelector('#editor-line-numbers');
  const previewIframe = bodyEl.querySelector('#studio-preview-iframe');

  function updateLineNumbers() {
    const count = (editor.value.match(/\n/g) || []).length + 1;
    lineNums.innerHTML = Array.from({ length: count }, (_, i) => i + 1).join('<br/>');
  }
  updateLineNumbers();

  editor.addEventListener('scroll', () => {
    lineNums.scrollTop = editor.scrollTop;
  });

  async function loadAuthenticatedPreview() {
    const html = await api.request(`/api/v1/game-studio/projects/${activeGame.id}/preview`);
    previewIframe.srcdoc = html;
  }
  loadAuthenticatedPreview();

  async function saveCurrentEditorState(isAutosave = false) {
    files[adminState.activeFileIdx].content = editor.value;
    const res = await api.request(`/api/v1/game-studio/projects/${activeGame.id}/files`, {
      method: 'PUT',
      body: JSON.stringify({
        autosave: isAutosave,
        files: files.map((f) => ({
          filename: f.filename,
          language: f.language,
          content: f.content,
        })),
      }),
    });
    const badge = bodyEl.querySelector('#autosave-badge');
    if (badge) badge.textContent = isAutosave ? '✓ Autosaved just now' : '✓ Saved';
    if (res.validation_errors && res.validation_errors.length) {
      adminState.consoleLogs.push(`❌ Validation Errors: ${res.validation_errors.join(' | ')}`);
    } else if (!isAutosave) {
      adminState.consoleLogs.push(`✓ Saved ${files.length} files with 0 errors.`);
    }
    const cEl = bodyEl.querySelector('#studio-console');
    if (cEl) cEl.innerHTML = adminState.consoleLogs.slice(-8).map((l) => `<div>${l}</div>`).join('');
    return res;
  }

  editor.addEventListener('input', () => {
    updateLineNumbers();
    files[adminState.activeFileIdx].content = editor.value;
    if (adminState.autosaveTimer) clearTimeout(adminState.autosaveTimer);
    adminState.autosaveTimer = setTimeout(() => saveCurrentEditorState(true), 1200);
  });

  // File switching
  bodyEl.querySelectorAll('.studio-file-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      if (e.target.classList.contains('del-file-x')) return;
      files[adminState.activeFileIdx].content = editor.value;
      adminState.activeFileIdx = Number(btn.dataset.idx);
      renderGameStudioSection(bodyEl);
    });
  });

  // Add file
  bodyEl.querySelector('#add-file-btn').addEventListener('click', () => {
    const box = bodyEl.querySelector('#new-file-inline');
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });
  bodyEl.querySelector('#confirm-add-file-btn').addEventListener('click', async () => {
    const fname = bodyEl.querySelector('#new-filename-input').value.trim();
    if (!fname) return;
    const ext = fname.split('.').pop();
    const langMap = { html: 'html', css: 'css', js: 'javascript', ts: 'typescript', py: 'python' };
    await api.request(`/api/v1/game-studio/projects/${activeGame.id}/files`, {
      method: 'POST',
      body: JSON.stringify({
        filename: fname,
        language: langMap[ext] || 'javascript',
        content: `// ${fname}\n`,
      }),
    });
    renderGameStudioSection(bodyEl);
  });

  // Delete file
  bodyEl.querySelectorAll('.del-file-x').forEach((x) => {
    x.addEventListener('click', async (e) => {
      e.stopPropagation();
      await api.request(`/api/v1/game-studio/projects/${activeGame.id}/files/${x.dataset.fid}`, {
        method: 'DELETE',
      });
      adminState.activeFileIdx = 0;
      renderGameStudioSection(bodyEl);
    });
  });

  // Code search
  bodyEl.querySelector('#code-search-input').addEventListener('input', (e) => {
    const q = e.target.value;
    const out = bodyEl.querySelector('#search-match-readout');
    if (!q) {
      out.textContent = '';
      return;
    }
    const matches = editor.value.split(q).length - 1;
    out.textContent = `${matches} match(es)`;
  });

  // Format Code
  bodyEl.querySelector('#format-code-btn').addEventListener('click', () => {
    editor.value = editor.value
      .split('\n')
      .map((line) => line.trimEnd())
      .join('\n')
      .trim() + '\n';
    updateLineNumbers();
  });

  // Save Project
  bodyEl.querySelector('#save-project-btn').addEventListener('click', async () => {
    await saveCurrentEditorState(false);
    await loadAuthenticatedPreview();
  });

  // Run Preview
  bodyEl.querySelector('#run-preview-btn').addEventListener('click', async () => {
    await saveCurrentEditorState(false);
    await loadAuthenticatedPreview();
    adminState.consoleLogs.push(`[Preview] Reloaded sandboxed iframe for '${activeGame.title}'.`);
  });

  // Submit for Review
  bodyEl.querySelector('#submit-review-btn').addEventListener('click', async () => {
    await saveCurrentEditorState(false);
    try {
      await api.request(`/api/v1/game-studio/projects/${activeGame.id}/submit-review`, { method: 'POST' });
      adminState.consoleLogs.push(`📋 Submitted '${activeGame.title}' for review.`);
      renderGameStudioSection(bodyEl);
    } catch (err) {
      adminState.consoleLogs.push(`❌ Review blocked: ${err.message}`);
      renderGameStudioSection(bodyEl);
    }
  });

  // Publish Game
  bodyEl.querySelector('#publish-game-btn').addEventListener('click', async () => {
    await saveCurrentEditorState(false);
    try {
      const pub = await api.request(`/api/v1/game-studio/projects/${activeGame.id}/publish`, {
        method: 'POST',
        body: JSON.stringify({ changelog: 'Published from Game Studio IDE' }),
      });
      adminState.consoleLogs.push(`🚀 Published '${pub.title}' v${pub.published_version}! Now live for children.`);
      renderGameStudioSection(bodyEl);
    } catch (err) {
      adminState.consoleLogs.push(`❌ Publish failed: ${err.message}`);
      renderGameStudioSection(bodyEl);
    }
  });
}

/* ==========================================================================
   BOOKS LIBRARY (All Storybooks Catalog, Edit Details, Settings, Preview & Delete)
   ========================================================================== */
async function renderBooksLibrarySection(bodyEl, rootContainer, notice = null) {
  const [books, langs, bookCats] = await Promise.all([
    api.request('/api/v1/storybooks?include_drafts=true'),
    api.request('/api/v1/languages').catch(() => []),
    api.request('/api/v1/categories?content_type=storybook').catch(() => []),
  ]);
  adminState.storybooks = books;

  const filters = adminState.booksLibrary;
  const langOptions = langs.length
    ? langs
    : [
        { code: 'rw', name: 'KINYARWANDA', flag_emoji: '🇷🇼' },
        { code: 'fr', name: 'FRENCH (FRANÇAIS)', flag_emoji: '🇫🇷' },
        { code: 'sw', name: 'SWAHILI (KISWAHILI)', flag_emoji: '🇹🇿' },
        { code: 'en', name: 'ENGLISH', flag_emoji: '🇬🇧' },
      ];
  const langMap = new Map(langOptions.map((l) => [l.code.toLowerCase(), l]));
  const formatLang = (code) => {
    const l = langMap.get(String(code || '').toLowerCase());
    return l ? `${l.flag_emoji || '🌍'} ${l.code.toUpperCase()}` : String(code || '').toUpperCase();
  };

  const categoryNames = Array.from(
    new Set([
      'Folktales & Stories',
      'Science & Nature',
      'Values & Kindness',
      'Adventure',
      ...bookCats.map((c) => c.name),
      ...books.map((b) => b.category_name).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const publishedCount = books.filter((b) => b.status === 'Published').length;
  const draftReviewCount = books.filter((b) => b.status === 'Draft' || b.status === 'Review').length;
  const archivedCount = books.filter((b) => b.status === 'Archived').length;
  const totalReads = books.reduce((sum, b) => sum + (Number(b.read_count) || 0), 0);

  const q = filters.search.trim().toLowerCase();
  const filteredBooks = books
    .filter((b) => {
      if (filters.status !== 'ALL' && b.status !== filters.status) return false;
      if (filters.language !== 'ALL' && String(b.language_code).toLowerCase() !== filters.language.toLowerCase()) return false;
      if (filters.category !== 'ALL' && b.category_name !== filters.category) return false;
      if (filters.ageGroup !== 'ALL' && b.age_group !== filters.ageGroup) return false;
      if (q) {
        const hay = `${b.title} ${b.description} ${b.author || ''} ${b.category_name} ${b.language_code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'reads') return (b.read_count || 0) - (a.read_count || 0);
      if (filters.sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (filters.sortBy === 'pages') return (b.page_count || 0) - (a.page_count || 0);
      return new Date(b.updated_at || 0) - new Date(a.updated_at || 0);
    });

  const statusBadgeClass = (st) => {
    if (st === 'Published') return 'gl-status-published';
    if (st === 'Review') return 'gl-status-review';
    if (st === 'Archived') return 'gl-status-archived';
    return 'gl-status-draft';
  };

  bodyEl.innerHTML = `
    <div class="gl-header">
      <div>
        <h2 style="margin:0">📖 Books Library (${books.length})</h2>
        <small style="color:var(--text-3)">Manage all storybooks — edit titles, descriptions, authors, cover photos, book settings, translations, preview pages, publish/archive, clone, or delete.</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="bl-open-studio-new-btn" class="btn-primary" type="button">+ Create New Storybook</button>
      </div>
    </div>

    ${
      notice
        ? `<div class="gl-notice ${notice.type === 'error' ? 'gl-notice-error' : 'gl-notice-success'}">${escapeHtml(notice.text)}</div>`
        : ''
    }

    <div class="admin-kpi-grid">
      <div class="admin-kpi"><small>All Books</small><div class="num">${books.length}</div></div>
      <div class="admin-kpi"><small>Published (Live)</small><div class="num" style="color:#4ade80">${publishedCount}</div></div>
      <div class="admin-kpi"><small>Draft / Review</small><div class="num" style="color:#fbbf24">${draftReviewCount}</div></div>
      <div class="admin-kpi"><small>Archived</small><div class="num" style="color:#94a3b8">${archivedCount}</div></div>
      <div class="admin-kpi"><small>Total Reads</small><div class="num" style="color:#38bdf8">${totalReads}</div></div>
    </div>

    <div class="admin-card gl-filter-bar">
      <input id="bl-search" type="search" value="${escapeHtml(filters.search)}" placeholder="🔍 Search books by title, description, author, category..." />
      <select id="bl-filter-status" aria-label="Filter by status">
        <option value="ALL" ${filters.status === 'ALL' ? 'selected' : ''}>All Statuses</option>
        <option value="Published" ${filters.status === 'Published' ? 'selected' : ''}>✅ Published</option>
        <option value="Draft" ${filters.status === 'Draft' ? 'selected' : ''}>📝 Draft</option>
        <option value="Review" ${filters.status === 'Review' ? 'selected' : ''}>📋 Review</option>
        <option value="Archived" ${filters.status === 'Archived' ? 'selected' : ''}>📦 Archived</option>
      </select>
      <select id="bl-filter-lang" aria-label="Filter by language">
        <option value="ALL" ${filters.language === 'ALL' ? 'selected' : ''}>All Languages</option>
        ${langOptions
          .map((l) => `<option value="${escapeHtml(l.code)}" ${filters.language === l.code ? 'selected' : ''}>${escapeHtml(l.flag_emoji || '🌍')} ${escapeHtml(l.name)}</option>`)
          .join('')}
      </select>
      <select id="bl-filter-category" aria-label="Filter by category">
        <option value="ALL" ${filters.category === 'ALL' ? 'selected' : ''}>All Categories</option>
        ${categoryNames
          .map((c) => `<option value="${escapeHtml(c)}" ${filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
          .join('')}
      </select>
      <select id="bl-filter-age" aria-label="Filter by age group">
        <option value="ALL" ${filters.ageGroup === 'ALL' ? 'selected' : ''}>All Ages</option>
        <option value="3-5" ${filters.ageGroup === '3-5' ? 'selected' : ''}>Ages 3–5</option>
        <option value="6-8" ${filters.ageGroup === '6-8' ? 'selected' : ''}>Ages 6–8</option>
        <option value="9-12" ${filters.ageGroup === '9-12' ? 'selected' : ''}>Ages 9–12</option>
      </select>
      <select id="bl-sort" aria-label="Sort books">
        <option value="updated" ${filters.sortBy === 'updated' ? 'selected' : ''}>Sort: Recently Updated</option>
        <option value="reads" ${filters.sortBy === 'reads' ? 'selected' : ''}>Sort: Most Read</option>
        <option value="title" ${filters.sortBy === 'title' ? 'selected' : ''}>Sort: Title A–Z</option>
        <option value="pages" ${filters.sortBy === 'pages' ? 'selected' : ''}>Sort: Most Pages</option>
      </select>
    </div>

    ${
      filteredBooks.length === 0
        ? `<div class="admin-card" style="text-align:center;padding:36px;color:var(--text-3)">
             <div style="font-size:2rem;margin-bottom:8px">📖</div>
             <strong>No storybooks match your current filters.</strong>
             <div style="margin-top:12px"><button id="bl-reset-filters-btn" class="btn-secondary" type="button">Reset Filters</button></div>
           </div>`
        : `<div class="gl-grid">
            ${filteredBooks
              .map(
                (b) => `
              <article class="gl-card" data-bid="${b.id}">
                <div class="gl-card-top">
                  <div class="gl-cover-box">${renderCoverVisual(b.cover_illustration_url || b.cover_image, b.title)}</div>
                  <div class="gl-card-head">
                    <div class="gl-card-badges">
                      <span class="gl-status-badge ${statusBadgeClass(b.status)}">${escapeHtml(b.status)}</span>
                      <span class="gl-engine-badge">${escapeHtml(formatLang(b.language_code))}</span>
                      <span class="gl-ver-badge">📄 ${b.page_count || 0} pages</span>
                    </div>
                    <h3 class="gl-card-title">${escapeHtml(b.title)}</h3>
                    <p class="gl-card-desc">${escapeHtml(b.description)}</p>
                  </div>
                </div>

                <div class="gl-meta-chips">
                  <span>✍️ ${escapeHtml(b.author || 'Gitego Story Team')}</span>
                  <span>🗂️ ${escapeHtml(b.category_name)}</span>
                  <span>🧒 Ages ${escapeHtml(b.age_group)}</span>
                  <span>⚡ ${escapeHtml(b.difficulty)}</span>
                  <span>👁️ ${b.read_count || 0} reads</span>
                  ${
                    b.linked_translations && b.linked_translations.length
                      ? `<span>🔗 ${b.linked_translations.length} translation(s)</span>`
                      : ''
                  }
                </div>

                <div class="gl-card-actions">
                  <button class="btn-primary bl-edit-btn" data-bid="${b.id}" type="button">✏️ Edit</button>
                  <button class="btn-secondary bl-settings-btn" data-bid="${b.id}" type="button">⚙️ Settings</button>
                  <button class="btn-secondary bl-preview-btn" data-bid="${b.id}" type="button">👁️ Preview</button>
                  <button class="btn-secondary bl-studio-btn" data-bid="${b.id}" type="button">🎨 Studio</button>
                  ${
                    b.status === 'Published'
                      ? `<button class="btn-secondary bl-archive-btn" data-bid="${b.id}" type="button">📦 Archive</button>`
                      : `<button class="btn-success bl-publish-btn" data-bid="${b.id}" type="button">🚀 Publish</button>`
                  }
                  <button class="btn-secondary bl-duplicate-btn" data-bid="${b.id}" type="button" title="Duplicate book">📋 Clone</button>
                  <button class="btn-danger bl-delete-btn" data-bid="${b.id}" type="button">🗑️ Delete</button>
                </div>
              </article>
            `
              )
              .join('')}
          </div>`
    }

    <!-- Edit / Settings Modal -->
    <div id="bl-modal-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal" role="dialog" aria-modal="true" aria-labelledby="bl-modal-title">
        <div class="gl-modal-header">
          <div>
            <h3 id="bl-modal-title" style="margin:0">Edit Storybook</h3>
            <small id="bl-modal-subtitle" style="color:var(--text-3)"></small>
          </div>
          <button id="bl-modal-close" class="btn-secondary" type="button">✕ Close</button>
        </div>

        <div class="gl-modal-tabs">
          <button id="bl-tab-edit" class="gl-tab-btn active" type="button">✏️ Edit Details</button>
          <button id="bl-tab-settings" class="gl-tab-btn" type="button">⚙️ Book Settings</button>
        </div>

        <form id="bl-edit-form" class="gl-modal-body">
          <!-- Tab 1: Edit Details -->
          <div id="bl-pane-edit">
            <div class="form-grid">
              <label class="form-control">
                Book Title
                <input name="title" required maxlength="200" placeholder="Enter book title" />
              </label>
              <label class="form-control">
                Author
                <input name="author" required maxlength="150" placeholder="e.g. Gitego Story Team" />
              </label>
              <label class="form-control">
                Category
                <input name="category_name" list="bl-category-datalist" required maxlength="100" placeholder="e.g. Folktales & Stories" />
                <datalist id="bl-category-datalist">
                  ${categoryNames.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('')}
                </datalist>
              </label>
            </div>

            <label class="form-control" style="margin-top:10px">
              Description
              <textarea name="description" rows="3" required placeholder="Short summary of the story..."></textarea>
            </label>

            <div class="gl-cover-editor">
              <div id="bl-cover-preview" class="gl-cover-box" style="width:80px;height:80px"></div>
              <div style="flex:1;min-width:220px">
                <div class="form-grid" style="margin-bottom:6px">
                  <label class="form-control">
                    Cover Image URL or Emoji
                    <input name="cover_image" id="bl-cover-input" maxlength="500" placeholder="📖 or /uploads/image/..." />
                  </label>
                  <label class="form-control">
                    Upload Cover Photo
                    <input id="bl-cover-upload" type="file" accept="image/*" />
                  </label>
                </div>
                <small id="bl-cover-upload-status" style="color:#4ade80;font-weight:700"></small>
              </div>
            </div>
          </div>

          <!-- Tab 2: Book Settings -->
          <div id="bl-pane-settings" style="display:none">
            <div class="form-grid">
              <label class="form-control">
                Visibility / Status
                <select name="status">
                  <option value="Published">✅ Published (Visible to Children)</option>
                  <option value="Draft">📝 Draft (Hidden)</option>
                  <option value="Review">📋 In Review</option>
                  <option value="Archived">📦 Archived (Hidden)</option>
                </select>
              </label>
              <label class="form-control">
                Primary Language
                <select name="language_code">
                  ${langOptions
                    .map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.flag_emoji || '🌍')} ${escapeHtml(l.name)}</option>`)
                    .join('')}
                </select>
              </label>
              <label class="form-control">
                Target Age Group
                <select name="age_group">
                  <option value="3-5">Ages 3–5</option>
                  <option value="6-8">Ages 6–8</option>
                  <option value="9-12">Ages 9–12</option>
                </select>
              </label>
              <label class="form-control">
                Reading Difficulty
                <select name="difficulty">
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </label>
            </div>

            <div class="gl-versions-box">
              <strong>🌍 Linked Language Translations</strong>
              <div id="bl-translations-list" style="margin-top:6px"></div>
              <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap">
                <select id="bl-link-target-select" style="flex:1;min-width:200px;padding:7px 10px;border-radius:8px;border:1px solid var(--line-2);background:var(--surface);color:var(--text)">
                  <option value="">— Select another book to link as translation —</option>
                </select>
                <button id="bl-link-translation-btn" class="btn-secondary" type="button">🔗 Link Translation</button>
              </div>
            </div>

            <div class="gl-danger-zone">
              <div>
                <strong>⚠️ Danger Zone</strong>
                <div style="font-size:0.8rem;color:var(--text-3)">Permanently delete this book, all its pages, bookmarks, and translation links.</div>
              </div>
              <button id="bl-modal-delete-btn" class="btn-danger" type="button">🗑️ Delete Book</button>
            </div>
          </div>

          <div class="gl-modal-footer">
            <button id="bl-modal-studio-btn" class="btn-secondary" type="button">🎨 Open Pages in Studio</button>
            <div style="display:flex;gap:8px">
              <button id="bl-modal-cancel-btn" class="btn-secondary" type="button">Cancel</button>
              <button class="btn-primary" type="submit">💾 Save Changes</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Live Book Reader Preview Modal -->
    <div id="bl-preview-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal gl-preview-modal" role="dialog" aria-modal="true" aria-labelledby="bl-preview-title">
        <div class="gl-modal-header">
          <div>
            <h3 id="bl-preview-title" style="margin:0">👁️ Book Preview</h3>
            <small id="bl-preview-meta" style="color:var(--text-3)"></small>
          </div>
          <button id="bl-preview-close" class="btn-secondary" type="button">✕ Close</button>
        </div>
        <div class="bl-preview-stage">
          <div class="bl-preview-img-wrap">
            <img id="bl-preview-img" src="" alt="Page illustration" />
          </div>
          <p id="bl-preview-text" class="bl-preview-text"></p>
          <div class="bl-preview-nav">
            <button id="bl-prev-page-btn" class="btn-secondary" type="button">← Previous Page</button>
            <strong id="bl-page-indicator">Page 1 / 1</strong>
            <button id="bl-next-page-btn" class="btn-primary" type="button">Next Page →</button>
          </div>
        </div>
      </div>
    </div>
  `;

  // Wire search, filters, and sort
  const rerenderFilters = () => renderBooksLibrarySection(bodyEl, rootContainer);
  const searchInput = bodyEl.querySelector('#bl-search');
  let searchDebounce = null;
  searchInput.addEventListener('input', (e) => {
    filters.search = e.target.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      await rerenderFilters();
      const nextSearch = bodyEl.querySelector('#bl-search');
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    }, 220);
  });
  bodyEl.querySelector('#bl-filter-status').addEventListener('change', (e) => {
    filters.status = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#bl-filter-lang').addEventListener('change', (e) => {
    filters.language = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#bl-filter-category').addEventListener('change', (e) => {
    filters.category = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#bl-filter-age').addEventListener('change', (e) => {
    filters.ageGroup = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#bl-sort').addEventListener('change', (e) => {
    filters.sortBy = e.target.value;
    rerenderFilters();
  });

  const resetBtn = bodyEl.querySelector('#bl-reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      adminState.booksLibrary = {
        search: '',
        status: 'ALL',
        language: 'ALL',
        category: 'ALL',
        ageGroup: 'ALL',
        sortBy: 'updated',
      };
      renderBooksLibrarySection(bodyEl, rootContainer);
    });
  }

  // Create New Storybook -> navigate to Storybook Studio
  bodyEl.querySelector('#bl-open-studio-new-btn').addEventListener('click', () => {
    adminState.section = 'storybook-studio';
    renderAdminView(rootContainer);
  });

  // Modal state & helpers
  let editingBook = null;
  const modalBackdrop = bodyEl.querySelector('#bl-modal-backdrop');
  const editForm = bodyEl.querySelector('#bl-edit-form');
  const paneEdit = bodyEl.querySelector('#bl-pane-edit');
  const paneSettings = bodyEl.querySelector('#bl-pane-settings');
  const tabEdit = bodyEl.querySelector('#bl-tab-edit');
  const tabSettings = bodyEl.querySelector('#bl-tab-settings');
  const coverInput = bodyEl.querySelector('#bl-cover-input');
  const coverPreview = bodyEl.querySelector('#bl-cover-preview');
  const coverUpload = bodyEl.querySelector('#bl-cover-upload');
  const coverUploadStatus = bodyEl.querySelector('#bl-cover-upload-status');
  const linkSelect = bodyEl.querySelector('#bl-link-target-select');

  function setModalTab(tab) {
    const isEdit = tab === 'edit';
    paneEdit.style.display = isEdit ? 'block' : 'none';
    paneSettings.style.display = isEdit ? 'none' : 'block';
    tabEdit.classList.toggle('active', isEdit);
    tabSettings.classList.toggle('active', !isEdit);
  }

  function openBookModal(bookId, initialTab = 'edit') {
    const b = books.find((item) => item.id === Number(bookId));
    if (!b) return;
    editingBook = b;

    bodyEl.querySelector('#bl-modal-title').textContent = b.title;
    bodyEl.querySelector('#bl-modal-subtitle').textContent = `Book #${b.id} • ${b.status} • ${formatLang(b.language_code)} • ${b.page_count || 0} pages • ${b.read_count || 0} reads`;

    editForm.elements.namedItem('title').value = b.title || '';
    editForm.elements.namedItem('author').value = b.author || 'Gitego Story Team';
    editForm.elements.namedItem('category_name').value = b.category_name || '';
    editForm.elements.namedItem('description').value = b.description || '';
    coverInput.value = b.cover_image || '📖';
    coverPreview.innerHTML = renderCoverVisual(b.cover_illustration_url || b.cover_image, b.title);
    coverUploadStatus.textContent = '';

    editForm.elements.namedItem('status').value = b.status || 'Draft';
    editForm.elements.namedItem('language_code').value = b.language_code || 'rw';
    editForm.elements.namedItem('age_group').value = b.age_group || '6-8';
    editForm.elements.namedItem('difficulty').value = b.difficulty || 'Easy';

    const transList = bodyEl.querySelector('#bl-translations-list');
    if (b.linked_translations && b.linked_translations.length) {
      transList.innerHTML = b.linked_translations
        .map(
          (t) =>
            `<div class="gl-version-row"><code>${escapeHtml(String(t.language_code || '').toUpperCase())}</code> <span>${escapeHtml(t.title)}</span> <small>${escapeHtml(t.status)}</small></div>`
        )
        .join('');
    } else {
      transList.innerHTML = `<small style="color:var(--text-3)">No linked translations yet.</small>`;
    }

    const otherBooks = books.filter((other) => other.id !== b.id);
    linkSelect.innerHTML =
      `<option value="">— Select another book to link as translation —</option>` +
      otherBooks
        .map((other) => `<option value="${other.id}">${escapeHtml(other.title)} (${escapeHtml(String(other.language_code).toUpperCase())})</option>`)
        .join('');

    setModalTab(initialTab);
    modalBackdrop.style.display = 'flex';
  }

  function closeBookModal() {
    modalBackdrop.style.display = 'none';
    editingBook = null;
  }

  tabEdit.addEventListener('click', () => setModalTab('edit'));
  tabSettings.addEventListener('click', () => setModalTab('settings'));
  bodyEl.querySelector('#bl-modal-close').addEventListener('click', closeBookModal);
  bodyEl.querySelector('#bl-modal-cancel-btn').addEventListener('click', closeBookModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeBookModal();
  });

  coverInput.addEventListener('input', () => {
    coverPreview.innerHTML = renderCoverVisual(coverInput.value.trim(), editingBook?.title || 'Book cover');
  });

  coverUpload.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    coverUploadStatus.textContent = '⏳ Uploading cover photo...';
    try {
      const url = await uploadAdminImageFile(file);
      coverInput.value = url;
      coverPreview.innerHTML = renderCoverVisual(url, editingBook?.title || 'Book cover');
      coverUploadStatus.textContent = '✅ Cover uploaded! Click "Save Changes" to apply.';
    } catch (err) {
      coverUploadStatus.textContent = `❌ Upload failed: ${err.message}`;
    }
  });

  bodyEl.querySelector('#bl-link-translation-btn').addEventListener('click', async () => {
    if (!editingBook) return;
    const targetId = Number(linkSelect.value);
    if (!targetId) return;
    try {
      await api.request('/api/v1/storybooks/translations/link', {
        method: 'POST',
        body: JSON.stringify({
          source_book_id: editingBook.id,
          translated_book_id: targetId,
        }),
      });
      const linkedTitle = editingBook.title;
      closeBookModal();
      renderBooksLibrarySection(bodyEl, rootContainer, {
        type: 'success',
        text: `🔗 Linked translation for "${linkedTitle}" successfully.`,
      });
    } catch (err) {
      window.alert(`Could not link translation: ${err.message}`);
    }
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingBook) return;
    const fd = new FormData(editForm);
    const payload = {
      title: String(fd.get('title') || '').trim(),
      author: String(fd.get('author') || 'Gitego Story Team').trim(),
      category_name: String(fd.get('category_name') || '').trim(),
      description: String(fd.get('description') || '').trim(),
      cover_image: String(fd.get('cover_image') || '📖').trim() || '📖',
      status: String(fd.get('status') || editingBook.status),
      language_code: String(fd.get('language_code') || editingBook.language_code),
      age_group: String(fd.get('age_group') || '6-8'),
      difficulty: String(fd.get('difficulty') || 'Easy'),
    };
    try {
      await api.request(`/api/v1/storybooks/${editingBook.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const savedTitle = payload.title;
      closeBookModal();
      renderBooksLibrarySection(bodyEl, rootContainer, {
        type: 'success',
        text: `✅ Updated "${savedTitle}" successfully.`,
      });
    } catch (err) {
      window.alert(`Could not save book changes: ${err.message}`);
    }
  });

  bodyEl.querySelector('#bl-modal-studio-btn').addEventListener('click', () => {
    if (!editingBook) return;
    adminState.activeBookId = editingBook.id;
    adminState.section = 'storybook-studio';
    closeBookModal();
    renderAdminView(rootContainer);
  });

  async function handleDeleteBook(book) {
    const confirmed = window.confirm(
      `Delete "${book.title}" permanently?\n\nThis removes the storybook, all its pages, bookmarks, and translation links. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await api.request(`/api/v1/storybooks/${book.id}`, { method: 'DELETE' });
      if (adminState.activeBookId === book.id) {
        adminState.activeBookId = null;
      }
      closeBookModal();
      renderBooksLibrarySection(bodyEl, rootContainer, {
        type: 'success',
        text: `🗑️ Deleted "${book.title}".`,
      });
    } catch (err) {
      renderBooksLibrarySection(bodyEl, rootContainer, {
        type: 'error',
        text: `❌ Could not delete "${book.title}": ${err.message}`,
      });
    }
  }

  bodyEl.querySelector('#bl-modal-delete-btn').addEventListener('click', () => {
    if (editingBook) handleDeleteBook(editingBook);
  });

  // Live Book Reader Preview Modal
  let previewBook = null;
  let previewPageIdx = 0;
  const previewBackdrop = bodyEl.querySelector('#bl-preview-backdrop');
  const previewImg = bodyEl.querySelector('#bl-preview-img');
  const previewText = bodyEl.querySelector('#bl-preview-text');
  const pageIndicator = bodyEl.querySelector('#bl-page-indicator');
  const prevPageBtn = bodyEl.querySelector('#bl-prev-page-btn');
  const nextPageBtn = bodyEl.querySelector('#bl-next-page-btn');

  function renderPreviewPage() {
    if (!previewBook) return;
    const pages = previewBook.pages || [];
    if (!pages.length) {
      previewImg.style.display = 'none';
      previewText.textContent = 'This book currently has no pages.';
      pageIndicator.textContent = 'Page 0 / 0';
      prevPageBtn.disabled = true;
      nextPageBtn.disabled = true;
      return;
    }
    const page = pages[previewPageIdx] || pages[0];
    if (isImageCover(page.illustration_url)) {
      previewImg.src = page.illustration_url;
      previewImg.style.display = 'block';
    } else {
      previewImg.style.display = 'none';
    }
    previewText.textContent = page.text_content || '';
    pageIndicator.textContent = `Page ${previewPageIdx + 1} / ${pages.length}`;
    prevPageBtn.disabled = previewPageIdx <= 0;
    nextPageBtn.disabled = previewPageIdx >= pages.length - 1;
  }

  async function openBookPreview(bookId) {
    try {
      const fullBook = await api.request(`/api/v1/storybooks/${bookId}`);
      previewBook = fullBook;
      previewPageIdx = 0;
      bodyEl.querySelector('#bl-preview-title').textContent = `👁️ ${fullBook.title}`;
      bodyEl.querySelector('#bl-preview-meta').textContent = `${formatLang(fullBook.language_code)} • Ages ${fullBook.age_group} • ${fullBook.author || ''}`;
      renderPreviewPage();
      previewBackdrop.style.display = 'flex';
    } catch (err) {
      window.alert(`Could not load book preview: ${err.message}`);
    }
  }

  function closeBookPreview() {
    previewBackdrop.style.display = 'none';
    previewBook = null;
  }

  bodyEl.querySelector('#bl-preview-close').addEventListener('click', closeBookPreview);
  previewBackdrop.addEventListener('click', (e) => {
    if (e.target === previewBackdrop) closeBookPreview();
  });
  prevPageBtn.addEventListener('click', () => {
    if (previewPageIdx > 0) {
      previewPageIdx -= 1;
      renderPreviewPage();
    }
  });
  nextPageBtn.addEventListener('click', () => {
    if (previewBook && previewPageIdx < (previewBook.pages?.length || 1) - 1) {
      previewPageIdx += 1;
      renderPreviewPage();
    }
  });

  // Wire per-card actions
  bodyEl.querySelectorAll('.bl-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openBookModal(btn.dataset.bid, 'edit'));
  });
  bodyEl.querySelectorAll('.bl-settings-btn').forEach((btn) => {
    btn.addEventListener('click', () => openBookModal(btn.dataset.bid, 'settings'));
  });
  bodyEl.querySelectorAll('.bl-preview-btn').forEach((btn) => {
    btn.addEventListener('click', () => openBookPreview(btn.dataset.bid));
  });
  bodyEl.querySelectorAll('.bl-studio-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      adminState.activeBookId = Number(btn.dataset.bid);
      adminState.section = 'storybook-studio';
      renderAdminView(rootContainer);
    });
  });
  bodyEl.querySelectorAll('.bl-publish-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const b = books.find((item) => item.id === Number(btn.dataset.bid));
      if (!b) return;
      try {
        await api.request(`/api/v1/storybooks/${b.id}/publish`, { method: 'POST' });
        renderBooksLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `🚀 Published "${b.title}"! Now live for children.`,
        });
      } catch (err) {
        renderBooksLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Publish failed for "${b.title}": ${err.message}`,
        });
      }
    });
  });
  bodyEl.querySelectorAll('.bl-archive-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const b = books.find((item) => item.id === Number(btn.dataset.bid));
      if (!b) return;
      try {
        await api.request(`/api/v1/storybooks/${b.id}/archive`, { method: 'POST' });
        renderBooksLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `📦 Archived "${b.title}". It is now hidden from children.`,
        });
      } catch (err) {
        renderBooksLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Could not archive "${b.title}": ${err.message}`,
        });
      }
    });
  });
  bodyEl.querySelectorAll('.bl-duplicate-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const b = books.find((item) => item.id === Number(btn.dataset.bid));
      if (!b) return;
      try {
        const clone = await api.request(`/api/v1/storybooks/${b.id}/duplicate`, { method: 'POST' });
        renderBooksLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `📋 Duplicated "${b.title}" as "${clone.title}" (Draft).`,
        });
      } catch (err) {
        renderBooksLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Could not duplicate "${b.title}": ${err.message}`,
        });
      }
    });
  });
  bodyEl.querySelectorAll('.bl-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const b = books.find((item) => item.id === Number(btn.dataset.bid));
      if (b) handleDeleteBook(b);
    });
  });
}

/* ==========================================================================
   STORYBOOK STUDIO (Multilingual Kinyarwanda, French, Swahili + Page Editor)
   ========================================================================== */
async function renderStorybookStudioSection(bodyEl) {
  const [books, langs, bookCats] = await Promise.all([
    api.request('/api/v1/storybooks?include_drafts=true'),
    api.request('/api/v1/languages'),
    api.request('/api/v1/categories?content_type=storybook').catch(() => []),
  ]);
  const bookCategoryNames = Array.from(new Set(bookCats.map((c) => c.name)));
  if (!bookCategoryNames.length) bookCategoryNames.push('Folktales & Stories');
  adminState.storybooks = books;
  if (!adminState.activeBookId && books.length) adminState.activeBookId = books[0].id;
  const activeBook = adminState.activeBookId
    ? await api.request(`/api/v1/storybooks/${adminState.activeBookId}`)
    : null;

  bodyEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <div>
        <h2 style="margin:0">🎨 Storybook Studio — Multilingual Digital Book Creator</h2>
        <small style="color:var(--text-3)">Create illustrated books in KINYARWANDA, FRENCH (FRANÇAIS), SWAHILI (KISWAHILI), and link translations.</small>
      </div>
      <div style="display:flex;gap:8px">
        <select id="studio-book-select" style="padding:8px 12px;border-radius:8px;border:1px solid var(--line-2);font-weight:700">
          ${books.map((b) => `<option value="${b.id}" ${b.id === activeBook?.id ? 'selected' : ''}>${b.cover_image} ${b.title} [${b.language_code.toUpperCase()} • ${b.status}]</option>`).join('')}
        </select>
        <button id="new-book-toggle-btn" class="btn-primary" type="button">+ Create New Storybook</button>
      </div>
    </div>

    <!-- Create New Storybook Form -->
    <div id="new-book-panel" class="admin-card" style="display:none;border:1px solid rgba(99,102,241,0.45)">
      <h3 style="margin-top:0">Create Illustrated Storybook</h3>
      <div class="form-grid">
        <label class="form-control">Book Title <input id="nb-title" type="text" placeholder="e.g. Ingagi zo mu Birunga" /></label>
        <label class="form-control">Primary Language
          <select id="nb-lang">
            ${langs.map((l) => `<option value="${l.code}">${l.flag_emoji} ${l.name}</option>`).join('')}
          </select>
        </label>
        <label class="form-control">Category
          <select id="nb-cat">
            ${bookCategoryNames.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
        </label>
        <label class="form-control">Age Group
          <select id="nb-age">
            <option value="3-5">Ages 3–5</option>
            <option value="6-8" selected>Ages 6–8</option>
            <option value="9-12">Ages 9–12</option>
          </select>
        </label>
        <label class="form-control">Link as Translation of (Optional)
          <select id="nb-trans-src">
            <option value="">— Standalone Original Story —</option>
            ${books.map((b) => `<option value="${b.id}">${b.title} (${b.language_code.toUpperCase()})</option>`).join('')}
          </select>
        </label>
      </div>
      <label class="form-control" style="margin-bottom:10px">Description <input id="nb-desc" type="text" placeholder="An illustrated story for children..." /></label>

      <!-- Manual Cover Photo Upload Box for New Storybook -->
      <div style="background:rgba(59,130,246,0.08);border:1px dashed rgba(99,102,241,0.45);border-radius:14px;padding:14px;margin-bottom:12px">
        <strong style="color:#93c5fd;display:block;margin-bottom:8px">📘 1. Shyiramo Ifoto ya Cover y'Igitabo (Book Cover Photo Upload cyangwa URL):</strong>
        <div class="form-grid" style="margin-bottom:8px">
          <label class="form-control">
            📤 Hitamo Ifoto ya Cover kuri Mudasobwa (PNG, JPG, WEBP, SVG)
            <input id="nb-cover-file" type="file" accept="image/*" style="background:var(--surface-2)" />
          </label>
          <label class="form-control">
            🔗 URL y'Ifoto ya Cover (cyangwa Emoji)
            <input id="nb-cover" type="text" value="" placeholder="/uploads/image/... cyangwa https://..." />
          </label>
        </div>
        <div id="nb-cover-preview-wrap" style="display:none;margin-top:8px">
          <img id="nb-cover-preview" src="" alt="Cover Preview" style="max-height:140px;border-radius:10px;border:1px solid var(--line-2);box-shadow:0 4px 10px rgba(0,0,0,0.1)" />
        </div>
      </div>

      <!-- Manual Photo Upload Box for New Storybook Page 1 -->
      <div style="background:rgba(34,197,94,0.08);border:1px dashed rgba(34,197,94,0.45);border-radius:14px;padding:14px;margin-bottom:12px">
        <strong style="color:#86efac;display:block;margin-bottom:8px">📷 2. Shyiramo Ifoto y'Inkuru (Ipaji ya 1 — Upload Photo cyangwa URL):</strong>
        <div class="form-grid" style="margin-bottom:8px">
          <label class="form-control">
            📤 Hitamo Ifoto kuri Mudasobwa (PNG, JPG, WEBP, SVG)
            <input id="nb-photo-file" type="file" accept="image/*" style="background:var(--surface-2)" />
          </label>
          <label class="form-control">
            🔗 Cyangwa shyiramo URL y'Ifoto
            <input id="nb-photo-url" type="text" placeholder="/uploads/... cyangwa https://..." />
          </label>
        </div>
        <div id="nb-photo-preview-wrap" style="display:none;margin-top:8px">
          <img id="nb-photo-preview" src="" alt="Preview" style="max-height:150px;border-radius:10px;border:1px solid var(--line-2);box-shadow:0 4px 10px rgba(0,0,0,0.1)" />
        </div>
      </div>

      <label class="form-control" style="margin-bottom:12px">
        ✍️ 3. Andika Inkuru y'Ipaji ya 1 (Ijya Munsi y'Ifoto):
        <textarea id="nb-page1-story" rows="2" placeholder="Andika inkuru ijyanye n'ifoto washyizemo..."></textarea>
      </label>
      <button id="create-book-submit" class="btn-success" type="button">💾 Bika Igitabo, Cover n'Ifoto Washyizemo (Create Storybook)</button>
    </div>

    ${
      activeBook
        ? `
      <div class="admin-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
          <div>
            <h3 style="margin:0">📘 ${activeBook.title} (${activeBook.language_code.toUpperCase()}) — Status: ${activeBook.status}</h3>
            <small style="color:var(--text-3)">📷 Shyiramo ifoto ya Cover y'igitabo n'ifoto ya buri paji hejuru, hanyuma wandike inkuru munsi y'ifoto!</small>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="add-page-btn" class="btn-secondary" type="button">+ Ongeraho Ipaji (Add Page)</button>
            <button id="save-pages-btn" class="btn-primary" type="button">💾 Bika Amapaji n'Amafoto (Save Pages)</button>
            <button id="publish-book-btn" class="btn-success" type="button">🚀 Tangaza Igitabo (Publish)</button>
          </div>
        </div>

        <!-- Book Cover Photo Upload Panel for Active Book -->
        <div style="background:rgba(59,130,246,0.08);border:1px dashed rgba(99,102,241,0.45);border-radius:16px;padding:14px 18px;margin-bottom:18px;display:flex;flex-wrap:wrap;align-items:center;gap:18px">
          <div style="width:165px;height:115px;border-radius:14px;overflow:hidden;border:1px solid var(--line-2);background:var(--surface-3);box-shadow:0 4px 12px rgba(15,23,42,0.12);flex-shrink:0">
            <img id="active-book-cover-img" src="${activeBook.cover_illustration_url || activeBook.cover_image}" alt="Cover y'Igitabo" style="width:100%;height:100%;object-fit:cover;display:block" />
          </div>
          <div style="flex:1;min-width:260px;display:flex;flex-direction:column;gap:8px">
            <strong style="color:#bfdbfe;font-size:0.94rem">📘 Ifoto ya Cover y'Igitabo (Book Cover Photo — Igaragara ku Gifuniko cy'Igitabo):</strong>
            <div class="form-grid" style="margin-bottom:0">
              <label class="form-control" style="color:#93c5fd">
                <span>📤 Shyiramo / Hindura Ifoto ya Cover kuri Mudasobwa:</span>
                <input id="active-book-cover-file" type="file" accept="image/*" style="background:var(--surface-2);padding:6px;cursor:pointer" />
              </label>
              <label class="form-control" style="color:#93c5fd">
                <span>🔗 Cyangwa Andika URL y'Ifoto ya Cover:</span>
                <div style="display:flex;gap:6px">
                  <input id="active-book-cover-url" type="text" value="${activeBook.cover_illustration_url || activeBook.cover_image}" placeholder="/uploads/image/... cyangwa https://..." style="background:var(--surface-2);flex:1" />
                  <button id="save-book-cover-btn" class="btn-primary" type="button">💾 Bika Cover</button>
                </div>
              </label>
            </div>
            <span id="active-cover-status" style="font-size:0.8rem;font-weight:800;color:#4ade80"></span>
          </div>
        </div>

        <div id="pages-editor-list" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:18px">
          ${activeBook.pages
            .map(
              (p, idx) => `
            <div class="page-editor-row" data-pnum="${idx + 1}" style="background:var(--surface-2);border:1px solid var(--line-2);border-radius:20px;padding:16px;display:flex;flex-direction:column;gap:12px">
              <div style="display:flex;justify-content:space-between;align-items:center">
                <strong style="color:#fde68a;font-size:0.95rem">📖 Ipaji #${idx + 1} (1. Ifoto Hejuru • 2. Inkuru Munsi)</strong>
                <div style="display:flex;gap:6px">
                  ${idx > 0 ? `<button class="move-up-btn btn-secondary" data-idx="${idx}" style="padding:4px 10px;font-size:0.76rem" type="button">↑ Zamura</button>` : ''}
                </div>
              </div>

              <!-- 1. TOP: Photo Preview & User Photo Upload Box -->
              <div style="width:100%;height:210px;border-radius:16px;overflow:hidden;border:1px solid var(--line-2);background:var(--surface-3);box-shadow:0 4px 12px rgba(15,23,42,0.1);position:relative">
                <img class="pg-live-img" src="${p.illustration_url}" alt="Ifoto y'Ipaji ${idx + 1}" style="width:100%;height:100%;object-fit:cover;display:block" />
              </div>

              <div style="background:rgba(34,197,94,0.08);border:1px dashed rgba(34,197,94,0.45);border-radius:14px;padding:10px 12px;display:flex;flex-direction:column;gap:8px">
                <label class="form-control" style="color:#86efac">
                  <span>📷 Shyiramo Ifoto kuri Mudasobwa (Upload Photo for Page #${idx + 1}):</span>
                  <input type="file" class="pg-file-upload" data-idx="${idx}" accept="image/*" style="background:var(--surface-2);padding:6px;cursor:pointer" />
                </label>
                <label class="form-control" style="color:#93c5fd">
                  <span>🔗 Cyangwa Andika / Hindura URL y'Ifoto:</span>
                  <input class="pg-illus" type="text" value="${p.illustration_url}" placeholder="/uploads/image/... cyangwa https://..." style="background:var(--surface-2)" />
                </label>
                <span class="pg-upload-status" style="font-size:0.78rem;font-weight:800;color:#4ade80"></span>
              </div>

              <!-- 2. BOTTOM (MUNSI Y'IFOTO): Story Text Editor -->
              <label class="form-control" style="background:var(--surface-2);padding:12px;border-radius:14px;border:1px solid var(--line-2)">
                <span style="color:#fcd34d;font-size:0.82rem;font-weight:900">✍️ Andika Inkuru y'Ipaji #${idx + 1} Munsi y'Ifoto:</span>
                <textarea class="pg-text" rows="3" style="font-weight:700;font-size:0.95rem;border:1px solid var(--line-2);margin-top:6px">${p.text_content}</textarea>
              </label>
            </div>
          `
            )
            .join('')}
        </div>
      </div>
    `
        : ''
    }
  `;

  bodyEl.querySelector('#new-book-toggle-btn').addEventListener('click', () => {
    const p = bodyEl.querySelector('#new-book-panel');
    p.style.display = p.style.display === 'none' ? 'block' : 'none';
  });

  bodyEl.querySelector('#studio-book-select').addEventListener('change', (e) => {
    adminState.activeBookId = Number(e.target.value);
    renderStorybookStudioSection(bodyEl);
  });

  async function uploadImageFileToServer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const dataUrl = String(reader.result || '');
          const base64Part = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
          const res = await api.request('/api/v1/admin/media/upload', {
            method: 'POST',
            body: JSON.stringify({
              filename: file.name || 'story_photo.png',
              mime_type: file.type || 'image/png',
              media_type: 'image',
              content_base64: base64Part,
            }),
          });
          resolve(res.public_url);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Could not read file'));
      reader.readAsDataURL(file);
    });
  }

  // Wire cover & page file uploads in "+ Create New Storybook" form
  const nbCoverFileInput = bodyEl.querySelector('#nb-cover-file');
  if (nbCoverFileInput) {
    nbCoverFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const uploadedUrl = await uploadImageFileToServer(file);
      bodyEl.querySelector('#nb-cover').value = uploadedUrl;
      const prevImg = bodyEl.querySelector('#nb-cover-preview');
      const prevWrap = bodyEl.querySelector('#nb-cover-preview-wrap');
      if (prevImg && prevWrap) {
        prevImg.src = uploadedUrl;
        prevWrap.style.display = 'block';
      }
    });
  }

  const nbFileInput = bodyEl.querySelector('#nb-photo-file');
  if (nbFileInput) {
    nbFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const uploadedUrl = await uploadImageFileToServer(file);
      bodyEl.querySelector('#nb-photo-url').value = uploadedUrl;
      if (!bodyEl.querySelector('#nb-cover').value.trim()) {
        bodyEl.querySelector('#nb-cover').value = uploadedUrl;
      }
      const prevImg = bodyEl.querySelector('#nb-photo-preview');
      const prevWrap = bodyEl.querySelector('#nb-photo-preview-wrap');
      if (prevImg && prevWrap) {
        prevImg.src = uploadedUrl;
        prevWrap.style.display = 'block';
      }
    });
  }

  bodyEl.querySelector('#create-book-submit').addEventListener('click', async () => {
    const title = bodyEl.querySelector('#nb-title').value.trim();
    if (!title) return;
    const srcId = bodyEl.querySelector('#nb-trans-src').value;
    const page1Story = bodyEl.querySelector('#nb-page1-story').value.trim() || title;
    const manualPhotoUrl = bodyEl.querySelector('#nb-photo-url').value.trim();
    const coverPhotoUrl = bodyEl.querySelector('#nb-cover').value.trim() || manualPhotoUrl || '📖';
    const created = await api.request('/api/v1/storybooks', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: bodyEl.querySelector('#nb-desc').value.trim() || page1Story,
        cover_image: coverPhotoUrl,
        language_code: bodyEl.querySelector('#nb-lang').value,
        category_name: bodyEl.querySelector('#nb-cat').value,
        age_group: bodyEl.querySelector('#nb-age').value,
        linked_source_book_id: srcId ? Number(srcId) : null,
        status: 'Published',
        pages: [
          {
            page_number: 1,
            text_content: page1Story,
            illustration_url: manualPhotoUrl || (coverPhotoUrl !== '📖' ? coverPhotoUrl : ''),
            auto_generate_illustration: !(manualPhotoUrl || coverPhotoUrl !== '📖'),
          },
        ],
      }),
    });
    adminState.activeBookId = created.id;
    renderStorybookStudioSection(bodyEl);
  });

  if (!activeBook) return;

  // Wire Active Book Cover Photo Upload & Save
  const activeCoverFile = bodyEl.querySelector('#active-book-cover-file');
  const activeCoverUrl = bodyEl.querySelector('#active-book-cover-url');
  const activeCoverImg = bodyEl.querySelector('#active-book-cover-img');
  const activeCoverStatus = bodyEl.querySelector('#active-cover-status');

  async function saveActiveBookCover(newCoverUrl) {
    if (!newCoverUrl) return;
    await api.request(`/api/v1/storybooks/${activeBook.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ cover_image: newCoverUrl }),
    });
    if (activeCoverImg) activeCoverImg.src = newCoverUrl;
    if (activeCoverStatus) activeCoverStatus.textContent = '✅ Ifoto ya Cover y\'igitabo yashyizwemo kandi yabitswe neza!';
  }

  if (activeCoverFile) {
    activeCoverFile.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      if (activeCoverStatus) activeCoverStatus.textContent = '⏳ Irimo gushyiramo ifoto ya Cover...';
      try {
        const uploadedUrl = await uploadImageFileToServer(file);
        if (activeCoverUrl) activeCoverUrl.value = uploadedUrl;
        await saveActiveBookCover(uploadedUrl);
      } catch (err) {
        if (activeCoverStatus) activeCoverStatus.textContent = `❌ Ikibazo: ${err.message}`;
      }
    });
  }

  const saveCoverBtn = bodyEl.querySelector('#save-book-cover-btn');
  if (saveCoverBtn) {
    saveCoverBtn.addEventListener('click', async () => {
      const val = activeCoverUrl ? activeCoverUrl.value.trim() : '';
      if (val) await saveActiveBookCover(val);
    });
  }

  function collectEditedPages() {
    const rows = bodyEl.querySelectorAll('.page-editor-row');
    return Array.from(rows).map((r, i) => ({
      page_number: i + 1,
      illustration_url: r.querySelector('.pg-illus').value.trim(),
      auto_generate_illustration: false,
      text_content: r.querySelector('.pg-text').value,
      vocabulary: activeBook.pages[i]?.vocabulary || [],
      interactive_question: activeBook.pages[i]?.interactive_question || null,
    }));
  }

  // Wire per-page manual photo upload & live URL preview
  bodyEl.querySelectorAll('.page-editor-row').forEach((rowEl) => {
    const fileInp = rowEl.querySelector('.pg-file-upload');
    const urlInp = rowEl.querySelector('.pg-illus');
    const liveImg = rowEl.querySelector('.pg-live-img');
    const statusEl = rowEl.querySelector('.pg-upload-status');

    if (fileInp) {
      fileInp.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        if (statusEl) statusEl.textContent = '⏳ Irimo gushyiramo ifoto...';
        try {
          const uploadedUrl = await uploadImageFileToServer(file);
          urlInp.value = uploadedUrl;
          liveImg.src = uploadedUrl;
          await api.request(`/api/v1/storybooks/${activeBook.id}/pages`, {
            method: 'PUT',
            body: JSON.stringify({ pages: collectEditedPages() }),
          });
          if (statusEl) statusEl.textContent = '✅ Ifoto yawe yashyizwemo kandi yabitswe neza!';
        } catch (err) {
          if (statusEl) statusEl.textContent = `❌ Ikibazo: ${err.message}`;
        }
      });
    }

    if (urlInp) {
      urlInp.addEventListener('input', () => {
        const val = urlInp.value.trim();
        if (val) liveImg.src = val;
      });
    }
  });

  bodyEl.querySelector('#add-page-btn').addEventListener('click', async () => {
    const current = collectEditedPages();
    current.push({
      page_number: current.length + 1,
      illustration_url: activeBook.pages[0]?.illustration_url || '',
      auto_generate_illustration: false,
      text_content: 'Andika inkuru y\'iyi paji hano...',
      vocabulary: [],
    });
    await api.request(`/api/v1/storybooks/${activeBook.id}/pages`, {
      method: 'PUT',
      body: JSON.stringify({ pages: current }),
    });
    renderStorybookStudioSection(bodyEl);
  });

  bodyEl.querySelectorAll('.move-up-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.idx);
      const current = collectEditedPages();
      const tmp = current[idx - 1];
      current[idx - 1] = current[idx];
      current[idx] = tmp;
      current.forEach((p, i) => (p.page_number = i + 1));
      await api.request(`/api/v1/storybooks/${activeBook.id}/pages`, {
        method: 'PUT',
        body: JSON.stringify({ pages: current }),
      });
      renderStorybookStudioSection(bodyEl);
    });
  });

  bodyEl.querySelector('#save-pages-btn').addEventListener('click', async () => {
    await api.request(`/api/v1/storybooks/${activeBook.id}/pages`, {
      method: 'PUT',
      body: JSON.stringify({ pages: collectEditedPages() }),
    });
    renderStorybookStudioSection(bodyEl);
  });

  bodyEl.querySelector('#publish-book-btn').addEventListener('click', async () => {
    await api.request(`/api/v1/storybooks/${activeBook.id}/pages`, {
      method: 'PUT',
      body: JSON.stringify({ pages: collectEditedPages() }),
    });
    await api.request(`/api/v1/storybooks/${activeBook.id}/publish`, { method: 'POST' });
    renderStorybookStudioSection(bodyEl);
  });
}

/* ==========================================================================
   VIDEO LIBRARY (All Videos Catalog, Edit Details, Settings, Preview & Delete)
   ========================================================================== */
async function renderVideoLibrarySection(bodyEl, rootContainer, notice = null) {
  const [videos, langs, videoCats] = await Promise.all([
    api.request('/api/v1/videos?include_drafts=true'),
    api.request('/api/v1/languages').catch(() => []),
    api.request('/api/v1/categories?content_type=video').catch(() => []),
  ]);

  const filters = adminState.videoLibrary;
  const langOptions = langs.length
    ? langs
    : [
        { code: 'rw', name: 'KINYARWANDA', flag_emoji: '🇷🇼' },
        { code: 'fr', name: 'FRENCH (FRANÇAIS)', flag_emoji: '🇫🇷' },
        { code: 'sw', name: 'SWAHILI (KISWAHILI)', flag_emoji: '🇹🇿' },
        { code: 'en', name: 'ENGLISH', flag_emoji: '🇬🇧' },
      ];
  const langMap = new Map(langOptions.map((l) => [l.code.toLowerCase(), l]));
  const formatLang = (code) => {
    const l = langMap.get(String(code || '').toLowerCase());
    return l ? `${l.flag_emoji || '🌍'} ${l.code.toUpperCase()}` : String(code || '').toUpperCase();
  };
  const formatDuration = (secs) => {
    const s = Math.max(0, Number(secs) || 0);
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  };

  const categoryNames = Array.from(
    new Set([
      ...videoCats.map((c) => c.name),
      ...videos.map((v) => v.category_name).filter(Boolean),
    ])
  ).sort((a, b) => a.localeCompare(b));

  const providerNames = Array.from(
    new Set(videos.map((v) => v.provider).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const publishedCount = videos.filter((v) => v.status === 'Published').length;
  const draftReviewCount = videos.filter((v) => v.status === 'Draft' || v.status === 'Review').length;
  const archivedCount = videos.filter((v) => v.status === 'Archived').length;
  const totalViews = videos.reduce((sum, v) => sum + (Number(v.view_count) || 0), 0);

  const q = filters.search.trim().toLowerCase();
  const filteredVideos = videos
    .filter((v) => {
      if (filters.status !== 'ALL' && v.status !== filters.status) return false;
      if (filters.category !== 'ALL' && v.category_name !== filters.category) return false;
      if (filters.provider !== 'ALL' && v.provider !== filters.provider) return false;
      if (filters.language !== 'ALL' && String(v.language_code).toLowerCase() !== filters.language.toLowerCase()) return false;
      if (filters.ageGroup !== 'ALL' && v.age_group !== filters.ageGroup) return false;
      if (q) {
        const hay = `${v.title} ${v.description} ${v.category_name} ${v.provider} ${v.video_url} ${v.language_code}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (filters.sortBy === 'views') return (b.view_count || 0) - (a.view_count || 0);
      if (filters.sortBy === 'title') return (a.title || '').localeCompare(b.title || '');
      if (filters.sortBy === 'duration') return (b.duration_seconds || 0) - (a.duration_seconds || 0);
      return new Date(b.created_at || 0) - new Date(a.created_at || 0);
    });

  const statusBadgeClass = (st) => {
    if (st === 'Published') return 'gl-status-published';
    if (st === 'Review') return 'gl-status-review';
    if (st === 'Archived') return 'gl-status-archived';
    return 'gl-status-draft';
  };

  bodyEl.innerHTML = `
    <div class="gl-header">
      <div>
        <h2 style="margin:0">📺 Video Library (${videos.length})</h2>
        <small style="color:var(--text-3)">Manage all cartoons and learning videos — edit titles, descriptions, video URLs, thumbnails, video settings, preview playback, publish/archive, clone, or delete.</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="vl-open-studio-new-btn" class="btn-primary" type="button">+ Add Cartoon / Video</button>
      </div>
    </div>

    ${
      notice
        ? `<div class="gl-notice ${notice.type === 'error' ? 'gl-notice-error' : 'gl-notice-success'}">${escapeHtml(notice.text)}</div>`
        : ''
    }

    <div class="admin-kpi-grid">
      <div class="admin-kpi"><small>All Videos</small><div class="num">${videos.length}</div></div>
      <div class="admin-kpi"><small>Published (Live)</small><div class="num" style="color:#4ade80">${publishedCount}</div></div>
      <div class="admin-kpi"><small>Draft / Review</small><div class="num" style="color:#fbbf24">${draftReviewCount}</div></div>
      <div class="admin-kpi"><small>Archived</small><div class="num" style="color:#94a3b8">${archivedCount}</div></div>
      <div class="admin-kpi"><small>Total Views</small><div class="num" style="color:#38bdf8">${totalViews}</div></div>
    </div>

    <div class="admin-card gl-filter-bar">
      <input id="vl-search" type="search" value="${escapeHtml(filters.search)}" placeholder="🔍 Search videos by title, description, URL, provider..." />
      <select id="vl-filter-status" aria-label="Filter by status">
        <option value="ALL" ${filters.status === 'ALL' ? 'selected' : ''}>All Statuses</option>
        <option value="Published" ${filters.status === 'Published' ? 'selected' : ''}>✅ Published</option>
        <option value="Draft" ${filters.status === 'Draft' ? 'selected' : ''}>📝 Draft</option>
        <option value="Review" ${filters.status === 'Review' ? 'selected' : ''}>📋 Review</option>
        <option value="Archived" ${filters.status === 'Archived' ? 'selected' : ''}>📦 Archived</option>
      </select>
      <select id="vl-filter-category" aria-label="Filter by type">
        <option value="ALL" ${filters.category === 'ALL' ? 'selected' : ''}>All Types</option>
        ${categoryNames
          .map((c) => `<option value="${escapeHtml(c)}" ${filters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`)
          .join('')}
      </select>
      <select id="vl-filter-lang" aria-label="Filter by language">
        <option value="ALL" ${filters.language === 'ALL' ? 'selected' : ''}>All Languages</option>
        ${langOptions
          .map((l) => `<option value="${escapeHtml(l.code)}" ${filters.language === l.code ? 'selected' : ''}>${escapeHtml(l.flag_emoji || '🌍')} ${escapeHtml(l.name)}</option>`)
          .join('')}
      </select>
      <select id="vl-filter-provider" aria-label="Filter by provider">
        <option value="ALL" ${filters.provider === 'ALL' ? 'selected' : ''}>All Providers</option>
        ${providerNames
          .map((p) => `<option value="${escapeHtml(p)}" ${filters.provider === p ? 'selected' : ''}>${escapeHtml(p.toUpperCase())}</option>`)
          .join('')}
      </select>
      <select id="vl-sort" aria-label="Sort videos">
        <option value="newest" ${filters.sortBy === 'newest' ? 'selected' : ''}>Sort: Newest</option>
        <option value="views" ${filters.sortBy === 'views' ? 'selected' : ''}>Sort: Most Viewed</option>
        <option value="title" ${filters.sortBy === 'title' ? 'selected' : ''}>Sort: Title A–Z</option>
        <option value="duration" ${filters.sortBy === 'duration' ? 'selected' : ''}>Sort: Longest</option>
      </select>
    </div>

    ${
      filteredVideos.length === 0
        ? `<div class="admin-card" style="text-align:center;padding:36px;color:var(--text-3)">
             <div style="font-size:2rem;margin-bottom:8px">📺</div>
             <strong>No videos match your current filters.</strong>
             <div style="margin-top:12px"><button id="vl-reset-filters-btn" class="btn-secondary" type="button">Reset Filters</button></div>
           </div>`
        : `<div class="gl-grid">
            ${filteredVideos
              .map(
                (v) => `
              <article class="gl-card" data-vid="${v.id}">
                <div class="gl-card-top">
                  <div class="gl-cover-box">${renderCoverVisual(v.thumbnail_url || '🎬', v.title)}</div>
                  <div class="gl-card-head">
                    <div class="gl-card-badges">
                      <span class="gl-status-badge ${statusBadgeClass(v.status)}">${escapeHtml(v.status)}</span>
                      <span class="gl-engine-badge">${escapeHtml(String(v.provider || 'external').toUpperCase())}</span>
                      <span class="gl-ver-badge">${escapeHtml(formatLang(v.language_code))}</span>
                    </div>
                    <h3 class="gl-card-title">${escapeHtml(v.title)}</h3>
                    <p class="gl-card-desc">${escapeHtml(v.description)}</p>
                  </div>
                </div>

                <div class="gl-meta-chips">
                  <span>🗂️ ${escapeHtml(v.category_name)}</span>
                  <span>🧒 Ages ${escapeHtml(v.age_group)}</span>
                  <span>⏱️ ${formatDuration(v.duration_seconds)}</span>
                  <span>👁️ ${v.view_count || 0} views</span>
                  <span>${v.provider_supports_events ? '✅ Telemetry' : '⚠️ External'}</span>
                  ${v.ad_settings?.enabled ? '<span style="background:rgba(245,158,11,0.18);border-color:rgba(245,158,11,0.45);color:#fde68a">📢 Ads ON</span>' : ''}
                </div>

                <div class="gl-card-actions">
                  <button class="btn-primary vl-edit-btn" data-vid="${v.id}" type="button">✏️ Edit</button>
                  <button class="btn-secondary vl-settings-btn" data-vid="${v.id}" type="button">⚙️ Settings</button>
                  <button class="btn-secondary vl-ads-btn" data-vid="${v.id}" type="button">📢 Ads</button>
                  <button class="btn-secondary vl-preview-btn" data-vid="${v.id}" type="button">▶️ Preview</button>
                  ${
                    v.status === 'Published'
                      ? `<button class="btn-secondary vl-archive-btn" data-vid="${v.id}" type="button">📦 Archive</button>`
                      : `<button class="btn-success vl-publish-btn" data-vid="${v.id}" type="button">🚀 Publish</button>`
                  }
                  <button class="btn-secondary vl-duplicate-btn" data-vid="${v.id}" type="button" title="Duplicate video">📋 Clone</button>
                  <button class="btn-danger vl-delete-btn" data-vid="${v.id}" type="button">🗑️ Delete</button>
                </div>
              </article>
            `
              )
              .join('')}
          </div>`
    }

    <!-- Edit / Settings Modal -->
    <div id="vl-modal-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal" role="dialog" aria-modal="true" aria-labelledby="vl-modal-title">
        <div class="gl-modal-header">
          <div>
            <h3 id="vl-modal-title" style="margin:0">Edit Video</h3>
            <small id="vl-modal-subtitle" style="color:var(--text-3)"></small>
          </div>
          <button id="vl-modal-close" class="btn-secondary" type="button">✕ Close</button>
        </div>

        <div class="gl-modal-tabs">
          <button id="vl-tab-edit" class="gl-tab-btn active" type="button">✏️ Edit Details</button>
          <button id="vl-tab-settings" class="gl-tab-btn" type="button">⚙️ Video Settings</button>
          <button id="vl-tab-ads" class="gl-tab-btn" type="button">📢 Ads &amp; Overlays</button>
        </div>

        <form id="vl-edit-form" class="gl-modal-body">
          <!-- Tab 1: Edit Details -->
          <div id="vl-pane-edit">
            <div class="form-grid">
              <label class="form-control">
                Video Title
                <input name="title" required maxlength="200" placeholder="Enter video title" />
              </label>
              <label class="form-control">
                Video Type / Category
                <input name="category_name" list="vl-category-datalist" required maxlength="100" placeholder="e.g. Movies or Learning Videos" />
                <datalist id="vl-category-datalist">
                  ${categoryNames.map((c) => `<option value="${escapeHtml(c)}"></option>`).join('')}
                </datalist>
              </label>
            </div>

            <label class="form-control" style="margin-top:10px">
              Video / Embed URL (YouTube, Vimeo, or MP4)
              <input name="video_url" required maxlength="500" placeholder="https://www.youtube.com/watch?v=..." />
            </label>

            <label class="form-control" style="margin-top:10px">
              Description
              <textarea name="description" rows="3" required placeholder="Describe this cartoon or learning video..."></textarea>
            </label>

            <div class="gl-cover-editor">
              <div id="vl-thumb-preview" class="gl-cover-box" style="width:80px;height:80px"></div>
              <div style="flex:1;min-width:220px">
                <div class="form-grid" style="margin-bottom:6px">
                  <label class="form-control">
                    Thumbnail Image URL or Emoji
                    <input name="thumbnail_url" id="vl-thumb-input" maxlength="500" placeholder="🎬 or /uploads/image/..." />
                  </label>
                  <label class="form-control">
                    Upload Thumbnail Image
                    <input id="vl-thumb-upload" type="file" accept="image/*" />
                  </label>
                </div>
                <small id="vl-thumb-upload-status" style="color:#4ade80;font-weight:700"></small>
              </div>
            </div>
          </div>

          <!-- Tab 2: Video Settings -->
          <div id="vl-pane-settings" style="display:none">
            <div class="form-grid">
              <label class="form-control">
                Visibility / Status
                <select name="status">
                  <option value="Published">✅ Published (Visible to Children)</option>
                  <option value="Draft">📝 Draft (Hidden)</option>
                  <option value="Review">📋 In Review</option>
                  <option value="Archived">📦 Archived (Hidden)</option>
                </select>
              </label>
              <label class="form-control">
                Language
                <select name="language_code">
                  ${langOptions
                    .map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.flag_emoji || '🌍')} ${escapeHtml(l.name)}</option>`)
                    .join('')}
                </select>
              </label>
              <label class="form-control">
                Target Age Group
                <select name="age_group">
                  <option value="3-5">Ages 3–5</option>
                  <option value="6-8">Ages 6–8</option>
                  <option value="9-12">Ages 9–12</option>
                </select>
              </label>
              <label class="form-control">
                Duration (Seconds)
                <input name="duration_seconds" type="number" min="1" max="86400" required />
              </label>
            </div>

            <div class="gl-versions-box">
              <strong>📡 Provider &amp; Playback Telemetry</strong>
              <div id="vl-provider-info" style="margin-top:6px;font-size:0.84rem;color:var(--text-2)"></div>
            </div>

            <div class="gl-danger-zone">
              <div>
                <strong>⚠️ Danger Zone</strong>
                <div style="font-size:0.8rem;color:var(--text-3)">Permanently delete this video and all watch sessions associated with it.</div>
              </div>
              <button id="vl-modal-delete-btn" class="btn-danger" type="button">🗑️ Delete Video</button>
            </div>
          </div>

          <!-- Tab 3: Ads & Overlays (Pre/Mid/Post-Roll, Banner, Ticker, Watermark) -->
          <div id="vl-pane-ads" style="display:none">
            <label class="vad-master-toggle">
              <input type="checkbox" name="ads_enabled" />
              <span>
                <strong>📢 Enable Ads &amp; Overlays on this Video</strong>
                <small style="display:block;color:var(--text-3)">Turn on to display configured video ads, promo banners, scrolling text, or watermark.</small>
              </span>
            </label>

            <!-- 1. Video Ads: Pre-Roll, Mid-Roll, Post-Roll -->
            <div class="vad-cfg-card">
              <div class="vad-cfg-head">
                <strong>🎬 1. Video Ads (Pre-Roll • Mid-Roll • Post-Roll)</strong>
                <small style="color:var(--text-3)">YouTube, Vimeo, or MP4 ad video URLs</small>
              </div>

              <div class="vad-slot-box">
                <label class="vad-slot-toggle"><input type="checkbox" name="pre_enabled" /> <strong>▶️ Pre-Roll Ad</strong> <small>(Itangira mbere ya videwo)</small></label>
                <div class="form-grid" style="margin-top:8px">
                  <label class="form-control">Ad Video URL <input name="pre_url" placeholder="https://youtu.be/... or /uploads/ad.mp4" /></label>
                  <label class="form-control">Duration (s) <input name="pre_duration" type="number" min="3" max="300" value="10" /></label>
                  <label class="form-control">Skip After (s) <input name="pre_skip" type="number" min="0" max="60" value="5" /></label>
                  <label class="form-control">CTA Label (Optional) <input name="pre_cta_text" placeholder="e.g. Visit Sponsor" /></label>
                  <label class="form-control">CTA Link (Optional) <input name="pre_cta_url" placeholder="https://..." /></label>
                </div>
              </div>

              <div class="vad-slot-box">
                <label class="vad-slot-toggle"><input type="checkbox" name="mid_enabled" /> <strong>⏸️ Mid-Roll Ad</strong> <small>(Ijyamo hagati ya videwo)</small></label>
                <div class="form-grid" style="margin-top:8px">
                  <label class="form-control">Ad Video URL <input name="mid_url" placeholder="https://youtu.be/... or /uploads/ad.mp4" /></label>
                  <label class="form-control">Trigger At (s) <input name="mid_trigger" type="number" min="5" max="36000" value="30" /></label>
                  <label class="form-control">Duration (s) <input name="mid_duration" type="number" min="3" max="300" value="10" /></label>
                  <label class="form-control">Skip After (s) <input name="mid_skip" type="number" min="0" max="60" value="5" /></label>
                  <label class="form-control">CTA Label (Optional) <input name="mid_cta_text" placeholder="e.g. Learn More" /></label>
                  <label class="form-control">CTA Link (Optional) <input name="mid_cta_url" placeholder="https://..." /></label>
                </div>
              </div>

              <div class="vad-slot-box">
                <label class="vad-slot-toggle"><input type="checkbox" name="post_enabled" /> <strong>⏹️ Post-Roll Ad</strong> <small>(Ijyamo videwo irangiye)</small></label>
                <div class="form-grid" style="margin-top:8px">
                  <label class="form-control">Ad Video URL <input name="post_url" placeholder="https://youtu.be/... or /uploads/ad.mp4" /></label>
                  <label class="form-control">Duration (s) <input name="post_duration" type="number" min="3" max="300" value="10" /></label>
                  <label class="form-control">Skip After (s) <input name="post_skip" type="number" min="0" max="60" value="5" /></label>
                  <label class="form-control">CTA Label (Optional) <input name="post_cta_text" placeholder="e.g. Subscribe" /></label>
                  <label class="form-control">CTA Link (Optional) <input name="post_cta_url" placeholder="https://..." /></label>
                </div>
              </div>
            </div>

            <!-- 2. Promo Banner -->
            <div class="vad-cfg-card">
              <label class="vad-slot-toggle"><input type="checkbox" name="banner_enabled" /> <strong>🏷️ 2. Promo Banner (Amabano)</strong></label>
              <div class="form-grid" style="margin-top:10px">
                <label class="form-control">Banner Text <input name="banner_text" maxlength="240" placeholder="e.g. 🎉 New Kinyarwanda Storybooks Available Now!" /></label>
                <label class="form-control">Click Link URL (Optional) <input name="banner_link" maxlength="500" placeholder="https://..." /></label>
                <label class="form-control">Position
                  <select name="banner_position">
                    <option value="bottom">Bottom of Video</option>
                    <option value="top">Top of Video</option>
                  </select>
                </label>
                <label class="form-control">Background Color <input name="banner_bg" type="color" value="#0f172a" style="height:40px;padding:4px" /></label>
                <label class="form-control">Text Color <input name="banner_fg" type="color" value="#ffffff" style="height:40px;padding:4px" /></label>
                <label class="form-control" style="justify-content:center">
                  <span>Allow Dismiss (✕)</span>
                  <label style="display:flex;align-items:center;gap:8px;margin-top:6px;cursor:pointer">
                    <input type="checkbox" name="banner_dismissible" checked style="width:auto;height:auto" />
                    <span>Viewer can close banner</span>
                  </label>
                </label>
              </div>
              <div class="form-grid" style="margin-top:8px">
                <label class="form-control">Banner Image URL (Optional) <input name="banner_image" id="vl-banner-img-input" maxlength="500" placeholder="/uploads/image/... or https://..." /></label>
                <label class="form-control">Upload Banner Image <input id="vl-banner-img-upload" type="file" accept="image/*" /></label>
              </div>
              <small id="vl-banner-upload-status" style="color:#4ade80;font-weight:700"></small>
            </div>

            <!-- 3. Scrolling Text Ticker -->
            <div class="vad-cfg-card">
              <label class="vad-slot-toggle"><input type="checkbox" name="ticker_enabled" /> <strong>📜 3. Scrolling Text Ticker (Amagambo Agenda)</strong></label>
              <label class="form-control" style="margin-top:10px">
                Scrolling Text Message
                <input name="ticker_text" maxlength="400" placeholder="e.g. 🌟 Murakaza neza kuri Gitego Kids World! Reba cartoons nshya buri munsi..." />
              </label>
              <div class="form-grid" style="margin-top:8px">
                <label class="form-control">Position
                  <select name="ticker_position">
                    <option value="bottom">Bottom</option>
                    <option value="top">Top</option>
                  </select>
                </label>
                <label class="form-control">Scroll Speed
                  <select name="ticker_speed">
                    <option value="slow">Slow</option>
                    <option value="normal">Normal</option>
                    <option value="fast">Fast</option>
                  </select>
                </label>
                <label class="form-control">Background Color <input name="ticker_bg" type="color" value="#f59e0b" style="height:40px;padding:4px" /></label>
                <label class="form-control">Text Color <input name="ticker_fg" type="color" value="#0b0d12" style="height:40px;padding:4px" /></label>
              </div>
            </div>

            <!-- 4. Watermark -->
            <div class="vad-cfg-card">
              <label class="vad-slot-toggle"><input type="checkbox" name="wm_enabled" /> <strong>💧 4. Video Watermark (Wotermark)</strong></label>
              <div class="form-grid" style="margin-top:10px">
                <label class="form-control">Watermark Text <input name="wm_text" maxlength="60" placeholder="e.g. GITEGO KIDS" /></label>
                <label class="form-control">Corner Position
                  <select name="wm_position">
                    <option value="top-right">Top Right</option>
                    <option value="top-left">Top Left</option>
                    <option value="bottom-right">Bottom Right</option>
                    <option value="bottom-left">Bottom Left</option>
                  </select>
                </label>
                <label class="form-control">
                  Opacity (<span id="vl-wm-opacity-val">65%</span>)
                  <input name="wm_opacity" id="vl-wm-opacity" type="range" min="0.1" max="1" step="0.05" value="0.65" />
                </label>
              </div>
              <div class="form-grid" style="margin-top:8px">
                <label class="form-control">Watermark Logo URL (Optional) <input name="wm_image" id="vl-wm-img-input" maxlength="500" placeholder="/uploads/image/... or https://..." /></label>
                <label class="form-control">Upload Logo Image <input id="vl-wm-img-upload" type="file" accept="image/*" /></label>
              </div>
              <small id="vl-wm-upload-status" style="color:#4ade80;font-weight:700"></small>
            </div>
          </div>

          <div class="gl-modal-footer">
            <button id="vl-modal-preview-btn" class="btn-secondary" type="button">▶️ Preview Video</button>
            <div style="display:flex;gap:8px">
              <button id="vl-modal-cancel-btn" class="btn-secondary" type="button">Cancel</button>
              <button class="btn-primary" type="submit">💾 Save Changes</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Live Video Preview Modal -->
    <div id="vl-preview-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal gl-preview-modal" role="dialog" aria-modal="true" aria-labelledby="vl-preview-title">
        <div class="gl-modal-header">
          <div>
            <h3 id="vl-preview-title" style="margin:0">▶️ Video Preview</h3>
            <small id="vl-preview-meta" style="color:var(--text-3)"></small>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button id="vl-preview-midroll-btn" class="btn-secondary" type="button" style="display:none">⏸️ Test Mid-Roll</button>
            <button id="vl-preview-postroll-btn" class="btn-secondary" type="button" style="display:none">⏹️ Test Post-Roll</button>
            <button id="vl-preview-close" class="btn-secondary" type="button">✕ Close</button>
          </div>
        </div>
        <div id="vl-preview-container" style="background:#000;height:500px;position:relative"></div>
      </div>
    </div>
  `;

  // Wire search, filters, and sort
  const rerenderFilters = () => renderVideoLibrarySection(bodyEl, rootContainer);
  const searchInput = bodyEl.querySelector('#vl-search');
  let searchDebounce = null;
  searchInput.addEventListener('input', (e) => {
    filters.search = e.target.value;
    if (searchDebounce) clearTimeout(searchDebounce);
    searchDebounce = setTimeout(async () => {
      await rerenderFilters();
      const nextSearch = bodyEl.querySelector('#vl-search');
      if (nextSearch) {
        nextSearch.focus();
        nextSearch.setSelectionRange(nextSearch.value.length, nextSearch.value.length);
      }
    }, 220);
  });
  bodyEl.querySelector('#vl-filter-status').addEventListener('change', (e) => {
    filters.status = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#vl-filter-category').addEventListener('change', (e) => {
    filters.category = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#vl-filter-lang').addEventListener('change', (e) => {
    filters.language = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#vl-filter-provider').addEventListener('change', (e) => {
    filters.provider = e.target.value;
    rerenderFilters();
  });
  bodyEl.querySelector('#vl-sort').addEventListener('change', (e) => {
    filters.sortBy = e.target.value;
    rerenderFilters();
  });

  const resetBtn = bodyEl.querySelector('#vl-reset-filters-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      adminState.videoLibrary = {
        search: '',
        status: 'ALL',
        category: 'ALL',
        provider: 'ALL',
        language: 'ALL',
        ageGroup: 'ALL',
        sortBy: 'newest',
      };
      renderVideoLibrarySection(bodyEl, rootContainer);
    });
  }

  // Add Cartoon / Video -> navigate to Cartoon Studio
  bodyEl.querySelector('#vl-open-studio-new-btn').addEventListener('click', () => {
    adminState.section = 'cartoon-studio';
    renderAdminView(rootContainer);
  });

  // Modal state & helpers
  let editingVideo = null;
  const modalBackdrop = bodyEl.querySelector('#vl-modal-backdrop');
  const editForm = bodyEl.querySelector('#vl-edit-form');
  const paneEdit = bodyEl.querySelector('#vl-pane-edit');
  const paneSettings = bodyEl.querySelector('#vl-pane-settings');
  const paneAds = bodyEl.querySelector('#vl-pane-ads');
  const tabEdit = bodyEl.querySelector('#vl-tab-edit');
  const tabSettings = bodyEl.querySelector('#vl-tab-settings');
  const tabAds = bodyEl.querySelector('#vl-tab-ads');
  const thumbInput = bodyEl.querySelector('#vl-thumb-input');
  const thumbPreview = bodyEl.querySelector('#vl-thumb-preview');
  const thumbUpload = bodyEl.querySelector('#vl-thumb-upload');
  const thumbUploadStatus = bodyEl.querySelector('#vl-thumb-upload-status');
  const bannerImgInput = bodyEl.querySelector('#vl-banner-img-input');
  const bannerImgUpload = bodyEl.querySelector('#vl-banner-img-upload');
  const bannerUploadStatus = bodyEl.querySelector('#vl-banner-upload-status');
  const wmImgInput = bodyEl.querySelector('#vl-wm-img-input');
  const wmImgUpload = bodyEl.querySelector('#vl-wm-img-upload');
  const wmUploadStatus = bodyEl.querySelector('#vl-wm-upload-status');
  const wmOpacityRange = bodyEl.querySelector('#vl-wm-opacity');
  const wmOpacityVal = bodyEl.querySelector('#vl-wm-opacity-val');

  function setModalTab(tab) {
    paneEdit.style.display = tab === 'edit' ? 'block' : 'none';
    paneSettings.style.display = tab === 'settings' ? 'block' : 'none';
    paneAds.style.display = tab === 'ads' ? 'block' : 'none';
    tabEdit.classList.toggle('active', tab === 'edit');
    tabSettings.classList.toggle('active', tab === 'settings');
    tabAds.classList.toggle('active', tab === 'ads');
  }

  function openVideoModal(videoId, initialTab = 'edit') {
    const v = videos.find((item) => item.id === Number(videoId));
    if (!v) return;
    editingVideo = v;

    bodyEl.querySelector('#vl-modal-title').textContent = v.title;
    bodyEl.querySelector('#vl-modal-subtitle').textContent = `Video #${v.id} • ${v.status} • ${String(v.provider).toUpperCase()} • ${v.view_count || 0} views`;

    editForm.elements.namedItem('title').value = v.title || '';
    editForm.elements.namedItem('category_name').value = v.category_name || '';
    editForm.elements.namedItem('video_url').value = v.video_url || '';
    editForm.elements.namedItem('description').value = v.description || '';
    thumbInput.value = v.thumbnail_url || '🎬';
    thumbPreview.innerHTML = renderCoverVisual(v.thumbnail_url || '🎬', v.title);
    thumbUploadStatus.textContent = '';

    editForm.elements.namedItem('status').value = v.status || 'Published';
    editForm.elements.namedItem('language_code').value = v.language_code || 'rw';
    editForm.elements.namedItem('age_group').value = v.age_group || '6-8';
    editForm.elements.namedItem('duration_seconds').value = v.duration_seconds || 180;

    // Populate Ads & Overlays tab
    const ads = v.ad_settings || {};
    const pre = ads.video_ads?.pre_roll || {};
    const mid = ads.video_ads?.mid_roll || {};
    const post = ads.video_ads?.post_roll || {};
    const bn = ads.banner || {};
    const tk = ads.ticker || {};
    const wm = ads.watermark || {};

    editForm.elements.namedItem('ads_enabled').checked = Boolean(ads.enabled);

    editForm.elements.namedItem('pre_enabled').checked = Boolean(pre.enabled);
    editForm.elements.namedItem('pre_url').value = pre.video_url || '';
    editForm.elements.namedItem('pre_duration').value = pre.duration_seconds || 10;
    editForm.elements.namedItem('pre_skip').value = pre.skip_after_seconds ?? 5;
    editForm.elements.namedItem('pre_cta_text').value = pre.cta_text || '';
    editForm.elements.namedItem('pre_cta_url').value = pre.cta_url || '';

    editForm.elements.namedItem('mid_enabled').checked = Boolean(mid.enabled);
    editForm.elements.namedItem('mid_url').value = mid.video_url || '';
    editForm.elements.namedItem('mid_trigger').value = mid.trigger_at_seconds || 30;
    editForm.elements.namedItem('mid_duration').value = mid.duration_seconds || 10;
    editForm.elements.namedItem('mid_skip').value = mid.skip_after_seconds ?? 5;
    editForm.elements.namedItem('mid_cta_text').value = mid.cta_text || '';
    editForm.elements.namedItem('mid_cta_url').value = mid.cta_url || '';

    editForm.elements.namedItem('post_enabled').checked = Boolean(post.enabled);
    editForm.elements.namedItem('post_url').value = post.video_url || '';
    editForm.elements.namedItem('post_duration').value = post.duration_seconds || 10;
    editForm.elements.namedItem('post_skip').value = post.skip_after_seconds ?? 5;
    editForm.elements.namedItem('post_cta_text').value = post.cta_text || '';
    editForm.elements.namedItem('post_cta_url').value = post.cta_url || '';

    editForm.elements.namedItem('banner_enabled').checked = Boolean(bn.enabled);
    editForm.elements.namedItem('banner_text').value = bn.text || '';
    editForm.elements.namedItem('banner_image').value = bn.image_url || '';
    editForm.elements.namedItem('banner_link').value = bn.link_url || '';
    editForm.elements.namedItem('banner_position').value = bn.position || 'bottom';
    editForm.elements.namedItem('banner_bg').value = bn.bg_color || '#0f172a';
    editForm.elements.namedItem('banner_fg').value = bn.text_color || '#ffffff';
    editForm.elements.namedItem('banner_dismissible').checked = bn.dismissible !== false;
    bannerUploadStatus.textContent = '';

    editForm.elements.namedItem('ticker_enabled').checked = Boolean(tk.enabled);
    editForm.elements.namedItem('ticker_text').value = tk.text || '';
    editForm.elements.namedItem('ticker_position').value = tk.position || 'bottom';
    editForm.elements.namedItem('ticker_speed').value = tk.speed || 'normal';
    editForm.elements.namedItem('ticker_bg').value = tk.bg_color || '#f59e0b';
    editForm.elements.namedItem('ticker_fg').value = tk.text_color || '#0b0d12';

    editForm.elements.namedItem('wm_enabled').checked = Boolean(wm.enabled);
    editForm.elements.namedItem('wm_text').value = wm.text || 'GITEGO KIDS';
    editForm.elements.namedItem('wm_image').value = wm.image_url || '';
    editForm.elements.namedItem('wm_position').value = wm.position || 'top-right';
    const opVal = wm.opacity != null ? Number(wm.opacity) : 0.65;
    wmOpacityRange.value = String(opVal);
    wmOpacityVal.textContent = `${Math.round(opVal * 100)}%`;
    wmUploadStatus.textContent = '';

    bodyEl.querySelector('#vl-provider-info').innerHTML = `
      <div>Provider: <code>${escapeHtml(String(v.provider || '').toUpperCase())}</code> • ${v.provider_supports_events ? '✅ Reliable Player API Telemetry' : '⚠️ External Unverified Provider'}</div>
      <div style="margin-top:4px;word-break:break-all;color:var(--text-3)">Embed URL: <code>${escapeHtml(v.embed_url || v.video_url)}</code></div>
    `;

    setModalTab(initialTab);
    modalBackdrop.style.display = 'flex';
  }

  function closeVideoModal() {
    modalBackdrop.style.display = 'none';
    editingVideo = null;
  }

  tabEdit.addEventListener('click', () => setModalTab('edit'));
  tabSettings.addEventListener('click', () => setModalTab('settings'));
  tabAds.addEventListener('click', () => setModalTab('ads'));
  bodyEl.querySelector('#vl-modal-close').addEventListener('click', closeVideoModal);
  bodyEl.querySelector('#vl-modal-cancel-btn').addEventListener('click', closeVideoModal);
  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) closeVideoModal();
  });

  wmOpacityRange.addEventListener('input', () => {
    wmOpacityVal.textContent = `${Math.round(Number(wmOpacityRange.value) * 100)}%`;
  });

  thumbInput.addEventListener('input', () => {
    thumbPreview.innerHTML = renderCoverVisual(thumbInput.value.trim() || '🎬', editingVideo?.title || 'Video thumbnail');
  });

  thumbUpload.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    thumbUploadStatus.textContent = '⏳ Uploading thumbnail...';
    try {
      const url = await uploadAdminImageFile(file);
      thumbInput.value = url;
      thumbPreview.innerHTML = renderCoverVisual(url, editingVideo?.title || 'Video thumbnail');
      thumbUploadStatus.textContent = '✅ Thumbnail uploaded! Click "Save Changes" to apply.';
    } catch (err) {
      thumbUploadStatus.textContent = `❌ Upload failed: ${err.message}`;
    }
  });

  bannerImgUpload.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    bannerUploadStatus.textContent = '⏳ Uploading banner image...';
    try {
      const url = await uploadAdminImageFile(file);
      bannerImgInput.value = url;
      bannerUploadStatus.textContent = '✅ Banner image uploaded! Click "Save Changes" to apply.';
    } catch (err) {
      bannerUploadStatus.textContent = `❌ Upload failed: ${err.message}`;
    }
  });

  wmImgUpload.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    wmUploadStatus.textContent = '⏳ Uploading watermark logo...';
    try {
      const url = await uploadAdminImageFile(file);
      wmImgInput.value = url;
      wmUploadStatus.textContent = '✅ Logo uploaded! Click "Save Changes" to apply.';
    } catch (err) {
      wmUploadStatus.textContent = `❌ Upload failed: ${err.message}`;
    }
  });

  function collectAdSettingsFromForm() {
    const fd = new FormData(editForm);
    return {
      enabled: Boolean(editForm.elements.namedItem('ads_enabled').checked),
      video_ads: {
        pre_roll: {
          enabled: Boolean(editForm.elements.namedItem('pre_enabled').checked),
          video_url: String(fd.get('pre_url') || '').trim(),
          duration_seconds: Math.max(3, Number(fd.get('pre_duration')) || 10),
          skip_after_seconds: Math.max(0, Number(fd.get('pre_skip') ?? 5)),
          cta_text: String(fd.get('pre_cta_text') || '').trim(),
          cta_url: String(fd.get('pre_cta_url') || '').trim(),
        },
        mid_roll: {
          enabled: Boolean(editForm.elements.namedItem('mid_enabled').checked),
          video_url: String(fd.get('mid_url') || '').trim(),
          trigger_at_seconds: Math.max(5, Number(fd.get('mid_trigger')) || 30),
          duration_seconds: Math.max(3, Number(fd.get('mid_duration')) || 10),
          skip_after_seconds: Math.max(0, Number(fd.get('mid_skip') ?? 5)),
          cta_text: String(fd.get('mid_cta_text') || '').trim(),
          cta_url: String(fd.get('mid_cta_url') || '').trim(),
        },
        post_roll: {
          enabled: Boolean(editForm.elements.namedItem('post_enabled').checked),
          video_url: String(fd.get('post_url') || '').trim(),
          duration_seconds: Math.max(3, Number(fd.get('post_duration')) || 10),
          skip_after_seconds: Math.max(0, Number(fd.get('post_skip') ?? 5)),
          cta_text: String(fd.get('post_cta_text') || '').trim(),
          cta_url: String(fd.get('post_cta_url') || '').trim(),
        },
      },
      banner: {
        enabled: Boolean(editForm.elements.namedItem('banner_enabled').checked),
        text: String(fd.get('banner_text') || '').trim(),
        image_url: String(fd.get('banner_image') || '').trim(),
        link_url: String(fd.get('banner_link') || '').trim(),
        position: String(fd.get('banner_position') || 'bottom'),
        bg_color: String(fd.get('banner_bg') || '#0f172a'),
        text_color: String(fd.get('banner_fg') || '#ffffff'),
        dismissible: Boolean(editForm.elements.namedItem('banner_dismissible').checked),
      },
      ticker: {
        enabled: Boolean(editForm.elements.namedItem('ticker_enabled').checked),
        text: String(fd.get('ticker_text') || '').trim(),
        position: String(fd.get('ticker_position') || 'bottom'),
        speed: String(fd.get('ticker_speed') || 'normal'),
        bg_color: String(fd.get('ticker_bg') || '#f59e0b'),
        text_color: String(fd.get('ticker_fg') || '#0b0d12'),
      },
      watermark: {
        enabled: Boolean(editForm.elements.namedItem('wm_enabled').checked),
        text: String(fd.get('wm_text') || '').trim(),
        image_url: String(fd.get('wm_image') || '').trim(),
        position: String(fd.get('wm_position') || 'top-right'),
        opacity: Number(wmOpacityRange.value) || 0.65,
      },
    };
  }

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingVideo) return;
    const fd = new FormData(editForm);
    const payload = {
      title: String(fd.get('title') || '').trim(),
      category_name: String(fd.get('category_name') || '').trim(),
      video_url: String(fd.get('video_url') || '').trim(),
      description: String(fd.get('description') || '').trim(),
      thumbnail_url: String(fd.get('thumbnail_url') || '🎬').trim() || '🎬',
      status: String(fd.get('status') || editingVideo.status),
      language_code: String(fd.get('language_code') || editingVideo.language_code),
      age_group: String(fd.get('age_group') || '6-8'),
      duration_seconds: Math.max(1, Number(fd.get('duration_seconds')) || 180),
      ad_settings: collectAdSettingsFromForm(),
    };
    try {
      await api.request(`/api/v1/videos/${editingVideo.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const savedTitle = payload.title;
      closeVideoModal();
      renderVideoLibrarySection(bodyEl, rootContainer, {
        type: 'success',
        text: `✅ Updated "${savedTitle}" (including Ads & Overlays) successfully.`,
      });
    } catch (err) {
      window.alert(`Could not save video changes: ${err.message}`);
    }
  });

  async function handleDeleteVideo(video) {
    const confirmed = window.confirm(
      `Delete "${video.title}" permanently?\n\nThis removes the video and all associated watch sessions. This cannot be undone.`
    );
    if (!confirmed) return;
    try {
      await api.request(`/api/v1/videos/${video.id}`, { method: 'DELETE' });
      closeVideoModal();
      renderVideoLibrarySection(bodyEl, rootContainer, {
        type: 'success',
        text: `🗑️ Deleted "${video.title}".`,
      });
    } catch (err) {
      renderVideoLibrarySection(bodyEl, rootContainer, {
        type: 'error',
        text: `❌ Could not delete "${video.title}": ${err.message}`,
      });
    }
  }

  bodyEl.querySelector('#vl-modal-delete-btn').addEventListener('click', () => {
    if (editingVideo) handleDeleteVideo(editingVideo);
  });

  // Live Video Preview Modal (with full Ads & Overlays support!)
  const previewBackdrop = bodyEl.querySelector('#vl-preview-backdrop');
  const previewContainer = bodyEl.querySelector('#vl-preview-container');
  const previewMidBtn = bodyEl.querySelector('#vl-preview-midroll-btn');
  const previewPostBtn = bodyEl.querySelector('#vl-preview-postroll-btn');
  let activePreviewPlayer = null;

  function openVideoPreview(video) {
    if (!video) return;
    if (activePreviewPlayer) {
      activePreviewPlayer.destroy();
      activePreviewPlayer = null;
    }
    bodyEl.querySelector('#vl-preview-title').textContent = `▶️ ${video.title}`;
    bodyEl.querySelector('#vl-preview-meta').textContent = `${String(video.provider || '').toUpperCase()} • ${formatLang(video.language_code)} • Ages ${video.age_group} • ${formatDuration(video.duration_seconds)}${video.ad_settings?.enabled ? ' • 📢 Ads Active' : ''}`;
    const hasMid = Boolean(video.ad_settings?.enabled && video.ad_settings?.video_ads?.mid_roll?.enabled);
    const hasPost = Boolean(video.ad_settings?.enabled && video.ad_settings?.video_ads?.post_roll?.enabled);
    previewMidBtn.style.display = hasMid ? 'inline-flex' : 'none';
    previewPostBtn.style.display = hasPost ? 'inline-flex' : 'none';

    previewBackdrop.style.display = 'flex';
    activePreviewPlayer = mountVideoWithAds(previewContainer, video, { frameClass: 'vad-preview-frame' });
  }

  function closeVideoPreview() {
    previewBackdrop.style.display = 'none';
    if (activePreviewPlayer) {
      activePreviewPlayer.destroy();
      activePreviewPlayer = null;
    }
  }

  previewMidBtn.addEventListener('click', () => {
    if (activePreviewPlayer) activePreviewPlayer.triggerMidRoll();
  });
  previewPostBtn.addEventListener('click', () => {
    if (activePreviewPlayer) activePreviewPlayer.triggerPostRoll();
  });

  bodyEl.querySelector('#vl-preview-close').addEventListener('click', closeVideoPreview);
  previewBackdrop.addEventListener('click', (e) => {
    if (e.target === previewBackdrop) closeVideoPreview();
  });

  bodyEl.querySelector('#vl-modal-preview-btn').addEventListener('click', () => {
    if (editingVideo) {
      const target = editingVideo;
      closeVideoModal();
      openVideoPreview(target);
    }
  });

  // Wire per-card actions
  bodyEl.querySelectorAll('.vl-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => openVideoModal(btn.dataset.vid, 'edit'));
  });
  bodyEl.querySelectorAll('.vl-settings-btn').forEach((btn) => {
    btn.addEventListener('click', () => openVideoModal(btn.dataset.vid, 'settings'));
  });
  bodyEl.querySelectorAll('.vl-ads-btn').forEach((btn) => {
    btn.addEventListener('click', () => openVideoModal(btn.dataset.vid, 'ads'));
  });
  bodyEl.querySelectorAll('.vl-preview-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = videos.find((item) => item.id === Number(btn.dataset.vid));
      if (v) openVideoPreview(v);
    });
  });
  bodyEl.querySelectorAll('.vl-publish-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = videos.find((item) => item.id === Number(btn.dataset.vid));
      if (!v) return;
      try {
        await api.request(`/api/v1/videos/${v.id}/publish`, { method: 'POST' });
        renderVideoLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `🚀 Published "${v.title}"! Now live for children.`,
        });
      } catch (err) {
        renderVideoLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Publish failed for "${v.title}": ${err.message}`,
        });
      }
    });
  });
  bodyEl.querySelectorAll('.vl-archive-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = videos.find((item) => item.id === Number(btn.dataset.vid));
      if (!v) return;
      try {
        await api.request(`/api/v1/videos/${v.id}/archive`, { method: 'POST' });
        renderVideoLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `📦 Archived "${v.title}". It is now hidden from children.`,
        });
      } catch (err) {
        renderVideoLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Could not archive "${v.title}": ${err.message}`,
        });
      }
    });
  });
  bodyEl.querySelectorAll('.vl-duplicate-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const v = videos.find((item) => item.id === Number(btn.dataset.vid));
      if (!v) return;
      try {
        const clone = await api.request(`/api/v1/videos/${v.id}/duplicate`, { method: 'POST' });
        renderVideoLibrarySection(bodyEl, rootContainer, {
          type: 'success',
          text: `📋 Duplicated "${v.title}" as "${clone.title}" (Draft).`,
        });
      } catch (err) {
        renderVideoLibrarySection(bodyEl, rootContainer, {
          type: 'error',
          text: `❌ Could not duplicate "${v.title}": ${err.message}`,
        });
      }
    });
  });
  bodyEl.querySelectorAll('.vl-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = videos.find((item) => item.id === Number(btn.dataset.vid));
      if (v) handleDeleteVideo(v);
    });
  });
}

/* ==========================================================================
   CARTOON STUDIO & VIDEO LIBRARY
   ========================================================================== */
async function renderCartoonStudioSection(bodyEl) {
  const [videos, langs, videoCats] = await Promise.all([
    api.request('/api/v1/videos?include_drafts=true'),
    api.request('/api/v1/languages'),
    api.request('/api/v1/categories?content_type=video').catch(() => []),
  ]);
  const videoCategoryNames = Array.from(new Set(videoCats.map((c) => c.name)));
  if (!videoCategoryNames.length) videoCategoryNames.push('Movies', 'Learning Videos');
  bodyEl.innerHTML = `
    <div class="admin-card">
      <h2 style="margin-top:0">🎬 Cartoon &amp; Video Studio — Embed External &amp; Self-Hosted Videos</h2>
      <div class="form-grid">
        <label class="form-control">Cartoon / Video Title <input id="vid-title" type="text" placeholder="e.g. Akagera Safari Episode 1" /></label>
        <label class="form-control">Video / Embed URL (YouTube, Vimeo, or MP4) <input id="vid-url" type="text" placeholder="https://www.youtube.com/watch?v=..." /></label>
        <label class="form-control">Video Type / Category (Icyiciro)
          <select id="vid-cat">
            ${videoCategoryNames.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('')}
          </select>
        </label>
        <label class="form-control">Language
          <select id="vid-lang">
            ${langs.map((l) => `<option value="${l.code}">${l.flag_emoji} ${l.name}</option>`).join('')}
          </select>
        </label>
        <label class="form-control">Age Group
          <select id="vid-age">
            <option value="3-5">Ages 3–5</option>
            <option value="6-8" selected>Ages 6–8</option>
            <option value="9-12">Ages 9–12</option>
          </select>
        </label>
      </div>
      <label class="form-control" style="margin-bottom:10px">Description <input id="vid-desc" type="text" placeholder="Educational animated episode..." /></label>
      <button id="add-video-btn" class="btn-success" type="button">+ Add Cartoon / Video</button>
    </div>

    <div class="admin-card">
      <h3>📺 Video Library (${videos.length})</h3>
      <table class="admin-table">
        <thead><tr><th>Title</th><th>Type</th><th>Provider</th><th>Telemetry Support</th><th>Language</th><th>Age</th><th>Views</th></tr></thead>
        <tbody>
          ${videos
            .map(
              (v) => `
            <tr>
              <td><strong>${v.thumbnail_url} ${v.title}</strong><br/><small style="color:var(--text-3)">${v.embed_url}</small></td>
              <td>${v.category_name}</td>
              <td>${v.provider.toUpperCase()}</td>
              <td>${v.provider_supports_events ? '✅ Reliable Player API' : '⚠️ Unverified External'}</td>
              <td>${v.language_code.toUpperCase()}</td>
              <td>${v.age_group}</td>
              <td>${v.view_count}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  bodyEl.querySelector('#add-video-btn').addEventListener('click', async () => {
    const title = bodyEl.querySelector('#vid-title').value.trim();
    const url = bodyEl.querySelector('#vid-url').value.trim();
    if (!title || !url) return;
    await api.request('/api/v1/videos', {
      method: 'POST',
      body: JSON.stringify({
        title,
        description: bodyEl.querySelector('#vid-desc').value.trim() || title,
        video_url: url,
        category_name: bodyEl.querySelector('#vid-cat').value,
        language_code: bodyEl.querySelector('#vid-lang').value,
        age_group: bodyEl.querySelector('#vid-age').value,
      }),
    });
    renderCartoonStudioSection(bodyEl);
  });
}

/* ==========================================================================
   DYNAMIC LANGUAGES, CATEGORIES, LEARNING, USERS, ANALYTICS & SETTINGS
   ========================================================================== */
async function renderLanguagesAdminSection(bodyEl) {
  const langs = await api.request('/api/v1/languages');
  bodyEl.innerHTML = `
    <div class="admin-card">
      <h2 style="margin-top:0">🌍 Dynamic Multilingual Manager</h2>
      <p style="color:var(--text-3);font-size:0.9rem">Add new languages dynamically without changing source code. Core seeded categories: KINYARWANDA, FRENCH (FRANÇAIS), SWAHILI (KISWAHILI).</p>
      <div class="form-grid">
        <label class="form-control">ISO Code <input id="lang-code" type="text" placeholder="e.g. es" /></label>
        <label class="form-control">Display Name <input id="lang-name" type="text" placeholder="e.g. SPANISH (ESPAÑOL)" /></label>
        <label class="form-control">Native Name <input id="lang-native" type="text" placeholder="e.g. Español" /></label>
        <label class="form-control">Flag Emoji <input id="lang-flag" type="text" value="🇪🇸" /></label>
      </div>
      <button id="add-lang-btn" class="btn-success" type="button">+ Add Language</button>
    </div>
    <div class="admin-card">
      <table class="admin-table">
        <thead><tr><th>Flag</th><th>Code</th><th>Category Name</th><th>Native Name</th><th>Status</th></tr></thead>
        <tbody>
          ${langs.map((l) => `<tr><td>${l.flag_emoji}</td><td><code>${l.code}</code></td><td><strong>${l.name}</strong></td><td>${l.native_name}</td><td>✅ Active</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;

  bodyEl.querySelector('#add-lang-btn').addEventListener('click', async () => {
    const code = bodyEl.querySelector('#lang-code').value.trim();
    const name = bodyEl.querySelector('#lang-name').value.trim();
    if (!code || !name) return;
    await api.request('/api/v1/languages', {
      method: 'POST',
      body: JSON.stringify({
        code,
        name,
        native_name: bodyEl.querySelector('#lang-native').value.trim() || name,
        flag_emoji: bodyEl.querySelector('#lang-flag').value.trim() || '🌍',
      }),
    });
    renderLanguagesAdminSection(bodyEl);
  });
}

async function renderCategoriesAdminSection(bodyEl, notice = null) {
  const cats = await api.request('/api/v1/categories');
  bodyEl.innerHTML = `
    <div class="admin-card">
      <h2 style="margin-top:0">🗂️ Database-Driven Categories (${cats.length})</h2>
      ${
        notice
          ? `<div class="gl-notice ${notice.type === 'error' ? 'gl-notice-error' : 'gl-notice-success'}">${escapeHtml(notice.text)}</div>`
          : ''
      }
      <div class="form-grid">
        <label class="form-control">Slug <input id="cat-slug" type="text" placeholder="e.g. rwanda-history" /></label>
        <label class="form-control">Name <input id="cat-name" type="text" placeholder="e.g. Rwanda Cultural Heritage" /></label>
        <label class="form-control">Content Type
          <select id="cat-type">
            <option value="all">All Content Types</option>
            <option value="game">Games</option>
            <option value="storybook">Storybooks</option>
            <option value="video">Cartoons &amp; Videos</option>
            <option value="learning">Learning</option>
          </select>
        </label>
        <label class="form-control">Icon Emoji <input id="cat-icon" type="text" value="🏛️" /></label>
      </div>
      <button id="add-cat-btn" class="btn-success" type="button">+ Create Category</button>
    </div>
    <div class="admin-card">
      <table class="admin-table">
        <thead><tr><th>Icon</th><th>Name</th><th>Slug</th><th>Content Type</th><th>Actions</th></tr></thead>
        <tbody>
          ${cats
            .map(
              (c) => `
            <tr>
              <td>${escapeHtml(c.icon)}</td>
              <td><strong>${escapeHtml(c.name)}</strong></td>
              <td><code>${escapeHtml(c.slug)}</code></td>
              <td>${escapeHtml(c.content_type)}</td>
              <td>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  <button class="btn-primary cat-edit-btn" data-cid="${c.id}" style="padding:5px 10px;font-size:0.78rem" type="button">✏️ Edit</button>
                  <button class="btn-danger cat-delete-btn" data-cid="${c.id}" style="padding:5px 10px;font-size:0.78rem" type="button">🗑️ Delete</button>
                </div>
              </td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Edit Category Modal -->
    <div id="cat-edit-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal" role="dialog" aria-modal="true" style="max-width:560px">
        <div class="gl-modal-header">
          <h3 id="cat-edit-title" style="margin:0">Edit Category</h3>
          <button id="cat-edit-close" class="btn-secondary" type="button">✕ Close</button>
        </div>
        <form id="cat-edit-form" class="gl-modal-body">
          <div class="form-grid">
            <label class="form-control">Name <input name="name" required maxlength="120" /></label>
            <label class="form-control">Slug <input name="slug" required maxlength="100" /></label>
            <label class="form-control">Content Type
              <select name="content_type">
                <option value="all">All Content Types</option>
                <option value="game">Games</option>
                <option value="storybook">Storybooks</option>
                <option value="video">Cartoons &amp; Videos</option>
                <option value="learning">Learning</option>
              </select>
            </label>
            <label class="form-control">Icon Emoji <input name="icon" maxlength="30" /></label>
          </div>
          <label class="form-control" style="margin-top:8px">Description <textarea name="description" rows="2"></textarea></label>
          <div class="gl-modal-footer">
            <span></span>
            <div style="display:flex;gap:8px">
              <button id="cat-edit-cancel" class="btn-secondary" type="button">Cancel</button>
              <button class="btn-primary" type="submit">💾 Save Changes</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  bodyEl.querySelector('#add-cat-btn').addEventListener('click', async () => {
    const slug = bodyEl.querySelector('#cat-slug').value.trim();
    const name = bodyEl.querySelector('#cat-name').value.trim();
    if (!slug || !name) return;
    try {
      await api.request('/api/v1/categories', {
        method: 'POST',
        body: JSON.stringify({
          slug,
          name,
          content_type: bodyEl.querySelector('#cat-type').value,
          icon: bodyEl.querySelector('#cat-icon').value.trim() || '🌟',
        }),
      });
      renderCategoriesAdminSection(bodyEl, { type: 'success', text: `✅ Created category "${name}".` });
    } catch (err) {
      renderCategoriesAdminSection(bodyEl, { type: 'error', text: `❌ ${err.message}` });
    }
  });

  // Edit Category modal
  let editingCat = null;
  const editBackdrop = bodyEl.querySelector('#cat-edit-backdrop');
  const editForm = bodyEl.querySelector('#cat-edit-form');
  const closeEdit = () => {
    editBackdrop.style.display = 'none';
    editingCat = null;
  };
  bodyEl.querySelector('#cat-edit-close').addEventListener('click', closeEdit);
  bodyEl.querySelector('#cat-edit-cancel').addEventListener('click', closeEdit);
  editBackdrop.addEventListener('click', (e) => {
    if (e.target === editBackdrop) closeEdit();
  });

  bodyEl.querySelectorAll('.cat-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = cats.find((x) => x.id === Number(btn.dataset.cid));
      if (!cat) return;
      editingCat = cat;
      bodyEl.querySelector('#cat-edit-title').textContent = `Edit Category: ${cat.name}`;
      editForm.elements.namedItem('name').value = cat.name || '';
      editForm.elements.namedItem('slug').value = cat.slug || '';
      editForm.elements.namedItem('content_type').value = cat.content_type || 'all';
      editForm.elements.namedItem('icon').value = cat.icon || '🌟';
      editForm.elements.namedItem('description').value = cat.description || '';
      editBackdrop.style.display = 'flex';
    });
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingCat) return;
    const fd = new FormData(editForm);
    try {
      await api.request(`/api/v1/categories/${editingCat.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: String(fd.get('name') || '').trim(),
          slug: String(fd.get('slug') || '').trim(),
          content_type: String(fd.get('content_type') || 'all'),
          icon: String(fd.get('icon') || '🌟').trim() || '🌟',
          description: String(fd.get('description') || '').trim(),
        }),
      });
      closeEdit();
      renderCategoriesAdminSection(bodyEl, { type: 'success', text: '✅ Category updated successfully.' });
    } catch (err) {
      window.alert(`Could not update category: ${err.message}`);
    }
  });

  bodyEl.querySelectorAll('.cat-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const cat = cats.find((x) => x.id === Number(btn.dataset.cid));
      if (!cat) return;
      if (!window.confirm(`Delete category "${cat.name}" (${cat.slug})?`)) return;
      try {
        await api.request(`/api/v1/categories/${cat.id}`, { method: 'DELETE' });
        renderCategoriesAdminSection(bodyEl, { type: 'success', text: `🗑️ Deleted category "${cat.name}".` });
      } catch (err) {
        renderCategoriesAdminSection(bodyEl, { type: 'error', text: `❌ Could not delete: ${err.message}` });
      }
    });
  });
}

const EDUCATION_CYCLES = [
  { id: 'materineri', label: '🌱 Materineri (N1–N3)', grades: ['N1', 'N2', 'N3'] },
  { id: 'primary', label: '🏫 Primary (P1–P6)', grades: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] },
  { id: 'o_level', label: '📘 O-Level (S1–S3)', grades: ['S1', 'S2', 'S3'] },
  { id: 'high_school', label: '🎓 High School (S4–S6)', grades: ['S4', 'S5', 'S6'] },
];

function buildGradeSelectOptions(selectedCode = 'P1') {
  return EDUCATION_CYCLES.map(
    (c) => `
      <optgroup label="${escapeHtml(c.label)}">
        ${c.grades
          .map((g) => `<option value="${g}" ${g === selectedCode ? 'selected' : ''}>${g}</option>`)
          .join('')}
      </optgroup>
    `
  ).join('');
}

async function renderLearningAdminSection(bodyEl, notice = null) {
  const [subjects, lessons, langs] = await Promise.all([
    api.request('/api/v1/learning/subjects'),
    api.request('/api/v1/learning/lessons'),
    api.request('/api/v1/languages').catch(() => []),
  ]);

  const langOptions = langs.length
    ? langs
    : [
        { code: 'rw', name: 'KINYARWANDA', flag_emoji: '🇷🇼' },
        { code: 'fr', name: 'FRENCH (FRANÇAIS)', flag_emoji: '🇫🇷' },
        { code: 'sw', name: 'SWAHILI (KISWAHILI)', flag_emoji: '🇹🇿' },
        { code: 'en', name: 'ENGLISH', flag_emoji: '🇬🇧' },
      ];

  const filters = adminState.learningCenter;
  const lessonCount = lessons.filter((l) => (l.content_type || 'lesson') === 'lesson').length;
  const examCount = lessons.filter((l) => l.content_type === 'exam').length;
  const materineriCount = lessons.filter((l) => l.education_cycle === 'materineri').length;
  const primaryCount = lessons.filter((l) => l.education_cycle === 'primary').length;
  const secondaryCount = lessons.filter((l) => l.education_cycle === 'o_level' || l.education_cycle === 'high_school').length;

  const q = filters.search.trim().toLowerCase();
  const filteredItems = lessons.filter((l) => {
    const ctype = l.content_type || 'lesson';
    if (filters.tab !== 'all' && ctype !== filters.tab) return false;
    if (filters.cycle !== 'ALL' && l.education_cycle !== filters.cycle) return false;
    if (filters.grade !== 'ALL' && l.grade_level !== filters.grade) return false;
    if (filters.subjectId !== 'ALL' && String(l.subject_id) !== String(filters.subjectId)) return false;
    if (q) {
      const hay = `${l.title} ${l.description} ${l.content_body} ${l.subject_name} ${l.grade_level}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const activeCycleObj = EDUCATION_CYCLES.find((c) => c.id === filters.cycle);
  const visibleGrades = activeCycleObj ? activeCycleObj.grades : EDUCATION_CYCLES.flatMap((c) => c.grades);

  bodyEl.innerHTML = `
    <div class="gl-header">
      <div>
        <h2 style="margin:0">🧠 Learning Center — Amasomo &amp; Ibizamini (Materineri → S6 High School)</h2>
        <small style="color:var(--text-3)">Manage Lessons (Amasomo) and Exams (Ibizamini) separately across all levels from N1–N3, P1–P6, S1–S3, to S4–S6 High School.</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="lc-new-lesson-btn" class="btn-primary" type="button">+ New Lesson (Isomo)</button>
        <button id="lc-new-exam-btn" class="btn-success" type="button">+ New Exam (Ikizamini)</button>
      </div>
    </div>

    ${
      notice
        ? `<div class="gl-notice ${notice.type === 'error' ? 'gl-notice-error' : 'gl-notice-success'}">${escapeHtml(notice.text)}</div>`
        : ''
    }

    <div class="admin-kpi-grid">
      <div class="admin-kpi"><small>📚 Amasomo (Lessons)</small><div class="num" style="color:#38bdf8">${lessonCount}</div></div>
      <div class="admin-kpi"><small>📝 Ibizamini (Exams)</small><div class="num" style="color:#f59e0b">${examCount}</div></div>
      <div class="admin-kpi"><small>🌱 Materineri (N1–N3)</small><div class="num">${materineriCount}</div></div>
      <div class="admin-kpi"><small>🏫 Primary (P1–P6)</small><div class="num">${primaryCount}</div></div>
      <div class="admin-kpi"><small>🎓 Secondary (S1–S6)</small><div class="num" style="color:#4ade80">${secondaryCount}</div></div>
    </div>

    <!-- Create Lesson / Exam Form Panel -->
    <div id="lc-create-panel" class="admin-card" style="display:none;border:1px solid rgba(99,102,241,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 id="lc-create-heading" style="margin:0">📚 Create New Lesson (Isomo)</h3>
        <button id="lc-close-create-btn" class="btn-secondary" type="button">✕ Close</button>
      </div>
      <div class="form-grid">
        <label class="form-control">Type (Ubwoko)
          <select id="les-type">
            <option value="lesson">📚 Isomo (Lesson)</option>
            <option value="exam">📝 Ikizamini (Exam)</option>
          </select>
        </label>
        <label class="form-control">Grade Level (Umwaka: N1 → S6)
          <select id="les-grade">${buildGradeSelectOptions('P1')}</select>
        </label>
        <label class="form-control">Subject
          <select id="les-subj">
            ${subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.icon)} ${escapeHtml(s.name)}</option>`).join('')}
          </select>
        </label>
        <label class="form-control">Language
          <select id="les-lang">
            ${langOptions.map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.flag_emoji || '🌍')} ${escapeHtml(l.name)}</option>`).join('')}
          </select>
        </label>
        <label class="form-control">Difficulty
          <select id="les-diff">
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
        </label>
        <label class="form-control">Duration (Minutes)
          <input id="les-dur" type="number" min="1" max="240" value="15" />
        </label>
        <label class="form-control">Points Reward
          <input id="les-pts" type="number" min="5" max="500" value="15" />
        </label>
      </div>

      <label class="form-control" style="margin-top:8px">Title <input id="les-title" type="text" placeholder="e.g. Kubara Imibare cyangwa S6 Physics Term 1 Exam" /></label>
      <label class="form-control" style="margin-top:8px">Lesson Content / Exam Instructions <textarea id="les-body" rows="3" placeholder="Andika isomo cyangwa amabwiriza y'ikizamini..."></textarea></label>

      <!-- Dynamic Multi-Question Builder -->
      <div style="margin-top:12px;padding:12px;border-radius:12px;background:var(--surface-2);border:1px solid var(--line)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <strong>❓ Questions (Ibibazo — bihitamo ku isomo, bikenewe ku kizamini)</strong>
          <button id="lc-add-q-btn" class="btn-secondary" type="button">+ Add Question</button>
        </div>
        <div id="lc-questions-list" style="display:flex;flex-direction:column;gap:10px"></div>
      </div>

      <div style="margin-top:12px;display:flex;gap:8px">
        <button id="add-lesson-btn" class="btn-success" type="button">💾 Publish</button>
      </div>
    </div>

    <!-- Separate Tabs: All / Amasomo (Lessons) / Ibizamini (Exams) -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <button class="role-pill lc-tab-btn ${filters.tab === 'all' ? 'active' : ''}" data-tab="all" type="button">All (${lessons.length})</button>
      <button class="role-pill lc-tab-btn ${filters.tab === 'lesson' ? 'active' : ''}" data-tab="lesson" type="button">📚 Amasomo / Lessons (${lessonCount})</button>
      <button class="role-pill lc-tab-btn ${filters.tab === 'exam' ? 'active' : ''}" data-tab="exam" type="button">📝 Ibizamini / Exams (${examCount})</button>
    </div>

    <!-- Filter Bar (Cycle + Grade N1..S6 + Subject + Search) -->
    <div class="admin-card gl-filter-bar" style="grid-template-columns:minmax(180px,2fr) repeat(3,minmax(140px,1fr))">
      <input id="lc-search" type="search" value="${escapeHtml(filters.search)}" placeholder="🔍 Search lessons or exams..." />
      <select id="lc-filter-cycle" aria-label="Filter by education cycle">
        <option value="ALL" ${filters.cycle === 'ALL' ? 'selected' : ''}>All Levels (N1 → S6)</option>
        ${EDUCATION_CYCLES.map((c) => `<option value="${c.id}" ${filters.cycle === c.id ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('')}
      </select>
      <select id="lc-filter-grade" aria-label="Filter by grade">
        <option value="ALL" ${filters.grade === 'ALL' ? 'selected' : ''}>All Grades</option>
        ${visibleGrades.map((g) => `<option value="${g}" ${filters.grade === g ? 'selected' : ''}>${g}</option>`).join('')}
      </select>
      <select id="lc-filter-subj" aria-label="Filter by subject">
        <option value="ALL" ${filters.subjectId === 'ALL' ? 'selected' : ''}>All Subjects</option>
        ${subjects.map((s) => `<option value="${s.id}" ${String(filters.subjectId) === String(s.id) ? 'selected' : ''}>${escapeHtml(s.icon)} ${escapeHtml(s.name)}</option>`).join('')}
      </select>
    </div>

    <!-- List of Lessons & Exams -->
    ${
      filteredItems.length === 0
        ? `<div class="admin-card" style="text-align:center;padding:32px;color:var(--text-3)">No lessons or exams match these filters yet. Click <strong>+ New Lesson</strong> or <strong>+ New Exam</strong> above to create one!</div>`
        : `<div class="gl-grid">
            ${filteredItems
              .map((l) => {
                const isExam = l.content_type === 'exam';
                const qCount = (l.quizzes || []).reduce((acc, qz) => acc + (qz.questions?.length || 0), 0);
                return `
              <article class="gl-card">
                <div class="gl-card-top">
                  <div class="gl-cover-box"><span class="gl-cover-emoji">${isExam ? '📝' : escapeHtml(l.image_url || '📚')}</span></div>
                  <div class="gl-card-head">
                    <div class="gl-card-badges">
                      <span class="gl-status-badge ${isExam ? 'gl-status-draft' : 'gl-status-published'}">${isExam ? '📝 EXAM' : '📚 LESSON'}</span>
                      <span class="gl-engine-badge">${escapeHtml(l.grade_level || 'P1')}</span>
                      <span class="gl-ver-badge">${escapeHtml(String(l.language_code || 'rw').toUpperCase())}</span>
                    </div>
                    <h3 class="gl-card-title">${escapeHtml(l.title)}</h3>
                    <p class="gl-card-desc">${escapeHtml(l.content_body || l.description)}</p>
                  </div>
                </div>
                <div class="gl-meta-chips">
                  <span>🗂️ ${escapeHtml(l.subject_name)}</span>
                  <span>🎓 ${escapeHtml(l.education_cycle_label || l.grade_level)}</span>
                  <span>⏱️ ${l.duration_minutes || 15} min</span>
                  <span>❓ ${qCount} question(s)</span>
                  <span>⭐ +${l.points_reward} pts</span>
                </div>
                <div class="gl-card-actions">
                  <button class="btn-primary lc-edit-btn" data-lid="${l.id}" type="button">✏️ Edit</button>
                  <button class="btn-danger lc-delete-btn" data-lid="${l.id}" type="button">🗑️ Delete</button>
                </div>
              </article>
            `;
              })
              .join('')}
          </div>`
    }

    <!-- Edit Lesson/Exam Modal -->
    <div id="lc-edit-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal" role="dialog" aria-modal="true">
        <div class="gl-modal-header">
          <h3 id="lc-edit-title" style="margin:0">Edit Learning Item</h3>
          <button id="lc-edit-close" class="btn-secondary" type="button">✕ Close</button>
        </div>
        <form id="lc-edit-form" class="gl-modal-body">
          <div class="form-grid">
            <label class="form-control">Type
              <select name="content_type">
                <option value="lesson">📚 Isomo (Lesson)</option>
                <option value="exam">📝 Ikizamini (Exam)</option>
              </select>
            </label>
            <label class="form-control">Grade Level (N1 → S6)
              <select name="grade_level">${buildGradeSelectOptions('P1')}</select>
            </label>
            <label class="form-control">Subject
              <select name="subject_id">
                ${subjects.map((s) => `<option value="${s.id}">${escapeHtml(s.icon)} ${escapeHtml(s.name)}</option>`).join('')}
              </select>
            </label>
            <label class="form-control">Language
              <select name="language_code">
                ${langOptions.map((l) => `<option value="${escapeHtml(l.code)}">${escapeHtml(l.flag_emoji || '🌍')} ${escapeHtml(l.name)}</option>`).join('')}
              </select>
            </label>
            <label class="form-control">Duration (min) <input name="duration_minutes" type="number" min="1" max="240" /></label>
            <label class="form-control">Points <input name="points_reward" type="number" min="1" max="500" /></label>
          </div>
          <label class="form-control" style="margin-top:10px">Title <input name="title" required maxlength="200" /></label>
          <label class="form-control" style="margin-top:10px">Content / Instructions <textarea name="content_body" rows="3" required></textarea></label>
          <div class="gl-modal-footer">
            <span></span>
            <div style="display:flex;gap:8px">
              <button id="lc-edit-cancel" class="btn-secondary" type="button">Cancel</button>
              <button class="btn-primary" type="submit">💾 Save Changes</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  // Question builder helper
  const qListEl = bodyEl.querySelector('#lc-questions-list');
  function appendQuestionRow() {
    const idx = qListEl.children.length + 1;
    const row = document.createElement('div');
    row.className = 'vad-slot-box lc-q-row';
    row.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
        <strong>Question #${idx}</strong>
        <button type="button" class="btn-danger lc-rem-q" style="padding:2px 8px;font-size:0.74rem">✕ Remove</button>
      </div>
      <input class="lc-q-prompt" type="text" placeholder="Andika ikibazo (e.g. 12 × 3 = ?)" style="width:100%;margin-bottom:6px" />
      <div class="form-grid" style="margin-bottom:0">
        <input class="lc-q-opt" type="text" placeholder="Option A (Correct answer)" />
        <input class="lc-q-opt" type="text" placeholder="Option B" />
        <input class="lc-q-opt" type="text" placeholder="Option C" />
        <input class="lc-q-opt" type="text" placeholder="Option D (Optional)" />
      </div>
      <small style="color:var(--text-3);display:block;margin-top:4px">💡 Option A is saved as the correct answer (options are shuffled or shown to students).</small>
    `;
    row.querySelector('.lc-rem-q').addEventListener('click', () => row.remove());
    qListEl.appendChild(row);
  }
  appendQuestionRow();

  const createPanel = bodyEl.querySelector('#lc-create-panel');
  const typeSelect = bodyEl.querySelector('#les-type');
  const headingEl = bodyEl.querySelector('#lc-create-heading');

  function openCreatePanel(mode) {
    typeSelect.value = mode;
    headingEl.textContent = mode === 'exam' ? '📝 Create New Exam (Ikizamini)' : '📚 Create New Lesson (Isomo)';
    bodyEl.querySelector('#les-dur').value = mode === 'exam' ? '30' : '15';
    bodyEl.querySelector('#les-pts').value = mode === 'exam' ? '30' : '15';
    createPanel.style.display = 'block';
  }

  bodyEl.querySelector('#lc-new-lesson-btn').addEventListener('click', () => openCreatePanel('lesson'));
  bodyEl.querySelector('#lc-new-exam-btn').addEventListener('click', () => openCreatePanel('exam'));
  bodyEl.querySelector('#lc-close-create-btn').addEventListener('click', () => (createPanel.style.display = 'none'));
  typeSelect.addEventListener('change', () => {
    headingEl.textContent = typeSelect.value === 'exam' ? '📝 Create New Exam (Ikizamini)' : '📚 Create New Lesson (Isomo)';
  });
  bodyEl.querySelector('#lc-add-q-btn').addEventListener('click', appendQuestionRow);

  bodyEl.querySelector('#add-lesson-btn').addEventListener('click', async () => {
    const title = bodyEl.querySelector('#les-title').value.trim();
    if (!title) {
      window.alert('Please enter a title.');
      return;
    }
    const ctype = typeSelect.value;
    const questions = Array.from(qListEl.querySelectorAll('.lc-q-row'))
      .map((row) => {
        const prompt = row.querySelector('.lc-q-prompt').value.trim();
        const opts = Array.from(row.querySelectorAll('.lc-q-opt'))
          .map((i) => i.value.trim())
          .filter(Boolean);
        if (!prompt || opts.length < 2) return null;
        return { prompt, options: opts, correct_option: opts[0], points: 10 };
      })
      .filter(Boolean);

    if (ctype === 'exam' && questions.length === 0) {
      window.alert('An Exam needs at least 1 question with at least 2 options.');
      return;
    }

    try {
      await api.request('/api/v1/learning/lessons', {
        method: 'POST',
        body: JSON.stringify({
          subject_id: Number(bodyEl.querySelector('#les-subj').value),
          content_type: ctype,
          grade_level: bodyEl.querySelector('#les-grade').value,
          language_code: bodyEl.querySelector('#les-lang').value,
          difficulty: bodyEl.querySelector('#les-diff').value,
          duration_minutes: Math.max(1, Number(bodyEl.querySelector('#les-dur').value) || 15),
          points_reward: Math.max(5, Number(bodyEl.querySelector('#les-pts').value) || 15),
          title,
          description: title,
          content_body: bodyEl.querySelector('#les-body').value.trim() || title,
          image_url: ctype === 'exam' ? '📝' : '📚',
          quiz_questions: questions,
        }),
      });
      renderLearningAdminSection(bodyEl, {
        type: 'success',
        text: `✅ Published ${ctype === 'exam' ? 'Exam' : 'Lesson'} "${title}" (${bodyEl.querySelector('#les-grade').value})!`,
      });
    } catch (err) {
      window.alert(`Could not publish: ${err.message}`);
    }
  });

  // Filters & tabs
  bodyEl.querySelectorAll('.lc-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.tab = btn.dataset.tab;
      renderLearningAdminSection(bodyEl);
    });
  });
  let lcSearchTimer = null;
  bodyEl.querySelector('#lc-search').addEventListener('input', (e) => {
    filters.search = e.target.value;
    if (lcSearchTimer) clearTimeout(lcSearchTimer);
    lcSearchTimer = setTimeout(async () => {
      await renderLearningAdminSection(bodyEl);
      const next = bodyEl.querySelector('#lc-search');
      if (next) {
        next.focus();
        next.setSelectionRange(next.value.length, next.value.length);
      }
    }, 220);
  });
  bodyEl.querySelector('#lc-filter-cycle').addEventListener('change', (e) => {
    filters.cycle = e.target.value;
    filters.grade = 'ALL';
    renderLearningAdminSection(bodyEl);
  });
  bodyEl.querySelector('#lc-filter-grade').addEventListener('change', (e) => {
    filters.grade = e.target.value;
    renderLearningAdminSection(bodyEl);
  });
  bodyEl.querySelector('#lc-filter-subj').addEventListener('change', (e) => {
    filters.subjectId = e.target.value;
    renderLearningAdminSection(bodyEl);
  });

  // Edit & Delete
  let editingItem = null;
  const editBackdrop = bodyEl.querySelector('#lc-edit-backdrop');
  const editForm = bodyEl.querySelector('#lc-edit-form');
  const closeEdit = () => {
    editBackdrop.style.display = 'none';
    editingItem = null;
  };
  bodyEl.querySelector('#lc-edit-close').addEventListener('click', closeEdit);
  bodyEl.querySelector('#lc-edit-cancel').addEventListener('click', closeEdit);
  editBackdrop.addEventListener('click', (e) => {
    if (e.target === editBackdrop) closeEdit();
  });

  bodyEl.querySelectorAll('.lc-edit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = lessons.find((x) => x.id === Number(btn.dataset.lid));
      if (!item) return;
      editingItem = item;
      bodyEl.querySelector('#lc-edit-title').textContent = `Edit: ${item.title}`;
      editForm.elements.namedItem('content_type').value = item.content_type || 'lesson';
      editForm.elements.namedItem('grade_level').value = item.grade_level || 'P1';
      editForm.elements.namedItem('subject_id').value = String(item.subject_id);
      editForm.elements.namedItem('language_code').value = item.language_code || 'rw';
      editForm.elements.namedItem('duration_minutes').value = item.duration_minutes || 15;
      editForm.elements.namedItem('points_reward').value = item.points_reward || 10;
      editForm.elements.namedItem('title').value = item.title || '';
      editForm.elements.namedItem('content_body').value = item.content_body || '';
      editBackdrop.style.display = 'flex';
    });
  });

  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!editingItem) return;
    const fd = new FormData(editForm);
    try {
      await api.request(`/api/v1/learning/lessons/${editingItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          content_type: String(fd.get('content_type') || 'lesson'),
          grade_level: String(fd.get('grade_level') || 'P1'),
          subject_id: Number(fd.get('subject_id')),
          language_code: String(fd.get('language_code') || 'rw'),
          duration_minutes: Math.max(1, Number(fd.get('duration_minutes')) || 15),
          points_reward: Math.max(1, Number(fd.get('points_reward')) || 10),
          title: String(fd.get('title') || '').trim(),
          description: String(fd.get('title') || '').trim(),
          content_body: String(fd.get('content_body') || '').trim(),
        }),
      });
      closeEdit();
      renderLearningAdminSection(bodyEl, { type: 'success', text: '✅ Saved changes successfully.' });
    } catch (err) {
      window.alert(`Could not save: ${err.message}`);
    }
  });

  bodyEl.querySelectorAll('.lc-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = lessons.find((x) => x.id === Number(btn.dataset.lid));
      if (!item) return;
      if (!window.confirm(`Delete "${item.title}" permanently?`)) return;
      await api.request(`/api/v1/learning/lessons/${item.id}`, { method: 'DELETE' });
      renderLearningAdminSection(bodyEl, { type: 'success', text: `🗑️ Deleted "${item.title}".` });
    });
  });
}

async function renderAdminOverview(bodyEl) {
  const [ov, an] = await Promise.all([
    api.request('/api/v1/admin/overview'),
    api.request('/api/v1/analytics/overview'),
  ]);
  const s = an.summary || {};
  const ch = an.content_health || { games: {}, books: {}, videos: {} };
  const aud = an.audience_breakdown || { roles: {}, age_groups: {}, languages: [] };
  const lrn = an.learning_breakdown || { lessons: 0, exams: 0, cycles: {} };
  const saf = an.safety_and_moderation || {};
  const timeline = an.activity_timeline_7d || [];
  const topActions = an.top_actions || [];
  const topBooks = an.top_books || [];
  const topVideos = an.top_videos || [];
  const childBoard = an.child_leaderboard || [];
  const logs = ov.recent_activity_logs || [];

  const fmtTime = (secs) => {
    const n = Math.max(0, Math.round(Number(secs) || 0));
    if (n < 60) return `${n}s`;
    const m = Math.floor(n / 60);
    const r = n % 60;
    if (m < 60) return `${m}m ${r}s`;
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  };

  const maxDayCount = Math.max(1, ...timeline.map((d) => d.count || 0));
  const totalRoleUsers = Math.max(
    1,
    (aud.roles.SUPER_ADMIN || 0) + (aud.roles.CONTENT_ADMIN || 0) + (aud.roles.PARENT || 0) + (aud.roles.CHILD || 0)
  );
  const maxLangCount = Math.max(1, ...(aud.languages || []).map((l) => l.count || 0));
  const totalCycles = Math.max(
    1,
    (lrn.cycles.materineri || 0) + (lrn.cycles.primary || 0) + (lrn.cycles.o_level || 0) + (lrn.cycles.high_school || 0)
  );
  const maxActionCount = Math.max(1, ...topActions.map((a) => a.count || 0));

  const renderHealthBar = (label, icon, stats) => {
    const tot = Math.max(1, stats.total || 0);
    const pPct = Math.round(((stats.published || 0) / tot) * 100);
    const dPct = Math.round(((stats.draft || 0) / tot) * 100);
    const rPct = Math.round(((stats.review || 0) / tot) * 100);
    const aPct = Math.round(((stats.archived || 0) / tot) * 100);
    return `
      <div class="an-health-row">
        <div class="an-health-meta">
          <strong>${icon} ${label} (${stats.total || 0})</strong>
          <small>✅ ${stats.published || 0} Live • 📝 ${stats.draft || 0} Draft • 📋 ${stats.review || 0} Review • 📦 ${stats.archived || 0} Archived</small>
        </div>
        <div class="an-stacked-track">
          <div class="an-seg-pub" style="width:${pPct}%" title="Published: ${stats.published || 0}"></div>
          <div class="an-seg-draft" style="width:${dPct}%" title="Draft: ${stats.draft || 0}"></div>
          <div class="an-seg-rev" style="width:${rPct}%" title="Review: ${stats.review || 0}"></div>
          <div class="an-seg-arch" style="width:${aPct}%" title="Archived: ${stats.archived || 0}"></div>
        </div>
      </div>
    `;
  };

  const renderHBar = (label, value, maxVal, color) => {
    const pct = Math.min(100, Math.round((value / Math.max(1, maxVal)) * 100));
    return `
      <div class="an-hbar-row">
        <div class="an-hbar-labels">
          <span>${escapeHtml(label)}</span>
          <strong>${value}</strong>
        </div>
        <div class="an-hbar-track">
          <div class="an-hbar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>
    `;
  };

  bodyEl.innerHTML = `
    <div class="gl-header">
      <div>
        <h2 style="margin:0">📈 Reports &amp; System-Wide Analytics</h2>
        <small style="color:var(--text-3)">Real-time view of platform health, engagement, games, books, videos, learning (N1–S6), safety &amp; audit activity.</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="an-refresh-btn" class="btn-secondary" type="button">🔄 Refresh Live</button>
        <button id="an-export-csv-btn" class="btn-primary" type="button">📥 Export CSV Report</button>
        <button id="an-print-btn" class="btn-secondary" type="button">🖨️ Print</button>
      </div>
    </div>

    <!-- Executive KPI Grid -->
    <div class="admin-kpi-grid">
      <div class="admin-kpi"><small>🟢 Children Online Now</small><div class="num" style="color:#4ade80">${s.online_children_now || 0} <span style="font-size:0.85rem;color:var(--text-3)">/ ${s.total_children || 0}</span></div></div>
      <div class="admin-kpi"><small>🎮 Game Plays (${s.game_completion_rate_pct || 0}% Done)</small><div class="num" style="color:#38bdf8">${s.total_game_plays || 0}</div></div>
      <div class="admin-kpi"><small>📺 Active Video Watch</small><div class="num" style="color:#a78bfa">${fmtTime(s.total_active_watch_seconds)}</div></div>
      <div class="admin-kpi"><small>📖 Book Reads (${s.completed_book_reads || 0} Finished)</small><div class="num" style="color:#fbbf24">${s.total_book_reads || 0}</div></div>
      <div class="admin-kpi"><small>🧠 Learning (N1–S6)</small><div class="num">${s.total_lessons || 0}L · ${s.total_exams || 0}E</div></div>
      <div class="admin-kpi"><small>⭐ Total Stars Earned</small><div class="num" style="color:#facc15">${s.total_stars_earned || 0}</div></div>
      <div class="admin-kpi"><small>📢 Videos with Ads</small><div class="num" style="color:#fb923c">${s.videos_with_ads || 0} <span style="font-size:0.85rem;color:var(--text-3)">/ ${s.total_videos || 0}</span></div></div>
      <div class="admin-kpi"><small>🛡️ Safety &amp; Moderation</small><div class="num" style="color:${(s.suspended_accounts || 0) > 0 ? '#fda4af' : '#4ade80'}">${s.suspended_accounts || 0}⛔ · ${s.total_warnings || 0}⚠️</div></div>
    </div>

    <!-- Visual Charts Row 1: 7-Day Activity + Content Health -->
    <div class="an-grid-2">
      <div class="admin-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0">📊 7-Day System Activity</h3>
          <small style="color:var(--text-3)">Events logged per day</small>
        </div>
        <div class="an-bar-chart">
          ${timeline
            .map((d) => {
              const hPct = Math.max(6, Math.round(((d.count || 0) / maxDayCount) * 100));
              return `
              <div class="an-bar-col" title="${d.date}: ${d.count} events">
                <span class="an-bar-val">${d.count}</span>
                <div class="an-bar-wrap">
                  <div class="an-bar-fill" style="height:${hPct}%"></div>
                </div>
                <span class="an-bar-lbl">${escapeHtml(d.label)}</span>
              </div>
            `;
            })
            .join('')}
        </div>
      </div>

      <div class="admin-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0">📚 Content Publishing Health</h3>
          <small style="color:var(--text-3)">Published vs Draft / Review / Archived</small>
        </div>
        ${renderHealthBar('Games', '🎮', ch.games || {})}
        ${renderHealthBar('Storybooks', '📖', ch.books || {})}
        ${renderHealthBar('Videos', '📺', ch.videos || {})}
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:12px;font-size:0.78rem;color:var(--text-3)">
          <span>⏱️ Avg Game Session: <strong style="color:var(--text)">${fmtTime(s.avg_game_session_seconds)}</strong></span>
          <span>🏆 Top Verified Score: <strong style="color:var(--text)">${s.highest_score || 0}</strong></span>
          <span>👁️ Total Video Views: <strong style="color:var(--text)">${s.total_video_views || 0}</strong></span>
        </div>
      </div>
    </div>

    <!-- Visual Charts Row 2: Audience, Languages, Learning Cycles -->
    <div class="an-grid-3">
      <div class="admin-card">
        <h3 style="margin-top:0">👥 Audience by Role</h3>
        ${renderHBar('🛡️ Super Admins', aud.roles.SUPER_ADMIN || 0, totalRoleUsers, '#6366f1')}
        ${renderHBar('🎨 Creators', aud.roles.CONTENT_ADMIN || 0, totalRoleUsers, '#38bdf8')}
        ${renderHBar('👨‍👩‍👧 Parents', aud.roles.PARENT || 0, totalRoleUsers, '#22c55e')}
        ${renderHBar('🧒 Children', aud.roles.CHILD || 0, totalRoleUsers, '#f59e0b')}
        <div style="margin-top:10px;font-size:0.78rem;color:var(--text-3)">
          Age Groups: 3–5 (<strong>${aud.age_groups['3-5'] || 0}</strong>) • 6–8 (<strong>${aud.age_groups['6-8'] || 0}</strong>) • 9–12 (<strong>${aud.age_groups['9-12'] || 0}</strong>)
        </div>
      </div>

      <div class="admin-card">
        <h3 style="margin-top:0">🌍 Content by Language</h3>
        ${
          (aud.languages || []).length
            ? aud.languages.map((l) => renderHBar(l.code, l.count, maxLangCount, '#14b8a6')).join('')
            : '<small style="color:var(--text-3)">No language data yet.</small>'
        }
      </div>

      <div class="admin-card">
        <h3 style="margin-top:0">🎓 Learning Center (N1 → S6)</h3>
        ${renderHBar('🌱 Materineri (N1–N3)', lrn.cycles.materineri || 0, totalCycles, '#22c55e')}
        ${renderHBar('🏫 Primary (P1–P6)', lrn.cycles.primary || 0, totalCycles, '#38bdf8')}
        ${renderHBar('📘 O-Level (S1–S3)', lrn.cycles.o_level || 0, totalCycles, '#a78bfa')}
        ${renderHBar('🎓 High School (S4–S6)', lrn.cycles.high_school || 0, totalCycles, '#f59e0b')}
        <div style="margin-top:10px;font-size:0.78rem;color:var(--text-3)">
          📚 Lessons: <strong>${lrn.lessons || 0}</strong> • 📝 Exams: <strong>${lrn.exams || 0}</strong>
        </div>
      </div>
    </div>

    <!-- Row 3: Top System Actions + Safety & Moderation Health -->
    <div class="an-grid-2">
      <div class="admin-card">
        <h3 style="margin-top:0">⚡ Top System Actions (Last 7 Days)</h3>
        ${
          topActions.length
            ? topActions.map((a) => renderHBar(a.action, a.count, maxActionCount, '#818cf8')).join('')
            : '<small style="color:var(--text-3)">No actions logged in the last 7 days.</small>'
        }
      </div>

      <div class="admin-card">
        <h3 style="margin-top:0">🛡️ Safety, Discipline &amp; Screen-Time Health</h3>
        <div class="an-safety-grid">
          <div class="an-safety-pill"><span>⚖️ Active Rules</span><strong>${saf.active_rules || 0}</strong></div>
          <div class="an-safety-pill"><span>⚠️ Total Warnings</span><strong>${saf.total_warnings || 0}</strong></div>
          <div class="an-safety-pill"><span>⛔ Suspended Users</span><strong>${saf.suspended_users || 0}</strong></div>
          <div class="an-safety-pill"><span>⛔ Suspended Children</span><strong>${saf.suspended_children || 0}</strong></div>
          <div class="an-safety-pill"><span>🔔 Unread Alerts</span><strong>${saf.unread_notifications || 0}</strong></div>
          <div class="an-safety-pill"><span>⏱️ At Daily Screen Limit</span><strong>${saf.children_at_screen_limit || 0}</strong></div>
        </div>
      </div>
    </div>

    <!-- Row 4: Top Games Leaderboard -->
    <div class="admin-card">
      <h3 style="margin-top:0">🎮 Games Performance &amp; Popularity Leaderboard</h3>
      <table class="admin-table">
        <thead><tr><th>Game Title</th><th>Category</th><th>Engine</th><th>Status</th><th>Plays</th><th>Completion</th><th>Time Spent</th><th>Highest Score</th></tr></thead>
        <tbody>
          ${(an.popular_games || [])
            .map(
              (g) => `
            <tr>
              <td><strong>${escapeHtml(g.title)}</strong></td>
              <td>${escapeHtml(g.category_name || '')}</td>
              <td><code>${escapeHtml(g.engine)}</code></td>
              <td>${escapeHtml(g.status)}</td>
              <td><strong>${g.plays}</strong></td>
              <td>${g.completion_rate || 0}% (${g.completed_sessions})</td>
              <td>${fmtTime(g.time_spent_seconds)}</td>
              <td><strong>${g.highest_score}</strong></td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Row 5: Top Books & Top Videos -->
    <div class="an-grid-2">
      <div class="admin-card">
        <h3 style="margin-top:0">📖 Top Storybooks</h3>
        <table class="admin-table">
          <thead><tr><th>Book</th><th>Lang</th><th>Pages</th><th>Reads</th><th>Finished</th></tr></thead>
          <tbody>
            ${topBooks
              .map(
                (b) => `
              <tr>
                <td><strong>${escapeHtml(b.title)}</strong></td>
                <td><code>${escapeHtml(String(b.language_code || '').toUpperCase())}</code></td>
                <td>${b.page_count}</td>
                <td><strong>${b.read_count}</strong></td>
                <td>${b.completed_reads}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>

      <div class="admin-card">
        <h3 style="margin-top:0">📺 Top Videos &amp; Watch Time</h3>
        <table class="admin-table">
          <thead><tr><th>Video</th><th>Provider</th><th>Views</th><th>Active Watch</th><th>Ads</th></tr></thead>
          <tbody>
            ${topVideos
              .map(
                (v) => `
              <tr>
                <td><strong>${escapeHtml(v.title)}</strong></td>
                <td><code>${escapeHtml(String(v.provider || '').toUpperCase())}</code></td>
                <td><strong>${v.view_count}</strong></td>
                <td>${fmtTime(v.active_watch_seconds)}</td>
                <td>${v.has_ads ? '📢 ON' : '—'}</td>
              </tr>
            `
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Row 6: Top Learners & Screen-Time Health -->
    <div class="admin-card">
      <h3 style="margin-top:0">🏆 Top Learners &amp; Daily Screen-Time Usage</h3>
      <table class="admin-table">
        <thead><tr><th>Child</th><th>Age</th><th>Status &amp; Activity</th><th>Stars / Level</th><th>Daily Screen Time</th></tr></thead>
        <tbody>
          ${childBoard
            .map((c) => {
              const pct = Math.min(100, Math.round(((c.used_today_minutes || 0) / Math.max(1, c.daily_limit_minutes || 60)) * 100));
              return `
            <tr>
              <td>${escapeHtml(c.avatar)} <strong>${escapeHtml(c.display_name)}</strong></td>
              <td>${escapeHtml(c.age_group)}</td>
              <td>${c.is_suspended ? '⛔ Suspended' : c.is_online ? `🟢 ${escapeHtml(c.current_activity)}` : `⚫ ${escapeHtml(c.current_activity)}`}</td>
              <td>⭐ <strong>${c.total_stars}</strong> (Lvl ${c.current_level})</td>
              <td style="min-width:160px">
                <div style="font-size:0.78rem;margin-bottom:3px">${c.used_today_minutes} / ${c.daily_limit_minutes} min (${pct}%)</div>
                <div class="an-hbar-track"><div class="an-hbar-fill" style="width:${pct}%;background:${pct >= 90 ? '#f43f5e' : '#38bdf8'}"></div></div>
              </td>
            </tr>
          `;
            })
            .join('')}
        </tbody>
      </table>
    </div>

    <!-- Row 7: Searchable Security & Activity Audit Logs -->
    <div class="admin-card">
      <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px">
        <h3 style="margin:0">🛡️ Security &amp; System Activity Audit Logs (${logs.length})</h3>
        <input id="an-log-search" type="search" placeholder="🔍 Filter audit logs by action or summary..." style="padding:7px 12px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);min-width:240px" />
      </div>
      <table class="admin-table">
        <thead><tr><th>Action</th><th>Resource</th><th>Summary</th><th>Timestamp</th></tr></thead>
        <tbody id="an-audit-tbody">
          ${logs
            .map(
              (lg) => `
            <tr data-logtext="${escapeHtml(`${lg.action_type} ${lg.resource_type} ${lg.summary}`.toLowerCase())}">
              <td><code>${escapeHtml(lg.action_type)}</code></td>
              <td>${escapeHtml(lg.resource_type)} #${escapeHtml(lg.resource_id || '')}</td>
              <td>${escapeHtml(lg.summary)}</td>
              <td>${lg.created_at ? new Date(lg.created_at).toLocaleString() : ''}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    </div>
  `;

  bodyEl.querySelector('#an-refresh-btn').addEventListener('click', () => renderAdminOverview(bodyEl));
  bodyEl.querySelector('#an-print-btn').addEventListener('click', () => window.print());

  // Export CSV Report
  bodyEl.querySelector('#an-export-csv-btn').addEventListener('click', () => {
    const csvRows = [
      ['Section', 'Metric / Item', 'Value 1', 'Value 2', 'Value 3'],
      ['Summary', 'Total Users', s.total_users, 'Children', s.total_children],
      ['Summary', 'Online Children Now', s.online_children_now, 'Suspended Accounts', s.suspended_accounts],
      ['Summary', 'Total Games', s.total_games, 'Total Plays', s.total_game_plays],
      ['Summary', 'Game Completion Rate %', s.game_completion_rate_pct, 'Highest Score', s.highest_score],
      ['Summary', 'Total Storybooks', s.total_storybooks, 'Book Reads', s.total_book_reads],
      ['Summary', 'Total Videos', s.total_videos, 'Active Watch Seconds', s.total_active_watch_seconds],
      ['Summary', 'Lessons & Exams', s.total_lessons, 'Exams', s.total_exams],
      ['Summary', 'Total Stars Earned', s.total_stars_earned, 'Total Warnings', s.total_warnings],
      ...((an.popular_games || []).map((g) => ['Game', g.title, `Plays: ${g.plays}`, `Top Score: ${g.highest_score}`, g.status])),
      ...(topBooks.map((b) => ['Book', b.title, `Reads: ${b.read_count}`, `Finished: ${b.completed_reads}`, b.language_code])),
      ...(topVideos.map((v) => ['Video', v.title, `Views: ${v.view_count}`, `Watch(s): ${v.active_watch_seconds}`, v.provider])),
    ];
    const csvText = csvRows
      .map((row) => row.map((cell) => `"${String(cell ?? '').replaceAll('"', '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitego-analytics-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Live audit log filter
  const logSearch = bodyEl.querySelector('#an-log-search');
  logSearch.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    bodyEl.querySelectorAll('#an-audit-tbody tr').forEach((tr) => {
      tr.style.display = !q || (tr.dataset.logtext || '').includes(q) ? '' : 'none';
    });
  });
}

let adminUsersLiveTimer = null;

function stopAdminUsersLiveRefresh() {
  if (adminUsersLiveTimer) {
    clearInterval(adminUsersLiveTimer);
    adminUsersLiveTimer = null;
  }
}

function generateStrongPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$';
  let out = 'Gt';
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out + '9!';
}

async function renderUsersAdminSection(bodyEl, notice = null) {
  let cp = null;
  try {
    cp = await api.request('/api/v1/users/control-panel');
  } catch (err) {
    bodyEl.innerHTML = `<div class="admin-card">Full User Control Panel requires <strong>SUPER_ADMIN</strong> role. (${escapeHtml(err.message)})</div>`;
    return;
  }

  const s = cp.summary;
  const users = cp.users || [];
  const children = cp.children || [];
  const rules = cp.rules || [];
  const tab = adminState.usersPanel.tab || 'admins';
  const q = (adminState.usersPanel.search || '').trim().toLowerCase();

  const matchSearch = (text) => !q || String(text || '').toLowerCase().includes(q);
  const adminsList = users.filter((u) => u.role === 'SUPER_ADMIN' && matchSearch(`${u.full_name} ${u.username} ${u.email} ${u.current_activity}`));
  const creatorsList = users.filter((u) => u.role === 'CONTENT_ADMIN' && matchSearch(`${u.full_name} ${u.username} ${u.email} ${u.current_activity}`));
  const parentsList = users.filter((u) => u.role === 'PARENT' && matchSearch(`${u.full_name} ${u.username} ${u.email} ${u.parent_profile?.phone_number || ''} ${u.current_activity}`));
  const childrenList = children.filter((c) => matchSearch(`${c.label} ${c.parent_name} ${c.parent_email} ${c.current_activity} ${c.age_group}`));

  const renderUserStatusBadge = (u) => {
    if (u.is_suspended) {
      const untilTxt = u.suspended_until ? ` until ${new Date(u.suspended_until).toLocaleString()}` : ' (Indefinite)';
      return `<span class="gl-status-badge" style="background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.45);color:#fda4af">⛔ Suspended${escapeHtml(untilTxt)}</span>`;
    }
    if (!u.is_active) {
      return `<span class="gl-status-badge gl-status-archived">Disabled</span>`;
    }
    return `<span class="gl-status-badge gl-status-published">✅ Active</span>`;
  };

  const renderUserCard = (u) => `
    <article class="gl-card">
      <div class="gl-card-top">
        <div class="gl-cover-box"><span class="gl-cover-emoji">${u.role === 'SUPER_ADMIN' ? '🛡️' : u.role === 'CONTENT_ADMIN' ? '🎨' : '👨‍👩‍👧'}</span></div>
        <div class="gl-card-head">
          <div class="gl-card-badges">
            ${renderUserStatusBadge(u)}
            <span class="gl-engine-badge">${escapeHtml(u.role)}</span>
            ${u.warning_count > 0 ? `<span class="gl-status-badge gl-status-draft">⚠️ ${u.warning_count} Warning(s)</span>` : ''}
          </div>
          <h3 class="gl-card-title">${escapeHtml(u.full_name)} <small style="color:var(--text-3);font-weight:600">(@${escapeHtml(u.username)})</small></h3>
          <p class="gl-card-desc">${escapeHtml(u.email)} ${u.parent_profile?.phone_number ? `• 📞 ${escapeHtml(u.parent_profile.phone_number)}` : ''}</p>
        </div>
      </div>

      <div class="gl-meta-chips">
        <span>${u.is_online ? `🟢 Live: ${escapeHtml(u.current_activity || 'Online')}` : `⚫ Offline · Last: ${escapeHtml(u.current_activity || 'Idle')}`}</span>
        <span>📜 ${escapeHtml(u.last_action || 'No actions yet')}</span>
        <span>📊 ${u.stats.activity_count} actions</span>
        ${u.role !== 'PARENT' ? `<span>🎮 ${u.stats.games_created} games • 📖 ${u.stats.books_created} books</span>` : ''}
        ${u.role === 'PARENT' ? `<span>🧒 ${(u.children || []).length} Child account(s)</span>` : ''}
      </div>

      ${
        u.is_suspended && u.suspension_reason
          ? `<div style="font-size:0.8rem;color:#fda4af;background:rgba(244,63,94,0.08);border:1px solid rgba(244,63,94,0.28);padding:8px 10px;border-radius:10px">
               ⛔ Reason: ${escapeHtml(u.suspension_reason)}
             </div>`
          : ''
      }

      ${
        u.role === 'PARENT' && u.children && u.children.length
          ? `<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:8px">
               <strong style="font-size:0.78rem;color:var(--text-3)">🧒 Children Accounts (Amazina, Code &amp; Ibyo Bakora):</strong>
               ${u.children
                 .map(
                   (ch) => `
                 <div style="display:flex;flex-direction:column;gap:4px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.05)">
                   <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;font-size:0.82rem">
                     <span>${escapeHtml(ch.avatar)} <strong>${escapeHtml(ch.display_name || ch.label)}</strong> (Ages ${escapeHtml(ch.age_group)}) • 🔑 <code>${escapeHtml(ch.pin_code)}</code> • ⭐ ${ch.total_stars}</span>
                     <span>${ch.is_suspended ? '⛔ Suspended' : ch.is_online ? `🟢 ${escapeHtml(ch.current_activity)}` : `⚫ ${escapeHtml(ch.current_activity)}`}</span>
                   </div>
                   <div style="display:flex;gap:6px;flex-wrap:wrap">
                     <button class="btn-secondary ucp-impersonate-child-btn" data-cid="${ch.id}" style="padding:3px 8px;font-size:0.72rem" type="button">🚀 Login as ${escapeHtml(ch.display_name || 'Child')}</button>
                     <button class="btn-secondary ucp-child-resetpin-btn" data-cid="${ch.id}" data-cname="${escapeHtml(ch.display_name || ch.label)}" data-cpin="${escapeHtml(ch.pin_code || '')}" style="padding:3px 8px;font-size:0.72rem" type="button">🔑 Reset PIN</button>
                   </div>
                 </div>
               `
                 )
                 .join('')}
             </div>`
          : ''
      }

      <div class="gl-card-actions">
        <button class="btn-primary ucp-inspect-btn" data-uid="${u.id}" type="button">👁️ Details &amp; Activity</button>
        <button class="btn-secondary ucp-impersonate-user-btn" data-uid="${u.id}" type="button">🚀 Login As</button>
        <button class="btn-secondary ucp-notify-btn" data-uid="${u.id}" type="button">📢 Alert / Warning</button>
        <button class="btn-secondary ucp-resetpw-btn" data-uid="${u.id}" type="button">🔐 Set Password</button>
        ${
          u.is_suspended
            ? `<button class="btn-success ucp-unsuspend-btn" data-uid="${u.id}" type="button">▶️ Restore</button>`
            : `<button class="btn-warning ucp-suspend-btn" data-uid="${u.id}" type="button">⏸️ Suspend</button>`
        }
        <button class="btn-danger ucp-delete-btn" data-uid="${u.id}" type="button">🗑️ Delete</button>
      </div>
    </article>
  `;

  bodyEl.innerHTML = `
    <div class="gl-header">
      <div>
        <h2 style="margin:0">👥 Super Admin Users &amp; Discipline Control Panel</h2>
        <small style="color:var(--text-3)">Monitor Admins, Creators, Parents &amp; Children — inspect live activity, manage passwords, send alerts/warnings, enforce rules, suspend, or delete accounts.</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="ucp-refresh-live-btn" class="btn-secondary" type="button">🔄 Refresh Live</button>
        <button id="ucp-toggle-create-btn" class="btn-primary" type="button">+ Create User Account</button>
      </div>
    </div>

    ${
      notice
        ? `<div class="gl-notice ${notice.type === 'error' ? 'gl-notice-error' : 'gl-notice-success'}">${escapeHtml(notice.text)}</div>`
        : ''
    }

    <div class="admin-kpi-grid">
      <div class="admin-kpi"><small>🛡️ Admins</small><div class="num">${s.admins}</div></div>
      <div class="admin-kpi"><small>🎨 Creators</small><div class="num" style="color:#38bdf8">${s.creators}</div></div>
      <div class="admin-kpi"><small>👨‍👩‍👧 Parents</small><div class="num" style="color:#4ade80">${s.parents}</div></div>
      <div class="admin-kpi"><small>🧒 Children</small><div class="num">${s.children}</div></div>
      <div class="admin-kpi"><small>⛔ Suspended</small><div class="num" style="color:#fda4af">${s.suspended_accounts}</div></div>
      <div class="admin-kpi"><small>⚠️ Warnings</small><div class="num" style="color:#fbbf24">${s.total_warnings}</div></div>
    </div>

    <!-- Create User Panel -->
    <div id="ucp-create-panel" class="admin-card" style="display:none;border:1px solid rgba(99,102,241,0.45)">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <h3 style="margin:0">+ Create New Admin / Creator / Parent Account</h3>
        <button id="ucp-close-create-btn" class="btn-secondary" type="button">✕ Close</button>
      </div>
      <div class="form-grid">
        <label class="form-control">Full Name <input id="ucp-new-name" type="text" placeholder="e.g. Jean Paul" /></label>
        <label class="form-control">Username <input id="ucp-new-user" type="text" placeholder="e.g. jeanpaul" /></label>
        <label class="form-control">Email <input id="ucp-new-email" type="email" placeholder="jean@gitego.kids" /></label>
        <label class="form-control">Role
          <select id="ucp-new-role">
            <option value="CONTENT_ADMIN">🎨 Creator (CONTENT_ADMIN)</option>
            <option value="SUPER_ADMIN">🛡️ Super Admin (SUPER_ADMIN)</option>
            <option value="PARENT">👨‍👩‍👧 Parent (PARENT)</option>
          </select>
        </label>
        <label class="form-control">Password (Visible)
          <div style="display:flex;gap:6px">
            <input id="ucp-new-pass" type="text" value="${generateStrongPassword()}" style="flex:1;font-family:var(--font-mono)" />
            <button id="ucp-gen-pass-btn" class="btn-secondary" type="button" title="Generate password">🎲</button>
          </div>
        </label>
      </div>
      <button id="ucp-submit-create-btn" class="btn-success" type="button">💾 Create Account</button>
    </div>

    <!-- Role & Discipline Tabs + Search -->
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:10px;margin-bottom:14px">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="role-pill ucp-tab-btn ${tab === 'admins' ? 'active' : ''}" data-tab="admins" type="button">🛡️ Admins (${s.admins})</button>
        <button class="role-pill ucp-tab-btn ${tab === 'creators' ? 'active' : ''}" data-tab="creators" type="button">🎨 Creators (${s.creators})</button>
        <button class="role-pill ucp-tab-btn ${tab === 'parents' ? 'active' : ''}" data-tab="parents" type="button">👨‍👩‍👧 Parents (${s.parents})</button>
        <button class="role-pill ucp-tab-btn ${tab === 'children' ? 'active' : ''}" data-tab="children" type="button">🧒 Children (${s.children})</button>
        <button class="role-pill ucp-tab-btn ${tab === 'rules' ? 'active' : ''}" data-tab="rules" type="button">⚖️ Rules &amp; Discipline (${s.active_rules})</button>
      </div>
      ${tab !== 'rules' ? `<input id="ucp-search" type="search" value="${escapeHtml(adminState.usersPanel.search)}" placeholder="🔍 Search users or activity..." style="padding:8px 12px;border-radius:10px;border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);min-width:220px" />` : ''}
    </div>

    <!-- Tab Body -->
    ${
      tab === 'admins'
        ? `<div class="gl-grid">${adminsList.map(renderUserCard).join('') || '<div class="admin-card">No admins found.</div>'}</div>`
        : tab === 'creators'
          ? `<div class="gl-grid">${creatorsList.map(renderUserCard).join('') || '<div class="admin-card">No creators found.</div>'}</div>`
          : tab === 'parents'
            ? `<div class="gl-grid">${parentsList.map(renderUserCard).join('') || '<div class="admin-card">No parents found.</div>'}</div>`
            : tab === 'children'
              ? `
                <div class="admin-card" style="margin-bottom:12px">
                  <small style="color:var(--text-3)">🧒 Super Admin Support Controls: view child names, access PINs, recent activity, reset PINs, login as a child to assist them, suspend, or remove accounts.</small>
                </div>
                <div class="gl-grid">
                  ${childrenList
                    .map(
                      (c) => `
                    <article class="gl-card">
                      <div class="gl-card-top">
                        <div class="gl-cover-box"><span class="gl-cover-emoji">${escapeHtml(c.avatar || '🧒')}</span></div>
                        <div class="gl-card-head">
                          <div class="gl-card-badges">
                            ${
                              c.is_suspended
                                ? `<span class="gl-status-badge" style="background:rgba(244,63,94,0.2);border:1px solid rgba(244,63,94,0.45);color:#fda4af">⛔ Suspended</span>`
                                : c.is_online
                                  ? `<span class="gl-status-badge gl-status-published">🟢 Online</span>`
                                  : `<span class="gl-status-badge gl-status-archived">⚫ Offline</span>`
                            }
                            <span class="gl-engine-badge">Ages ${escapeHtml(c.age_group)}</span>
                            <span class="gl-ver-badge">🔑 PIN: ${escapeHtml(c.pin_code)}</span>
                          </div>
                          <h3 class="gl-card-title">${escapeHtml(c.display_name || c.label)}</h3>
                          <p class="gl-card-desc">Parent: <strong>${escapeHtml(c.parent_name)}</strong> (@${escapeHtml(c.parent_username || '')} · ${escapeHtml(c.parent_email)})</p>
                        </div>
                      </div>
                      <div class="gl-meta-chips">
                        <span>⚡ ${escapeHtml(c.current_activity)}</span>
                        <span>⭐ ${c.total_stars} stars (Lvl ${c.current_level})</span>
                        <span>⏱️ ${c.used_today_minutes}/${c.daily_limit_minutes}m today</span>
                        <span>🌍 ${escapeHtml(String(c.preferred_language || 'rw').toUpperCase())}</span>
                      </div>
                      ${
                        c.recent_activities && c.recent_activities.length
                          ? `<div style="background:var(--surface-2);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font-size:0.78rem">
                               <strong style="color:var(--text-3);display:block;margin-bottom:4px">📜 Ibyo yakoze (Recent Activity):</strong>
                               ${c.recent_activities
                                 .slice(0, 3)
                                 .map((a) => `<div style="margin-bottom:2px">• ${escapeHtml(a.summary)}</div>`)
                                 .join('')}
                             </div>`
                          : ''
                      }
                      ${c.is_suspended && c.suspension_reason ? `<div style="font-size:0.8rem;color:#fda4af">⛔ ${escapeHtml(c.suspension_reason)}</div>` : ''}
                      <div class="gl-card-actions">
                        <button class="btn-primary ucp-impersonate-child-btn" data-cid="${c.id}" type="button">🚀 Login As</button>
                        <button class="btn-secondary ucp-child-resetpin-btn" data-cid="${c.id}" data-cname="${escapeHtml(c.display_name || c.label)}" data-cpin="${escapeHtml(c.pin_code || '')}" type="button">🔑 Reset PIN</button>
                        ${
                          c.is_suspended
                            ? `<button class="btn-success ucp-child-unsuspend-btn" data-cid="${c.id}" type="button">▶️ Restore</button>`
                            : `<button class="btn-warning ucp-child-suspend-btn" data-cid="${c.id}" type="button">⏸️ Suspend</button>`
                        }
                        <button class="btn-danger ucp-child-delete-btn" data-cid="${c.id}" type="button">🗑️ Delete</button>
                      </div>
                    </article>
                  `
                    )
                    .join('') || '<div class="admin-card">No child accounts found.</div>'}
                </div>
              `
              : `
                <!-- Rules & Discipline Tab -->
                <div class="admin-card">
                  <h3 style="margin-top:0">⚖️ Add New Platform Rule</h3>
                  <p style="color:var(--text-3);font-size:0.85rem;margin-top:0">Users who receive 3 official warnings are automatically suspended for 24 hours. You can also suspend or delete accounts immediately for severe violations.</p>
                  <div class="form-grid">
                    <label class="form-control">Rule Code <input id="rule-code" type="text" placeholder="e.g. NO_HARASSMENT" /></label>
                    <label class="form-control">Rule Title <input id="rule-title" type="text" placeholder="e.g. Respectful Behavior Policy" /></label>
                    <label class="form-control">Severity
                      <select id="rule-sev">
                        <option value="low">Low</option>
                        <option value="medium" selected>Medium</option>
                        <option value="high">High</option>
                        <option value="critical">Critical</option>
                      </select>
                    </label>
                    <label class="form-control">Default Punishment
                      <select id="rule-act">
                        <option value="warning">⚠️ Official Warning</option>
                        <option value="suspend_24h">⏸️ Suspend 24 Hours</option>
                        <option value="suspend_7d">⏸️ Suspend 7 Days</option>
                        <option value="suspend_30d">⏸️ Suspend 30 Days</option>
                        <option value="delete">🗑️ Permanent Account Deletion</option>
                      </select>
                    </label>
                  </div>
                  <label class="form-control" style="margin-bottom:10px">Rule Description <input id="rule-desc" type="text" placeholder="Explain clearly what is prohibited and the consequences..." /></label>
                  <button id="ucp-add-rule-btn" class="btn-success" type="button">+ Add Platform Rule</button>
                </div>

                <div class="admin-card">
                  <h3 style="margin-top:0">📋 Active Platform Rules (${rules.length})</h3>
                  <table class="admin-table">
                    <thead><tr><th>Code</th><th>Rule Title &amp; Description</th><th>Severity</th><th>Default Punishment</th><th>Action</th></tr></thead>
                    <tbody>
                      ${rules
                        .map(
                          (r) => `
                        <tr>
                          <td><code>${escapeHtml(r.code)}</code></td>
                          <td><strong>${escapeHtml(r.title)}</strong><br/><small style="color:var(--text-3)">${escapeHtml(r.description)}</small></td>
                          <td><span class="gl-status-badge ${r.severity === 'critical' || r.severity === 'high' ? 'gl-status-draft' : 'gl-status-review'}">${escapeHtml(r.severity.toUpperCase())}</span></td>
                          <td><code>${escapeHtml(r.default_action)}</code></td>
                          <td><button class="btn-danger ucp-del-rule-btn" data-rid="${r.id}" style="padding:4px 10px;font-size:0.76rem" type="button">🗑️ Delete</button></td>
                        </tr>
                      `
                        )
                        .join('')}
                    </tbody>
                  </table>
                </div>
              `
    }

    <!-- Inspect User Modal (Details, Password Reset, Activity Log, Notifications, Linked Children) -->
    <div id="ucp-inspect-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal" role="dialog" aria-modal="true" style="max-width:820px">
        <div class="gl-modal-header">
          <div>
            <h3 id="ucp-inspect-title" style="margin:0">User Profile</h3>
            <small id="ucp-inspect-sub" style="color:var(--text-3)"></small>
          </div>
          <button id="ucp-inspect-close" class="btn-secondary" type="button">✕ Close</button>
        </div>
        <div id="ucp-inspect-body" class="gl-modal-body"></div>
      </div>
    </div>

    <!-- Send Alert / Message / Warning Modal -->
    <div id="ucp-notify-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal" role="dialog" aria-modal="true" style="max-width:600px">
        <div class="gl-modal-header">
          <div>
            <h3 id="ucp-notify-title" style="margin:0">📢 Send Message / Alert / Warning</h3>
            <small id="ucp-notify-sub" style="color:var(--text-3)"></small>
          </div>
          <button id="ucp-notify-close" class="btn-secondary" type="button">✕ Close</button>
        </div>
        <form id="ucp-notify-form" class="gl-modal-body">
          <div class="form-grid">
            <label class="form-control">Type
              <select name="message_type">
                <option value="message">💬 Message (Ubutumwa)</option>
                <option value="alert">🔔 Alert (Itangazo)</option>
                <option value="warning">⚠️ Official Warning (+1 Strike)</option>
              </select>
            </label>
            <label class="form-control">Rule Violated (Optional)
              <select name="rule_violated">
                <option value="">— None / General Notice —</option>
                ${rules.map((r) => `<option value="${escapeHtml(r.title)}">${escapeHtml(r.code)}: ${escapeHtml(r.title)}</option>`).join('')}
              </select>
            </label>
          </div>
          <label class="form-control" style="margin-top:8px">Title <input name="title" required maxlength="200" placeholder="e.g. Official Warning — Platform Safety Rule" /></label>
          <label class="form-control" style="margin-top:8px">Message Body <textarea name="body" rows="3" required placeholder="Andika ubutumwa, itangazo, cyangwa umuburo..."></textarea></label>
          <label class="form-control" style="margin-top:8px">Optional Immediate Suspension (if Warning)
            <select name="auto_suspend_hours">
              <option value="">No immediate suspension (3-strike auto-suspend still applies)</option>
              <option value="1">Suspend 1 Hour</option>
              <option value="24">Suspend 24 Hours</option>
              <option value="168">Suspend 7 Days</option>
              <option value="720">Suspend 30 Days</option>
            </select>
          </label>
          <div class="gl-modal-footer">
            <span></span>
            <div style="display:flex;gap:8px">
              <button id="ucp-notify-cancel" class="btn-secondary" type="button">Cancel</button>
              <button class="btn-primary" type="submit">📤 Send Now</button>
            </div>
          </div>
        </form>
      </div>
    </div>

    <!-- Suspend Account Modal (Timed or Permanent) -->
    <div id="ucp-suspend-backdrop" class="gl-modal-backdrop" style="display:none">
      <div class="gl-modal" role="dialog" aria-modal="true" style="max-width:560px">
        <div class="gl-modal-header">
          <div>
            <h3 id="ucp-suspend-title" style="margin:0">⏸️ Suspend Account</h3>
            <small id="ucp-suspend-sub" style="color:var(--text-3)"></small>
          </div>
          <button id="ucp-suspend-close" class="btn-secondary" type="button">✕ Close</button>
        </div>
        <form id="ucp-suspend-form" class="gl-modal-body">
          <div class="form-grid">
            <label class="form-control">Suspension Duration
              <select name="hours">
                <option value="1">⏱️ 1 Hour</option>
                <option value="24" selected>⏱️ 24 Hours (1 Day)</option>
                <option value="168">📅 7 Days (1 Week)</option>
                <option value="720">📅 30 Days (1 Month)</option>
                <option value="">⛔ Permanent / Indefinite (Until Restored)</option>
              </select>
            </label>
            <label class="form-control">Rule Violated
              <select name="rule_violated">
                <option value="">— Select Rule (Optional) —</option>
                ${rules.map((r) => `<option value="${escapeHtml(r.title)}">${escapeHtml(r.code)}: ${escapeHtml(r.title)}</option>`).join('')}
              </select>
            </label>
          </div>
          <label class="form-control" style="margin-top:8px">Suspension Reason <textarea name="reason" rows="2" required placeholder="Explain why this account is being suspended..."></textarea></label>
          <label id="ucp-also-children-wrap" style="display:none;align-items:center;gap:8px;margin-top:10px;cursor:pointer;font-weight:700">
            <input type="checkbox" name="also_suspend_children" style="width:auto;height:auto" />
            <span>Also suspend all linked child accounts of this Parent</span>
          </label>
          <div class="gl-modal-footer">
            <span></span>
            <div style="display:flex;gap:8px">
              <button id="ucp-suspend-cancel" class="btn-secondary" type="button">Cancel</button>
              <button class="btn-danger" type="submit">⛔ Confirm Suspension</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  `;

  // Wire tabs & search
  bodyEl.querySelectorAll('.ucp-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      adminState.usersPanel.tab = btn.dataset.tab;
      renderUsersAdminSection(bodyEl);
    });
  });

  const searchEl = bodyEl.querySelector('#ucp-search');
  if (searchEl) {
    let timer = null;
    searchEl.addEventListener('input', (e) => {
      adminState.usersPanel.search = e.target.value;
      if (timer) clearTimeout(timer);
      timer = setTimeout(async () => {
        await renderUsersAdminSection(bodyEl);
        const next = bodyEl.querySelector('#ucp-search');
        if (next) {
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        }
      }, 220);
    });
  }

  // Create User panel
  stopAdminUsersLiveRefresh();
  bodyEl.querySelector('#ucp-refresh-live-btn').addEventListener('click', () => {
    renderUsersAdminSection(bodyEl);
  });
  adminUsersLiveTimer = setInterval(() => {
    if (adminState.section !== 'users' && adminState.section !== 'parents' && adminState.section !== 'children') {
      stopAdminUsersLiveRefresh();
      return;
    }
    const anyModalOpen =
      bodyEl.querySelector('#ucp-inspect-backdrop')?.style.display === 'flex' ||
      bodyEl.querySelector('#ucp-notify-backdrop')?.style.display === 'flex' ||
      bodyEl.querySelector('#ucp-suspend-backdrop')?.style.display === 'flex' ||
      bodyEl.querySelector('#ucp-create-panel')?.style.display === 'block' ||
      document.activeElement?.id === 'ucp-search';
    if (!anyModalOpen && !document.hidden) {
      renderUsersAdminSection(bodyEl);
    }
  }, 8000);

  const createPanel = bodyEl.querySelector('#ucp-create-panel');
  bodyEl.querySelector('#ucp-toggle-create-btn').addEventListener('click', () => {
    createPanel.style.display = createPanel.style.display === 'none' ? 'block' : 'none';
  });
  bodyEl.querySelector('#ucp-close-create-btn').addEventListener('click', () => {
    createPanel.style.display = 'none';
  });
  bodyEl.querySelector('#ucp-gen-pass-btn').addEventListener('click', () => {
    bodyEl.querySelector('#ucp-new-pass').value = generateStrongPassword();
  });
  bodyEl.querySelector('#ucp-submit-create-btn').addEventListener('click', async () => {
    const full_name = bodyEl.querySelector('#ucp-new-name').value.trim();
    const username = bodyEl.querySelector('#ucp-new-user').value.trim();
    const email = bodyEl.querySelector('#ucp-new-email').value.trim();
    const password = bodyEl.querySelector('#ucp-new-pass').value.trim();
    const role_name = bodyEl.querySelector('#ucp-new-role').value;
    if (!full_name || !username || !email || !password) {
      window.alert('Please fill all fields.');
      return;
    }
    try {
      await api.request('/api/v1/users', {
        method: 'POST',
        body: JSON.stringify({ full_name, username, email, password, role_name }),
      });
      renderUsersAdminSection(bodyEl, {
        type: 'success',
        text: `✅ Created ${role_name} account "${username}" with password: ${password}`,
      });
    } catch (err) {
      window.alert(`Could not create user: ${err.message}`);
    }
  });

  // Inspect User Modal (with Set/Reset Password + Activity Timeline + Notifications)
  const inspectBackdrop = bodyEl.querySelector('#ucp-inspect-backdrop');
  const inspectBody = bodyEl.querySelector('#ucp-inspect-body');
  const closeInspect = () => (inspectBackdrop.style.display = 'none');
  bodyEl.querySelector('#ucp-inspect-close').addEventListener('click', closeInspect);
  inspectBackdrop.addEventListener('click', (e) => {
    if (e.target === inspectBackdrop) closeInspect();
  });

  function openInspectUser(uid, focusPassword = false) {
    const u = users.find((x) => x.id === Number(uid));
    if (!u) return;
    bodyEl.querySelector('#ucp-inspect-title').textContent = `${u.full_name} (@${u.username})`;
    bodyEl.querySelector('#ucp-inspect-sub').textContent = `${u.email} • Role: ${u.role} • Warnings: ${u.warning_count} • Joined: ${u.created_at ? new Date(u.created_at).toLocaleDateString() : ''}`;

    inspectBody.innerHTML = `
      <div class="vad-cfg-card">
        <strong>🔐 Password &amp; Credentials Management</strong>
        <p style="font-size:0.8rem;color:var(--text-3);margin:4px 0 8px">Existing passwords are encrypted (hashed) for security and cannot be reversed. You can set or generate a new password below and view/copy it immediately:</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input id="ucp-reset-pw-input" type="text" value="${generateStrongPassword()}" style="flex:1;min-width:180px;font-family:var(--font-mono);padding:8px 10px;border-radius:8px;border:1px solid var(--line-2);background:var(--surface);color:var(--text)" />
          <button id="ucp-reset-pw-gen" class="btn-secondary" type="button">🎲 Generate</button>
          <button id="ucp-reset-pw-save" class="btn-primary" type="button">💾 Set New Password</button>
        </div>
        <small id="ucp-reset-pw-status" style="color:#4ade80;font-weight:700;display:block;margin-top:6px"></small>
      </div>

      ${
        u.role === 'PARENT'
          ? `<div class="vad-cfg-card">
               <strong>🧒 Children Accounts — Amazina, Code &amp; Ibyo Bakoze (${(u.children || []).length})</strong>
               ${
                 u.children && u.children.length
                   ? u.children
                       .map(
                         (c) => `
                       <div style="margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid var(--line)">
                         <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">
                           <span>${escapeHtml(c.avatar)} <strong>${escapeHtml(c.display_name || c.label)}</strong> (Ages ${escapeHtml(c.age_group)}) • 🔑 PIN: <code>${escapeHtml(c.pin_code)}</code> • ⭐ ${c.total_stars} • ⏱️ ${c.used_today_minutes}/${c.daily_limit_minutes}m</span>
                           <span>${c.is_suspended ? '⛔ Suspended' : c.is_online ? `🟢 ${escapeHtml(c.current_activity)}` : `⚫ ${escapeHtml(c.current_activity)}`}</span>
                         </div>
                         <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px">
                           <button class="btn-primary ucp-modal-impersonate-child" data-cid="${c.id}" style="padding:4px 10px;font-size:0.76rem" type="button">🚀 Login as ${escapeHtml(c.display_name || 'Child')}</button>
                           <button class="btn-secondary ucp-modal-reset-child-pin" data-cid="${c.id}" data-cname="${escapeHtml(c.display_name || c.label)}" data-cpin="${escapeHtml(c.pin_code || '')}" style="padding:4px 10px;font-size:0.76rem" type="button">🔑 Reset PIN</button>
                         </div>
                         ${
                           c.recent_activities && c.recent_activities.length
                             ? `<div style="margin-top:8px;font-size:0.78rem;color:var(--text-3)">
                                  <strong>Ibyo yakoze:</strong>
                                  ${c.recent_activities
                                    .slice(0, 5)
                                    .map((a) => `<div>• ${escapeHtml(a.summary)} <small>(${a.created_at ? new Date(a.created_at).toLocaleString() : ''})</small></div>`)
                                    .join('')}
                                </div>`
                             : '<div style="margin-top:6px;font-size:0.76rem;color:var(--text-3)">No child activity recorded yet.</div>'
                         }
                       </div>
                     `
                       )
                       .join('')
                   : '<div style="font-size:0.84rem;color:var(--text-3);margin-top:6px">No child profiles linked yet.</div>'
               }
             </div>`
          : ''
      }

      <div class="vad-cfg-card">
        <strong>📜 Recent Activity Log (Ibyo yakoze &amp; ibyo ari gukora)</strong>
        <div style="margin-top:6px;max-height:200px;overflow-y:auto">
          ${
            u.recent_activities && u.recent_activities.length
              ? u.recent_activities
                  .map(
                    (a) => `
                  <div class="gl-version-row">
                    <code>${escapeHtml(a.action_type)}</code>
                    <span>${escapeHtml(a.summary)}</span>
                    <small>${a.created_at ? new Date(a.created_at).toLocaleString() : ''}</small>
                  </div>
                `
                  )
                  .join('')
              : '<small style="color:var(--text-3)">No activity recorded yet.</small>'
          }
        </div>
      </div>

      <div class="vad-cfg-card">
        <strong>📢 Sent Messages, Alerts &amp; Warnings (${(u.notifications || []).length})</strong>
        <div style="margin-top:6px;max-height:180px;overflow-y:auto">
          ${
            u.notifications && u.notifications.length
              ? u.notifications
                  .map(
                    (n) => `
                  <div class="gl-version-row">
                    <code>${escapeHtml(n.message_type.toUpperCase())}</code>
                    <span><strong>${escapeHtml(n.title)}:</strong> ${escapeHtml(n.body)}</span>
                    <small>${n.is_read ? '✓ Read' : '● Unread'}</small>
                  </div>
                `
                  )
                  .join('')
              : '<small style="color:var(--text-3)">No alerts or warnings sent to this user.</small>'
          }
        </div>
      </div>
    `;

    const pwInput = inspectBody.querySelector('#ucp-reset-pw-input');
    const pwStatus = inspectBody.querySelector('#ucp-reset-pw-status');
    inspectBody.querySelector('#ucp-reset-pw-gen').addEventListener('click', () => {
      pwInput.value = generateStrongPassword();
    });
    inspectBody.querySelector('#ucp-reset-pw-save').addEventListener('click', async () => {
      const new_password = pwInput.value.trim();
      if (new_password.length < 4) {
        window.alert('Password must be at least 4 characters.');
        return;
      }
      try {
        await api.request(`/api/v1/users/${u.id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ new_password }),
        });
        pwStatus.textContent = `✅ Password updated! New password for @${u.username}: ${new_password}`;
      } catch (err) {
        pwStatus.textContent = `❌ ${err.message}`;
      }
    });

    inspectBody.querySelectorAll('.ucp-modal-impersonate-child').forEach((btn) => {
      btn.addEventListener('click', () => impersonateChildAccount(Number(btn.dataset.cid)));
    });
    inspectBody.querySelectorAll('.ucp-modal-reset-child-pin').forEach((btn) => {
      btn.addEventListener('click', () => promptResetChildPin(Number(btn.dataset.cid), btn.dataset.cname, btn.dataset.cpin));
    });

    inspectBackdrop.style.display = 'flex';
    if (focusPassword) pwInput.focus();
  }

  async function impersonateUserAccount(uid) {
    try {
      api.saveParentReturnSession();
      const data = await api.request(`/api/v1/users/${uid}/impersonate`, { method: 'POST' });
      api.setSession(data);
      window.location.reload();
    } catch (err) {
      window.alert(`Could not sign in as user: ${err.message}`);
    }
  }

  async function impersonateChildAccount(cid) {
    try {
      api.saveParentReturnSession();
      const data = await api.request(`/api/v1/users/children/${cid}/impersonate`, { method: 'POST' });
      api.setSession(data);
      window.location.reload();
    } catch (err) {
      window.alert(`Could not sign in as child: ${err.message}`);
    }
  }

  async function promptResetChildPin(cid, cname, currentPin) {
    const suggested = String(Math.floor(1000 + Math.random() * 9000));
    const newPin = window.prompt(
      `Enter new Access Code / PIN for ${cname} (Current PIN: ${currentPin || 'N/A'}):`,
      suggested
    );
    if (!newPin || !newPin.trim()) return;
    if (newPin.trim().length < 4) {
      window.alert('PIN must be at least 4 characters.');
      return;
    }
    try {
      const res = await api.request(`/api/v1/users/children/${cid}/reset-pin`, {
        method: 'POST',
        body: JSON.stringify({ new_pin: newPin.trim() }),
      });
      closeInspect();
      renderUsersAdminSection(bodyEl, {
        type: 'success',
        text: `🔑 Updated PIN for ${res.display_name}: ${res.pin_code}`,
      });
    } catch (err) {
      window.alert(`Could not reset PIN: ${err.message}`);
    }
  }

  bodyEl.querySelectorAll('.ucp-inspect-btn').forEach((btn) => {
    btn.addEventListener('click', () => openInspectUser(btn.dataset.uid, false));
  });
  bodyEl.querySelectorAll('.ucp-resetpw-btn').forEach((btn) => {
    btn.addEventListener('click', () => openInspectUser(btn.dataset.uid, true));
  });
  bodyEl.querySelectorAll('.ucp-impersonate-user-btn').forEach((btn) => {
    btn.addEventListener('click', () => impersonateUserAccount(Number(btn.dataset.uid)));
  });
  bodyEl.querySelectorAll('.ucp-impersonate-child-btn').forEach((btn) => {
    btn.addEventListener('click', () => impersonateChildAccount(Number(btn.dataset.cid)));
  });
  bodyEl.querySelectorAll('.ucp-child-resetpin-btn').forEach((btn) => {
    btn.addEventListener('click', () => promptResetChildPin(Number(btn.dataset.cid), btn.dataset.cname, btn.dataset.cpin));
  });

  // Notify / Warn Modal
  let targetNotifyUser = null;
  const notifyBackdrop = bodyEl.querySelector('#ucp-notify-backdrop');
  const notifyForm = bodyEl.querySelector('#ucp-notify-form');
  const closeNotify = () => {
    notifyBackdrop.style.display = 'none';
    targetNotifyUser = null;
  };
  bodyEl.querySelector('#ucp-notify-close').addEventListener('click', closeNotify);
  bodyEl.querySelector('#ucp-notify-cancel').addEventListener('click', closeNotify);
  notifyBackdrop.addEventListener('click', (e) => {
    if (e.target === notifyBackdrop) closeNotify();
  });

  bodyEl.querySelectorAll('.ucp-notify-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = users.find((x) => x.id === Number(btn.dataset.uid));
      if (!u) return;
      targetNotifyUser = u;
      bodyEl.querySelector('#ucp-notify-title').textContent = `📢 Notify / Warn: ${u.full_name}`;
      bodyEl.querySelector('#ucp-notify-sub').textContent = `@${u.username} (${u.role}) • Current Warnings: ${u.warning_count}`;
      notifyForm.reset();
      notifyBackdrop.style.display = 'flex';
    });
  });

  notifyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!targetNotifyUser) return;
    const fd = new FormData(notifyForm);
    const hoursRaw = String(fd.get('auto_suspend_hours') || '').trim();
    try {
      const res = await api.request(`/api/v1/users/${targetNotifyUser.id}/notify`, {
        method: 'POST',
        body: JSON.stringify({
          message_type: String(fd.get('message_type') || 'message'),
          title: String(fd.get('title') || '').trim(),
          body: String(fd.get('body') || '').trim(),
          rule_violated: String(fd.get('rule_violated') || '').trim() || null,
          auto_suspend_hours: hoursRaw ? Number(hoursRaw) : null,
        }),
      });
      const uname = targetNotifyUser.username;
      closeNotify();
      renderUsersAdminSection(bodyEl, {
        type: 'success',
        text: `📤 Sent to @${uname}${res.auto_suspended ? ' (Account auto-suspended!)' : ''}. Total warnings: ${res.warning_count}.`,
      });
    } catch (err) {
      window.alert(`Could not send notification: ${err.message}`);
    }
  });

  // Suspend Modal (for Users AND Children)
  let suspendTarget = null; // { kind: 'user' | 'child', id, label, isParent }
  const suspendBackdrop = bodyEl.querySelector('#ucp-suspend-backdrop');
  const suspendForm = bodyEl.querySelector('#ucp-suspend-form');
  const alsoChildrenWrap = bodyEl.querySelector('#ucp-also-children-wrap');
  const closeSuspend = () => {
    suspendBackdrop.style.display = 'none';
    suspendTarget = null;
  };
  bodyEl.querySelector('#ucp-suspend-close').addEventListener('click', closeSuspend);
  bodyEl.querySelector('#ucp-suspend-cancel').addEventListener('click', closeSuspend);
  suspendBackdrop.addEventListener('click', (e) => {
    if (e.target === suspendBackdrop) closeSuspend();
  });

  bodyEl.querySelectorAll('.ucp-suspend-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const u = users.find((x) => x.id === Number(btn.dataset.uid));
      if (!u) return;
      suspendTarget = { kind: 'user', id: u.id, label: `${u.full_name} (@${u.username})`, isParent: u.role === 'PARENT' };
      bodyEl.querySelector('#ucp-suspend-title').textContent = `⏸️ Suspend ${u.full_name}`;
      bodyEl.querySelector('#ucp-suspend-sub').textContent = `@${u.username} (${u.role})`;
      alsoChildrenWrap.style.display = u.role === 'PARENT' ? 'flex' : 'none';
      suspendForm.reset();
      suspendBackdrop.style.display = 'flex';
    });
  });

  bodyEl.querySelectorAll('.ucp-child-suspend-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const c = children.find((x) => x.id === Number(btn.dataset.cid));
      if (!c) return;
      suspendTarget = { kind: 'child', id: c.id, label: c.label, isParent: false };
      bodyEl.querySelector('#ucp-suspend-title').textContent = `⏸️ Suspend ${c.label}`;
      bodyEl.querySelector('#ucp-suspend-sub').textContent = `Parent: ${c.parent_name}`;
      alsoChildrenWrap.style.display = 'none';
      suspendForm.reset();
      suspendBackdrop.style.display = 'flex';
    });
  });

  suspendForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!suspendTarget) return;
    const fd = new FormData(suspendForm);
    const hrsRaw = String(fd.get('hours') || '').trim();
    const payload = {
      hours: hrsRaw ? Number(hrsRaw) : null,
      reason: String(fd.get('reason') || 'Rule violation').trim(),
      rule_violated: String(fd.get('rule_violated') || '').trim() || null,
      also_suspend_children: Boolean(suspendForm.elements.namedItem('also_suspend_children')?.checked),
    };
    const endpoint =
      suspendTarget.kind === 'child'
        ? `/api/v1/users/children/${suspendTarget.id}/suspend`
        : `/api/v1/users/${suspendTarget.id}/suspend`;
    try {
      await api.request(endpoint, { method: 'POST', body: JSON.stringify(payload) });
      const lbl = suspendTarget.label;
      closeSuspend();
      renderUsersAdminSection(bodyEl, { type: 'success', text: `⛔ Suspended ${lbl}.` });
    } catch (err) {
      window.alert(`Could not suspend: ${err.message}`);
    }
  });

  // Restore / Unsuspend & Delete
  bodyEl.querySelectorAll('.ucp-unsuspend-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.request(`/api/v1/users/${btn.dataset.uid}/unsuspend`, { method: 'POST' });
      renderUsersAdminSection(bodyEl, { type: 'success', text: '✅ Account restored successfully.' });
    });
  });

  bodyEl.querySelectorAll('.ucp-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const u = users.find((x) => x.id === Number(btn.dataset.uid));
      if (!u) return;
      if (!window.confirm(`Delete account "${u.full_name}" (@${u.username}) permanently? This cannot be undone.`)) return;
      try {
        await api.request(`/api/v1/users/${u.id}`, { method: 'DELETE' });
        renderUsersAdminSection(bodyEl, { type: 'success', text: `🗑️ Deleted account @${u.username}.` });
      } catch (err) {
        renderUsersAdminSection(bodyEl, { type: 'error', text: `❌ ${err.message}` });
      }
    });
  });

  bodyEl.querySelectorAll('.ucp-child-unsuspend-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await api.request(`/api/v1/users/children/${btn.dataset.cid}/unsuspend`, { method: 'POST' });
      renderUsersAdminSection(bodyEl, { type: 'success', text: '✅ Child account restored.' });
    });
  });

  bodyEl.querySelectorAll('.ucp-child-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const c = children.find((x) => x.id === Number(btn.dataset.cid));
      if (!c) return;
      if (!window.confirm(`Delete ${c.label} permanently?`)) return;
      await api.request(`/api/v1/users/children/${c.id}`, { method: 'DELETE' });
      renderUsersAdminSection(bodyEl, { type: 'success', text: `🗑️ Deleted ${c.label}.` });
    });
  });

  // Rules tab handlers
  const addRuleBtn = bodyEl.querySelector('#ucp-add-rule-btn');
  if (addRuleBtn) {
    addRuleBtn.addEventListener('click', async () => {
      const code = bodyEl.querySelector('#rule-code').value.trim();
      const title = bodyEl.querySelector('#rule-title').value.trim();
      const description = bodyEl.querySelector('#rule-desc').value.trim();
      if (!code || !title || !description) {
        window.alert('Please enter rule code, title, and description.');
        return;
      }
      try {
        await api.request('/api/v1/users/rules', {
          method: 'POST',
          body: JSON.stringify({
            code,
            title,
            description,
            severity: bodyEl.querySelector('#rule-sev').value,
            default_action: bodyEl.querySelector('#rule-act').value,
          }),
        });
        renderUsersAdminSection(bodyEl, { type: 'success', text: `⚖️ Added rule "${title}".` });
      } catch (err) {
        window.alert(`Could not add rule: ${err.message}`);
      }
    });
  }

  bodyEl.querySelectorAll('.ucp-del-rule-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Delete this platform rule?')) return;
      await api.request(`/api/v1/users/rules/${btn.dataset.rid}`, { method: 'DELETE' });
      renderUsersAdminSection(bodyEl, { type: 'success', text: '🗑️ Rule deleted.' });
    });
  });
}

async function renderRewardsAdminSection(bodyEl) {
  const rw = await api.request('/api/v1/rewards');
  bodyEl.innerHTML = `
    <div class="admin-card">
      <h2 style="margin-top:0">🏆 Platform Achievements &amp; Gamification Rules</h2>
      <p style="color:var(--text-3)">${rw.safety_notice}</p>
      <table class="admin-table">
        <thead><tr><th>Badge</th><th>Code</th><th>Title</th><th>Description</th><th>Stars Threshold</th></tr></thead>
        <tbody>
          ${rw.achievements.map((a) => `<tr><td>${a.badge_icon}</td><td><code>${a.code}</code></td><td><strong>${a.title}</strong></td><td>${a.description}</td><td>⭐ ${a.stars_threshold}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>
  `;
}

let activeSettingsTab = 'branding';

async function renderSettingsAdminSection(bodyEl, notice = null) {
  let settings = [];
  let langs = [];
  try {
    [settings, langs] = await Promise.all([
      api.request('/api/v1/admin/settings'),
      api.request('/api/v1/languages').catch(() => []),
    ]);
  } catch {
    bodyEl.innerHTML = `<div class="admin-card">Platform Settings require <strong>SUPER_ADMIN</strong> role.</div>`;
    return;
  }

  const map = Object.fromEntries(settings.map((s) => [s.key, s.value]));
  const val = (k, fallback = '') => (map[k] !== undefined && map[k] !== null ? map[k] : fallback);
  const isTrue = (k, fallback = false) => {
    const v = val(k, fallback ? 'true' : 'false');
    return String(v).toLowerCase() === 'true';
  };
  const langOptions = langs.length
    ? langs
    : [
        { code: 'rw', name: 'KINYARWANDA', flag_emoji: '🇷🇼' },
        { code: 'fr', name: 'FRENCH (FRANÇAIS)', flag_emoji: '🇫🇷' },
        { code: 'sw', name: 'SWAHILI (KISWAHILI)', flag_emoji: '🇹🇿' },
        { code: 'en', name: 'ENGLISH', flag_emoji: '🇬🇧' },
      ];

  const accentSwatches = [
    { name: 'Aurora Indigo', hex: '#6366f1' },
    { name: 'Emerald Green', hex: '#10b981' },
    { name: 'Ocean Cyan', hex: '#06b6d4' },
    { name: 'Sunset Rose', hex: '#f43f5e' },
    { name: 'Golden Amber', hex: '#f59e0b' },
    { name: 'Royal Purple', hex: '#8b5cf6' },
  ];

  const renderToggleCard = (key, icon, title, desc, checked) => `
    <label class="vad-cfg-card" style="display:flex;justify-content:space-between;align-items:center;gap:14px;cursor:pointer;margin-bottom:0">
      <div>
        <strong>${icon} ${title}</strong>
        <div style="font-size:0.8rem;color:var(--text-3);margin-top:2px">${desc}</div>
      </div>
      <input type="checkbox" class="ps-bool-input" data-key="${key}" ${checked ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent,#6366f1);cursor:pointer;flex-shrink:0" />
    </label>
  `;

  bodyEl.innerHTML = `
    <div class="gl-header">
      <div>
        <h2 style="margin:0">⚙️ Platform Settings — Master Control Suite</h2>
        <small style="color:var(--text-3)">Configure live branding, theme colors, global announcements, feature modules, child safety, rewards, and backups.</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button id="ps-export-json-btn" class="btn-secondary" type="button">📥 Export JSON</button>
        <button id="ps-reset-defaults-btn" class="btn-danger" type="button">♻️ Reset Defaults</button>
        <button id="ps-save-all-top-btn" class="btn-success" type="button">💾 Save All Settings</button>
      </div>
    </div>

    ${
      notice
        ? `<div class="gl-notice ${notice.type === 'error' ? 'gl-notice-error' : 'gl-notice-success'}">${escapeHtml(notice.text)}</div>`
        : ''
    }

    <!-- 6 Settings Tabs -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      <button class="role-pill ps-tab-btn ${activeSettingsTab === 'branding' ? 'active' : ''}" data-tab="branding" type="button">🎨 Branding &amp; Theme</button>
      <button class="role-pill ps-tab-btn ${activeSettingsTab === 'announce' ? 'active' : ''}" data-tab="announce" type="button">📢 Announcement &amp; Maintenance</button>
      <button class="role-pill ps-tab-btn ${activeSettingsTab === 'modules' ? 'active' : ''}" data-tab="modules" type="button">🧩 Feature Modules</button>
      <button class="role-pill ps-tab-btn ${activeSettingsTab === 'safety' ? 'active' : ''}" data-tab="safety" type="button">🛡️ Safety &amp; Discipline</button>
      <button class="role-pill ps-tab-btn ${activeSettingsTab === 'rewards' ? 'active' : ''}" data-tab="rewards" type="button">🏆 Rewards &amp; Video Ads</button>
      <button class="role-pill ps-tab-btn ${activeSettingsTab === 'advanced' ? 'active' : ''}" data-tab="advanced" type="button">🔧 Advanced (${settings.length})</button>
    </div>

    <form id="ps-master-form">
      <!-- TAB 1: BRANDING & THEME -->
      <div class="ps-pane" data-pane="branding" style="display:${activeSettingsTab === 'branding' ? 'block' : 'none'}">
        <div class="admin-card">
          <h3 style="margin-top:0">🎨 Platform Identity &amp; Live Theme</h3>
          <div class="form-grid">
            <label class="form-control">
              Platform Name
              <input class="ps-text-input" data-key="platform_name" value="${escapeHtml(val('platform_name', 'Gitego Kids World'))}" />
            </label>
            <label class="form-control">
              Tagline
              <input class="ps-text-input" data-key="platform_tagline" value="${escapeHtml(val('platform_tagline', 'Play • Watch • Read • Learn • Explore'))}" />
            </label>
            <label class="form-control">
              Default Language
              <select class="ps-text-input" data-key="default_language">
                ${langOptions.map((l) => `<option value="${escapeHtml(l.code)}" ${val('default_language', 'rw') === l.code ? 'selected' : ''}>${escapeHtml(l.flag_emoji || '🌍')} ${escapeHtml(l.name)}</option>`).join('')}
              </select>
            </label>
            <label class="form-control">
              Support Contact Email
              <input class="ps-text-input" data-key="support_email" type="email" value="${escapeHtml(val('support_email', 'support@gitego.kids'))}" />
            </label>
          </div>

          <div class="gl-cover-editor" style="margin-top:14px">
            <div id="ps-logo-preview" class="gl-cover-box" style="width:72px;height:72px">
              ${isImageCover(val('platform_logo_url')) ? `<img src="${escapeHtml(val('platform_logo_url'))}" class="gl-cover-img" alt="Logo" />` : '<span class="gl-cover-emoji">G</span>'}
            </div>
            <div style="flex:1;min-width:220px">
              <div class="form-grid" style="margin-bottom:4px">
                <label class="form-control">Platform Logo URL <input id="ps-logo-url" class="ps-text-input" data-key="platform_logo_url" value="${escapeHtml(val('platform_logo_url'))}" placeholder="/uploads/image/... or leave empty for G badge" /></label>
                <label class="form-control">Upload Logo Image <input id="ps-logo-upload" type="file" accept="image/*" /></label>
              </div>
              <small id="ps-logo-status" style="color:#4ade80;font-weight:700"></small>
            </div>
          </div>

          <div style="margin-top:16px">
            <label class="form-control">✨ Brand Accent Color (Live Theme Preview)</label>
            <div style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-top:8px">
              <input id="ps-accent-color" class="ps-text-input" data-key="brand_accent_color" type="color" value="${escapeHtml(val('brand_accent_color', '#6366f1'))}" style="width:56px;height:42px;padding:3px;border-radius:10px;cursor:pointer" />
              ${accentSwatches
                .map(
                  (sw) =>
                    `<button type="button" class="ps-swatch-btn" data-hex="${sw.hex}" style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;border:1px solid var(--line-2);background:var(--surface-2);color:var(--text);font-size:0.78rem;font-weight:700;cursor:pointer"><span style="width:14px;height:14px;border-radius:50%;background:${sw.hex};display:inline-block"></span>${sw.name}</button>`
                )
                .join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- TAB 2: ANNOUNCEMENT & MAINTENANCE -->
      <div class="ps-pane" data-pane="announce" style="display:${activeSettingsTab === 'announce' ? 'block' : 'none'}">
        <div class="admin-card">
          <h3 style="margin-top:0">📢 Live Global Announcement Banner</h3>
          ${renderToggleCard('announcement_enabled', '📣', 'Enable Global Announcement Banner', 'Displays a live top banner across Child World, Parent Portal, and Admin.', isTrue('announcement_enabled'))}
          <div class="form-grid" style="margin-top:12px">
            <label class="form-control" style="grid-column:span 2">
              Announcement Message
              <input id="ps-ann-text" class="ps-text-input" data-key="announcement_text" value="${escapeHtml(val('announcement_text'))}" placeholder="e.g. 🎉 New Senior 6 High School Exams & Kinyarwanda Storybooks are live!" />
            </label>
            <label class="form-control">
              Banner Color
              <input id="ps-ann-bg" class="ps-text-input" data-key="announcement_bg" type="color" value="${escapeHtml(val('announcement_bg', '#f59e0b'))}" style="height:42px;padding:4px" />
            </label>
          </div>
          <div id="ps-ann-preview" style="margin-top:10px;padding:10px 16px;border-radius:10px;font-weight:800;font-size:0.86rem;text-align:center;color:#0b0d12;background:${escapeHtml(val('announcement_bg', '#f59e0b'))}">
            📢 Preview: ${escapeHtml(val('announcement_text') || 'Your live announcement banner will appear here...')}
          </div>
        </div>

        <div class="admin-card" style="border:1px solid rgba(244,63,94,0.35)">
          <h3 style="margin-top:0">🚧 Maintenance Mode</h3>
          ${renderToggleCard('maintenance_mode', '🚧', 'Enable Maintenance Notice', 'Shows a prominent maintenance banner to Parents and Children while Super Admins keep full access.', isTrue('maintenance_mode'))}
          <label class="form-control" style="margin-top:12px">
            Maintenance Message
            <textarea class="ps-text-input" data-key="maintenance_message" rows="2">${escapeHtml(val('maintenance_message'))}</textarea>
          </label>
        </div>
      </div>

      <!-- TAB 3: FEATURE MODULES -->
      <div class="ps-pane" data-pane="modules" style="display:${activeSettingsTab === 'modules' ? 'block' : 'none'}">
        <div class="admin-card">
          <h3 style="margin-top:0">🧩 Live Platform Module Switches</h3>
          <p style="color:var(--text-3);margin-top:0;font-size:0.86rem">Instantly enable or disable core modules across the platform.</p>
          <div class="an-grid-2">
            ${renderToggleCard('module_games_enabled', '🎮', 'Games Arcade & Studio', 'Playable sandboxed HTML5, Phaser, TS & Python games', isTrue('module_games_enabled', true))}
            ${renderToggleCard('module_books_enabled', '📖', 'Multilingual Storybooks', 'Illustrated Kinyarwanda, French & Swahili books', isTrue('module_books_enabled', true))}
            ${renderToggleCard('module_videos_enabled', '📺', 'Cartoon & Video Center', 'Curated cartoons, learning videos & ads engine', isTrue('module_videos_enabled', true))}
            ${renderToggleCard('module_learning_enabled', '🧠', 'Learning Center (N1–S6)', 'Structured lessons from Materineri to Senior 6', isTrue('module_learning_enabled', true))}
            ${renderToggleCard('module_exams_enabled', '📝', 'Exams & Assessments', 'Multi-question graded exams across all school levels', isTrue('module_exams_enabled', true))}
            ${renderToggleCard('module_rewards_enabled', '🏆', 'Rewards & Badges', 'Stars, levels, and trophy cabinet gamification', isTrue('module_rewards_enabled', true))}
          </div>
        </div>
      </div>

      <!-- TAB 4: SAFETY & DISCIPLINE -->
      <div class="ps-pane" data-pane="safety" style="display:${activeSettingsTab === 'safety' ? 'block' : 'none'}">
        <div class="admin-card">
          <h3 style="margin-top:0">🛡️ Child Safety, Access &amp; Discipline Defaults</h3>
          <div class="form-grid">
            <label class="form-control">
              Default Daily Screen-Time Limit (Minutes)
              <input class="ps-text-input" data-key="default_child_daily_limit_minutes" type="number" min="10" max="480" value="${escapeHtml(val('default_child_daily_limit_minutes', '60'))}" />
            </label>
            <label class="form-control">
              Auto-Suspend After Warnings (Strikes)
              <input class="ps-text-input" data-key="auto_suspend_warnings_threshold" type="number" min="1" max="10" value="${escapeHtml(val('auto_suspend_warnings_threshold', '3'))}" />
            </label>
          </div>
          <div class="an-grid-2" style="margin-top:12px">
            ${renderToggleCard('allow_parent_self_registration', '👨‍👩‍👧', 'Allow Parent Self-Registration', 'Let new families register parent accounts on the login page', isTrue('allow_parent_self_registration', true))}
            ${renderToggleCard('strict_game_sandbox', '🔒', 'Strict Game Sandbox & CSP', 'Enforce isolated iframe sandbox="allow-scripts" on all games', isTrue('strict_game_sandbox', true))}
          </div>
        </div>
      </div>

      <!-- TAB 5: REWARDS & VIDEO ADS DEFAULTS -->
      <div class="ps-pane" data-pane="rewards" style="display:${activeSettingsTab === 'rewards' ? 'block' : 'none'}">
        <div class="admin-card">
          <h3 style="margin-top:0">🏆 Gamification &amp; Rewards Economy</h3>
          <div class="form-grid">
            <label class="form-control">Stars per Game Win <input class="ps-text-input" data-key="stars_per_game_win" type="number" min="1" max="100" value="${escapeHtml(val('stars_per_game_win', '5'))}" /></label>
            <label class="form-control">Stars per Book Finished <input class="ps-text-input" data-key="stars_per_book_read" type="number" min="1" max="100" value="${escapeHtml(val('stars_per_book_read', '5'))}" /></label>
            <label class="form-control">Stars per Exam Passed <input class="ps-text-input" data-key="stars_per_exam_pass" type="number" min="1" max="100" value="${escapeHtml(val('stars_per_exam_pass', '5'))}" /></label>
            <label class="form-control">Stars per Level Up <input class="ps-text-input" data-key="stars_per_level_up" type="number" min="5" max="500" value="${escapeHtml(val('stars_per_level_up', '15'))}" /></label>
          </div>
        </div>
        <div class="admin-card">
          <h3 style="margin-top:0">📢 Global Video Watermark &amp; Ad Defaults</h3>
          ${renderToggleCard('global_video_watermark_enabled', '💧', 'Global Video Watermark', 'Apply a default watermark across videos automatically', isTrue('global_video_watermark_enabled'))}
          <div class="form-grid" style="margin-top:12px">
            <label class="form-control">Default Watermark Text <input class="ps-text-input" data-key="global_video_watermark_text" value="${escapeHtml(val('global_video_watermark_text', 'GITEGO KIDS'))}" /></label>
            <label class="form-control">Default Ad Skip Countdown (Seconds) <input class="ps-text-input" data-key="global_ad_skip_seconds" type="number" min="0" max="60" value="${escapeHtml(val('global_ad_skip_seconds', '5'))}" /></label>
          </div>
        </div>
      </div>

      <!-- TAB 6: ADVANCED KEY-VALUE & CUSTOM SETTINGS -->
      <div class="ps-pane" data-pane="advanced" style="display:${activeSettingsTab === 'advanced' ? 'block' : 'none'}">
        <div class="admin-card">
          <h3 style="margin-top:0">➕ Add Custom Platform Setting</h3>
          <div class="form-grid">
            <label class="form-control">Setting Key <input id="ps-custom-key" type="text" placeholder="e.g. school_partner_code" /></label>
            <label class="form-control">Value <input id="ps-custom-val" type="text" placeholder="e.g. RW-2026" /></label>
            <label class="form-control">Description <input id="ps-custom-desc" type="text" placeholder="What this setting controls..." /></label>
          </div>
          <button id="ps-add-custom-btn" class="btn-secondary" type="button">+ Add Custom Setting</button>
        </div>

        <div class="admin-card">
          <h3 style="margin-top:0">📋 All Stored Settings (${settings.length})</h3>
          <table class="admin-table">
            <thead><tr><th>Key</th><th>Value</th><th>Description</th></tr></thead>
            <tbody>
              ${settings.map((s) => `<tr><td><code>${escapeHtml(s.key)}</code></td><td><strong>${escapeHtml(s.value)}</strong></td><td>${escapeHtml(s.description || '')}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:10px">
        <button class="btn-success" type="submit" style="padding:10px 22px;font-size:0.94rem">💾 Save All Platform Settings</button>
      </div>
    </form>
  `;

  // Wire tabs
  bodyEl.querySelectorAll('.ps-tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      activeSettingsTab = btn.dataset.tab;
      bodyEl.querySelectorAll('.ps-tab-btn').forEach((b) => b.classList.toggle('active', b === btn));
      bodyEl.querySelectorAll('.ps-pane').forEach((p) => {
        p.style.display = p.dataset.pane === activeSettingsTab ? 'block' : 'none';
      });
    });
  });

  // Live accent color swatches
  const accentInput = bodyEl.querySelector('#ps-accent-color');
  const previewAccent = (hex) => {
    document.documentElement.style.setProperty('--accent', hex);
  };
  accentInput.addEventListener('input', () => previewAccent(accentInput.value));
  bodyEl.querySelectorAll('.ps-swatch-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      accentInput.value = btn.dataset.hex;
      previewAccent(btn.dataset.hex);
    });
  });

  // Live announcement preview
  const annText = bodyEl.querySelector('#ps-ann-text');
  const annBg = bodyEl.querySelector('#ps-ann-bg');
  const annPrev = bodyEl.querySelector('#ps-ann-preview');
  const updateAnnPrev = () => {
    annPrev.style.background = annBg.value || '#f59e0b';
    annPrev.textContent = `📢 Preview: ${annText.value.trim() || 'Your live announcement banner will appear here...'}`;
  };
  annText.addEventListener('input', updateAnnPrev);
  annBg.addEventListener('input', updateAnnPrev);

  // Logo upload
  const logoUpload = bodyEl.querySelector('#ps-logo-upload');
  const logoUrlInput = bodyEl.querySelector('#ps-logo-url');
  const logoPreview = bodyEl.querySelector('#ps-logo-preview');
  const logoStatus = bodyEl.querySelector('#ps-logo-status');
  logoUpload.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    logoStatus.textContent = '⏳ Uploading logo...';
    try {
      const url = await uploadAdminImageFile(file);
      logoUrlInput.value = url;
      logoPreview.innerHTML = `<img src="${escapeHtml(url)}" class="gl-cover-img" alt="Logo" />`;
      logoStatus.textContent = '✅ Logo uploaded! Click "Save All Settings" to apply.';
    } catch (err) {
      logoStatus.textContent = `❌ ${err.message}`;
    }
  });

  // Save all settings
  async function saveAllSettings() {
    const payload = [];
    bodyEl.querySelectorAll('.ps-text-input').forEach((el) => {
      payload.push({ key: el.dataset.key, value: String(el.value ?? '').trim() });
    });
    bodyEl.querySelectorAll('.ps-bool-input').forEach((el) => {
      payload.push({ key: el.dataset.key, value: el.checked ? 'true' : 'false' });
    });
    try {
      const res = await api.request('/api/v1/admin/settings/bulk', {
        method: 'PUT',
        body: JSON.stringify({ settings: payload }),
      });
      window.dispatchEvent(new CustomEvent('gitego:settings-updated'));
      renderSettingsAdminSection(bodyEl, {
        type: 'success',
        text: `✨ Saved ${res.updated} platform settings! Live theme & branding applied.`,
      });
    } catch (err) {
      renderSettingsAdminSection(bodyEl, { type: 'error', text: `❌ ${err.message}` });
    }
  }

  bodyEl.querySelector('#ps-master-form').addEventListener('submit', (e) => {
    e.preventDefault();
    saveAllSettings();
  });
  bodyEl.querySelector('#ps-save-all-top-btn').addEventListener('click', saveAllSettings);

  // Add custom setting
  bodyEl.querySelector('#ps-add-custom-btn').addEventListener('click', async () => {
    const key = bodyEl.querySelector('#ps-custom-key').value.trim();
    const value = bodyEl.querySelector('#ps-custom-val').value.trim();
    const description = bodyEl.querySelector('#ps-custom-desc').value.trim();
    if (!key) {
      window.alert('Enter a setting key.');
      return;
    }
    await api.request('/api/v1/admin/settings', {
      method: 'PUT',
      body: JSON.stringify({ key, value, description }),
    });
    renderSettingsAdminSection(bodyEl, { type: 'success', text: `✅ Saved custom setting "${key}".` });
  });

  // Export JSON
  bodyEl.querySelector('#ps-export-json-btn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gitego-platform-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Reset to defaults
  bodyEl.querySelector('#ps-reset-defaults-btn').addEventListener('click', async () => {
    if (!window.confirm('Reset all platform settings to recommended defaults?')) return;
    await api.request('/api/v1/admin/settings/reset-defaults', { method: 'POST' });
    window.dispatchEvent(new CustomEvent('gitego:settings-updated'));
    renderSettingsAdminSection(bodyEl, { type: 'success', text: '♻️ All platform settings reset to defaults.' });
  });
}
