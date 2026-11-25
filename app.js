const UI_TEXT = {
  rw: {
    siteTitle: "Isi y'Abana",
    siteTagline: "Inkuru n'Indirimbo zishimishije!",
    langBtn: "🇷🇼 Kinyarwanda",
    parentBtn: "Ababyeyi",
    navGames: "Udukino",
    navStories: "Inkuru",
    navSongs: "Indirimbo",
    navMusic: "Curanga",
    gamesHeading: "Hitamo Agakino ukine!",
    gamesSub: "Udukino dushimishije dufasha abana gutekereza, kubara no kwibuka.",
    game1Title: "Guhuza Amashusho (Memory)",
    game1Desc: "Birindura amakarita abiri asa kugira ngo ubone inyamaswa zihishe!",
    game1Reset: "Tangira Bushya 🔄",
    game2Title: "Bara Imbuto n'Inyamaswa",
    game2Desc: "Bara ibintu ubona hasi hanyuma ukande ku mubare w'ukuri!",
    game3Title: "Shaka Inyamaswa cyangwa Ibara",
    game3Desc: "Soma icyo bagusabye, hanyuma ukande ku ishusho nyayo!",
    correctMsg: "Byiza cyane! Wabikoze neza! ⭐",
    tryAgainMsg: "Ongera ugerageze! 😊",
    storiesHeading: "Hitamo Inkuru ushaka gusoma!",
    storiesSub: "Kanda ku ikarita y'inkuru kugira ngo utangire urugendo.",
    songsHeading: "Ririmba hamwe natwe!",
    songsSub: "Kanda ku ndirimbo wumve umuziki kandi usome amagambo yayo.",
    musicHeading: "Curanga Xilofone y'Amabara!",
    musicSub: "Kanda ku mabara kugira ngo ukore indirimbo yawe.",
    readBtn: "Soma Inkuru 📖",
    singBtn: "Fungura Indirimbo 🎵",
    playLabel: "Curanga",
    stopLabel: "Hagarika",
    demoLabel: "Curanga agace gato",
    prevLabel: "Inyuma",
    nextLabel: "Komeza",
    finishLabel: "Birangiye! ⭐",
    parentTitle: "Umutekano w'Ababyeyi",
    parentDesc: "Subiza iki kibazo cyoroshye kugira ngo winjire:",
    parentEnter: "Injira",
    parentWrong: "Ongera ugerageze! Igisubizo si cyo.",
    parentWelcome: "Murakaza neza! Hano mushobora kugenzura ibikoresho by'umwana.",
    soundLabel: "Ijwi ry'umuziki",
    resetLabel: "Subiza inyenyeri kuri zero",
    resetBtn: "Subiza kuri 0",
    footer: "Isi y'Abana • Yateguwe mu rukundo rwinshi ku bana bo mu Rwanda n'ahandi hose 🌍",
    pagesWord: "amapaji"
  },
  en: {
    siteTitle: "Kids' World",
    siteTagline: "Fun Stories & Songs!",
    langBtn: "🇬🇧 English",
    parentBtn: "Parents",
    navGames: "Mini-Games",
    navStories: "Stories",
    navSongs: "Songs",
    navMusic: "Play Music",
    gamesHeading: "Pick a Mini-Game to Play!",
    gamesSub: "Fun interactive games that help kids count, match, and explore.",
    game1Title: "Memory Match",
    game1Desc: "Flip two matching cards to find all the hidden animal friends!",
    game1Reset: "Play Again 🔄",
    game2Title: "Count the Treats",
    game2Desc: "Count the items in the box and tap the matching number!",
    game3Title: "Find the Animal or Color",
    game3Desc: "Read the clue and tap the right picture!",
    correctMsg: "Awesome job! You got a star! ⭐",
    tryAgainMsg: "Almost! Try again! 😊",
    storiesHeading: "Pick a Story to Read!",
    storiesSub: "Tap any story card to start your adventure.",
    songsHeading: "Sing Along With Us!",
    songsSub: "Pick a song to hear the melody and follow the glowing lyrics.",
    musicHeading: "Play the Rainbow Xylophone!",
    musicSub: "Tap the colorful keys to create your own happy tune.",
    readBtn: "Read Story 📖",
    singBtn: "Open Song 🎵",
    playLabel: "Play Song",
    stopLabel: "Stop",
    demoLabel: "Play a Happy Tune",
    prevLabel: "Back",
    nextLabel: "Next",
    finishLabel: "All Done! ⭐",
    parentTitle: "Parent Corner",
    parentDesc: "Solve this quick math question to continue:",
    parentEnter: "Enter",
    parentWrong: "Try again! That answer isn't quite right.",
    parentWelcome: "Welcome! Manage audio and progress settings here.",
    soundLabel: "Music & Sound Effects",
    resetLabel: "Reset collected stars",
    resetBtn: "Reset to 0",
    footer: "Kids' World • Made with love for children in Rwanda and everywhere 🌍",
    pagesWord: "pages"
  }
};

