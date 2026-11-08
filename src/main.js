import './styles.css';
import { JigsawEngine } from './puzzle-engine.js';
import { getLocale, localizeCategory, localizeTitle, setLocale, t } from './i18n.js';
import { appSettings, customPuzzles, favorites, readJson, savedGames, saveSettings, writeJson } from './persistence.js';
import { sounds } from './sounds.js';
import { celebrate } from './celebrate.js';

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const app = document.querySelector('#app');
const artwork = [
  '/puzzles/sunrise.svg', '/puzzles/coast.svg', '/puzzles/forest.svg', '/puzzles/mountain.svg',
  '/puzzles/garden.svg', '/puzzles/city.svg', '/puzzles/space.svg', '/puzzles/cafe.svg',
  '/puzzles/desert.svg', '/puzzles/snow.svg', '/puzzles/festival.svg', '/puzzles/waves.svg',
  '/puzzles/rain.svg', '/puzzles/autumn.svg', '/puzzles/lake.svg', '/puzzles/meadow.svg',
  '/puzzles/canyon.svg', '/puzzles/harbor.svg', '/puzzles/aurora.svg', '/puzzles/carnival.svg',
];
const sceneArtwork = [
  '/scenes/sunrise.jpg', '/scenes/coast.jpg', '/scenes/forest.jpg', '/scenes/mountain.jpg',
  '/scenes/garden.jpg', '/scenes/city.jpg', '/scenes/space.jpg', '/scenes/cafe.jpg',
  '/scenes/desert.jpg', '/scenes/snow.jpg', '/scenes/festival.jpg', '/scenes/waves.jpg',
];
let currentPuzzle = null;
let currentPieceCount = 16;
let currentDifficulty = 'medium';
let currentEngine = null;
let currentRoom = null;
let socket = null;
let reconnectAttempts = 0;
let elapsed = 0;
let timerId = null;
let paused = false;
let completed = false;
let toastTimer = null;
let lastFocusedElement = null;

const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const pieceLabel = (count) => `${count} ${t('pieceWord')}`;
const stats = () => readJson('lumapiece-stats', {});
const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
function recordCompletion(puzzleId, timeSeconds) {
  const all = stats();
  const entry = all[puzzleId] || { plays: 0, bestTime: null };
  entry.plays += 1;
  entry.lastCompleted = Date.now();
  const isBest = entry.bestTime === null || timeSeconds < entry.bestTime;
  if (isBest) entry.bestTime = timeSeconds;
  all[puzzleId] = entry;
  writeJson('lumapiece-stats', all);
  return { isBest, bestTime: entry.bestTime };
}
const validDifficulties = new Set(['easy', 'medium', 'hard', 'expert']);
const difficultyLabel = (difficulty) => t(validDifficulties.has(difficulty) ? difficulty : 'medium');
const imageMarkup = (puzzle, alt, extra = '') => `<img loading="lazy" decoding="async" referrerpolicy="no-referrer" ${extra} src="${esc(puzzle.image)}" data-fallback="${esc(puzzle.fallbackImage || '')}" alt="${esc(alt)}"/>`;

const catalog = [
  ['sunrise', 'First Light', 'Nature', 'easy'], ['coast', 'Blue Coast', 'Seascapes', 'easy'], ['forest', 'Quiet Forest', 'Nature', 'hard'], ['mountain', 'High Morning', 'Mountains', 'hard'],
  ['garden', 'Hidden Garden', 'Flowers', 'easy'], ['city', 'Afterglow City', 'City', 'medium'], ['space', 'Orbit', 'Space', 'hard'], ['cafe', 'Slow Coffee', 'Still life', 'easy'],
  ['desert', 'Amber Desert', 'Travel', 'medium'], ['snow', 'Snow Path', 'Nature', 'medium'], ['festival', 'Lantern Night', 'Holidays', 'easy'], ['waves', 'Long Waves', 'Seascapes', 'medium'],
  ['rain', 'Window Rain', 'Nature', 'medium'], ['autumn', 'Amber Fall', 'Nature', 'easy'], ['lake', 'Still Lake', 'Seascapes', 'easy'], ['meadow', 'Open Meadow', 'Nature', 'easy'],
  ['canyon', 'Deep Canyon', 'Travel', 'hard'], ['harbor', 'Evening Harbor', 'Seascapes', 'medium'], ['aurora', 'Northern Lights', 'Space', 'hard'], ['carnival', 'Night Carnival', 'Holidays', 'medium'],
].map(([id, title, category, difficulty], index) => ({ id, title, category, difficulty, image: sceneArtwork[index], fallbackImage: artwork[index], mode: [2, 6, 18].includes(index) ? 'challenging' : 'classic', challenging: [2, 6, 18].includes(index), mystery: [5, 10, 16].includes(index), pieces: index % 3 === 0 ? 9 : 16 }));
const basePuzzles = [...catalog, ...catalog.map((puzzle, index) => ({ ...puzzle, id: `${puzzle.id}-${index + 2}`, title: `${puzzle.title} — Study ${index + 2}`, image: sceneArtwork[(index + 3) % sceneArtwork.length], fallbackImage: artwork[(index + 3) % artwork.length] }))];
const allPuzzles = () => [...basePuzzles, ...customPuzzles];
const getPuzzle = (id) => allPuzzles().find((puzzle) => puzzle.id === id) || basePuzzles[0];
let dailyKeyOverride = null;
const dayKey = (date = new Date()) => Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(date).replaceAll('-', ''));
const dailyPuzzle = () => { const dateKey = dailyKeyOverride ?? dayKey(); return basePuzzles[dateKey % basePuzzles.length]; };

function puzzleCard(puzzle) {
  const saved = savedGames()[puzzle.id];
  const solvedEntry = stats()[puzzle.id];
  const solvedTitle = solvedEntry ? (solvedEntry.bestTime ? `Best ${formatTime(solvedEntry.bestTime)}` : 'Solved before') : '';
  const progress = saved?.progress || 0;
  const progressPct = saved && progress > 0 ? Math.round((progress / (saved.pieceCount || 16)) * 100) : 0;
  const title = localizeTitle(puzzle.id, puzzle.title);
  const category = localizeCategory(puzzle.id, puzzle.category);
  return `<article class="puzzle-card" data-puzzle-id="${esc(puzzle.id)}"><div class="puzzle-art">${imageMarkup(puzzle, title, 'loading="lazy"')}<button class="heart ${favorites.has(puzzle.id) ? 'active' : ''}" data-favorite="${esc(puzzle.id)}" aria-label="${favorites.has(puzzle.id) ? 'Remove favorite' : 'Add favorite'}">${favorites.has(puzzle.id) ? '♥' : '♡'}</button>${solvedEntry ? `<span class="solved-badge" title="${solvedTitle}">✓</span>` : ''}<span class="difficulty ${puzzle.difficulty}">${difficultyLabel(puzzle.difficulty)}</span></div>${progressPct > 0 && progressPct < 100 ? `<div class="card-progress" title="${progressPct}%"><span style="width:${progressPct}%"></span></div>` : ''}<div class="puzzle-card-copy"><div><h3>${esc(title)}</h3><p>${esc(category)} · ${pieceLabel(saved?.pieceCount || puzzle.pieces)}</p></div><button class="play-icon" data-play="${esc(puzzle.id)}" aria-label="${t('play')} ${esc(title)}">↗</button></div></article>`;
}

