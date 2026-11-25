import { api } from '../api.js';
import { mountVideoWithAds } from '../components/videoAdPlayer.js';

let activeCinemaAdPlayer = null;

const AVATAR_CHOICES = ['🦁', '🚀', '🦄', '🦖', '👑', '🎧', '🦊', '⚽'];

let childState = {
  tab: 'explore', // explore, games, storybooks, videos, learning, rewards
  vibe: ['aurora', 'sunshine', 'emerald', 'ocean'].includes(localStorage.getItem('gitego_kid_vibe'))
    ? localStorage.getItem('gitego_kid_vibe')
    : 'aurora', // aurora, sunshine, emerald, ocean
  customAvatar: localStorage.getItem('gitego_kid_avatar') || '',
  dashboard: null,
  bookshelf: null,
  languages: [],
  categories: [],
  filterLang: '',
  filterAge: '',
  filterCategory: '',
  filterDifficulty: '',
  searchQuery: '',
  searchResults: null,
  activeGame: null,
  activeGameSession: null,
  activeBook: null,
  activeBookPageIdx: 0,
  bookFontSize: 22,
  activeVideo: null,
  activeVideoSessionId: null,
  videoPlaying: false,
  videoFilter: 'all', // all, movies, learn
  activeSubjectId: null,
  lessons: [],
};

let videoTelemetryTimer = null;
let uiAudioCtx = null;
let childHeartbeatTimer = null;
let currentChildActivity = 'Browsing Child World';

function isPreviewMode() {
  const user = api.getCurrentUser();
  return Boolean(childState.dashboard?.child?.is_preview || (user && user.role !== 'CHILD'));
}

export function stopChildHeartbeat() {
  if (childHeartbeatTimer) {
    clearInterval(childHeartbeatTimer);
    childHeartbeatTimer = null;
  }
}

export async function sendChildLeaving() {
  stopChildHeartbeat();
  const user = api.getCurrentUser();
  if (!user || user.role !== 'CHILD' || !api.getToken()) return;
  try {
    await api.request('/api/v1/children/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        activity: 'Offline',
        device_id: api.getDeviceId(),
        leaving: true,
      }),
    });
  } catch {
    // ignore on logout
  }
}

async function pingChildHeartbeat(activityText = null) {
  if (activityText) currentChildActivity = activityText;
  const user = api.getCurrentUser();
  if (!user || user.role !== 'CHILD' || !api.getToken()) return;
  try {
    await api.request('/api/v1/children/heartbeat', {
      method: 'POST',
      body: JSON.stringify({
        activity: currentChildActivity,
        device_id: api.getDeviceId(),
        leaving: false,
      }),
    });
  } catch (err) {
    if (err && err.message && (err.message.includes('ACCOUNT_SUSPENDED') || err.message.toLowerCase().includes('suspended'))) {
      stopChildHeartbeat();
      stopVideoTelemetry();
      api.clearSession();
      window.dispatchEvent(
        new CustomEvent('gitego:child-suspended', {
          detail: { message: err.message.replace('ACCOUNT_SUSPENDED:', '').trim() },
        })
      );
    }
  }
}

function ensureChildHeartbeat(activityText = null) {
  if (activityText) currentChildActivity = activityText;
  const user = api.getCurrentUser();
  if (!user || user.role !== 'CHILD') {
    stopChildHeartbeat();
    return;
  }
  pingChildHeartbeat(currentChildActivity);
  if (!childHeartbeatTimer) {
    childHeartbeatTimer = setInterval(() => pingChildHeartbeat(), 6000);
  }
}

function playKidSfx(type = 'pop') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!uiAudioCtx) uiAudioCtx = new AudioCtx();
    if (uiAudioCtx.state === 'suspended') uiAudioCtx.resume();
    const notes =
      type === 'fanfare'
        ? [523.25, 659.25, 783.99, 1046.5]
        : type === 'coin'
        ? [587.33, 880]
        : [440];
    notes.forEach((freq, idx) => {
      const osc = uiAudioCtx.createOscillator();
      const gain = uiAudioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, uiAudioCtx.currentTime + idx * 0.07);
      gain.gain.setValueAtTime(0.14, uiAudioCtx.currentTime + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, uiAudioCtx.currentTime + idx * 0.07 + 0.16);
      osc.connect(gain);
      gain.connect(uiAudioCtx.destination);
      osc.start(uiAudioCtx.currentTime + idx * 0.07);
      osc.stop(uiAudioCtx.currentTime + idx * 0.07 + 0.17);
    });
  } catch {
    // Ignore audio context restrictions
  }
}

function spawnStarBurst(x, y) {
  const icons = ['⭐', '✨', '🌈', '🎉', '💫', '🔥'];
  for (let i = 0; i < 10; i++) {
    const el = document.createElement('span');
    el.className = 'kid-confetti-burst';
    el.textContent = icons[i % icons.length];
    const angle = (Math.PI * 2 * i) / 10;
    const dist = 55 + Math.random() * 65;
    el.style.left = `${x || window.innerWidth / 2}px`;
    el.style.top = `${y || window.innerHeight / 3}px`;
    el.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    el.style.setProperty('--dy', `${Math.sin(angle) * dist - 40}px`);
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1150);
  }
}

// Rich cinematic palettes: [deep base, glow, highlight]
const ART_PALETTES = [
  ['#1e1b4b', '#7c3aed', '#f472b6'],
  ['#0c1e3a', '#0ea5e9', '#a5f3fc'],
  ['#3b0a1e', '#e11d48', '#fdba74'],
  ['#052e2b', '#10b981', '#bef264'],
  ['#2a1505', '#f59e0b', '#fde68a'],
  ['#1a0b2e', '#c026d3', '#93c5fd'],
];

function artPalette(seedIdx = 0) {
  return ART_PALETTES[Math.abs(seedIdx) % ART_PALETTES.length];
}

function buildCardSvgArt(seedIdx = 0, variant = 'game') {
  const [base, glow, hi] = artPalette(seedIdx);
  const uid = `${variant}-${seedIdx}-${Math.random().toString(36).slice(2, 7)}`;
  const accentShape =
    variant === 'book'
      ? `<rect x="214" y="22" width="76" height="98" rx="10" fill="${hi}" opacity="0.10" transform="rotate(8 252 71)" />
         <rect x="200" y="30" width="76" height="98" rx="10" fill="${hi}" opacity="0.08" transform="rotate(-6 238 79)" />`
      : `<circle cx="262" cy="40" r="46" fill="none" stroke="${hi}" stroke-opacity="0.16" stroke-width="1.5" />
         <circle cx="262" cy="40" r="72" fill="none" stroke="${hi}" stroke-opacity="0.08" stroke-width="1.5" />`;
  return `<svg class="card-art-svg" viewBox="0 0 320 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <radialGradient id="glow-${uid}" cx="50%" cy="55%" r="60%">
        <stop offset="0%" stop-color="${glow}" stop-opacity="0.95" />
        <stop offset="100%" stop-color="${glow}" stop-opacity="0" />
      </radialGradient>
      <radialGradient id="hi-${uid}" cx="85%" cy="10%" r="45%">
        <stop offset="0%" stop-color="${hi}" stop-opacity="0.55" />
        <stop offset="100%" stop-color="${hi}" stop-opacity="0" />
      </radialGradient>
      <pattern id="dots-${uid}" width="14" height="14" patternUnits="userSpaceOnUse">
        <circle cx="1.5" cy="1.5" r="1" fill="#ffffff" fill-opacity="0.06" />
      </pattern>
    </defs>
    <rect width="320" height="200" fill="${base}" />
    <rect width="320" height="200" fill="url(#glow-${uid})" />
    <rect width="320" height="200" fill="url(#hi-${uid})" />
    <rect width="320" height="200" fill="url(#dots-${uid})" />
    ${accentShape}
  </svg>`;
}

const ICONS = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.53.85l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z"/></svg>',
  shuffle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="m15 15 6 6"/><path d="M4 4l5 5"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>',
  right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>',
};

function miniThumb(val) {
  return isImageUrl(val)
    ? `<img class="mini-thumb" src="${val}" alt="" loading="lazy" />`
    : `<span class="mini-thumb">${val || '✨'}</span>`;
}

function rowHeader(title, subtitle, rowId, seeAllTab) {
  return `
    <div class="row-head">
      <div>
        <h2>${title}</h2>
        ${subtitle ? `<p>${subtitle}</p>` : ''}
      </div>
      <div class="row-tools">
        ${seeAllTab ? `<button class="row-link see-all-btn" data-tab="${seeAllTab}" type="button">Reba Byose →</button>` : ''}
        <button class="row-arrow" data-row="${rowId}" data-dir="-1" type="button" aria-label="Scroll left">${ICONS.left}</button>
        <button class="row-arrow" data-row="${rowId}" data-dir="1" type="button" aria-label="Scroll right">${ICONS.right}</button>
      </div>
    </div>`;
}

function wireRowControls(scopeEl, rootContainer) {
  scopeEl.querySelectorAll('.row-arrow').forEach((btn) => {
    btn.addEventListener('click', () => {
      const row = scopeEl.querySelector(`#${btn.dataset.row}`);
      if (row) row.scrollBy({ left: Number(btn.dataset.dir) * row.clientWidth * 0.85, behavior: 'smooth' });
    });
  });
  scopeEl.querySelectorAll('.see-all-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playKidSfx('pop');
      childState.tab = btn.dataset.tab;
      renderChildView(rootContainer).then(() => {
        const nav = rootContainer.querySelector('.child-nav-wrap');
        if (nav) nav.scrollIntoView({ behavior: 'smooth' });
      });
    });
  });
}

function stopVideoTelemetry() {
  if (videoTelemetryTimer) {
    clearInterval(videoTelemetryTimer);
    videoTelemetryTimer = null;
  }
}