const STORIES = [
  {
    id: "bakame",
    emoji: "🐇🥖",
    bg: "linear-gradient(135deg, #fef08a, #fdba74)",
    title: {
      rw: "Bakame n'Umugati",
      en: "Bakame and the Warm Bread"
    },
    desc: {
      rw: "Inkuru y'urukundo no gusangira n'inshuti mu ishyamba ryiza.",
      en: "A heartwarming tale about sharing with friends in the forest."
    },
    pages: [
      {
        scene: "🌳 🐇 🥖",
        sceneBg: "#fef9c3",
        rw: "Umunsi umwe, Bakame yabonye umugati ushyushye mu ishyamba ryiza. Yarishimye cyane!",
        en: "One sunny day, Bakame found a warm loaf of bread in the forest. He was so happy!"
      },
      {
        scene: "🐇 🐦 🐢",
        sceneBg: "#dcfce7",
        rw: "Mu nzira yahuye n'inshuti ze: Inyoni ntoya n'Akanyamasyo bari bashonje cyane.",
        en: "On the way, he met his friends—a little bird and a turtle who were very hungry."
      },
      {
        scene: "💛 🐇 🐦 🐢 ✨",
        sceneBg: "#ffedd5",
        rw: "Bakame yagabanye na bo umugati. Bose baraseka bati: 'Gusangira birashimisha!'",
        en: "Bakame shared the bread with them. Everyone smiled and said, 'Sharing makes us happy!'"
      }
    ]
  },
  {
    id: "keza-bird",
    emoji: "🐦☁️",
    bg: "linear-gradient(135deg, #bae6fd, #a5b4fc)",
    title: {
      rw: "Inyoni Yigaga Kuguruka",
      en: "The Little Bird Who Learned to Fly"
    },
    desc: {
      rw: "Inyoni ntoya yitwa Keza yiga kudacika intege no kwizera ko ishoboye.",
      en: "Little bird Keza discovers courage and learns never to give up."
    },
    pages: [
      {
        scene: "🪺 🐦 🌲",
        sceneBg: "#e0f2fe",
        rw: "Inyoni ntoya yitwa Keza yashakaga kuguruka hejuru y'ibiti binini.",
        en: "A little bird named Keza dreamed of flying high above the tall green trees."
      },
      {
        scene: "🍃 🐦 💬",
        sceneBg: "#f3e8ff",
        rw: "Bwa mbere yaguye hasi buhoro, ariko nyina aramubwira ati: 'Ongera ugerageze, urashoboye!'",
        en: "At first she tumbled softly, but her mama cheered, 'Try one more time—you can do it!'"
      },
      {
        scene: "☀️ ☁️ 🐦 🌈",
        sceneBg: "#fef08a",
        rw: "Keza yazamuye amababa ye, aguruka mu kirere cyiza cy'ubururu. Yatsinze!",
        en: "Keza flapped her wings wide and soared into the bright blue sky. She did it!"
      }
    ]
  },
  {
    id: "garden-numbers",
    emoji: "🌻🦋",
    bg: "linear-gradient(135deg, #bbf7d0, #99f6e4)",
    title: {
      rw: "Kubara mu Busitani",
      en: "Counting in the Garden"
    },
    desc: {
      rw: "Twige kubara kuva kuri rimwe kugeza kuri gatanu hamwe n'inyamaswa.",
      en: "Let's count from one to five with friendly garden creatures."
    },
    pages: [
      {
        scene: "☀️ 🦋 🦋",
        sceneBg: "#fef9c3",
        rw: "Mu busitani hari izuba rimwe (1) rirabagirana n'ibinyugunyugu bibiri (2) byiza.",
        en: "In the garden shines one (1) bright sun and two (2) colorful butterflies."
      },
      {
        scene: "🐸 🐸 🐸 🌷🌷🌷🌷",
        sceneBg: "#dcfce7",
        rw: "Hafi y'uruzi hari ibikeri bitatu (3) bisimbuka n'indabyo enye (4) zihumura.",
        en: "By the pond jump three (3) happy frogs beside four (4) blooming flowers."
      },
      {
        scene: "🌙 ⭐ ⭐ ⭐ ⭐ ⭐",
        sceneBg: "#e0e7ff",
        rw: "Nijoro haza inyenyeri eshanu (5) ziti: 'Ijoro ryiza bana beza!'",
        en: "At night come five (5) twinkling stars whispering, 'Goodnight, wonderful kids!'"
      }
    ]
  }
];