function renderHome() {
  const daily = dailyPuzzle();
  const streak = readJson('lumapiece-streak', { last: 0, count: 0 });
  const dailyTitle = localizeTitle(daily.id, daily.title);
  const dailyCategory = localizeCategory(daily.id, daily.category);
  app.innerHTML = `<div class="site-frame"><header class="topbar"><a class="wordmark" href="#home" aria-label="LumaPiece home"><span class="logo-orb">LP</span><span><strong>Luma<span>Piece</span></strong><small>small moments, beautifully made</small></span></a><nav class="desktop-nav"><a href="#catalog">${t('discover')}</a><a href="#daily">${t('daily')}</a><a href="#together">${t('together')}</a></nav><div class="top-actions"><button class="quiet-button" id="locale-toggle">${t('language')}</button><button class="round-button" id="open-settings" aria-label="Settings">⚙</button><button class="round-button" id="theme-toggle" aria-label="Toggle theme">☼</button><button class="primary-button compact" id="open-custom">${t('create')} <span>+</span></button></div></header>
  <main id="home"><section class="hero"><div class="hero-copy"><span class="eyebrow">A calmer way to play</span><h1>Find a picture.<br/><em>Find your focus.</em></h1><p>Beautiful, high-resolution scenes made for quiet mornings, shared evenings, and every little pause in between.</p><div class="hero-buttons"><a class="primary-button" href="#catalog">${t('browse')} <span>→</span></a><button class="link-button" id="resume-latest">${t('continue')} <span>↗</span></button></div><div class="hero-note"><span class="status-dot"></span><span><strong>${allPuzzles().length} curated scenes</strong><small>Original scenes bundled locally · works offline</small></span></div></div><div class="hero-visual"><div class="hero-frame">${imageMarkup(daily, dailyTitle)}<div class="hero-caption"><span>Today</span><strong>${esc(dailyTitle)}</strong><small>${esc(dailyCategory)} · ${pieceLabel(daily.pieces)}</small></div></div><span class="floating-sticker">take<br/><b>five</b></span></div></section>
  <section class="value-row"><div><b>01</b><strong>Pick a scene</strong><span>Every image is an original LumaPiece illustration.</span></div><div><b>02</b><strong>Choose your pace</strong><span>Start with 9 pieces or make it challenging.</span></div><div><b>03</b><strong>Play your way</strong><span>Solo, together, or from your own photo.</span></div></section>
  <section class="section-block" id="catalog"><div class="section-head"><div><span class="eyebrow">A little collection</span><h2>${t('all')}</h2></div><div class="catalog-controls"><label class="search-field">⌕<input id="search" placeholder="${t('search')}"/></label><div class="chips"><button class="chip active" data-filter="all">All</button><button class="chip" data-filter="Nature">Nature</button><button class="chip" data-filter="Travel">Travel</button><button class="chip" data-filter="hard">Hard</button><button class="chip" data-filter="challenging">Challenging</button><button class="chip" data-filter="mystery">Mystery</button><button class="chip" data-filter="favorite">♥</button></div></div></div><div class="puzzle-grid" id="puzzle-grid">${allPuzzles().map(puzzleCard).join('')}</div><p class="empty-message" id="empty-message" hidden>No puzzle found. Try another search.</p></section>
  <section class="daily-section" id="daily"><div class="daily-copy">${streak.count > 0 ? `<div class="daily-streak">🔥 ${streak.count} ${t('streak')}</div>` : ''}<span class="eyebrow">A small ritual</span><h2>${t('daily')}</h2><p>A fresh scene chosen from the LumaPiece collection each day. Come back tomorrow for a new mood.</p><button class="light-button" data-play="${daily.id}">${t('start')} <span>→</span></button></div><div class="daily-card"><span class="daily-date">${new Intl.DateTimeFormat(getLocale() === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date())}</span>${imageMarkup(daily, dailyTitle)}<div><strong>${esc(dailyTitle)}</strong><span>${esc(dailyCategory)} · ${difficultyLabel(daily.difficulty)} · ${pieceLabel(daily.pieces)}</span></div></div></section>
  <section class="together-section" id="together"><div class="together-art"><span class="orb orb-one"></span><span class="orb orb-two"></span><div class="mini-board"><i></i><i></i><i></i><i></i></div></div><div><span class="eyebrow">Make space for friends</span><h2>One board.<br/><em>Many hands.</em></h2><p>Create a private room, share a six-letter code, and build the same picture together.</p><button class="primary-button" id="open-room">${t('room')} <span>↗</span></button></div></section>
  <section class="create-strip"><div><span class="eyebrow">Make it yours</span><h2>${t('custom')}</h2><p>Use a favorite photo and turn it into a LumaPiece in a few clicks.</p></div><button class="outline-button" id="open-custom-secondary">${t('create')} <span>+</span></button></section></main>
  <footer class="footer"><div class="wordmark footer-mark"><span class="logo-orb">LP</span><span><strong>Luma<span>Piece</span></strong><small>original puzzles for real life</small></span></div><div><span>© 2026 LumaPiece · All rights reserved</span><span>Original brand and artwork</span></div></footer></div>
  ${gameMarkup()}${roomMarkup()}${customMarkup()}${settingsMarkup()}<div class="onboarding" id="onboarding" ${localStorage.getItem('lumapiece-onboarded') ? 'hidden' : ''} role="dialog" aria-label="Welcome tips"><strong>${t('welcome')}</strong><p>${t('welcomeBody')}</p><button class="primary-button compact" id="dismiss-onboarding">${t('gotIt')}</button></div><div class="toast" id="toast" role="status" aria-live="polite"></div>`;
  bindHome();
}