export async function renderChildView(container) {
  stopVideoTelemetry();
  try {
    const [dash, shelf, langs, cats, lessons] = await Promise.all([
      api.request(`/api/v1/children/dashboard${childState.filterLang ? `?language=${childState.filterLang}` : ''}`),
      api.request('/api/v1/storybooks/bookshelf'),
      api.request('/api/v1/languages'),
      api.request('/api/v1/categories'),
      api.request('/api/v1/learning/lessons'),
    ]);
    childState.dashboard = dash;
    childState.bookshelf = shelf;
    childState.languages = langs;
    childState.categories = cats;
    childState.lessons = lessons;
  } catch (err) {
    if (err && err.message && err.message.includes('ACCOUNT_SUSPENDED')) {
      stopChildHeartbeat();
      api.clearSession();
      window.dispatchEvent(
        new CustomEvent('gitego:child-suspended', {
          detail: { message: err.message.replace('ACCOUNT_SUSPENDED:', '').trim() },
        })
      );
      return;
    }
    container.innerHTML = `<div style="padding:32px;color:#fda4af">Error loading Child World: ${err.message}</div>`;
    return;
  }

  const tabActivityMap = {
    explore: 'Exploring Child World',
    games: 'Browsing Games',
    storybooks: 'Browsing Storybooks',
    videos: 'Browsing Cartoons & Videos',
    learning: 'Learning Center',
    rewards: 'Viewing Rewards & Badges',
  };
  ensureChildHeartbeat(tabActivityMap[childState.tab] || 'Browsing Child World');

  const d = childState.dashboard;
  const ch = d.child;
  const st = d.screen_time;
  const preview = isPreviewMode();
  const currentUser = api.getCurrentUser() || {};
  const previewRoleLabel = currentUser.role === 'PARENT' ? 'Parent Preview' : 'Admin Preview';
  const activeAvatar = preview ? ch.avatar || '🛡️' : childState.customAvatar || ch.avatar;
  const xpPercent = Math.min(100, Math.round(((ch.total_stars % 15) / 15) * 100)) || 35;

  const vibeClass = childState.vibe && childState.vibe !== 'aurora' ? `vibe-${childState.vibe}` : '';
  const featured = d.games[0] || null;
  const [, heroGlow, heroHi] = artPalette(0);
  const featuredArt = featured
    ? isImageUrl(featured.cover_image)
      ? `<div class="cine-hero-art"><img src="${featured.cover_image}" alt="" /></div>`
      : `<div class="cine-hero-art" data-emoji="${featured.cover_image}" aria-hidden="true">${featured.cover_image}</div>`
    : `<div class="cine-hero-art" data-emoji="🌍" aria-hidden="true">🌍</div>`;
  const remaining = st.remaining_minutes;

  container.innerHTML = `
    <div class="theme-child ${vibeClass}">
      <!-- Cinematic Billboard Hero -->
      <section class="cine-hero" aria-label="Featured">
        <div class="cine-hero-bg" style="--h1:${heroGlow};--h2:${heroHi}"></div>
        ${featuredArt}
        <div class="cine-hero-shade"></div>
        <div class="cine-hero-inner">
          <div class="cine-hero-copy">
            <div class="cine-eyebrow"><span class="dot">★</span> Umukino w'Umunsi · Featured Game</div>
            <h1 class="cine-title">${featured ? featured.title : "Ikaze mu Isi y'Imikino n'Inkuru"}</h1>
            <p class="cine-desc">${
              featured
                ? featured.description
                : "Kina udukino dushya, soma inkuru mu Kinyarwanda, Igifaransa n'Igiswahili, kandi ukusanye inyenyeri za zahabu!"
            }</p>
            ${
              featured
                ? `<div class="cine-meta">
                    <span class="match">${featured.play_count || 12} plays</span>
                    <span class="tag">${featured.age_group}+</span>
                    <span>${featured.difficulty}</span>
                    <span class="sep"></span>
                    <span>${featured.category_name}</span>
                  </div>`
                : ''
            }
            <div class="cine-actions">
              ${
                featured
                  ? `<button id="hero-play-btn" class="btn-cine-primary" data-id="${featured.id}" type="button">${ICONS.play} Kina Ubu</button>`
                  : ''
              }
              <button id="quick-surprise-btn" class="btn-cine-glass" type="button">${ICONS.shuffle} Surprise Me</button>
            </div>
          </div>

          <aside class="player-card" aria-label="${preview ? previewRoleLabel : 'Your profile'}">
            ${
              preview
                ? `
            <div class="player-top">
              <div class="child-avatar-circle" style="--xp:100" aria-hidden="true">
                <span>${activeAvatar}</span>
              </div>
              <div class="player-hello">
                <small>${previewRoleLabel}</small>
                <h2>${currentUser.full_name || currentUser.username || previewRoleLabel}</h2>
                <span class="player-level">👁️ Preview Mode</span>
              </div>
            </div>
            <div style="margin:12px 0;padding:10px 12px;border-radius:12px;background:rgba(16,185,129,0.12);border:1px solid rgba(16,185,129,0.28);font-size:0.82rem;line-height:1.45;color:var(--text-2)">
              <strong style="color:#6ee7b7;display:block;margin-bottom:2px">🛡️ Ntibirimo konti y'umwana</strong>
              Urareba Child World nk'umubyeyi (Preview). Umwana ashobora kwinjira muri konti ye nta nkomyi.
            </div>
                `
                : `
            <div class="player-top">
              <div class="child-avatar-circle" id="cycle-avatar-btn" style="--xp:${xpPercent}" title="Kanda uhindure Avatar yawe!" role="button" tabindex="0">
                <span>${activeAvatar}</span>
                <span class="avatar-edit-tag">✨</span>
              </div>
              <div class="player-hello">
                <small>Muraho</small>
                <h2>${ch.display_name}</h2>
                <span class="player-level">🏅 Level ${ch.current_level} Explorer</span>
              </div>
            </div>
            <div class="player-xp">
              <div class="player-xp-row"><span>Level ${ch.current_level} → ${ch.current_level + 1}</span><strong>${xpPercent}%</strong></div>
              <div class="hero-xp-track"><div class="hero-xp-fill" style="width:${xpPercent}%"></div></div>
            </div>
            <div class="child-stats-bar">
              <div class="stat-tile" title="Stars Earned">
                <span class="stat-ico">⭐</span>
                <span class="stat-val" id="child-star-readout">${ch.total_stars}</span>
                <span class="stat-lbl">Inyenyeri</span>
              </div>
              <div class="stat-tile">
                <span class="stat-ico">🔥</span>
                <span class="stat-val">5</span>
                <span class="stat-lbl">Day streak</span>
              </div>
              <div class="stat-tile" title="Screen time remaining today">
                <span class="stat-ico">⏱️</span>
                <span class="stat-val">${remaining}m</span>
                <span class="stat-lbl">of ${st.daily_limit_minutes}m left</span>
              </div>
            </div>
                `
            }
            <div class="vibe-switcher">
              <span>Theme</span>
              <div class="vibe-dots">
                <button class="vibe-btn ${childState.vibe === 'aurora' ? 'active' : ''}" data-vibe="aurora" type="button" title="Aurora" aria-label="Aurora theme"></button>
                <button class="vibe-btn ${childState.vibe === 'sunshine' ? 'active' : ''}" data-vibe="sunshine" type="button" title="Izuba" aria-label="Izuba theme"></button>
                <button class="vibe-btn ${childState.vibe === 'emerald' ? 'active' : ''}" data-vibe="emerald" type="button" title="Akagera" aria-label="Akagera theme"></button>
                <button class="vibe-btn ${childState.vibe === 'ocean' ? 'active' : ''}" data-vibe="ocean" type="button" title="Kivu" aria-label="Kivu theme"></button>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <!-- Sticky Section Navigation -->
      <div class="child-nav-wrap">
        <nav class="child-nav" aria-label="Child World Sections">
          <button class="child-nav-btn ${childState.tab === 'explore' ? 'active' : ''}" data-tab="explore">
            <span class="emoji">🌟</span><span class="label">Ahabanza</span>
          </button>
          <button class="child-nav-btn ${childState.tab === 'games' ? 'active' : ''}" data-tab="games">
            <span class="emoji">🎮</span><span class="label">Games</span><span class="count">${d.games.length}</span>
          </button>
          <button class="child-nav-btn ${childState.tab === 'storybooks' ? 'active' : ''}" data-tab="storybooks">
            <span class="emoji">📖</span><span class="label">Storybooks</span><span class="count">${d.storybooks.length}</span>
          </button>
          <button class="child-nav-btn ${childState.tab === 'videos' ? 'active' : ''}" data-tab="videos">
            <span class="emoji">🎬</span><span class="label">Cartoons</span><span class="count">${d.videos.length}</span>
          </button>
          <button class="child-nav-btn ${childState.tab === 'learning' ? 'active' : ''}" data-tab="learning">
            <span class="emoji">🧠</span><span class="label">Learning</span><span class="count">${d.learning_subjects.length}</span>
          </button>
          <button class="child-nav-btn ${childState.tab === 'rewards' ? 'active' : ''}" data-tab="rewards">
            <span class="emoji">🏆</span><span class="label">Rewards</span>
          </button>
        </nav>
      </div>

      <!-- Main Child Content -->
      <main class="child-container" id="child-tab-body"></main>

      <!-- Active Modal Stage (Game Player / Storybook Reader / Video Player) -->
      <div id="child-modal-root"></div>
    </div>
  `;

  const heroPlay = container.querySelector('#hero-play-btn');
  if (heroPlay) {
    heroPlay.addEventListener('click', (e) => {
      playKidSfx('coin');
      spawnStarBurst(e.clientX, e.clientY);
      openChildGamePlayer(Number(heroPlay.dataset.id), container);
    });
  }

  // Avatar Cycle with Sound & Confetti (only for active child profiles)
  const avatarBtn = container.querySelector('#cycle-avatar-btn');
  if (avatarBtn) {
    avatarBtn.addEventListener('click', (e) => {
      playKidSfx('coin');
      spawnStarBurst(e.clientX, e.clientY);
      const curIdx = AVATAR_CHOICES.indexOf(activeAvatar);
      const nextAvatar = AVATAR_CHOICES[(curIdx + 1) % AVATAR_CHOICES.length];
      childState.customAvatar = nextAvatar;
      localStorage.setItem('gitego_kid_avatar', nextAvatar);
      renderChildView(container);
    });
  }

  // Theme Vibe Switcher
  container.querySelectorAll('.vibe-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      playKidSfx('pop');
      spawnStarBurst(e.clientX, e.clientY);
      childState.vibe = btn.dataset.vibe;
      localStorage.setItem('gitego_kid_vibe', childState.vibe);
      renderChildView(container);
    });
  });

  // Quick Surprise Play button
  container.querySelector('#quick-surprise-btn').addEventListener('click', (e) => {
    playKidSfx('fanfare');
    spawnStarBurst(e.clientX, e.clientY);
    if (d.games.length) {
      const randGame = d.games[Math.floor(Math.random() * d.games.length)];
      openChildGamePlayer(randGame.id, container);
    }
  });

  container.querySelectorAll('.child-nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playKidSfx('pop');
      childState.tab = btn.dataset.tab;
      renderChildView(container);
    });
  });

  const bodyEl = container.querySelector('#child-tab-body');
  if (childState.tab === 'explore') renderExploreTab(bodyEl, container);
  else if (childState.tab === 'games') renderGamesTab(bodyEl, container);
  else if (childState.tab === 'storybooks') renderStorybooksTab(bodyEl, container);
  else if (childState.tab === 'videos') renderVideosTab(bodyEl, container);
  else if (childState.tab === 'learning') renderLearningTab(bodyEl, container);
  else if (childState.tab === 'rewards') renderRewardsTab(bodyEl);
}