const SONGS = [
  {
    id: "counting",
    emoji: "🔢🎶",
    bg: "linear-gradient(135deg, #fbcfe8, #fde68a)",
    title: {
      rw: "Indirimbo yo Kubara (1–5)",
      en: "The Counting Song (1–5)"
    },
    desc: {
      rw: "Bara rimwe kugeza kuri gatanu hamwe n'umuziki ushimishije!",
      en: "Count from one to five with a cheerful bouncy melody!"
    },
    lyrics: {
      rw: [
        "🎵 Rimwe, kabiri, gatatu...",
        "🎵 Kane, gatanu turabara!",
        "🙌 Amaboko yose hejuru,",
        "⭐ Twishimye twese hamwe!"
      ],
      en: [
        "🎵 One, two, three we go...",
        "🎵 Four and five, watch us grow!",
        "🙌 Raise your hands up to the sky,",
        "⭐ Clap and smile, we're flying high!"
      ]
    },
    // [frequency Hz, duration ms, lyricLineIndex]
    notes: [
      [261.63, 380, 0], [293.66, 380, 0], [329.63, 420, 0], [392.0, 480, 0],
      [349.23, 380, 1], [329.63, 380, 1], [293.66, 420, 1], [261.63, 500, 1],
      [392.0, 360, 2], [440.0, 360, 2], [523.25, 450, 2], [440.0, 420, 2],
      [392.0, 380, 3], [329.63, 380, 3], [293.66, 380, 3], [261.63, 600, 3]
    ]
  },
  {
    id: "animals",
    emoji: "🐄🐶🐦",
    bg: "linear-gradient(135deg, #a7f3d0, #bae6fd)",
    title: {
      rw: "Inyamaswa z'Inshuti",
      en: "Our Animal Friends"
    },
    desc: {
      rw: "Menya amajwi y'inyamaswa z'inshuti zacu mu ndirimbo!",
      en: "Sing along with the sounds of our favorite animal friends!"
    },
    lyrics: {
      rw: [
        "🐄 Inka nziza iravuga ngo Mooo!",
        "🐶 Imbwa y'inshuti iravuga ngo Woof!",
        "🐦 Inyoni iririmbira mu kirere,",
        "🌍 Isi yose irashima!"
      ],
      en: [
        "🐄 The gentle cow says Mooo!",
        "🐶 The friendly puppy says Woof!",
        "🐦 The little bird sings in the sky,",
        "🌍 Happy friends, both you and I!"
      ]
    },
    notes: [
      [329.63, 360, 0], [329.63, 360, 0], [392.0, 440, 0], [329.63, 460, 0],
      [349.23, 360, 1], [349.23, 360, 1], [440.0, 440, 1], [349.23, 460, 1],
      [392.0, 350, 2], [440.0, 350, 2], [493.88, 380, 2], [523.25, 500, 2],
      [440.0, 360, 3], [392.0, 360, 3], [329.63, 400, 3], [261.63, 600, 3]
    ]
  },
  {
    id: "handwash",
    emoji: "🧼💧",
    bg: "linear-gradient(135deg, #c7d2fe, #99f6e4)",
    title: {
      rw: "Gukaraba Intoki",
      en: "Wash Your Hands"
    },
    desc: {
      rw: "Indirimbo yo kwitoza isuku no gukaraba intoki n'isabune.",
      en: "A bubbly song to remember healthy handwashing habits!"
    },
    lyrics: {
      rw: [
        "🧼 Karaba intoki n'isabune,",
        "💧 Imbere n'inyuma buri munsi,",
        "✨ Isuku itera ubuzima bwiza,",
        "😄 Bana beza tubyishimire!"
      ],
      en: [
        "🧼 Wash your hands with bubbly soap,",
        "💧 Front and back, let's scrub them clean,",
        "✨ Healthy hands keep us strong,",
        "😄 Sing this happy washing song!"
      ]
    },
    notes: [
      [261.63, 360, 0], [329.63, 360, 0], [392.0, 360, 0], [523.25, 480, 0],
      [440.0, 360, 1], [392.0, 360, 1], [349.23, 360, 1], [329.63, 480, 1],
      [293.66, 360, 2], [349.23, 360, 2], [440.0, 360, 2], [392.0, 480, 2],
      [329.63, 360, 3], [293.66, 360, 3], [329.63, 360, 3], [261.63, 600, 3]
    ]
  }
];