function gameMarkup() { return `<section class="player" id="player" aria-hidden="true"><header class="player-bar"><button class="back-button" id="close-player">← ${t('exit')}</button><div class="player-name"><small id="player-category">Puzzle</small><strong id="player-title">LumaPiece</strong></div><div class="player-tools"><span class="room-badge" id="room-badge"></span><button class="tool-button" id="player-ghost">${t('ghostGuide')}</button><button class="tool-button" id="player-hint">${t('hint')}</button><button class="tool-button" id="player-sound" aria-label="Toggle sound">🔊</button><button class="tool-button" id="player-preview">${t('preview')}</button><button class="tool-button" id="player-save">${t('save')}</button></div></header><div class="player-layout"><div class="board-wrap"><div class="game-stats"><span><b id="move-count">0</b> moves</span><span><b id="game-time">00:00</b></span><span id="piece-status">0 / 16</span></div><div class="canvas-shell"><canvas id="puzzle-canvas" aria-label="Interactive jigsaw puzzle"></canvas><div class="canvas-help" id="canvas-help">${t('helpText')}</div></div><div class="simple-toolbar"><label><span>${t('difficulty')}</span><select id="difficulty-select"><option value="easy">${t('easy')}</option><option value="medium" selected>${t('medium')}</option><option value="hard">${t('hard')}</option><option value="expert">${t('expert')}</option></select></label><label><span>${t('pieces')}</span><select id="piece-count"><option value="9">9</option><option value="16" selected>16</option><option value="25">25</option><option value="36">36</option><option value="60">60</option><option value="100">100</option><option value="144">144</option></select></label><label class="switch"><input id="rotation-toggle" type="checkbox"/><span></span>${t('rotate')}</label><button id="player-pause">${t('pause')}</button><button id="player-edge">${t('edges')}</button><button id="player-rearrange">${t('rearrange')}</button></div></div><aside class="player-side"><div class="reference-box"><span>${t('reference')}</span><img id="player-reference" alt="${t('reference')}"/></div><div class="side-card"><span class="eyebrow">${t('together')}</span><strong id="room-title">${t('solo')}</strong><p id="room-copy">${t('soloCopy')}</p><button class="outline-button" id="player-room">${t('together')} <span>↗</span></button><button class="quiet-button room-copy-button" id="copy-room-code" hidden>${t('copyRoomCode')}</button><div class="emote-bar" id="emote-bar" hidden>${['👍', '🎉', '❤️', '😂', '😮', '👏'].map((emoji) => `<button class="emote" data-react="${emoji}" aria-label="React ${emoji}">${emoji}</button>`).join('')}</div></div></aside></div><div class="complete-card" id="complete-card" aria-hidden="true"><span class="complete-icon">✦</span><span class="eyebrow">${t('completeEyebrow')}</span><h2>${t('completeTitle')}</h2><p id="complete-copy">You made space for a good moment.</p><div><button class="primary-button" id="play-again">${t('playAgain')}</button><button class="outline-button" id="complete-share">${t('share')}</button><button class="outline-button" id="complete-close">${t('back')}</button></div></div></section>`; }
function roomMarkup() { return `<div class="modal-layer" id="room-modal" aria-hidden="true"><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="room-heading"><button class="modal-x" id="close-room" aria-label="Close">×</button><span class="eyebrow">${t('together')}</span><h2 id="room-heading">Same puzzle, different places.</h2><p>Choose a nickname and room settings. Share the six-letter code with up to 19 other players.</p><label class="form-label">${t('nickname')}<input id="nickname" maxlength="24" placeholder="Your name"/></label><label class="form-label">${t('passwordLabel')}<input id="room-password" type="password" maxlength="32" placeholder="••••"/></label><div class="room-settings"><label class="form-label">${t('difficulty')}<select id="room-difficulty"><option value="easy">${t('easy')}</option><option value="medium" selected>${t('medium')}</option><option value="hard">${t('hard')}</option><option value="expert">${t('expert')}</option></select></label><label class="form-label">${t('pieces')}<select id="room-piece-count"><option value="9">9</option><option value="16" selected>16</option><option value="25">25</option><option value="36">36</option><option value="60">60</option><option value="100">100</option><option value="144">144</option></select></label></div><button class="primary-button full" id="create-room">${t('room')} <span>+</span></button><div class="divider">${t('orJoin')}</div><div class="join-line"><input id="room-code" maxlength="6" placeholder="ABC123"/><button class="outline-button" id="join-room">${t('join')} <span>→</span></button></div><small class="form-note" id="room-note">${t('roomsNote')}</small></div></div>`; }
function customMarkup() { return `<div class="modal-layer" id="custom-modal" aria-hidden="true"><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="custom-heading"><button class="modal-x" id="close-custom" aria-label="Close">×</button><span class="eyebrow">Your picture, your puzzle</span><h2 id="custom-heading">Make a LumaPiece.</h2><p>Upload an image or paste a public URL. The puzzle stays in this browser.</p><label class="form-label">Title<input id="custom-title" maxlength="60" placeholder="A memory worth keeping"/></label><label class="form-label">Upload image<input id="custom-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif"/></label><label class="form-label">Or paste a URL<input id="custom-url" type="url" placeholder="https://…"/></label><div class="custom-preview" id="custom-preview">Your preview appears here.</div><div class="form-row"><label>Pieces<select id="custom-pieces"><option value="9">9</option><option value="16" selected>16</option><option value="25">25</option><option value="36">36</option><option value="60">60</option><option value="144">144</option></select></label><label class="switch"><input id="custom-rotation" type="checkbox"/><span></span>Rotate</label></div><button class="primary-button full" id="create-custom">${t('start')} <span>→</span></button><small class="form-note" id="custom-note"></small></div></div>`; }

function settingsMarkup() { return `<div class="modal-layer" id="settings-modal" aria-hidden="true"><div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="settings-heading"><button class="modal-x" id="close-settings" aria-label="Close">×</button><span class="eyebrow">Make it yours</span><h2 id="settings-heading">${t('settings')}</h2><label class="form-label switch-line">${t('sound')}<input id="setting-sound" type="checkbox"/></label><label class="form-label">${t('volume')}<input id="setting-volume" type="range" min="0" max="100" step="5"/></label><label class="form-label switch-line">${t('guide')}<input id="setting-guide" type="checkbox"/></label><label class="form-label">${t('pieceSize')}<input id="setting-scale" type="range" min="40" max="75" step="1"/></label><label class="form-label switch-line">${t('confetti')}<input id="setting-confetti" type="checkbox"/></label><span class="eyebrow">Developer</span><label class="form-label switch-line">${t('debug')}<input id="setting-debug" type="checkbox"/></label><label class="form-label switch-line">${t('reducedMotion')}<input id="setting-motion" type="checkbox"/></label><small class="form-note">${t('pieceSizeNote')}</small></div></div>`; }