function renderExploreTab(bodyEl, rootContainer) {
  const d = childState.dashboard;
  const results = childState.searchResults;

  bodyEl.innerHTML = `
    <div class="child-filter-bar">
      <div class="search-field">
        ${ICONS.search}
        <input id="global-search-q" type="text" placeholder="Shakisha udukino, inkuru, cartoons..." value="${childState.searchQuery}" />
      </div>
      <select id="filter-lang" aria-label="Language">
        <option value="">🌍 Indimi Zose</option>
        ${childState.languages.map((l) => `<option value="${l.code}" ${childState.filterLang === l.code ? 'selected' : ''}>${l.flag_emoji} ${l.name}</option>`).join('')}
      </select>
      <select id="filter-age" aria-label="Age">
        <option value="">Imyaka Yose</option>
        <option value="3-5" ${childState.filterAge === '3-5' ? 'selected' : ''}>Imyaka 3–5</option>
        <option value="6-8" ${childState.filterAge === '6-8' ? 'selected' : ''}>Imyaka 6–8</option>
        <option value="9-12" ${childState.filterAge === '9-12' ? 'selected' : ''}>Imyaka 9–12</option>
      </select>
      <select id="filter-diff" aria-label="Difficulty">
        <option value="">Urwego Rwose</option>
        <option value="Easy" ${childState.filterDifficulty === 'Easy' ? 'selected' : ''}>Byoroshye</option>
        <option value="Medium" ${childState.filterDifficulty === 'Medium' ? 'selected' : ''}>Biringaniye</option>
        <option value="Hard" ${childState.filterDifficulty === 'Hard' ? 'selected' : ''}>Bigoye</option>
      </select>
      <button id="run-search-btn" class="child-play-btn" type="button">Shakisha</button>
    </div>

    <!-- Continue where you left off -->
    <div class="continue-grid">
      <div class="kid-panel continue-panel">
        <h3><span class="ico">🕹️</span> Recently Played</h3>
        ${
          d.recently_played.length
            ? d.recently_played.map((rp) => `<div class="recent-row-item"><span class="recent-row-title" title="${rp.title}">${miniThumb(rp.cover_image)}<span class="t">${rp.title}</span></span><span class="recent-row-meta ${rp.completed ? 'ok' : ''}">${rp.completed ? '⭐ Done' : 'Playing'}</span></div>`).join('')
            : '<p>Play your first game below!</p>'
        }
      </div>
      <div class="kid-panel continue-panel">
        <h3><span class="ico">📖</span> Continue Reading</h3>
        ${
          d.continue_reading.length
            ? d.continue_reading.map((cr) => `<div class="recent-row-item"><span class="recent-row-title" title="${cr.title}">${miniThumb(cr.cover_image)}<span class="t">${cr.title}</span></span><span class="recent-row-meta info">Ipaji ${cr.last_page_number}</span></div>`).join('')
            : '<p>Open any storybook to start reading!</p>'
        }
      </div>
      <div class="kid-panel continue-panel">
        <h3><span class="ico">🎬</span> Continue Watching</h3>
        ${
          d.continue_watching.length
            ? d.continue_watching.map((cw) => `<div class="recent-row-item"><span class="recent-row-title" title="${cw.title}">${miniThumb(cw.thumbnail_url)}<span class="t">${cw.title}</span></span><span class="recent-row-meta pink">${Math.round(cw.last_position_seconds)}s</span></div>`).join('')
            : '<p>Pick a cartoon episode to watch!</p>'
        }
      </div>
    </div>

    <section class="row-section">
      ${rowHeader(results ? '🔍 Games Found' : '🎮 Featured Games', 'Udukino twiza two gukina uyu munsi', 'explore-games-grid', 'games')}
      <div class="media-row" id="explore-games-grid"></div>
    </section>

    <section class="row-section">
      ${rowHeader(results ? '🔍 Storybooks Found' : '📖 Multilingual Storybooks', 'Kinyarwanda • Français • Kiswahili', 'explore-books-grid', 'storybooks')}
      <div class="media-row" id="explore-books-grid"></div>
    </section>

    ${
      !results && d.videos.length
        ? `<section class="row-section">
            ${rowHeader('🎬 Cartoons', 'Reba cartoons nziza kandi zifite umutekano', 'explore-videos-grid', 'videos')}
            <div class="media-row" id="explore-videos-grid"></div>
          </section>`
        : ''
    }
  `;

  const gamesToShow = results ? results.games : d.games;
  const booksToShow = results ? results.storybooks : d.storybooks;

  renderGameCards(bodyEl.querySelector('#explore-games-grid'), gamesToShow, rootContainer);
  renderBookCards(bodyEl.querySelector('#explore-books-grid'), booksToShow, rootContainer);
  const vRow = bodyEl.querySelector('#explore-videos-grid');
  if (vRow) renderVideoCards(vRow, d.videos, rootContainer);
  wireRowControls(bodyEl, rootContainer);

  const runSearch = async () => {
    playKidSfx('pop');
    childState.searchQuery = bodyEl.querySelector('#global-search-q').value.trim();
    childState.filterLang = bodyEl.querySelector('#filter-lang').value;
    childState.filterAge = bodyEl.querySelector('#filter-age').value;
    childState.filterDifficulty = bodyEl.querySelector('#filter-diff').value;
    const params = new URLSearchParams();
    if (childState.searchQuery) params.set('q', childState.searchQuery);
    if (childState.filterLang) params.set('language', childState.filterLang);
    if (childState.filterAge) params.set('age_group', childState.filterAge);
    if (childState.filterDifficulty) params.set('difficulty', childState.filterDifficulty);
    childState.searchResults = params.toString() ? await api.request(`/api/v1/search?${params.toString()}`) : null;
    renderExploreTab(bodyEl, rootContainer);
  };
  bodyEl.querySelector('#run-search-btn').addEventListener('click', runSearch);
  bodyEl.querySelector('#global-search-q').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });
}

function renderGameCards(gridEl, games, rootContainer) {
  if (!games.length) {
    gridEl.innerHTML = '<p class="empty-note">No games match the current filter.</p>';
    return;
  }
  gridEl.innerHTML = games
    .map(
      (g, idx) => `
      <article class="child-card">
        <div class="child-card-thumb">
          ${
            isImageUrl(g.cover_image)
              ? `<img src="${g.cover_image}" alt="" loading="lazy" />`
              : `${buildCardSvgArt(idx, 'game')}<span class="floating-hero-emoji">${g.cover_image}</span>`
          }
          <span class="child-badge">AGES ${g.age_group} · ${String(g.difficulty).toUpperCase()}</span>
          <span class="child-engine-tag">${g.category_name}</span>
          <button class="thumb-play play-game-trigger" data-id="${g.id}" type="button" aria-label="Play ${g.title}">${ICONS.play}</button>
        </div>
        <div class="card-body">
          <h3 title="${g.title}">${g.title}</h3>
          <p>${g.description}</p>
          <div class="card-foot">
            <span class="card-meta"><span class="hot">●</span> ${g.play_count || 12} plays</span>
            <button class="child-play-btn play-game-trigger" data-id="${g.id}" type="button">▶ Kina</button>
          </div>
        </div>
      </article>
    `
    )
    .join('');

  gridEl.querySelectorAll('.play-game-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      playKidSfx('coin');
      spawnStarBurst(e.clientX, e.clientY);
      openChildGamePlayer(Number(btn.dataset.id), rootContainer);
    });
  });
}

function renderGamesTab(bodyEl, rootContainer) {
  bodyEl.innerHTML = `
    <h2 class="section-title">🎮 Gitego Arcade</h2>
    <div class="child-grid" id="games-tab-grid"></div>
  `;
  renderGameCards(bodyEl.querySelector('#games-tab-grid'), childState.dashboard.games, rootContainer);
}

let activeGameCleanup = null;