const XYLO_KEYS = [
  { label: "Do", freq: 261.63, color: "#ef4444", height: 220 },
  { label: "Re", freq: 293.66, color: "#f97316", height: 205 },
  { label: "Mi", freq: 329.63, color: "#eab308", height: 190 },
  { label: "Fa", freq: 349.23, color: "#22c55e", height: 175 },
  { label: "Sol", freq: 392.0, color: "#06b6d4", height: 160 },
  { label: "La", freq: 440.0, color: "#3b82f6", height: 148 },
  { label: "Si", freq: 493.88, color: "#8b5cf6", height: 136 },
  { label: "Do!", freq: 523.25, color: "#ec4899", height: 124 }
];

// App State
let lang = localStorage.getItem("kids_lang") || "rw";
let stars = Number(localStorage.getItem("kids_stars") || "0");
let soundEnabled = localStorage.getItem("kids_sound") !== "false";
let activeStory = null;
let currentPage = 0;
let activeSong = null;
let songTimers = [];
let audioCtx = null;
let mathAnswer = 7;

function ensureAudio() {
  if (!soundEnabled) return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

function playTone(freq, durationMs = 350) {
  const ctx = ensureAudio();
  if (!ctx) return;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, ctx.currentTime);

  gain.gain.setValueAtTime(0.001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationMs / 1000 + 0.03);
}

function playRewardChime() {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, idx) => {
    setTimeout(() => playTone(f, 240), idx * 95);
  });
}

function addStar(amount = 1) {
  stars += amount;
  localStorage.setItem("kids_stars", String(stars));
  document.getElementById("star-count").textContent = String(stars);
  playRewardChime();
  launchConfetti();
}

function launchConfetti() {
  const layer = document.getElementById("confetti-layer");
  const icons = ["⭐", "🎉", "🌈", "✨", "💛"];
  for (let i = 0; i < 18; i++) {
    const el = document.createElement("span");
    el.className = "confetti-piece";
    el.textContent = icons[i % icons.length];
    el.style.left = `${Math.random() * 94 + 3}%`;
    el.style.animationDelay = `${Math.random() * 0.35}s`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }
}