function bindHome() {
  bindImageFallbacks();
  const grid = document.querySelector('#puzzle-grid');
  document.querySelector('#search').addEventListener('input', filterCatalog);
  document.querySelectorAll('[data-filter]').forEach((button) => button.addEventListener('click', () => { document.querySelectorAll('.chip').forEach((chip) => chip.classList.remove('active')); button.classList.add('active'); filterCatalog(button.dataset.filter); }));
  grid.addEventListener('click', (event) => { const favorite = event.target.closest('[data-favorite]'); if (favorite) { event.stopPropagation(); toggleFavorite(favorite.dataset.favorite); return; } const play = event.target.closest('[data-play]'); const card = event.target.closest('[data-puzzle-id]'); if (play || card) openGame(play?.dataset.play || card?.dataset.puzzleId); });
  document.querySelectorAll('.daily-section [data-play]').forEach((button) => button.addEventListener('click', () => openGame(button.dataset.play)));
  document.querySelector('#resume-latest').addEventListener('click', resumeLatest); document.querySelector('#open-custom').addEventListener('click', openCustom); document.querySelector('#open-custom-secondary').addEventListener('click', openCustom); document.querySelector('#open-room').addEventListener('click', () => openRoom()); document.querySelector('#locale-toggle').addEventListener('click', toggleLocale); document.querySelector('#theme-toggle').addEventListener('click', toggleTheme); document.querySelector('#open-settings').addEventListener('click', openSettings);
  document.querySelector('#player-ghost').addEventListener('click', () => { const active = currentEngine?.toggleGhost(); document.querySelector('#player-ghost').classList.toggle('active', Boolean(active)); });
  document.querySelector('#player-hint').addEventListener('click', () => currentEngine?.showHint()); document.querySelector('#player-sound').addEventListener('click', toggleSound);
  document.querySelector('#emote-bar').addEventListener('click', (event) => { const button = event.target.closest('[data-react]'); if (button && currentRoom && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'react', code: currentRoom.code, emoji: button.dataset.react })); });
  document.querySelector('#close-player').addEventListener('click', closeGame); document.querySelector('#player-save').addEventListener('click', () => { saveGame(); showToast('Progress saved.'); }); document.querySelector('#player-preview').addEventListener('click', togglePreview); document.querySelector('#player-pause').addEventListener('click', togglePause); document.querySelector('#player-edge').addEventListener('click', toggleEdges); document.querySelector('#player-rearrange').addEventListener('click', () => currentEngine?.rearrange()); document.querySelector('#piece-count').addEventListener('change', (event) => { currentPieceCount = Number(event.target.value); startEngine(true); }); document.querySelector('#difficulty-select').addEventListener('change', (event) => { currentDifficulty = event.target.value; applyDifficulty(); }); document.querySelector('#rotation-toggle').addEventListener('change', (event) => { currentEngine.rotationEnabled = event.target.checked; }); document.querySelector('#player-room').addEventListener('click', () => openRoom(currentPuzzle?.id)); document.querySelector('#copy-room-code').addEventListener('click', copyRoomCode); document.querySelector('#play-again').addEventListener('click', () => { hideComplete(); startEngine(true); }); document.querySelector('#complete-share').addEventListener('click', shareCompletion); document.querySelector('#complete-close').addEventListener('click', closeGame);
  document.querySelector('#close-room').addEventListener('click', closeRoom); document.querySelector('#create-room').addEventListener('click', createRoom); document.querySelector('#join-room').addEventListener('click', joinRoom); document.querySelector('#room-piece-count').addEventListener('change', (event) => { currentPieceCount = Number(event.target.value); }); document.querySelector('#room-difficulty').addEventListener('change', (event) => { currentDifficulty = event.target.value; }); document.querySelector('#close-custom').addEventListener('click', closeCustom); document.querySelector('#create-custom').addEventListener('click', createCustom); document.querySelector('#custom-file').addEventListener('change', previewFile); document.querySelector('#custom-url').addEventListener('input', previewUrl);
  document.querySelector('#close-settings').addEventListener('click', closeSettings);
  document.querySelector('#dismiss-onboarding').addEventListener('click', dismissOnboarding);
  bindSettings();
  document.querySelectorAll('.modal-layer').forEach((layer) => layer.addEventListener('click', (event) => {
    if (event.target !== layer) return;
    if (layer.id === 'room-modal') closeRoom();
    if (layer.id === 'custom-modal') closeCustom();
    if (layer.id === 'settings-modal') closeSettings();
  }));
  bindPlayerEnhancements();
}

function bindImageFallbacks(root = document) {
  root.querySelectorAll('img[data-fallback]').forEach((image) => {
    image.addEventListener('error', () => {
      const fallback = image.dataset.fallback;
      if (fallback && image.src !== new URL(fallback, location.href).href) {
        image.src = fallback;
        image.classList.add('using-fallback');
      }
    }, { once: true });
  });
}

function bindPlayerEnhancements() {
  const tools = document.querySelector('.player-tools');
  if (tools && !document.querySelector('#player-fullscreen')) {
    const button = document.createElement('button');
    button.className = 'tool-button';
    button.id = 'player-fullscreen';
    button.textContent = t('fullscreen');
    button.addEventListener('click', toggleFullscreen);
    tools.append(button);
  }
}