async function openChildGamePlayer(gameId, rootContainer) {
  if (typeof activeGameCleanup === 'function') {
    activeGameCleanup();
    activeGameCleanup = null;
  }

  const preview = isPreviewMode();
  const game = await api.request(`/api/v1/games/${gameId}`);
  const session = preview
    ? null
    : await api.request(`/api/v1/games/${gameId}/sessions`, { method: 'POST', body: JSON.stringify({}) });
  pingChildHeartbeat(`Playing Game: ${game.title}`);

  const allGames = (childState.dashboard && childState.dashboard.games) || [];
  const curIdx = allGames.findIndex((g) => g.id === game.id);
  const prevGame = curIdx > 0 ? allGames[curIdx - 1] : null;
  const nextGame = curIdx >= 0 && curIdx < allGames.length - 1 ? allGames[curIdx + 1] : null;
  const quickGames = allGames.filter((g) => g.id !== game.id).slice(0, 5);

  const coverVisual = isImageUrl(game.cover_image)
    ? `<img class="arcade-game-thumb" src="${game.cover_image}" alt="" />`
    : `<span class="arcade-game-emoji">${game.cover_image || '🎮'}</span>`;

  let sfxEnabled = localStorage.getItem('gitego_arcade_sfx') !== 'off';
  let fitMode = localStorage.getItem('gitego_arcade_fit') || 'fill'; // 'fill' | 'classic' | 'theater'
  let highScore = Number(game.highest_score || 0);
  let currentScore = 0;
  let elapsedSec = 0;
  let startedAt = Date.now();
  let newRecordCelebrated = false;

  const formatClock = (s) => {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  const modalRoot = rootContainer.querySelector('#child-modal-root');
  document.body.classList.add('arcade-modal-open');

  modalRoot.innerHTML = `
    <div class="stage-modal arcade-modal" id="game-player-modal">
      <div class="stage-box arcade-stage fit-${fitMode}" id="game-stage-box">
        <!-- Ambient Arcade Glow -->
        <div class="arcade-ambient-glow" aria-hidden="true"></div>

        <!-- Compact Sleek Arcade Top HUD -->
        <header class="arcade-hud">
          <div class="arcade-hud-left">
            <div class="arcade-badge">${coverVisual}</div>
            <div class="arcade-title-block">
              <div class="arcade-title-row">
                <h2>${game.title}</h2>
                ${game.difficulty ? `<span class="arcade-chip diff">${game.difficulty}</span>` : ''}
                ${game.category_name ? `<span class="arcade-chip">${game.category_name}</span>` : ''}
                ${preview ? `<span class="arcade-chip preview">👁️ Preview</span>` : ''}
              </div>
              <p class="arcade-sub-hint">${game.instructions || 'Kina wishimire umukino!'}</p>
            </div>
          </div>

          <div class="arcade-hud-center">
            <div class="arcade-hud-pill score-pill" id="live-game-score" title="Current score">
              <span class="pill-ico">⭐</span>
              <span class="pill-val" id="arcade-score-val">0</span>
            </div>
            <div class="arcade-hud-pill best-pill" id="arcade-best-pill" title="Best score">
              <span class="pill-ico">🏆</span>
              <span class="pill-val" id="arcade-best-val">${highScore}</span>
            </div>
            <div class="arcade-hud-pill timer-pill" title="Play time">
              <span class="pill-ico">⏱️</span>
              <span class="pill-val" id="arcade-timer-val">00:00</span>
            </div>
          </div>

          <div class="arcade-hud-actions">
            <button id="arcade-help-btn" class="arcade-icon-btn" type="button" title="Amabwiriza (How to Play)" aria-label="How to Play">❓</button>
            <button id="arcade-fit-btn" class="arcade-icon-btn" type="button" title="Hindura uko umukino ugaragara (Fill / Classic / Theater)">${fitMode === 'classic' ? '▣' : fitMode === 'theater' ? '🎬' : '⤢'}</button>
            <button id="arcade-sfx-btn" class="arcade-icon-btn ${sfxEnabled ? 'on' : ''}" type="button" title="Ijwi (Sound Effects)">${sfxEnabled ? '🔊' : '🔇'}</button>
            <button id="arcade-restart-btn" class="arcade-action-btn" type="button" title="Tangira bundi bushya (Restart)">🔄 Restart</button>
            <button id="fullscreen-game-btn" class="arcade-action-btn primary" type="button" title="Fullscreen (F)">⛶ Fullscreen</button>
            <button id="close-game-btn" class="arcade-action-btn danger" type="button" title="Funga (Esc)">✕</button>
          </div>
        </header>

        <!-- Collapsible How-to-Play Popover -->
        <div id="arcade-help-popover" class="arcade-help-popover" hidden>
          <div class="arcade-help-inner">
            <strong>🎮 Uko bakina "${game.title}"</strong>
            <p>${game.instructions || 'Koresha mouse, touch, cyangwa Arrow keys (↑ ↓ ← →) kugira ngo ukine kandi ukusanye inyenyeri!'}</p>
            <div class="arcade-shortcuts">
              <span><kbd>Click / Tap</kbd> cyangwa <kbd>↑ ↓ ← →</kbd> Gukina</span>
              <span><kbd>F</kbd> Fullscreen</span>
              <span><kbd>R</kbd> Restart</span>
              <span><kbd>Esc</kbd> Gusohoka</span>
            </div>
          </div>
          <button id="arcade-help-close" class="arcade-icon-btn" type="button" aria-label="Close help">✕</button>
        </div>

        <!-- Main Responsive Game Viewport -->
        <div class="arcade-viewport-wrap" id="arcade-viewport-wrap">
          <div id="game-loading-banner" class="arcade-loading-overlay">
            <div class="arcade-loader-ring">
              <span>${isImageUrl(game.cover_image) ? '🎮' : game.cover_image || '🎮'}</span>
            </div>
            <div class="arcade-loader-title">Turimo gutegura ${game.title}…</div>
            <div class="arcade-loader-bar"><span></span></div>
          </div>

          <div id="arcade-toast" class="arcade-toast" hidden></div>

          <div id="arcade-error-overlay" class="arcade-error-overlay" hidden>
            <div class="arcade-error-card">
              <span class="err-emoji">🛠️</span>
              <h3>Habayeho akabazo gato mu mukino</h3>
              <p id="arcade-error-text">Kanda "Restart" wongere ugerageze cyangwa uhitemo undi mukino.</p>
              <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
                <button id="arcade-err-restart" class="arcade-action-btn primary" type="button">🔄 Restart Game</button>
                ${nextGame ? `<button id="arcade-err-next" class="arcade-action-btn" type="button">Next Game →</button>` : ''}
              </div>
            </div>
          </div>

          <!-- Sandboxed Iframe: executes game in strict isolation without parent cookies, tokens, or source code visibility -->
          <div class="arcade-frame-shell">
            <iframe
              id="child-game-iframe"
              class="game-iframe-frame"
              sandbox="allow-scripts"
              allow="autoplay"
              src="/api/v1/games/${game.id}/play-bundle"
              title="${game.title}"
            ></iframe>
          </div>
        </div>

        <!-- Slim Quick-Switch Arcade Dock -->
        ${
          allGames.length > 1
            ? `
        <footer class="arcade-dock">
          <div class="arcade-dock-nav">
            ${prevGame ? `<button id="arcade-prev-btn" class="arcade-dock-btn" type="button" title="${prevGame.title}">◀ Prev</button>` : ''}
            <button id="arcade-surprise-btn" class="arcade-dock-btn accent" type="button">🎲 Surprise Game</button>
            ${nextGame ? `<button id="arcade-next-btn" class="arcade-dock-btn" type="button" title="${nextGame.title}">Next ▶</button>` : ''}
          </div>
          <div class="arcade-dock-list" aria-label="Quick switch games">
            ${quickGames
              .map(
                (g) => `
              <button class="arcade-quick-pill" data-game-id="${g.id}" type="button" title="Kina ${g.title}">
                <span>${isImageUrl(g.cover_image) ? '🎮' : g.cover_image || '🎮'}</span>
                <span>${g.title}</span>
              </button>
            `
              )
              .join('')}
          </div>
        </footer>
            `
            : ''
        }
      </div>
    </div>
  `;

  const stageBox = modalRoot.querySelector('#game-stage-box');
  const iframe = modalRoot.querySelector('#child-game-iframe');
  const loadingOverlay = modalRoot.querySelector('#game-loading-banner');
  const toastEl = modalRoot.querySelector('#arcade-toast');
  const errorOverlay = modalRoot.querySelector('#arcade-error-overlay');
  const errorText = modalRoot.querySelector('#arcade-error-text');
  const scoreValEl = modalRoot.querySelector('#arcade-score-val');
  const scorePillEl = modalRoot.querySelector('#live-game-score');
  const bestValEl = modalRoot.querySelector('#arcade-best-val');
  const timerValEl = modalRoot.querySelector('#arcade-timer-val');
  const fsBtn = modalRoot.querySelector('#fullscreen-game-btn');
  const fitBtn = modalRoot.querySelector('#arcade-fit-btn');
  const sfxBtn = modalRoot.querySelector('#arcade-sfx-btn');
  const helpBtn = modalRoot.querySelector('#arcade-help-btn');
  const helpPopover = modalRoot.querySelector('#arcade-help-popover');

  let toastTimer = null;
  const showToast = (html, variant = 'gold', ms = 3200) => {
    if (!toastEl) return;
    toastEl.className = `arcade-toast ${variant}`;
    toastEl.innerHTML = html;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.hidden = true;
    }, ms);
  };

  const focusGameFrame = () => {
    try {
      iframe.focus();
    } catch {
      // ignore
    }
  };

  const hideLoader = () => {
    if (loadingOverlay) loadingOverlay.classList.add('hidden');
    focusGameFrame();
  };

  iframe.addEventListener('load', () => {
    hideLoader();
  });

  // Clicking around the viewport automatically hands keyboard focus back to the game
  modalRoot.querySelector('#arcade-viewport-wrap').addEventListener('pointerdown', focusGameFrame);

  // Live arcade timer
  const timerInterval = setInterval(() => {
    elapsedSec = Math.floor((Date.now() - startedAt) / 1000);
    if (timerValEl) timerValEl.textContent = formatClock(elapsedSec);
  }, 1000);

  const restartGame = () => {
    if (sfxEnabled) playKidSfx('pop');
    if (errorOverlay) errorOverlay.hidden = true;
    if (loadingOverlay) loadingOverlay.classList.remove('hidden');
    currentScore = 0;
    startedAt = Date.now();
    elapsedSec = 0;
    newRecordCelebrated = false;
    if (scoreValEl) scoreValEl.textContent = '0';
    if (timerValEl) timerValEl.textContent = '00:00';
    iframe.src = `/api/v1/games/${game.id}/play-bundle?t=${Date.now()}`;
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      if (document.exitFullscreen) document.exitFullscreen();
    } else if (stageBox.requestFullscreen) {
      stageBox.requestFullscreen();
    }
  };

  const onFullscreenChange = () => {
    const isFs = document.fullscreenElement === stageBox;
    if (fsBtn) fsBtn.textContent = isFs ? '↙ Exit' : '⛶ Fullscreen';
    focusGameFrame();
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);

  const getPlayerStorageKey = (rawKey) => {
    const safeKey = String(rawKey || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48);
    const u = api.getCurrentUser() || {};
    const owner =
      u.role === 'CHILD'
        ? `child_${u.child_profile_id || u.id || 'anon'}`
        : `user_${u.id || u.username || 'anon'}`;
    return `gitego_pdata_${owner}_game_${game.id}_${safeKey}`;
  };

  const onMessage = async (event) => {
    const data = event.data;
    if (!data || data.type !== 'GITEGO_GAME_EVENT') return;

    if (data.event === 'STORAGE_SET') {
      try {
        const storageKey = getPlayerStorageKey(data.key);
        const serialized = JSON.stringify(data.value);
        if (serialized.length <= 250000) {
          localStorage.setItem(storageKey, serialized);
        }
      } catch {
        // ignore quota errors
      }
      return;
    }

    if (data.event === 'STORAGE_GET') {
      let val = null;
      try {
        const raw = localStorage.getItem(getPlayerStorageKey(data.key));
        if (raw !== null) val = JSON.parse(raw);
      } catch {
        val = null;
      }
      try {
        if (iframe && iframe.contentWindow) {
          iframe.contentWindow.postMessage(
            { type: 'GITEGO_HOST_STORAGE', requestId: data.requestId, key: data.key, value: val },
            '*'
          );
        }
      } catch {
        // ignore
      }
      return;
    }

    if (data.event === 'GAME_READY') {
      hideLoader();
      return;
    }

    if (data.event === 'RUNTIME_ERROR') {
      hideLoader();
      if (errorText) errorText.textContent = data.message || 'Habayeho ikibazo mu mukino.';
      if (errorOverlay) errorOverlay.hidden = false;
      return;
    }

    if (data.event === 'SCORE_UPDATE') {
      const nextScore = Math.max(0, Number(data.score) || 0);
      const gained = nextScore > currentScore;
      currentScore = nextScore;

      if (scoreValEl) scoreValEl.textContent = String(currentScore);
      if (scorePillEl) {
        scorePillEl.classList.remove('pulse');
        void scorePillEl.offsetWidth;
        scorePillEl.classList.add('pulse');
      }

      if (currentScore > highScore) {
        highScore = currentScore;
        if (bestValEl) bestValEl.textContent = String(highScore);
        if (!newRecordCelebrated && currentScore > 0) {
          newRecordCelebrated = true;
          showToast(`👑 <strong>New High Score!</strong> ${highScore} pts`, 'gold', 3000);
        }
      }

      if (data.completed) {
        if (sfxEnabled) playKidSfx('fanfare');
        spawnStarBurst();
        showToast(
          `🎉 <strong>Wabikoze neza!</strong> Score: ${currentScore} <button type="button" class="toast-mini-btn" id="toast-play-again">🔄 Play Again</button>`,
          'victory',
          6000
        );
        const againBtn = toastEl?.querySelector('#toast-play-again');
        if (againBtn) againBtn.addEventListener('click', restartGame);
      } else if (gained) {
        if (sfxEnabled) playKidSfx('coin');
        spawnStarBurst();
      }

      if (!session) return;
      try {
        const res = await api.request(`/api/v1/games/${game.id}/scores`, {
          method: 'POST',
          body: JSON.stringify({
            session_token: session.session_token,
            score: currentScore,
            duration_seconds: Math.max(5, elapsedSec || 10),
            completed: Boolean(data.completed),
          }),
        });
        const topStars = rootContainer.querySelector('#child-star-readout');
        if (topStars && res.child_total_stars) topStars.textContent = String(res.child_total_stars);
      } catch (e) {
        console.warn('Score validation notice:', e.message);
      }
    }
  };
  window.addEventListener('message', onMessage);

  const onKeyDown = (e) => {
    const tag = e.target?.tagName?.toUpperCase() || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (e.key === 'Escape' && !document.fullscreenElement) {
      closeModal(true);
    } else if (e.altKey && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault();
      toggleFullscreen();
    } else if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      restartGame();
    }
  };
  window.addEventListener('keydown', onKeyDown);

  const cleanup = () => {
    clearInterval(timerInterval);
    if (toastTimer) clearTimeout(toastTimer);
    window.removeEventListener('message', onMessage);
    window.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.body.classList.remove('arcade-modal-open');
    if (document.fullscreenElement === stageBox && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };
  activeGameCleanup = cleanup;

  const closeModal = (refreshParentView = true) => {
    cleanup();
    activeGameCleanup = null;
    modalRoot.innerHTML = '';
    if (refreshParentView) renderChildView(rootContainer);
  };

  // Cycle Fit Modes: fill (edge-to-edge) -> classic (4:3 centered arcade cabinet) -> theater (zero-dock max height)
  const fitOrder = ['fill', 'classic', 'theater'];
  const fitLabels = {
    fill: { icon: '⤢', label: 'Fill Mode — Umukino wuzuye screen' },
    classic: { icon: '▣', label: 'Arcade Cabinet — Umukino uri hagati neza' },
    theater: { icon: '🎬', label: 'Focus Mode — Nta kirogoya na kimwe' },
  };
  fitBtn.addEventListener('click', () => {
    const nextIdx = (fitOrder.indexOf(fitMode) + 1) % fitOrder.length;
    fitMode = fitOrder[nextIdx];
    localStorage.setItem('gitego_arcade_fit', fitMode);
    stageBox.classList.remove('fit-fill', 'fit-classic', 'fit-theater');
    stageBox.classList.add(`fit-${fitMode}`);
    fitBtn.textContent = fitLabels[fitMode].icon;
    showToast(`🖥️ ${fitLabels[fitMode].label}`, 'info', 2200);
    focusGameFrame();
  });

  sfxBtn.addEventListener('click', () => {
    sfxEnabled = !sfxEnabled;
    localStorage.setItem('gitego_arcade_sfx', sfxEnabled ? 'on' : 'off');
    sfxBtn.textContent = sfxEnabled ? '🔊' : '🔇';
    sfxBtn.classList.toggle('on', sfxEnabled);
    if (sfxEnabled) playKidSfx('pop');
    focusGameFrame();
  });

  helpBtn.addEventListener('click', () => {
    helpPopover.hidden = !helpPopover.hidden;
  });
  modalRoot.querySelector('#arcade-help-close').addEventListener('click', () => {
    helpPopover.hidden = true;
    focusGameFrame();
  });

  modalRoot.querySelector('#arcade-restart-btn').addEventListener('click', restartGame);
  modalRoot.querySelector('#arcade-err-restart').addEventListener('click', restartGame);
  fsBtn.addEventListener('click', toggleFullscreen);
  modalRoot.querySelector('#close-game-btn').addEventListener('click', () => closeModal(true));

  const switchToGame = (targetId) => {
    if (sfxEnabled) playKidSfx('pop');
    openChildGamePlayer(targetId, rootContainer);
  };

  const prevBtn = modalRoot.querySelector('#arcade-prev-btn');
  if (prevBtn && prevGame) prevBtn.addEventListener('click', () => switchToGame(prevGame.id));

  const nextBtn = modalRoot.querySelector('#arcade-next-btn');
  if (nextBtn && nextGame) nextBtn.addEventListener('click', () => switchToGame(nextGame.id));

  const errNextBtn = modalRoot.querySelector('#arcade-err-next');
  if (errNextBtn && nextGame) errNextBtn.addEventListener('click', () => switchToGame(nextGame.id));

  const surpriseBtn = modalRoot.querySelector('#arcade-surprise-btn');
  if (surpriseBtn && allGames.length > 1) {
    surpriseBtn.addEventListener('click', () => {
      const others = allGames.filter((g) => g.id !== game.id);
      const pick = others[Math.floor(Math.random() * others.length)];
      if (pick) switchToGame(pick.id);
    });
  }

  modalRoot.querySelectorAll('.arcade-quick-pill').forEach((btn) => {
    btn.addEventListener('click', () => switchToGame(Number(btn.dataset.gameId)));
  });
}