function renderText() {
  const t = UI_TEXT[lang];
  document.documentElement.lang = lang;
  document.getElementById("site-title").textContent = t.siteTitle;
  document.getElementById("site-tagline").textContent = t.siteTagline;
  document.getElementById("lang-toggle").textContent = t.langBtn;
  document.getElementById("parent-btn-label").textContent = t.parentBtn;
  document.getElementById("nav-games").textContent = t.navGames;
  document.getElementById("nav-stories").textContent = t.navStories;
  document.getElementById("nav-songs").textContent = t.navSongs;
  document.getElementById("nav-music").textContent = t.navMusic;
  document.getElementById("games-heading").textContent = t.gamesHeading;
  document.getElementById("games-sub").textContent = t.gamesSub;
  document.getElementById("game1-title").textContent = t.game1Title;
  document.getElementById("game1-desc").textContent = t.game1Desc;
  document.getElementById("memory-reset-btn").textContent = t.game1Reset;
  document.getElementById("game2-title").textContent = t.game2Title;
  document.getElementById("game2-desc").textContent = t.game2Desc;
  document.getElementById("game3-title").textContent = t.game3Title;
  document.getElementById("game3-desc").textContent = t.game3Desc;
  document.getElementById("stories-heading").textContent = t.storiesHeading;
  document.getElementById("stories-sub").textContent = t.storiesSub;
  document.getElementById("songs-heading").textContent = t.songsHeading;
  document.getElementById("songs-sub").textContent = t.songsSub;
  document.getElementById("music-heading").textContent = t.musicHeading;
  document.getElementById("music-sub").textContent = t.musicSub;
  document.getElementById("play-label").textContent = t.playLabel;
  document.getElementById("stop-label").textContent = t.stopLabel;
  document.getElementById("demo-label").textContent = t.demoLabel;
  document.getElementById("prev-label").textContent = t.prevLabel;
  document.getElementById("parent-modal-title").textContent = t.parentTitle;
  document.getElementById("parent-gate-desc").textContent = t.parentDesc;
  document.getElementById("math-submit-btn").textContent = t.parentEnter;
  document.getElementById("parent-welcome").textContent = t.parentWelcome;
  document.getElementById("sound-label").textContent = t.soundLabel;
  document.getElementById("reset-stars-label").textContent = t.resetLabel;
  document.getElementById("reset-stars-btn").textContent = t.resetBtn;
  document.getElementById("footer-text").textContent = t.footer;
  document.getElementById("star-count").textContent = String(stars);
}

function renderStories() {
  const t = UI_TEXT[lang];
  const grid = document.getElementById("stories-grid");
  grid.innerHTML = STORIES.map((s) => `
    <article class="kid-card" data-story-id="${s.id}">
      <div class="card-banner" style="background: ${s.bg}">
        <span>${s.emoji}</span>
        <span class="card-badge">${s.pages.length} ${t.pagesWord}</span>
      </div>
      <h3>${s.title[lang]}</h3>
      <p>${s.desc[lang]}</p>
      <button class="card-action" type="button">${t.readBtn}</button>
    </article>
  `).join("");

  grid.querySelectorAll(".kid-card").forEach((card) => {
    card.addEventListener("click", () => {
      openStory(card.dataset.storyId);
    });
  });
}

function openStory(storyId) {
  activeStory = STORIES.find((s) => s.id === storyId);
  if (!activeStory) return;
  currentPage = 0;
  playTone(392, 180);
  renderStoryPage();
  document.getElementById("story-modal").classList.remove("hidden");
}

function renderStoryPage() {
  if (!activeStory) return;
  const t = UI_TEXT[lang];
  const page = activeStory.pages[currentPage];
  document.getElementById("reader-title").textContent = activeStory.title[lang];
  const scene = document.getElementById("reader-scene");
  scene.textContent = page.scene;
  scene.style.backgroundColor = page.sceneBg;
  document.getElementById("reader-text").textContent = page[lang];
  document.getElementById("page-indicator").textContent = `${currentPage + 1} / ${activeStory.pages.length}`;
  document.getElementById("prev-page-btn").disabled = currentPage === 0;

  const isLast = currentPage === activeStory.pages.length - 1;
  document.getElementById("next-label").textContent = isLast ? t.finishLabel : t.nextLabel;
}

function closeStory() {
  document.getElementById("story-modal").classList.add("hidden");
  activeStory = null;
}