function filterCatalog(filter = document.querySelector('.chip.active')?.dataset.filter || 'all') { const term = document.querySelector('#search').value.trim().toLowerCase(); const visible = allPuzzles().filter((puzzle) => { const matchesText = `${puzzle.title} ${puzzle.category}`.toLowerCase().includes(term); const matchesFilter = filter === 'all' || (filter === 'favorite' ? favorites.has(puzzle.id) : filter === 'hard' ? puzzle.difficulty === 'hard' : filter === 'challenging' ? puzzle.challenging : filter === 'mystery' ? puzzle.mystery : puzzle.category.toLowerCase().includes(filter.toLowerCase())); return matchesText && matchesFilter; }); document.querySelector('#puzzle-grid').innerHTML = visible.map(puzzleCard).join(''); document.querySelector('#empty-message').hidden = visible.length > 0; }
function toggleFavorite(id) { if (favorites.has(id)) favorites.delete(id); else favorites.add(id); writeJson('lumapiece-favorites', [...favorites]); filterCatalog(); showToast(favorites.has(id) ? 'Saved to favorites.' : 'Removed from favorites.'); }
function resumeLatest() { const saved = Object.values(savedGames()).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0]; openGame(saved?.puzzleId || dailyPuzzle().id, false, saved); if (!saved) showToast('Start a puzzle and it will appear here next time.'); }
function openGame(id, together = false, saved = null) { currentPuzzle = getPuzzle(id); currentPieceCount = saved?.pieceCount || currentPuzzle.pieces || 16; currentDifficulty = saved?.difficulty || currentPuzzle.difficulty || 'medium'; completed = false; document.querySelector('#player').classList.add('open'); document.querySelector('#player').setAttribute('aria-hidden', 'false'); document.body.classList.add('player-open'); document.querySelector('#player-title').textContent = localizeTitle(currentPuzzle.id, currentPuzzle.title); document.querySelector('#player-category').textContent = `${localizeCategory(currentPuzzle.id, currentPuzzle.category)} · ${difficultyLabel(currentDifficulty)}`; document.querySelector('#player-reference').src = currentPuzzle.image; document.querySelector('#player-reference').dataset.fallback = currentPuzzle.fallbackImage || ''; document.querySelector('#piece-count').value = String(currentPieceCount); document.querySelector('#difficulty-select').value = currentDifficulty; document.querySelector('#rotation-toggle').checked = saved?.rotationEnabled ?? currentPuzzle.rotationEnabled ?? false; bindImageFallbacks(document.querySelector('#player')); hideComplete(); startEngine(!saved, saved); if (together) openRoom(currentPuzzle.id); }
function closeGame() { if (!completed) saveGame(); stopTimer(); leaveRoom(); currentEngine?.destroy(); currentEngine = null; document.querySelector('#player').classList.remove('open'); document.querySelector('#player').setAttribute('aria-hidden', 'true'); document.body.classList.remove('player-open'); }
function startEngine(shuffle = true, saved = null) { elapsed = saved?.elapsed || 0; paused = false; const canvas = document.querySelector('#puzzle-canvas'); currentEngine?.destroy(); currentEngine = new JigsawEngine(canvas, { image: currentPuzzle.image, fallbackImage: currentPuzzle.fallbackImage, puzzleId: currentPuzzle.id, pieceCount: currentPieceCount, rotationEnabled: saved?.rotationEnabled ?? currentPuzzle.rotationEnabled ?? false, initialRotation: !saved && currentDifficulty === 'expert', boardScale: appSettings.boardScale, showGuide: appSettings.guide, debugOverlay: appSettings.debug, onPick: () => sounds.play('pick'), onDrop: (snapped) => { sounds.play(snapped ? 'snap' : 'drop'); if (snapped && typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(18); }, onRotate: () => sounds.play('rotate'), onReady: () => { if (saved?.engineState) currentEngine.restore(saved.engineState); applyDifficulty(); updateStatus(); }, onError: () => { stopTimer(); sounds.play('error'); showToast('This image could not be loaded.'); }, onChange: () => { updateStatus(); if (!completed) { saveGame(); sendRoomState(); } }, onComplete: () => { completed = true; stopTimer(); const result = recordCompletion(currentPuzzle.id, elapsed); if (currentPuzzle.id === dailyPuzzle().id) { const today = dayKey(); const yesterday = dayKey(new Date(Date.now() - 86_400_000)); const streak = readJson('lumapiece-streak', { last: 0, count: 0 }); if (streak.last !== today) { streak.count = (streak.last === yesterday ? streak.count : 0) + 1; streak.last = today; writeJson('lumapiece-streak', streak); } } clearSavedGame(); showComplete(result); if (appSettings.confetti) celebrate({ reducedMotion: appSettings.reducedMotion }); sounds.play('complete'); } }); updateStatus(); startTimer(); }
function updateStatus() { const progress = currentEngine?.progress() || 0; document.querySelector('#move-count').textContent = currentEngine?.moves || 0; document.querySelector('#game-time').textContent = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`; document.querySelector('#piece-status').textContent = `${progress} / ${currentPieceCount}`; }
function startTimer() { stopTimer(); timerId = setInterval(() => { if (!paused) { elapsed += 1; updateStatus(); saveGame(); } }, 1000); }
function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
function saveGame() { if (!currentPuzzle || !currentEngine || completed) return; const games = savedGames(); games[currentPuzzle.id] = { puzzleId: currentPuzzle.id, pieceCount: currentPieceCount, difficulty: currentDifficulty, progress: currentEngine.progress(), elapsed, rotationEnabled: currentEngine.rotationEnabled, engineState: currentEngine.serialize(), savedAt: Date.now() }; writeJson('lumapiece-progress', games); }
function showComplete(result = null) { document.querySelector('#complete-card').classList.add('show'); document.querySelector('#complete-card').setAttribute('aria-hidden', 'false'); const time = document.querySelector('#game-time').textContent; let message = `${t('finishedIn')} ${time}.`; if (result?.isBest) message += ` ${t('newBest')}`; else if (result?.bestTime) message += ` ${t('yourBest')} ${formatTime(result.bestTime)}.`; document.querySelector('#complete-copy').textContent = message; }
function hideComplete() { document.querySelector('#complete-card').classList.remove('show'); document.querySelector('#complete-card').setAttribute('aria-hidden', 'true'); }
async function shareCompletion() { const time = document.querySelector('#game-time').textContent; const title = localizeTitle(currentPuzzle?.id, currentPuzzle?.title || 'LumaPiece'); const text = `🧩 Solved "${title}" in ${time} on LumaPiece!`; if (navigator.share) { try { await navigator.share({ title: 'LumaPiece', text, url: location.origin }); return; } catch {} } try { await navigator.clipboard.writeText(text); showToast('Result copied to clipboard!'); } catch { showToast(text); } }
function togglePause() { paused = !paused; document.querySelector('#player-pause').textContent = paused ? t('resume') : t('pause'); showToast(paused ? 'Paused.' : 'Back to it.'); }
function togglePreview() { document.querySelector('#player-reference').classList.toggle('large'); }
function toggleEdges() { const button = document.querySelector('#player-edge'); currentEngine?.setEdgeOnly(button.dataset.active !== 'true'); const active = button.dataset.active !== 'true'; button.dataset.active = String(active); button.textContent = active ? t('allPieces') : t('edges'); }
function applyDifficulty() { if (!currentEngine) return; const settings = { easy: { rotation: false, edgeOnly: false }, medium: { rotation: false, edgeOnly: false }, hard: { rotation: true, edgeOnly: false }, expert: { rotation: true, edgeOnly: false } }[currentDifficulty] || { rotation: false, edgeOnly: false }; currentEngine.rotationEnabled = settings.rotation || document.querySelector('#rotation-toggle')?.checked; document.querySelector('#rotation-toggle').checked = currentEngine.rotationEnabled; document.querySelector('#player-category').textContent = `${currentPuzzle.category} · ${difficultyLabel(currentDifficulty)}`; }
function showModal(id) {
  lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const layer = document.querySelector(`#${id}`);
  layer.classList.add('open');
  layer.setAttribute('aria-hidden', 'false');
}
function hideModal(id) {
  const layer = document.querySelector(`#${id}`);
  layer.classList.remove('open');
  layer.setAttribute('aria-hidden', 'true');
  if (lastFocusedElement?.isConnected) lastFocusedElement.focus();
  lastFocusedElement = null;
}
function openRoom(puzzleId) { if (puzzleId) currentPuzzle = getPuzzle(puzzleId); document.querySelector('#room-piece-count').value = String(currentPieceCount); document.querySelector('#room-difficulty').value = currentDifficulty; showModal('room-modal'); document.querySelector('#nickname').focus(); }
function closeRoom() { hideModal('room-modal'); }
function leaveRoom() { if (currentRoom && socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'leave-room', code: currentRoom.code })); currentRoom = null; reconnectAttempts = 0; writeJson('lumapiece-room', null); if (socket && socket.readyState <= WebSocket.OPEN) socket.close(); socket = null; document.querySelector('#room-badge').textContent = ''; document.querySelector('#emote-bar').hidden = true; }
function roomMessage(message) { document.querySelector('#room-note').textContent = message; }
function connectSocket() { if (socket?.readyState === WebSocket.OPEN) return socket; try { socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`); socket.addEventListener('message', (event) => handleRoomMessage(JSON.parse(event.data))); socket.addEventListener('error', () => roomMessage('The room server is unavailable.')); socket.addEventListener('close', () => { if (currentRoom && reconnectAttempts < 3) { reconnectAttempts += 1; showToast(`Connection lost. Reconnecting to room ${currentRoom.code}…`); setTimeout(reconnectRoom, 1800 * reconnectAttempts); } }); return socket; } catch { roomMessage('The room server is unavailable.'); return null; } }
function rememberRoom(room) { writeJson('lumapiece-room', { code: room.code, nickname: document.querySelector('#nickname')?.value.trim() || 'Guest' }); }
function reconnectRoom() { const remembered = readJson('lumapiece-room', null); if (!remembered?.code || !currentRoom) return; const ws = connectSocket(); if (!ws) return; const send = () => ws.send(JSON.stringify({ type: 'join-room', nickname: remembered.nickname || 'Guest', code: remembered.code })); if (ws.readyState === WebSocket.OPEN) send(); else ws.addEventListener('open', send, { once: true }); }
function announceRoomChange(previous, next) {
  if (!previous?.players?.length || !next?.players) return;
  const before = new Set(previous.players.map((player) => player.nickname));
  const after = new Set(next.players.map((player) => player.nickname));
  after.forEach((nickname) => { if (!before.has(nickname)) { showToast(`${nickname} joined the room.`); sounds.play('join'); } });
  before.forEach((nickname) => { if (!after.has(nickname)) { showToast(`${nickname} left the room.`); sounds.play('leave'); } });
}
function createRoom() { const nickname = document.querySelector('#nickname').value.trim() || 'Guest'; currentPieceCount = Number(document.querySelector('#room-piece-count').value); currentDifficulty = document.querySelector('#room-difficulty').value; const password = document.querySelector('#room-password').value.trim(); const ws = connectSocket(); if (!ws) return; const send = () => ws.send(JSON.stringify({ type: 'create-room', nickname, puzzleId: currentPuzzle?.id || dailyPuzzle().id, pieceCount: currentPieceCount, difficulty: currentDifficulty, password })); if (ws.readyState === WebSocket.OPEN) send(); else ws.addEventListener('open', send, { once: true }); roomMessage('Creating your room…'); }
function joinRoom() { const nickname = document.querySelector('#nickname').value.trim() || 'Guest'; const code = document.querySelector('#room-code').value.trim().toUpperCase(); if (code.length !== 6) { roomMessage('Enter the six-letter room code.'); return; } const password = document.querySelector('#room-password').value.trim(); const ws = connectSocket(); if (!ws) return; const send = () => ws.send(JSON.stringify({ type: 'join-room', nickname, code, password })); if (ws.readyState === WebSocket.OPEN) send(); else ws.addEventListener('open', send, { once: true }); roomMessage('Joining…'); }
function spawnReaction(from, emoji) { const bubble = document.createElement('span'); bubble.className = 'reaction'; bubble.textContent = `${emoji} ${from}`; bubble.style.left = `${30 + Math.random() * 40}%`; document.body.append(bubble); setTimeout(() => bubble.remove(), 2400); }
function handleRoomMessage(message) { if (message.type === 'room-created' || message.type === 'room-joined') { sounds.play('join'); currentRoom = message.room; rememberRoom(currentRoom); reconnectAttempts = 0; closeRoom(); openGame(currentRoom.puzzleId, false, currentRoom.state); document.querySelector('#room-badge').textContent = `Room ${currentRoom.code}${currentRoom.locked ? ' 🔒' : ''}`; document.querySelector('#room-title').textContent = `Room ${currentRoom.code}`; document.querySelector('#room-copy').textContent = `${currentRoom.players.map((player) => `${player.idle ? '💤 ' : ''}${player.nickname === currentRoom.host ? '★ ' : ''}${player.nickname}`).join(', ')} · ${currentRoom.players.length}/20 players`; document.querySelector('#copy-room-code').hidden = false; document.querySelector('#emote-bar').hidden = false; showToast('Room ready. Share the code with your friends.'); } else if (message.type === 'room-update') { announceRoomChange(currentRoom, message.room); currentRoom = message.room; if (message.state?.engineState && currentEngine) { currentDifficulty = message.state.difficulty || currentDifficulty; currentEngine.restore(message.state.engineState); updateStatus(); } document.querySelector('#room-badge').textContent = `Room ${currentRoom.code}${currentRoom.locked ? ' 🔒' : ''}`; document.querySelector('#room-copy').textContent = `${currentRoom.players.map((player) => `${player.idle ? '💤 ' : ''}${player.nickname === currentRoom.host ? '★ ' : ''}${player.nickname}`).join(', ')} · ${currentRoom.players.length}/20 players`; document.querySelector('#copy-room-code').hidden = false; document.querySelector('#emote-bar').hidden = false; } else if (message.type === 'reaction') { spawnReaction(message.from, message.emoji); } else if (message.type === 'room-closed') { showToast('The room was closed by an administrator.'); writeJson('lumapiece-room', null); currentRoom = null; reconnectAttempts = 0; document.querySelector('#room-badge').textContent = ''; document.querySelector('#emote-bar').hidden = true; } else if (message.type === 'room-error') { roomMessage(message.message); if (currentRoom && reconnectAttempts > 0) { showToast('The room is no longer available.'); writeJson('lumapiece-room', null); currentRoom = null; reconnectAttempts = 0; document.querySelector('#room-badge').textContent = ''; document.querySelector('#emote-bar').hidden = true; } } }
async function copyRoomCode() { if (!currentRoom) return; try { await navigator.clipboard.writeText(currentRoom.code); showToast(`Room code ${currentRoom.code} copied.`); } catch { showToast(`Share room code: ${currentRoom.code}`); } }
function sendRoomState() { if (currentRoom && socket?.readyState === WebSocket.OPEN && currentEngine) { const engineState = currentEngine.serialize(); socket.send(JSON.stringify({ type: 'state', code: currentRoom.code, state: { puzzleId: currentPuzzle.id, pieceCount: currentPieceCount, difficulty: currentDifficulty, moves: currentEngine.moves, elapsed, engineState } })); } }
function openCustom() { showModal('custom-modal'); document.querySelector('#custom-title').focus(); }
function closeCustom() { hideModal('custom-modal'); }
function openSettings() { syncSettingsUi(); showModal('settings-modal'); }
function closeSettings() { hideModal('settings-modal'); }
function syncSettingsUi() {
  document.querySelector('#setting-sound').checked = appSettings.sound;
  document.querySelector('#setting-volume').value = String(Math.round(appSettings.volume * 100));
  document.querySelector('#setting-guide').checked = appSettings.guide;
  document.querySelector('#setting-scale').value = String(Math.round(appSettings.boardScale * 100));
  document.querySelector('#setting-confetti').checked = appSettings.confetti;
  document.querySelector('#setting-debug').checked = appSettings.debug;
  document.querySelector('#setting-motion').checked = appSettings.reducedMotion;
}
function bindSettings() {
  document.querySelector('#setting-sound').addEventListener('change', (event) => { appSettings.sound = event.target.checked; sounds.enabled = appSettings.sound; saveSettings(); });
  document.querySelector('#setting-volume').addEventListener('input', (event) => { appSettings.volume = clamp(Number(event.target.value) / 100, 0, 1); sounds.volume = appSettings.volume; saveSettings(); });
  document.querySelector('#setting-guide').addEventListener('change', (event) => { appSettings.guide = event.target.checked; if (currentEngine) { currentEngine.showGuide = appSettings.guide; currentEngine.render(); } saveSettings(); });
  document.querySelector('#setting-scale').addEventListener('input', (event) => { appSettings.boardScale = clamp(Number(event.target.value) / 100, 0.4, 0.8); saveSettings(); });
  document.querySelector('#setting-confetti').addEventListener('change', (event) => { appSettings.confetti = event.target.checked; saveSettings(); });
  document.querySelector('#setting-debug').addEventListener('change', (event) => { appSettings.debug = event.target.checked; if (currentEngine) { currentEngine.debugOverlay = appSettings.debug; currentEngine.render(); } saveSettings(); });
  document.querySelector('#setting-motion').addEventListener('change', (event) => { appSettings.reducedMotion = event.target.checked; saveSettings(); });
}
function toggleSound() {
  appSettings.sound = !appSettings.sound;
  sounds.enabled = appSettings.sound;
  saveSettings();
  document.querySelector('#player-sound').textContent = appSettings.sound ? '🔊' : '🔇';
  if (appSettings.sound) sounds.play('click');
  showToast(appSettings.sound ? 'Sound on.' : 'Sound off.');
}
function dismissOnboarding() {
  document.querySelector('#onboarding')?.setAttribute('hidden', '');
  try {
    localStorage.setItem('lumapiece-onboarded', '1');
  } catch {
    // storage blocked; the tip simply reappears next visit
  }
}
function previewFile(event) { const file = event.target.files[0]; if (!file) return; if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(file.type) || file.size > 10 * 1024 * 1024) { document.querySelector('#custom-note').textContent = 'Use a JPG, PNG, WEBP, or GIF under 10 MB.'; event.target.value = ''; return; } document.querySelector('#custom-url').value = ''; document.querySelector('#custom-note').textContent = ''; const reader = new FileReader(); reader.addEventListener('load', () => { document.querySelector('#custom-preview').innerHTML = `<img src="${reader.result}" alt="Preview"/>`; document.querySelector('#custom-preview').dataset.source = reader.result; }); reader.readAsDataURL(file); }
function isAllowedImageSource(source) { return /^data:image\/(png|jpeg|webp|gif);base64,/i.test(source) || /^https?:\/\//i.test(source); }
function previewUrl(event) { const url = event.target.value.trim(); document.querySelector('#custom-preview').dataset.source = ''; if (!url) { document.querySelector('#custom-preview').textContent = 'Your preview appears here.'; return; } if (!/^https?:\/\//i.test(url)) { document.querySelector('#custom-note').textContent = 'Use an http:// or https:// URL.'; return; } document.querySelector('#custom-note').textContent = ''; document.querySelector('#custom-preview').innerHTML = `<img src="${esc(url)}" alt="Preview"/>`; }
async function resolveImageViaProxy(url) {
  try {
    const response = await fetch('/api/resolve-image', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
    const payload = await response.json().catch(() => null);
    if (response.ok && payload?.ok && isAllowedImageSource(payload.dataUrl)) return payload.dataUrl;
  } catch {
    // server unavailable; fall back to using the URL directly
  }
  return null;
}
async function createCustom() {
  const title = document.querySelector('#custom-title').value.trim() || 'My LumaPiece';
  const url = document.querySelector('#custom-url').value.trim();
  let source = document.querySelector('#custom-preview').dataset.source || url;
  if (!source || !isAllowedImageSource(source)) { document.querySelector('#custom-note').textContent = 'Choose a valid image first.'; return; }
  if (/^https?:\/\//i.test(source)) {
    const resolved = await resolveImageViaProxy(source);
    if (resolved) source = resolved;
  }
  const puzzle = { id: `custom-${Date.now()}`, title, category: 'Custom', difficulty: 'easy', image: source, mode: 'custom', pieces: Number(document.querySelector('#custom-pieces').value), rotationEnabled: document.querySelector('#custom-rotation').checked };
  customPuzzles.unshift(puzzle); if (!writeJson('lumapiece-custom', customPuzzles)) { customPuzzles.shift(); document.querySelector('#custom-note').textContent = 'This image is too large for browser storage. Try a smaller image.'; return; } closeCustom(); renderHome(); openGame(puzzle.id); showToast('Your puzzle is ready.');
}
function toggleTheme() { document.body.classList.toggle('night'); localStorage.setItem('lumapiece-theme', document.body.classList.contains('night') ? 'night' : 'light'); }
function toggleLocale() { setLocale(getLocale() === 'en' ? 'ar' : 'en'); document.documentElement.dir = getLocale() === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = getLocale(); renderHome(); }
function showToast(message) { const element = document.querySelector('#toast'); if (!element) return; element.textContent = message; element.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => element.classList.remove('show'), 2200); }

function clearSavedGame(puzzleId = currentPuzzle?.id) {
  if (!puzzleId) return;
  const games = savedGames();
  delete games[puzzleId];
  writeJson('lumapiece-progress', games);
}

async function toggleFullscreen() {
  const player = document.querySelector('#player');
  if (!player) return;
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await player.requestFullscreen();
  } catch {
    showToast('Fullscreen is not available in this browser.');
  }
}

function handleGlobalKeydown(event) {
  const openLayer = document.querySelector('.modal-layer.open');
  if (openLayer && event.key === 'Tab') {
    const focusable = [...openLayer.querySelectorAll('button, [href], input, select, textarea')].filter((element) => !element.disabled && element.offsetParent !== null);
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !openLayer.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  const target = event.target;
  if (event.key === 'Escape' && document.querySelector('#room-modal')?.classList.contains('open')) { closeRoom(); return; }
  if (event.key === 'Escape' && document.querySelector('#custom-modal')?.classList.contains('open')) { closeCustom(); return; }
  if (event.key === 'Escape' && document.querySelector('#settings-modal')?.classList.contains('open')) { closeSettings(); return; }
  if (target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
  const playerOpen = document.querySelector('#player')?.classList.contains('open');
  if (!playerOpen) return;
  if (event.key === 'Escape') {
    closeGame();
    return;
  }
  if (event.key === ' ' || event.key.toLowerCase() === 'p') { event.preventDefault(); togglePause(); }
  if (event.key.toLowerCase() === 'r') currentEngine?.rearrange();
  if (event.key.toLowerCase() === 'b') togglePreview();
  if (event.key.toLowerCase() === 'f') toggleFullscreen();
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') currentEngine?.rotateSelected(event.key === 'ArrowRight' ? 90 : -90);
}

async function renderAdmin() {
  const token = sessionStorage.getItem('lumapiece-admin-token') || '';
  app.innerHTML = `<div class="site-frame"><header class="topbar"><a class="wordmark" href="#home" aria-label="LumaPiece home"><span class="logo-orb">LP</span><span><strong>Luma<span>Piece</span></strong><small>${t('admin')}</small></span></a><div class="top-actions"><a class="quiet-button" href="#home">← ${t('backToApp')}</a></div></header><main class="admin-view"><div class="admin-card"><span class="eyebrow">${t('admin')}</span><h2>${t('adminTitle')}</h2><div class="admin-form"><input id="admin-token-input" type="password" placeholder="${t('adminToken')}" value="${esc(token)}"/><button class="primary-button compact" id="admin-load-btn">${t('loadRooms')}</button></div><div id="admin-status" class="admin-status"></div><div id="admin-rooms-wrap"></div></div></main></div>`;
  const input = document.querySelector('#admin-token-input');
  const statusEl = document.querySelector('#admin-status');
  const wrap = document.querySelector('#admin-rooms-wrap');
  const loadRooms = async () => {
    const currentToken = input.value.trim();
    sessionStorage.setItem('lumapiece-admin-token', currentToken);
    statusEl.textContent = 'Loading…';
    wrap.innerHTML = '';
    try {
      const res = await fetch('/admin/rooms', { headers: { Authorization: `Bearer ${currentToken}` } });
      if (res.status === 404) { statusEl.textContent = t('adminDisabled'); return; }
      if (res.status === 401) { statusEl.textContent = t('unauthorized'); return; }
      const data = await res.json();
      if (!data.ok || !data.rooms?.length) { statusEl.textContent = t('noRooms'); return; }
      statusEl.textContent = `${t('activeRooms')}: ${data.rooms.length}`;
      wrap.innerHTML = `<table class="admin-table"><thead><tr><th>Code</th><th>Puzzle</th><th>${t('players')}</th><th>Host</th><th>${t('status')}</th><th>${t('moves')}</th><th>${t('time')}</th><th>${t('action')}</th></tr></thead><tbody>${data.rooms.map((r) => `<tr><td><strong>${esc(r.code)}</strong></td><td>${esc(r.puzzleId)}</td><td>${r.players}/20</td><td>${esc(r.host || '—')}</td><td>${r.locked ? '🔒' : '🔓'}</td><td>${r.moves}</td><td>${formatTime(r.elapsed)}</td><td><button class="admin-close-btn" data-close-room="${esc(r.code)}">${t('closeRoomAction')}</button></td></tr>`).join('')}</tbody></table>`;
      wrap.querySelectorAll('[data-close-room]').forEach((btn) => btn.addEventListener('click', async () => {
        const code = btn.dataset.closeRoom;
        btn.disabled = true;
        await fetch(`/admin/rooms?code=${encodeURIComponent(code)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${currentToken}` } });
        loadRooms();
      }));
    } catch {
      statusEl.textContent = 'Could not reach server.';
    }
  };
  document.querySelector('#admin-load-btn').addEventListener('click', loadRooms);
  if (token) loadRooms();
}
function route() { if (location.hash === '#admin') renderAdmin(); else renderHome(); }

if (localStorage.getItem('lumapiece-theme') === 'night') document.body.classList.add('night');
document.documentElement.dir = getLocale() === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = getLocale();
sounds.enabled = appSettings.sound;
sounds.volume = appSettings.volume;
window.addEventListener('pointerdown', () => sounds.unlock());
document.addEventListener('click', (event) => { if (event.target instanceof Element && event.target.closest('button')) sounds.play('click'); });
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => {}); });
}
fetch('/api/daily').then((response) => response.json()).then((payload) => {
  if (!payload?.ok || !Number.isFinite(Number(payload.key))) return;
  dailyKeyOverride = Number(payload.key);
  if (!document.querySelector('#player')?.classList.contains('open') && location.hash !== '#admin') renderHome();
}).catch(() => {});
window.addEventListener('hashchange', route);
window.addEventListener('keydown', handleGlobalKeydown);
route();