function isImageUrl(val) {
  if (!val) return false;
  const s = String(val).trim();
  return s.startsWith('/uploads/') || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/');
}

function renderBookCards(gridEl, books, rootContainer) {
  if (!books.length) {
    gridEl.innerHTML = '<p class="empty-note">No storybooks found for this language/category.</p>';
    return;
  }
  const langFlags = { rw: '🇷🇼 KINYARWANDA', fr: '🇫🇷 FRANÇAIS', sw: '🇹🇿 KISWAHILI', en: '🇬🇧 ENGLISH' };
  gridEl.innerHTML = books
    .map(
      (b, idx) => {
        const coverPhoto = isImageUrl(b.cover_image)
          ? b.cover_image
          : isImageUrl(b.cover_illustration_url)
          ? b.cover_illustration_url
          : null;
        return `
      <article class="child-card">
        <div class="child-card-thumb">
          ${
            coverPhoto
              ? `<img src="${coverPhoto}" alt="Cover: ${b.title}" loading="lazy" />`
              : `${buildCardSvgArt(idx + 1, 'book')}<span class="floating-hero-emoji">${b.cover_image}</span>`
          }
          <span class="child-badge">${langFlags[b.language_code] || b.language_code.toUpperCase()}</span>
          <span class="child-engine-tag">${b.page_count || 3} pages</span>
          <button class="thumb-play open-book-trigger" data-id="${b.id}" type="button" aria-label="Read ${b.title}">${ICONS.play}</button>
        </div>
        <div class="card-body">
          <h3 title="${b.title}">${b.title}</h3>
          <p>${b.description}</p>
          <div class="card-foot">
            <span class="card-meta">Ages ${b.age_group}</span>
            <button class="child-play-btn open-book-trigger" data-id="${b.id}" type="button">📖 Soma</button>
          </div>
        </div>
      </article>
    `;
      }
    )
    .join('');

  gridEl.querySelectorAll('.open-book-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      playKidSfx('coin');
      spawnStarBurst(e.clientX, e.clientY);
      openChildBookReader(Number(btn.dataset.id), rootContainer);
    });
  });
}

function renderStorybooksTab(bodyEl, rootContainer) {
  const shelf = childState.bookshelf;
  bodyEl.innerHTML = `
    <div class="row-head" style="align-items:center">
      <h2 class="section-title" style="margin:0">📖 Storybook Library</h2>
      <div class="chip-row" style="margin:0">
        <button class="role-pill book-lang-btn ${childState.filterLang === '' ? 'active' : ''}" data-lang="">All Languages</button>
        <button class="role-pill book-lang-btn ${childState.filterLang === 'rw' ? 'active' : ''}" data-lang="rw">🇷🇼 Kinyarwanda</button>
        <button class="role-pill book-lang-btn ${childState.filterLang === 'fr' ? 'active' : ''}" data-lang="fr">🇫🇷 Français</button>
        <button class="role-pill book-lang-btn ${childState.filterLang === 'sw' ? 'active' : ''}" data-lang="sw">🇹🇿 Kiswahili</button>
      </div>
    </div>

    ${
      shelf.recently_opened.length
        ? `<section class="row-section" style="margin-top:24px">${rowHeader('🔖 Your Bookmarks', 'Komeza aho wari ugeze', 'recent-books-grid', null)}<div class="media-row" id="recent-books-grid"></div></section>`
        : ''
    }

    <h3 class="section-title" style="font-size:1.3rem;margin-top:24px">📚 All Books</h3>
    <div class="child-grid" id="all-books-grid"></div>
  `;

  if (shelf.recently_opened.length) {
    renderBookCards(bodyEl.querySelector('#recent-books-grid'), shelf.recently_opened, rootContainer);
    wireRowControls(bodyEl, rootContainer);
  }
  renderBookCards(bodyEl.querySelector('#all-books-grid'), childState.dashboard.storybooks, rootContainer);

  bodyEl.querySelectorAll('.book-lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playKidSfx('pop');
      childState.filterLang = btn.dataset.lang;
      renderChildView(rootContainer);
    });
  });
}

async function openChildBookReader(bookId, rootContainer) {
  const book = await api.request(`/api/v1/storybooks/${bookId}`);
  childState.activeBook = book;
  pingChildHeartbeat(`Reading Book: ${book.title}`);
  const recentEntry = (childState.bookshelf?.recently_opened || []).find((b) => b.id === bookId);
  childState.activeBookPageIdx = recentEntry ? Math.max(0, Math.min(book.pages.length - 1, recentEntry.last_page_number - 1)) : 0;

  renderActiveBookModal(rootContainer);
}

function renderActiveBookModal(rootContainer) {
  const book = childState.activeBook;
  const pageIdx = childState.activeBookPageIdx;
  const page = book.pages[pageIdx] || { page_number: 1, text_content: '', illustration_url: '📖', vocabulary: [] };
  const modalRoot = rootContainer.querySelector('#child-modal-root');

  modalRoot.innerHTML = `
    <div class="stage-modal">
      <div class="stage-box" id="book-reader-box">
        <div class="stage-head">
          <div style="display:flex;align-items:center;gap:14px;min-width:0">
            ${
              isImageUrl(book.cover_image) || isImageUrl(book.cover_illustration_url)
                ? `<img src="${isImageUrl(book.cover_image) ? book.cover_image : book.cover_illustration_url}" alt="Cover" style="width:52px;height:52px;border-radius:12px;object-fit:cover;border:1px solid var(--line-2)" />`
                : `<span style="width:52px;height:52px;border-radius:12px;display:grid;place-items:center;font-size:1.8rem;background:var(--surface-3)">${book.cover_image}</span>`
            }
            <div style="min-width:0">
              <h2>${book.title} <span style="font-size:0.75rem;font-weight:800;color:var(--text-3);vertical-align:middle;margin-left:6px;padding:3px 8px;border:1px solid var(--line-2);border-radius:6px">${book.language_code.toUpperCase()}</span></h2>
              <p class="sub">By ${book.author}</p>
            </div>
          </div>
          <div class="stage-actions">
            ${(book.linked_translations || [])
              .map(
                (tr) =>
                  `<button class="role-pill switch-trans-btn" data-id="${tr.id}" type="button">🌐 ${tr.language_code.toUpperCase()}</button>`
              )
              .join('')}
            <button id="font-dec-btn" class="btn-secondary" type="button" title="Smaller text">A−</button>
            <button id="font-inc-btn" class="btn-secondary" type="button" title="Larger text">A+</button>
            <button id="read-aloud-btn" class="btn-primary" type="button">🔊 Read Aloud</button>
            <button id="fullscreen-book-btn" class="btn-secondary" type="button">⛶</button>
            <button id="close-book-btn" class="btn-warning" type="button">✕ Close</button>
          </div>
        </div>

        <div class="book-page-stage">
          <div class="book-illustration">
            ${
              page.illustration_url &&
              (page.illustration_url.startsWith('/uploads/') ||
                page.illustration_url.startsWith('http') ||
                page.illustration_url.startsWith('data:image/'))
                ? `<img class="book-scene-img" src="${page.illustration_url}" alt="Ifoto y'inkuru - Ipaji ${pageIdx + 1}" />`
                : `<span>${page.illustration_url}</span>`
            }
          </div>

          <div class="book-story-caption-card">
            <div class="book-kicker">Ipaji ya ${pageIdx + 1} kuri ${book.pages.length}</div>
            <p id="book-page-text" style="font-size:${childState.bookFontSize}px">${page.text_content}</p>

            ${
              page.vocabulary && page.vocabulary.length
                ? `<div class="vocab-row">
                    ${page.vocabulary.map((v) => `<span class="vocab-chip">💡 <strong>${v.word}</strong> — ${v.meaning}</span>`).join('')}
                  </div>`
                : ''
            }

            ${
              page.interactive_question
                ? `<div class="page-question">
                    <div class="q">❓ ${page.interactive_question.question}</div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap">
                      ${(page.interactive_question.options || [])
                        .map((opt) => `<button class="btn-secondary page-q-opt" data-opt="${opt}" data-ans="${page.interactive_question.answer}" type="button">${opt}</button>`)
                        .join('')}
                    </div>
                    <div id="page-q-feedback" style="margin-top:8px;font-weight:800"></div>
                  </div>`
                : ''
            }
          </div>
        </div>

        <div class="reader-foot">
          <button id="prev-page-btn" class="btn-secondary" type="button" ${pageIdx === 0 ? 'disabled' : ''}>← Previous</button>
          <div class="reader-progress">
            🔖 Bookmark auto-saved · ${pageIdx + 1} / ${book.pages.length}
            <div class="bar"><span style="width:${Math.round(((pageIdx + 1) / Math.max(1, book.pages.length)) * 100)}%"></span></div>
          </div>
          <button id="next-page-btn" class="child-play-btn" type="button">${pageIdx === book.pages.length - 1 ? '⭐ Finish Book' : 'Next →'}</button>
        </div>
      </div>
    </div>
  `;

  modalRoot.querySelectorAll('.switch-trans-btn').forEach((btn) => {
    btn.addEventListener('click', () => openChildBookReader(Number(btn.dataset.id), rootContainer));
  });

  modalRoot.querySelectorAll('.page-q-opt').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const fb = modalRoot.querySelector('#page-q-feedback');
      if (btn.dataset.opt === btn.dataset.ans) {
        playKidSfx('fanfare');
        spawnStarBurst(e.clientX, e.clientY);
        fb.textContent = '🎉 Byiza cyane / Correct!';
        fb.style.color = '#4ade80';
      } else {
        fb.textContent = '😊 Ongera ugerageze / Try again!';
        fb.style.color = '#fb7185';
      }
    });
  });

  modalRoot.querySelector('#font-dec-btn').addEventListener('click', () => {
    childState.bookFontSize = Math.max(16, childState.bookFontSize - 2);
    modalRoot.querySelector('#book-page-text').style.fontSize = `${childState.bookFontSize}px`;
  });
  modalRoot.querySelector('#font-inc-btn').addEventListener('click', () => {
    childState.bookFontSize = Math.min(34, childState.bookFontSize + 2);
    modalRoot.querySelector('#book-page-text').style.fontSize = `${childState.bookFontSize}px`;
  });

  modalRoot.querySelector('#read-aloud-btn').addEventListener('click', () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(page.text_content);
      u.lang = book.language_code === 'fr' ? 'fr-FR' : book.language_code === 'sw' ? 'sw-KE' : 'en-US';
      window.speechSynthesis.speak(u);
    }
  });

  modalRoot.querySelector('#fullscreen-book-btn').addEventListener('click', () => {
    const box = modalRoot.querySelector('#book-reader-box');
    if (box.requestFullscreen) box.requestFullscreen();
  });

  modalRoot.querySelector('#prev-page-btn').addEventListener('click', async () => {
    if (childState.activeBookPageIdx > 0) {
      playKidSfx('pop');
      childState.activeBookPageIdx--;
      if (!isPreviewMode()) {
        await api.request(`/api/v1/storybooks/${book.id}/progress`, {
          method: 'POST',
          body: JSON.stringify({ last_page_number: childState.activeBookPageIdx + 1, completed: false }),
        });
      }
      renderActiveBookModal(rootContainer);
    }
  });

  modalRoot.querySelector('#next-page-btn').addEventListener('click', async (e) => {
    if (childState.activeBookPageIdx < book.pages.length - 1) {
      playKidSfx('pop');
      childState.activeBookPageIdx++;
      if (!isPreviewMode()) {
        await api.request(`/api/v1/storybooks/${book.id}/progress`, {
          method: 'POST',
          body: JSON.stringify({ last_page_number: childState.activeBookPageIdx + 1, completed: false }),
        });
      }
      renderActiveBookModal(rootContainer);
    } else {
      playKidSfx('fanfare');
      spawnStarBurst(e.clientX, e.clientY);
      if (!isPreviewMode()) {
        await api.request(`/api/v1/storybooks/${book.id}/progress`, {
          method: 'POST',
          body: JSON.stringify({ last_page_number: book.pages.length, completed: true }),
        });
      }
      modalRoot.innerHTML = '';
      renderChildView(rootContainer);
    }
  });

  modalRoot.querySelector('#close-book-btn').addEventListener('click', () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    modalRoot.innerHTML = '';
    renderChildView(rootContainer);
  });
}