function renderSongs() {
  const t = UI_TEXT[lang];
  const grid = document.getElementById("songs-grid");
  grid.innerHTML = SONGS.map((song) => `
    <article class="kid-card" data-song-id="${song.id}">
      <div class="card-banner" style="background: ${song.bg}">
        <span>${song.emoji}</span>
      </div>
      <h3>${song.title[lang]}</h3>
      <p>${song.desc[lang]}</p>
      <button class="card-action" style="background:#ec4899" type="button">${t.singBtn}</button>
    </article>
  `).join("");

  grid.querySelectorAll(".kid-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectSong(card.dataset.songId);
    });
  });

  if (activeSong) {
    renderSongStage();
  }
}

function selectSong(songId) {
  stopSong();
  activeSong = SONGS.find((s) => s.id === songId);
  if (!activeSong) return;
  renderSongStage();
  document.getElementById("song-stage").classList.remove("hidden");
  document.getElementById("song-stage").scrollIntoView({ behavior: "smooth", block: "nearest" });
  playActiveSong();
}

function renderSongStage() {
  if (!activeSong) return;
  document.getElementById("stage-emoji").textContent = activeSong.emoji;
  document.getElementById("stage-title").textContent = activeSong.title[lang];
  const lyricsBox = document.getElementById("lyrics-box");
  lyricsBox.innerHTML = activeSong.lyrics[lang].map((line, i) => `
    <div class="lyric-line" data-line="${i}">${line}</div>
  `).join("");
}

function stopSong() {
  songTimers.forEach((id) => clearTimeout(id));
  songTimers = [];
  document.querySelectorAll(".lyric-line").forEach((el) => el.classList.remove("active"));
}

function playActiveSong() {
  if (!activeSong) return;
  stopSong();
  let elapsed = 0;

  activeSong.notes.forEach(([freq, dur, lineIdx]) => {
    const timer = setTimeout(() => {
      playTone(freq, dur);
      document.querySelectorAll(".lyric-line").forEach((el) => {
        el.classList.toggle("active", Number(el.dataset.line) === lineIdx);
      });
    }, elapsed);
    songTimers.push(timer);
    elapsed += dur;
  });

  const endTimer = setTimeout(() => {
    document.querySelectorAll(".lyric-line").forEach((el) => el.classList.remove("active"));
    addStar(1);
  }, elapsed + 200);
  songTimers.push(endTimer);
}

function renderXylophone() {
  const container = document.getElementById("xylophone");
  container.innerHTML = XYLO_KEYS.map((k, idx) => `
    <button
      class="xylo-key"
      type="button"
      data-index="${idx}"
      style="background:${k.color}; height:${k.height}px"
    >
      <span class="xylo-dot"></span>
      <span>${k.label}</span>
      <span class="xylo-dot"></span>
    </button>
  `).join("");

  container.querySelectorAll(".xylo-key").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = XYLO_KEYS[Number(btn.dataset.index)];
      playTone(k.freq, 360);
      btn.classList.add("pressed");
      setTimeout(() => btn.classList.remove("pressed"), 140);
    });
  });
}

function playDemoMelody() {
  const seq = [0, 0, 4, 4, 5, 5, 4, 3, 3, 2, 2, 1, 1, 0];
  const keys = document.querySelectorAll(".xylo-key");
  seq.forEach((keyIdx, step) => {
    setTimeout(() => {
      const k = XYLO_KEYS[keyIdx];
      playTone(k.freq, 320);
      const el = keys[keyIdx];
      if (el) {
        el.classList.add("pressed");
        setTimeout(() => el.classList.remove("pressed"), 220);
      }
    }, step * 310);
  });
}

function openParentModal() {
  const a = Math.floor(Math.random() * 6) + 3;
  const b = Math.floor(Math.random() * 5) + 2;
  mathAnswer = a + b;
  document.getElementById("math-prompt").textContent = `${a} + ${b} = ?`;
  document.getElementById("math-input").value = "";
  document.getElementById("math-error").classList.add("hidden");
  document.getElementById("parent-gate-step").classList.remove("hidden");
  document.getElementById("parent-settings-step").classList.add("hidden");
  document.getElementById("sound-toggle").checked = soundEnabled;
  document.getElementById("parent-modal").classList.remove("hidden");
}

function initEvents() {
  // Tabs
  document.querySelectorAll(".nav-tile").forEach((btn) => {
    btn.addEventListener("click", () => {
      stopSong();
      playTone(440, 140);
      const tab = btn.dataset.tab;
      document.querySelectorAll(".nav-tile").forEach((b) => b.classList.toggle("active", b === btn));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === `tab-${tab}`));
    });
  });

  // Language toggle
  document.getElementById("lang-toggle").addEventListener("click", () => {
    lang = lang === "rw" ? "en" : "rw";
    localStorage.setItem("kids_lang", lang);
    playTone(523.25, 160);
    renderAll();
    if (activeStory) renderStoryPage();
  });

  // Story reader controls
  document.getElementById("close-story-btn").addEventListener("click", closeStory);
  document.getElementById("prev-page-btn").addEventListener("click", () => {
    if (currentPage > 0) {
      currentPage--;
      playTone(329.63, 150);
      renderStoryPage();
    }
  });
  document.getElementById("next-page-btn").addEventListener("click", () => {
    if (!activeStory) return;
    if (currentPage < activeStory.pages.length - 1) {
      currentPage++;
      playTone(392.0, 150);
      renderStoryPage();
    } else {
      closeStory();
      addStar(1);
    }
  });

  // Song controls
  document.getElementById("play-song-btn").addEventListener("click", playActiveSong);
  document.getElementById("stop-song-btn").addEventListener("click", stopSong);

  // Xylophone demo
  document.getElementById("demo-melody-btn").addEventListener("click", playDemoMelody);

  // Parent gate
  document.getElementById("parent-btn").addEventListener("click", openParentModal);
  document.getElementById("close-parent-btn").addEventListener("click", () => {
    document.getElementById("parent-modal").classList.add("hidden");
  });
  document.getElementById("math-submit-btn").addEventListener("click", () => {
    const val = Number(document.getElementById("math-input").value);
    if (val === mathAnswer) {
      document.getElementById("parent-gate-step").classList.add("hidden");
      document.getElementById("parent-settings-step").classList.remove("hidden");
    } else {
      const err = document.getElementById("math-error");
      err.textContent = UI_TEXT[lang].parentWrong;
      err.classList.remove("hidden");
    }
  });
  document.getElementById("sound-toggle").addEventListener("change", (e) => {
    soundEnabled = e.target.checked;
    localStorage.setItem("kids_sound", String(soundEnabled));
  });
  document.getElementById("reset-stars-btn").addEventListener("click", () => {
    stars = 0;
    localStorage.setItem("kids_stars", "0");
    document.getElementById("star-count").textContent = "0";
  });
}

// --- MINI-GAMES LOGIC ---
// 1. Memory Match Game
const MEMORY_ICONS = ["🦁", "🐘", "🦒"];
let memoryDeck = [];
let flippedIndices = [];
let matchedIndices = new Set();

function initMemoryGame() {
  memoryDeck = [...MEMORY_ICONS, ...MEMORY_ICONS].sort(() => Math.random() - 0.5);
  flippedIndices = [];
  matchedIndices = new Set();
  renderMemoryBoard();
}

function renderMemoryBoard() {
  const board = document.getElementById("memory-board");
  if (!board) return;
  board.innerHTML = memoryDeck.map((icon, idx) => {
    const isMatched = matchedIndices.has(idx);
    const isFlipped = flippedIndices.includes(idx);
    const show = isMatched || isFlipped;
    return `<button type="button" class="memory-card ${isFlipped ? "revealed" : ""} ${isMatched ? "matched" : ""}" data-idx="${idx}">${show ? icon : "❓"}</button>`;
  }).join("");

  board.querySelectorAll(".memory-card").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const idx = Number(btn.dataset.idx);
      if (matchedIndices.has(idx) || flippedIndices.includes(idx) || flippedIndices.length >= 2) return;
      playTone(440, 120);
      flippedIndices.push(idx);
      renderMemoryBoard();

      if (flippedIndices.length === 2) {
        const [a, b] = flippedIndices;
        if (memoryDeck[a] === memoryDeck[b]) {
          matchedIndices.add(a);
          matchedIndices.add(b);
          flippedIndices = [];
          renderMemoryBoard();
          if (matchedIndices.size === memoryDeck.length) {
            addStar(1);
          }
        } else {
          setTimeout(() => {
            flippedIndices = [];
            renderMemoryBoard();
          }, 650);
        }
      }
    });
  });
}