function isLearningVideo(v) {
  const cat = String(v.category_name || '').toLowerCase();
  if (cat.includes('movie') || cat.includes('cartoon') || cat.includes('film')) {
    return cat.includes('learn') || cat.includes('educat');
  }
  return (
    cat.includes('learn') ||
    cat.includes('educat') ||
    cat.includes('song') ||
    cat.includes('music') ||
    cat.includes('animal') ||
    cat.includes('nature') ||
    cat.includes('science') ||
    cat.includes('math') ||
    cat.includes('kwiga')
  );
}

function renderVideoCards(gridEl, videos, rootContainer) {
  if (!videos.length) {
    gridEl.innerHTML = '<p class="empty-note">Nta video irimo muri iki cyiciro.</p>';
    return;
  }
  gridEl.innerHTML = videos
    .map((v, idx) => {
      const isLearn = isLearningVideo(v);
      const mins = Math.max(1, Math.round((v.duration_seconds || 180) / 60));
      return `
      <article class="child-card">
        <div class="child-card-thumb">
          ${
            isImageUrl(v.thumbnail_url)
              ? `<img src="${v.thumbnail_url}" alt="${v.title}" loading="lazy" />`
              : `${buildCardSvgArt(idx + 2, isLearn ? 'book' : 'game')}<span class="floating-hero-emoji">${v.thumbnail_url || (isLearn ? '🎓' : '🎬')}</span>`
          }
          <span class="child-badge">${isLearn ? '🎓 VIDEO LEARN' : '🎬 MOVIE'} · ${v.language_code.toUpperCase()}</span>
          <span class="child-engine-tag">⏱️ ${mins} min · ${v.provider.toUpperCase()}</span>
          <button class="thumb-play watch-video-trigger" data-id="${v.id}" type="button" aria-label="Watch ${v.title}">${ICONS.play}</button>
        </div>
        <div class="card-body">
          <h3 title="${v.title}">${v.title}</h3>
          <p>${v.description}</p>
          <div class="card-foot">
            <span class="card-meta" style="color:${v.provider_supports_events ? '#4ade80' : '#fbbf24'}">
              ${v.provider_supports_events ? '✓ Verified Tracking' : '⚠ External Player'}
            </span>
            <button class="child-play-btn watch-video-trigger" data-id="${v.id}" type="button">▶ Reba</button>
          </div>
        </div>
      </article>
    `;
    })
    .join('');

  gridEl.querySelectorAll('.watch-video-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      playKidSfx('coin');
      spawnStarBurst(e.clientX, e.clientY);
      openVideoPlayerModal(Number(btn.dataset.id), rootContainer);
    });
  });
}

function renderVideosTab(bodyEl, rootContainer) {
  const videos = childState.dashboard.videos || [];
  const movies = videos.filter((v) => !isLearningVideo(v));
  const learnVideos = videos.filter((v) => isLearningVideo(v));
  const f = childState.videoFilter || 'all';

  bodyEl.innerHTML = `
    <div class="row-head" style="align-items:center;margin-bottom:24px">
      <div>
        <h2 class="section-title" style="margin:0">🎬 Cartoons &amp; Videos</h2>
        <p style="margin:4px 0 0;color:var(--text-3);font-size:0.9rem">Hitamo Video za Movies cyangwa Video Learn zo kwiga</p>
      </div>
      <div class="chip-row" style="margin:0">
        <button class="role-pill vid-filter-btn ${f === 'all' ? 'active' : ''}" data-filter="all" type="button">All (${videos.length})</button>
        <button class="role-pill vid-filter-btn ${f === 'movies' ? 'active' : ''}" data-filter="movies" type="button">🎬 Video za Movies (${movies.length})</button>
        <button class="role-pill vid-filter-btn ${f === 'learn' ? 'active' : ''}" data-filter="learn" type="button">🎓 Video Learn (${learnVideos.length})</button>
      </div>
    </div>

    ${
      f === 'all' || f === 'movies'
        ? `<section class="row-section">
            <div class="row-head">
              <div>
                <h2>🎬 Video za Movies</h2>
                <p>Animated movies, cartoons &amp; adventure stories</p>
              </div>
            </div>
            <div class="child-grid" id="videos-movies-grid"></div>
          </section>`
        : ''
    }

    ${
      f === 'all' || f === 'learn'
        ? `<section class="row-section">
            <div class="row-head">
              <div>
                <h2>🎓 Video Learn</h2>
                <p>Educational videos, songs, science &amp; nature</p>
              </div>
            </div>
            <div class="child-grid" id="videos-learn-grid"></div>
          </section>`
        : ''
    }
  `;

  const moviesGrid = bodyEl.querySelector('#videos-movies-grid');
  if (moviesGrid) renderVideoCards(moviesGrid, movies, rootContainer);

  const learnGrid = bodyEl.querySelector('#videos-learn-grid');
  if (learnGrid) renderVideoCards(learnGrid, learnVideos, rootContainer);

  bodyEl.querySelectorAll('.vid-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playKidSfx('pop');
      childState.videoFilter = btn.dataset.filter;
      renderVideosTab(bodyEl, rootContainer);
    });
  });
}

let videoKeyHandler = null;