// 2. Counting Quiz Game
const COUNT_ITEMS = ["🍎", "🍌", "🍓", "🦋", "⭐"];
let currentCountTarget = 3;

function initCountGame() {
  currentCountTarget = Math.floor(Math.random() * 5) + 1;
  const emoji = COUNT_ITEMS[Math.floor(Math.random() * COUNT_ITEMS.length)];
  const display = document.getElementById("count-display");
  const optionsEl = document.getElementById("count-options");
  const feedback = document.getElementById("count-feedback");
  if (!display || !optionsEl) return;

  display.textContent = Array(currentCountTarget).fill(emoji).join(" ");
  feedback.textContent = "";

  const choices = new Set([currentCountTarget]);
  while (choices.size < 3) {
    choices.add(Math.floor(Math.random() * 5) + 1);
  }
  const sortedChoices = [...choices].sort((a, b) => a - b);

  optionsEl.innerHTML = sortedChoices.map((num) => `
    <button type="button" class="quiz-btn" data-num="${num}">${num}</button>
  `).join("");

  optionsEl.querySelectorAll(".quiz-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const picked = Number(btn.dataset.num);
      if (picked === currentCountTarget) {
        feedback.textContent = UI_TEXT[lang].correctMsg;
        feedback.style.color = "#16a34a";
        addStar(1);
        setTimeout(initCountGame, 1100);
      } else {
        playTone(220, 200);
        feedback.textContent = UI_TEXT[lang].tryAgainMsg;
        feedback.style.color = "#dc2626";
      }
    });
  });
}

// 3. Animal & Color Finder Game
const FINDER_QUESTIONS = [
  {
    rw: "Kanda ku nyamaswa ivuga ngo 'Mooo!' 🐄",
    en: "Tap the animal that says 'Mooo!' 🐄",
    answer: "🐄",
    choices: ["🐄", "🐶", "🐸"]
  },
  {
    rw: "Shaka urubuto rw'umuhondo (Umuneke)! 🍌",
    en: "Find the yellow fruit (Banana)! 🍌",
    answer: "🍌",
    choices: ["🍎", "🍌", "🍇"]
  },
  {
    rw: "Kanda ku nyoni iguruka mu kirere! 🐦",
    en: "Tap the bird that flies in the sky! 🐦",
    answer: "🐦",
    choices: ["🐢", "🐦", "🐟"]
  },
  {
    rw: "Shaka izuba ryaka mu kirere! ☀️",
    en: "Find the bright shining sun! ☀️",
    answer: "☀️",
    choices: ["🌧️", "☀️", "⛄"]
  }
];
let finderIndex = 0;

function renderFinderGame() {
  const q = FINDER_QUESTIONS[finderIndex % FINDER_QUESTIONS.length];
  const promptEl = document.getElementById("finder-prompt");
  const optionsEl = document.getElementById("finder-options");
  const feedback = document.getElementById("finder-feedback");
  if (!promptEl || !optionsEl) return;

  promptEl.textContent = q[lang];
  feedback.textContent = "";

  optionsEl.innerHTML = q.choices.map((c) => `
    <button type="button" class="quiz-btn" data-choice="${c}">${c}</button>
  `).join("");

  optionsEl.querySelectorAll(".quiz-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (btn.dataset.choice === q.answer) {
        feedback.textContent = UI_TEXT[lang].correctMsg;
        feedback.style.color = "#16a34a";
        addStar(1);
        setTimeout(() => {
          finderIndex++;
          renderFinderGame();
        }, 1100);
      } else {
        playTone(220, 200);
        feedback.textContent = UI_TEXT[lang].tryAgainMsg;
        feedback.style.color = "#dc2626";
      }
    });
  });
}

function renderAll() {
  renderText();
  renderStories();
  renderSongs();
  renderFinderGame();
}

initMemoryGame();
initCountGame();
document.getElementById("memory-reset-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  playTone(523.25, 140);
  initMemoryGame();
});
renderXylophone();
renderAll();
initEvents();