async function openVideoPlayerModal(videoId, rootContainer, opts = {}) {
  stopVideoTelemetry();
  if (activeCinemaAdPlayer) {
    activeCinemaAdPlayer.destroy();
    activeCinemaAdPlayer = null;
  }
  if (videoKeyHandler) {
    window.removeEventListener('keydown', videoKeyHandler);
    videoKeyHandler = null;
  }

  const allVideos = childState.dashboard.videos || [];
  const video = allVideos.find((v) => v.id === videoId);
  if (!video) return;
  pingChildHeartbeat(`Watching Video: ${video.title}`);

  const isLearn = isLearningVideo(video);
  const orderedPlaylist = [
    ...allVideos.filter((v) => isLearningVideo(v) === isLearn),
    ...allVideos.filter((v) => isLearningVideo(v) !== isLearn),
  ];
  const curIdx = orderedPlaylist.findIndex((v) => v.id === video.id);
  const prevVid = curIdx > 0 ? orderedPlaylist[curIdx - 1] : null;
  const nextVid = curIdx >= 0 && curIdx < orderedPlaylist.length - 1 ? orderedPlaylist[curIdx + 1] : null;

  const preview = isPreviewMode();
  const startRes = preview
    ? { session_id: null, active_watch_seconds: 0 }
    : await api.request(`/api/v1/videos/${video.id}/sessions`, {
        method: 'POST',
        body: JSON.stringify({
          event_type: 'play_started',
          position_seconds: 0,
          active_delta_seconds: 0,
          is_tab_visible: !document.hidden,
          is_paused: false,
        }),
      });
  let sessionId = startRes.session_id;
  let activeSeconds = startRes.active_watch_seconds || 0;
  let isPaused = false;
  let theaterMode = Boolean(opts.theaterMode);
  const totalDur = Math.max(30, Number(video.duration_seconds) || 180);
  const mins = Math.max(1, Math.round(totalDur / 60));

  const favKey = 'gitego_kid_fav_videos';
  const getFavs = () => {
    try {
      return JSON.parse(localStorage.getItem(favKey) || '[]');
    } catch {
      return [];
    }
  };
  let isFav = getFavs().includes(video.id);

  const playerEmbed =
    video.provider === 'self_hosted'
      ? `<video class="video-frame" src="${video.embed_url}" controls autoplay playsinline></video>`
      : `<iframe
          class="video-frame"
          src="${video.embed_url}"
          title="${video.title}"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowfullscreen
        ></iframe>`;

  const watchPct = Math.min(100, Math.round((activeSeconds / totalDur) * 100));
  const modalRoot = rootContainer.querySelector('#child-modal-root');
  modalRoot.innerHTML = `
    <div class="stage-modal" id="video-cinema-modal">
      <div class="stage-box ${isLearn ? 'is-learn' : ''} ${theaterMode ? 'theater-mode' : ''}" id="video-stage-box">
        <div class="cinema-topbar">
          <div class="cinema-title-wrap">
            <span class="cinema-type-badge">${isLearn ? '🎓 Video Learn' : '🎬 Video za Movies'}</span>
            <h2 title="${video.title}">${isImageUrl(video.thumbnail_url) ? '' : `${video.thumbnail_url} `}${video.title}</h2>
          </div>
          <div class="stage-actions">
            <span id="watch-timer-pill" class="child-stat-pill">
              <span class="live-dot" id="watch-live-dot"></span>
              <span id="watch-timer-text">Active: ${activeSeconds}s</span>
            </span>
            <button id="theater-video-btn" class="btn-secondary" type="button" title="Toggle Theater Mode (T)">
              ${theaterMode ? '◧ Show Playlist' : '🎭 Theater'}
            </button>
            <button id="fullscreen-video-btn" class="btn-secondary" type="button" title="Fullscreen (F)">⛶ Fullscreen</button>
            <button id="close-video-btn" class="btn-warning" type="button" title="Close (Esc)">✕ Close</button>
          </div>
        </div>

        <div class="cinema-layout">
          <div class="cinema-main">
            <div class="cinema-screen-wrap" id="cinema-screen-wrap"></div>

            <div class="cinema-footer-bar">
              <div class="cinema-info">
                <p>${video.description || 'Enjoy watching safe, curated kids videos on Gitego Kids World.'}</p>
                <div class="cinema-meta-row">
                  <span>🌍 ${String(video.language_code || '').toUpperCase()}</span>
                  <span>👶 Ages ${video.age_group}</span>
                  <span>⏱️ ${mins} min</span>
                  <span>📺 ${String(video.provider || '').toUpperCase()}</span>
                  <span style="color:${video.provider_supports_events ? '#4ade80' : '#fbbf24'}">
                    ${video.provider_supports_events ? '✓ Verified Watch Tracking' : '⚠ External Player'}
                  </span>
                </div>
                <div class="cinema-progress-wrap">
                  <div class="cinema-progress-track">
                    <div class="cinema-progress-fill" id="cinema-progress-fill" style="width:${watchPct}%"></div>
                  </div>
                  <span id="cinema-progress-pct" style="font-size:0.74rem;font-weight:800;color:var(--text-3)">${watchPct}% watched</span>
                </div>
              </div>

              <div class="cinema-controls-right">
                <button id="fav-video-btn" class="cinema-react-btn ${isFav ? 'active' : ''}" type="button">
                  ${isFav ? '❤️ Liked' : '🤍 Like'}
                </button>
                <button id="pause-sim-btn" class="btn-secondary" type="button">⏸️ Pause Tracking</button>
                ${prevVid ? `<button id="prev-video-btn" class="btn-secondary" type="button" title="${prevVid.title}">⏮ Prev</button>` : ''}
                ${nextVid ? `<button id="next-video-btn" class="btn-primary" type="button" title="${nextVid.title}">Next ⏭</button>` : ''}
                <button id="complete-video-btn" class="child-play-btn" type="button">⭐ Finish Episode</button>
              </div>
            </div>
          </div>

          <aside class="cinema-playlist" aria-label="Up Next Playlist">
            <div class="cinema-playlist-head">
              <span>${isLearn ? '🎓 Up Next · Video Learn' : '🎬 Up Next · Movies'}</span>
              <small>${orderedPlaylist.length} videos</small>
            </div>
            <div class="cinema-playlist-list">
              ${orderedPlaylist
                .map((item) => {
                  const active = item.id === video.id;
                  const itemLearn = isLearningVideo(item);
                  const itemMins = Math.max(1, Math.round((item.duration_seconds || 180) / 60));
                  return `
                  <button class="playlist-item ${active ? 'active' : ''}" data-vid="${item.id}" type="button">
                    ${
                      isImageUrl(item.thumbnail_url)
                        ? `<img class="playlist-thumb" src="${item.thumbnail_url}" alt="" />`
                        : `<span class="playlist-thumb">${item.thumbnail_url || (itemLearn ? '🎓' : '🎬')}</span>`
                    }
                    <span class="playlist-meta">
                      <strong>${item.title}</strong>
                      <small>${active ? '▶ Now Playing' : `${itemLearn ? '🎓 Learn' : '🎬 Movie'} · ${itemMins}m · ${String(item.language_code || '').toUpperCase()}`}</small>
                    </span>
                  </button>`;
                })
                .join('')}
            </div>
          </aside>
        </div>
      </div>
    </div>
  `;

  const screenWrap = modalRoot.querySelector('#cinema-screen-wrap');
  if (screenWrap) {
    activeCinemaAdPlayer = mountVideoWithAds(screenWrap, video, { frameClass: 'video-frame' });
  }

  const updateWatchUi = (secs) => {
    const pct = Math.min(100, Math.round((secs / totalDur) * 100));
    const tEl = modalRoot.querySelector('#watch-timer-text');
    const dotEl = modalRoot.querySelector('#watch-live-dot');
    const fillEl = modalRoot.querySelector('#cinema-progress-fill');
    const pctEl = modalRoot.querySelector('#cinema-progress-pct');
    if (tEl) tEl.textContent = `Active: ${secs}s${isPaused || document.hidden ? ' (Paused)' : ''}`;
    if (dotEl) dotEl.classList.toggle('paused', isPaused || document.hidden);
    if (fillEl) fillEl.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}% watched`;
  };

  if (!preview) {
    videoTelemetryTimer = setInterval(async () => {
      try {
        const res = await api.request(`/api/v1/videos/${video.id}/sessions`, {
          method: 'POST',
          body: JSON.stringify({
            session_id: sessionId,
            event_type: isPaused ? 'pause' : 'progress',
            position_seconds: activeSeconds + 5,
            active_delta_seconds: 5,
            is_tab_visible: !document.hidden,
            is_paused: isPaused,
          }),
        });
        activeSeconds = res.active_watch_seconds;
        updateWatchUi(activeSeconds);
      } catch {
        // ignore transient polling errors
      }
    }, 5000);
  }

  const closeCinema = () => {
    stopVideoTelemetry();
    if (activeCinemaAdPlayer) {
      activeCinemaAdPlayer.destroy();
      activeCinemaAdPlayer = null;
    }
    if (videoKeyHandler) {
      window.removeEventListener('keydown', videoKeyHandler);
      videoKeyHandler = null;
    }
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    modalRoot.innerHTML = '';
    renderChildView(rootContainer);
  };

  const toggleTheater = () => {
    theaterMode = !theaterMode;
    const box = modalRoot.querySelector('#video-stage-box');
    const btn = modalRoot.querySelector('#theater-video-btn');
    if (box) box.classList.toggle('theater-mode', theaterMode);
    if (btn) btn.textContent = theaterMode ? '◧ Show Playlist' : '🎭 Theater';
  };

  const toggleFullscreen = () => {
    const box = modalRoot.querySelector('#video-stage-box');
    if (!box) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (box.requestFullscreen) {
      box.requestFullscreen().catch(() => {});
    }
  };

  modalRoot.querySelector('#theater-video-btn').addEventListener('click', () => {
    playKidSfx('pop');
    toggleTheater();
  });

  modalRoot.querySelector('#fullscreen-video-btn').addEventListener('click', () => {
    playKidSfx('pop');
    toggleFullscreen();
  });

  modalRoot.querySelector('#pause-sim-btn').addEventListener('click', (e) => {
    isPaused = !isPaused;
    e.currentTarget.textContent = isPaused ? '▶️ Resume Tracking' : '⏸️ Pause Tracking';
    updateWatchUi(activeSeconds);
  });

  modalRoot.querySelector('#fav-video-btn').addEventListener('click', (e) => {
    const favs = new Set(getFavs());
    if (favs.has(video.id)) {
      favs.delete(video.id);
      isFav = false;
    } else {
      favs.add(video.id);
      isFav = true;
      playKidSfx('coin');
      spawnStarBurst(e.clientX, e.clientY);
    }
    localStorage.setItem(favKey, JSON.stringify([...favs]));
    e.currentTarget.classList.toggle('active', isFav);
    e.currentTarget.textContent = isFav ? '❤️ Liked' : '🤍 Like';
  });

  modalRoot.querySelector('#complete-video-btn').addEventListener('click', async (e) => {
    playKidSfx('fanfare');
    spawnStarBurst(e.clientX, e.clientY);
    if (!preview) {
      try {
        await api.request(`/api/v1/videos/${video.id}/sessions`, {
          method: 'POST',
          body: JSON.stringify({
            session_id: sessionId,
            event_type: 'completed',
            position_seconds: totalDur,
            active_delta_seconds: 5,
            is_tab_visible: true,
            is_paused: false,
          }),
        });
      } catch {
        // ignore
      }
    }
    e.currentTarget.textContent = '✓ Episode Completed!';
    e.currentTarget.disabled = true;
    updateWatchUi(totalDur);
    if (activeCinemaAdPlayer) {
      activeCinemaAdPlayer.triggerPostRoll();
    }
  });

  const prevBtn = modalRoot.querySelector('#prev-video-btn');
  if (prevBtn && prevVid) {
    prevBtn.addEventListener('click', () => {
      playKidSfx('pop');
      openVideoPlayerModal(prevVid.id, rootContainer, { theaterMode });
    });
  }

  const nextBtn = modalRoot.querySelector('#next-video-btn');
  if (nextBtn && nextVid) {
    nextBtn.addEventListener('click', () => {
      playKidSfx('pop');
      openVideoPlayerModal(nextVid.id, rootContainer, { theaterMode });
    });
  }

  modalRoot.querySelectorAll('.playlist-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = Number(btn.dataset.vid);
      if (targetId === video.id) return;
      playKidSfx('pop');
      openVideoPlayerModal(targetId, rootContainer, { theaterMode });
    });
  });

  modalRoot.querySelector('#close-video-btn').addEventListener('click', closeCinema);

  videoKeyHandler = (e) => {
    if (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
    if (e.key === 'Escape') closeCinema();
    else if (e.key === 't' || e.key === 'T') toggleTheater();
    else if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  };
  window.addEventListener('keydown', videoKeyHandler);
}

const CHILD_EDUCATION_CYCLES = [
  { id: 'materineri', label: '🌱 Materineri (N1–N3)', grades: ['N1', 'N2', 'N3'] },
  { id: 'primary', label: '🏫 Primary (P1–P6)', grades: ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'] },
  { id: 'o_level', label: '📘 O-Level (S1–S3)', grades: ['S1', 'S2', 'S3'] },
  { id: 'high_school', label: '🎓 High School (S4–S6)', grades: ['S4', 'S5', 'S6'] },
];

function renderLearningTab(bodyEl, rootContainer) {
  const subjects = childState.dashboard.learning_subjects || [];
  const allItems = childState.lessons || [];
  if (!childState.learningMode) childState.learningMode = 'lesson'; // 'lesson' | 'exam'
  if (!childState.learningCycle) childState.learningCycle = 'ALL';
  if (!childState.learningGrade) childState.learningGrade = 'ALL';

  const mode = childState.learningMode;
  const lessonsTotal = allItems.filter((l) => (l.content_type || 'lesson') === 'lesson').length;
  const examsTotal = allItems.filter((l) => l.content_type === 'exam').length;

  const activeCycleObj = CHILD_EDUCATION_CYCLES.find((c) => c.id === childState.learningCycle);
  const gradePills = activeCycleObj
    ? activeCycleObj.grades
    : CHILD_EDUCATION_CYCLES.flatMap((c) => c.grades);

  const visibleItems = allItems.filter((l) => {
    const ctype = l.content_type || 'lesson';
    if (ctype !== mode) return false;
    if (childState.learningCycle !== 'ALL' && l.education_cycle !== childState.learningCycle) return false;
    if (childState.learningGrade !== 'ALL' && l.grade_level !== childState.learningGrade) return false;
    if (childState.activeSubjectId && l.subject_id !== childState.activeSubjectId) return false;
    return true;
  });

  bodyEl.innerHTML = `
    <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px">
      <div>
        <h2 class="section-title" style="margin:0">🧠 Learning Center</h2>
        <small style="color:var(--text-3)">Hitamo Amasomo cyangwa Ibizamini — guhera Materineri (N1) kugeza Senior 6 High School (S6).</small>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="role-pill lc-child-mode-btn ${mode === 'lesson' ? 'active' : ''}" data-mode="lesson" type="button">
          📚 Amasomo / Lessons (${lessonsTotal})
        </button>
        <button class="role-pill lc-child-mode-btn ${mode === 'exam' ? 'active' : ''}" data-mode="exam" type="button">
          📝 Ibizamini / Exams (${examsTotal})
        </button>
      </div>
    </div>

    <!-- Education Cycle Selector (Materineri -> Primary -> O-Level -> High School) -->
    <div class="chip-row" style="margin-bottom:8px">
      <button class="role-pill lc-cycle-btn ${childState.learningCycle === 'ALL' ? 'active' : ''}" data-cycle="ALL" type="button">🌍 All Levels (N1–S6)</button>
      ${CHILD_EDUCATION_CYCLES.map(
        (c) =>
          `<button class="role-pill lc-cycle-btn ${childState.learningCycle === c.id ? 'active' : ''}" data-cycle="${c.id}" type="button">${c.label}</button>`
      ).join('')}
    </div>

    <!-- Specific Grade Selector (N1..N3, P1..P6, S1..S6) -->
    <div class="chip-row" style="margin-bottom:10px">
      <button class="role-pill lc-grade-btn ${childState.learningGrade === 'ALL' ? 'active' : ''}" data-grade="ALL" type="button">All Grades</button>
      ${gradePills
        .map(
          (g) =>
            `<button class="role-pill lc-grade-btn ${childState.learningGrade === g ? 'active' : ''}" data-grade="${g}" type="button">${g}</button>`
        )
        .join('')}
    </div>

    <!-- Subject Filter -->
    <div class="chip-row">
      <button class="role-pill subj-filter-btn ${!childState.activeSubjectId ? 'active' : ''}" data-id="" type="button">All Subjects (${subjects.length})</button>
      ${subjects
        .map(
          (s) =>
            `<button class="role-pill subj-filter-btn ${childState.activeSubjectId === s.id ? 'active' : ''}" data-id="${s.id}" type="button">${s.icon} ${s.name}</button>`
        )
        .join('')}
    </div>

    ${
      visibleItems.length === 0
        ? `<div class="child-card" style="padding:32px;text-align:center;margin-top:16px">
             <div style="font-size:2.4rem;margin-bottom:8px">${mode === 'exam' ? '📝' : '📚'}</div>
             <strong>Nta ${mode === 'exam' ? 'bizamini' : 'masomo'} birashyirwaho kuri iki cyiciro (${childState.learningGrade !== 'ALL' ? childState.learningGrade : childState.learningCycle}).</strong>
             <p style="color:var(--text-3);margin:6px 0 0">Hitamo undi mwaka cyangwa urebe ibyiciro byose (All Levels).</p>
           </div>`
        : `<div class="child-grid" style="margin-top:14px">
            ${visibleItems
              .map((l) => {
                const isExam = l.content_type === 'exam';
                return `
              <article class="child-card" style="padding:20px;gap:10px">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
                  <span style="font-size:2.2rem;line-height:1">${isExam ? '📝' : l.image_url || '📚'}</span>
                  <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                    <span class="lesson-tag" style="background:rgba(99,102,241,0.22);color:#c7d2fe">${l.grade_level || 'P1'}</span>
                    <span class="lesson-tag">${l.subject_name} · +${l.points_reward} pts</span>
                    ${isExam ? `<span class="lesson-tag" style="background:rgba(245,158,11,0.22);color:#fde68a">⏱️ ${l.duration_minutes || 30} min</span>` : ''}
                  </div>
                </div>
                <h3>${l.title}</h3>
                <p>${l.content_body}</p>
                ${
                  isExam
                    ? (l.quizzes || [])
                        .map(
                          (qz) => `
                        <form class="quiz-box lc-exam-form" data-quiz="${qz.id}">
                          <strong>📝 ${qz.title} (${qz.questions.length} Questions)</strong>
                          ${qz.questions
                            .map(
                              (qu, qIdx) => `
                            <div style="margin-top:10px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.08)">
                              <p class="q-prompt"><strong>${qIdx + 1}.</strong> ${qu.prompt} ${qu.image_hint || ''}</p>
                              <div style="display:flex;flex-direction:column;gap:6px">
                                ${qu.answers
                                  .map(
                                    (ans) => `
                                  <label style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:10px;background:rgba(255,255,255,0.05);cursor:pointer">
                                    <input type="radio" name="q_${qu.id}" value="${ans.id}" required style="width:auto;height:auto" />
                                    <span>${ans.answer_text}</span>
                                  </label>
                                `
                                  )
                                  .join('')}
                              </div>
                            </div>
                          `
                            )
                            .join('')}
                          <button class="child-play-btn" type="submit" style="margin-top:12px;width:100%">✅ Submit Exam (Ohereza Ikizamini)</button>
                          <div id="quiz-feedback-${qz.id}" style="margin-top:10px;font-weight:800"></div>
                        </form>
                      `
                        )
                        .join('')
                    : (l.quizzes || [])
                        .map(
                          (qz) => `
                        <div class="quiz-box">
                          <strong>💡 Practice Check: ${qz.title}</strong>
                          ${qz.questions
                            .map(
                              (qu) => `
                            <p class="q-prompt">${qu.prompt} ${qu.image_hint || ''}</p>
                            <div style="display:flex;gap:8px;flex-wrap:wrap">
                              ${qu.answers
                                .map(
                                  (ans) =>
                                    `<button class="child-play-btn submit-quiz-ans" data-quiz="${qz.id}" data-question="${qu.id}" data-answer="${ans.id}" type="button">${ans.answer_text}</button>`
                                )
                                .join('')}
                            </div>
                          `
                            )
                            .join('')}
                          <div id="quiz-feedback-${qz.id}" style="margin-top:8px;font-weight:800"></div>
                        </div>
                      `
                        )
                        .join('')
                }
              </article>
            `;
              })
              .join('')}
          </div>`
    }
  `;

  bodyEl.querySelectorAll('.lc-child-mode-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playKidSfx('pop');
      childState.learningMode = btn.dataset.mode;
      renderLearningTab(bodyEl, rootContainer);
    });
  });

  bodyEl.querySelectorAll('.lc-cycle-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playKidSfx('pop');
      childState.learningCycle = btn.dataset.cycle;
      childState.learningGrade = 'ALL';
      renderLearningTab(bodyEl, rootContainer);
    });
  });

  bodyEl.querySelectorAll('.lc-grade-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playKidSfx('pop');
      childState.learningGrade = btn.dataset.grade;
      renderLearningTab(bodyEl, rootContainer);
    });
  });

  bodyEl.querySelectorAll('.subj-filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      playKidSfx('pop');
      childState.activeSubjectId = btn.dataset.id ? Number(btn.dataset.id) : null;
      renderLearningTab(bodyEl, rootContainer);
    });
  });

  // Multi-question Exam submit
  bodyEl.querySelectorAll('.lc-exam-form').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const quizId = Number(form.dataset.quiz);
      const answers = {};
      const fd = new FormData(form);
      for (const [k, v] of fd.entries()) {
        if (k.startsWith('q_')) {
          answers[k.slice(2)] = Number(v);
        }
      }
      const res = await api.request(`/api/v1/learning/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers }),
      });
      const fb = bodyEl.querySelector(`#quiz-feedback-${quizId}`);
      if (res.passed) {
        playKidSfx('fanfare');
        spawnStarBurst(window.innerWidth / 2, window.innerHeight / 2);
        fb.textContent = `🎉 Watsinze Ikizamini! Score: ${res.correct_count}/${res.total_questions} (${res.percentage}%) • +${res.stars_awarded} Stars!`;
        fb.style.color = '#4ade80';
        const topStars = rootContainer.querySelector('#child-star-readout');
        if (topStars) topStars.textContent = String(res.child_total_stars);
      } else {
        fb.textContent = `😊 Score: ${res.correct_count}/${res.total_questions} (${res.percentage}%). Ongera ugerageze!`;
        fb.style.color = '#fb7185';
      }
    });
  });

  // Single-question Practice Check submit (for Lessons)
  bodyEl.querySelectorAll('.submit-quiz-ans').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const quizId = Number(btn.dataset.quiz);
      const qId = btn.dataset.question;
      const ansId = Number(btn.dataset.answer);
      const res = await api.request(`/api/v1/learning/quizzes/${quizId}/submit`, {
        method: 'POST',
        body: JSON.stringify({ answers: { [qId]: ansId } }),
      });
      const fb = bodyEl.querySelector(`#quiz-feedback-${quizId}`);
      if (res.passed) {
        playKidSfx('fanfare');
        spawnStarBurst(e.clientX, e.clientY);
        fb.textContent = `🎉 Correct! Passed (+${res.stars_awarded} Stars!) Total Stars: ${res.child_total_stars}`;
        fb.style.color = '#4ade80';
        const topStars = rootContainer.querySelector('#child-star-readout');
        if (topStars) topStars.textContent = String(res.child_total_stars);
      } else {
        fb.textContent = '😊 Not quite! Try another answer!';
        fb.style.color = '#fb7185';
      }
    });
  });
}

async function renderRewardsTab(bodyEl) {
  const rw = await api.request('/api/v1/rewards');
  const previewBanner = rw.is_preview
    ? `<p style="margin:6px 0 0;color:#6ee7b7;font-size:0.88rem">🛡️ Uri muri Preview Mode — nta konti y'umwana irimo gukoreshwa.</p>`
    : '';
  bodyEl.innerHTML = `
    <div class="trophy-hero">
      <h2>🏆 ${rw.is_preview ? 'Preview — Star Trophy Cabinet' : `${rw.display_name}'s Star Trophy Cabinet`}</h2>
      ${previewBanner}
      <div class="trophy-stats">
        <span>⭐ ${rw.total_stars} Total Stars</span>
        <span>🏅 Level ${rw.current_level} (Next at ${rw.next_level_stars} ⭐)</span>
        <span>🎯 Daily Goal: ${rw.daily_goal_completed} / ${rw.daily_goal_target}</span>
      </div>
      <small>${rw.safety_notice}</small>
    </div>

    <h3 class="section-title" style="font-size:1.3rem">🎖️ Achievements &amp; Badges</h3>
    <div class="child-grid">
      ${rw.achievements
        .map(
          (a) => `
        <article class="child-card badge-card ${a.unlocked ? 'unlocked' : 'locked'}">
          <div class="badge-ico">${a.badge_icon}</div>
          <h3>${a.title}</h3>
          <p>${a.description}</p>
          <span class="badge-status">
            ${a.unlocked ? '✓ UNLOCKED' : `🔒 Requires ${a.stars_threshold} Stars`}
          </span>
        </article>
      `
        )
        .join('')}
    </div>
  `;
}
