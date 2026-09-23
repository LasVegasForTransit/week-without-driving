// Digital Transit Bingo's interactivity: marking squares, detecting lines,
// switching between Card view and List view, saving progress on the device,
// and the clear/share/print actions. Lives in public/scripts because the
// site's Content Security Policy is `script-src 'self'`, which blocks
// inline scripts — see the comment in bingo.astro. This file is served
// as-is (no bundler), so it can't import from src/lib/bingo.ts; the square
// layout below (5x5, free square at index 12) must stay in sync with that
// file if the card ever changes.
//
// Marks are saved in this browser's localStorage. For someone signed in,
// /scripts/bingo-sync.js also keeps the card on their sign-up, so it
// follows them to another phone; it talks to this file through
// window.lvwwdBingo and the lvwwd:bingo-saved event.
(() => {
  const STORAGE_KEY = 'lvwwd_bingo_2026';
  const VIEW_KEY = 'lvwwd_bingo_view';
  const FREE_INDEX = 12;
  const SQUARE_COUNT = 25;
  // Keep in sync with src/lib/wwd.ts (wwd.start / wwd.end).
  const WEEK_START = Date.parse('2026-10-01T07:00:00Z');
  const WEEK_END = Date.parse('2026-10-09T07:00:00Z');

  const LINE_NAMES = [
    'row 1',
    'row 2',
    'row 3',
    'row 4',
    'row 5',
    'column 1',
    'column 2',
    'column 3',
    'column 4',
    'column 5',
    'the diagonal from top left',
    'the diagonal from top right',
  ];

  function buildLines() {
    const lines = [];
    for (let r = 0; r < 5; r++) lines.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
    for (let c = 0; c < 5; c++) lines.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
    lines.push([0, 6, 12, 18, 24]);
    lines.push([4, 8, 12, 16, 20]);
    return lines;
  }
  const LINES = buildLines();

  const board = document.querySelector('[data-bingo-board]');
  if (!board) return;

  const inputs = Array.from(board.querySelectorAll('[data-bingo-input]'));
  const progressEl = document.querySelector('[data-bingo-progress]');
  const dayLineEl = document.querySelector('[data-bingo-day-line]');
  const giveawayLinkEl = document.querySelector('[data-bingo-giveaway-link]');
  const storageNoticeEl = document.querySelector('[data-bingo-storage-notice]');
  const clearedNoticeEl = document.querySelector('[data-bingo-cleared-notice]');
  const clearBtn = document.querySelector('[data-bingo-clear]');
  const clearDialog = document.querySelector('[data-bingo-clear-dialog]');
  const clearConfirmBtn = document.querySelector('[data-bingo-clear-confirm]');
  const clearCancelBtn = document.querySelector('[data-bingo-clear-cancel]');
  const lineDialog = document.querySelector('[data-bingo-line-dialog]');
  const lineHeadingEl = document.querySelector('[data-bingo-line-heading]');
  const lineMessageEl = document.querySelector('[data-bingo-line-message]');
  const lineSuggestionEl = document.querySelector('[data-bingo-line-suggestion]');
  const dialogGiveawayBtn = document.querySelector('[data-bingo-dialog-giveaway]');
  const dialogCloseBtn = document.querySelector('[data-bingo-dialog-close]');
  const shareBtn = document.querySelector('[data-bingo-share]');
  const dialogShareBtn = document.querySelector('[data-bingo-dialog-share]');
  const confettiEl = document.querySelector('[data-bingo-confetti]');
  const viewButtons = Array.from(document.querySelectorAll('[data-bingo-view-btn]'));

  // --- storage -------------------------------------------------------
  function checkStorageAvailable() {
    try {
      const testKey = '__lvwwd_bingo_test__';
      window.localStorage.setItem(testKey, '1');
      window.localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }
  const storageAvailable = checkStorageAvailable();
  if (!storageAvailable && storageNoticeEl) storageNoticeEl.hidden = false;

  function loadState() {
    const fallback = new Array(SQUARE_COUNT).fill(false);
    fallback[FREE_INDEX] = true;
    if (!storageAvailable) return fallback;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length !== SQUARE_COUNT) return fallback;
      const loaded = parsed.map((v) => Boolean(v));
      loaded[FREE_INDEX] = true;
      return loaded;
    } catch {
      return fallback;
    }
  }

  function saveState(s) {
    document.dispatchEvent(new CustomEvent('lvwwd:bingo-saved', { detail: s }));
    if (!storageAvailable) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    } catch {
      // Storage may become unavailable mid-session (e.g. quota). Marks stay
      // in memory for the rest of this page view, same as the "blocked"
      // state.
    }
  }

  let state = loadState();
  inputs.forEach((input) => {
    input.checked = state[Number(input.dataset.index)];
  });

  // --- view (Card / List) ---------------------------------------------
  function largeTextLikely() {
    const px = parseFloat(getComputedStyle(document.documentElement).fontSize);
    return Number.isFinite(px) && px > 24;
  }

  function readStoredView() {
    if (!storageAvailable) return null;
    try {
      return window.localStorage.getItem(VIEW_KEY);
    } catch {
      return null;
    }
  }

  function setView(view, persist) {
    board.dataset.view = view;
    viewButtons.forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.bingoViewBtn === view));
    });
    if (!persist || !storageAvailable) return;
    try {
      window.localStorage.setItem(VIEW_KEY, view);
    } catch {
      // Non-fatal: the view just won't be remembered next time.
    }
  }

  function initView() {
    const stored = readStoredView();
    const initial =
      stored === 'list' || stored === 'card' ? stored : largeTextLikely() ? 'list' : 'card';
    setView(initial, false);
    viewButtons.forEach((btn) => {
      btn.addEventListener('click', () => setView(btn.dataset.bingoViewBtn, true));
    });
  }
  initView();

  // --- date state -------------------------------------------------------
  const now = Date.now();
  const isBeforeWeek = now < WEEK_START;
  const isAfterWeek = now >= WEEK_END;

  function dayOfWeek() {
    const n = Math.floor((now - WEEK_START) / 86_400_000) + 1;
    return Math.min(Math.max(n, 1), 8);
  }

  function dayLineText() {
    if (isBeforeWeek) return 'The week starts October 1. You can start marking squares now.';
    if (isAfterWeek)
      return "The week has ended. Thanks for playing! Your card can't be changed now.";
    return `The week is on: day ${dayOfWeek()} of 8.`;
  }

  function applyDateState() {
    if (dayLineEl) dayLineEl.textContent = dayLineText();
    if (giveawayLinkEl) giveawayLinkEl.style.display = isBeforeWeek || isAfterWeek ? 'none' : '';
    if (!isAfterWeek) return;
    inputs.forEach((input) => {
      input.disabled = true;
    });
    if (clearBtn) clearBtn.style.display = 'none';
  }
  applyDateState();

  function celebrationSuggestion() {
    return isBeforeWeek
      ? 'Share your card with friends.'
      : 'Share your card with friends. And share today’s trip on My week for a giveaway entry.';
  }

  // --- progress + lines --------------------------------------------------
  function markedCount(s) {
    return s.reduce((n, v, i) => (i !== FREE_INDEX && v ? n + 1 : n), 0);
  }

  function completedLines(s) {
    return LINES.map((line, idx) => (line.every((i) => s[i]) ? idx : -1)).filter((i) => i !== -1);
  }

  function progressText(s) {
    const n = markedCount(s);
    const bingos = completedLines(s).length;
    if (n === 0) return 'No squares marked yet. The middle square is free.';
    if (n === 24) return 'All 24 squares marked · 12 bingos';
    const squareWord = n === 1 ? 'square' : 'squares';
    if (bingos === 0) return `${n} ${squareWord} marked`;
    const bingoWord = bingos === 1 ? 'bingo' : 'bingos';
    return `${n} ${squareWord} marked · ${bingos} ${bingoWord}`;
  }

  function updateProgress(s) {
    if (progressEl) progressEl.textContent = progressText(s);
  }

  function cellIndex(cell) {
    if (cell.classList.contains('bingo-cell--free')) return FREE_INDEX;
    const input = cell.querySelector('[data-bingo-input]');
    return input ? Number(input.dataset.index) : -1;
  }

  function updateLineBorders(s) {
    const inLine = new Set();
    for (const idx of completedLines(s)) {
      for (const i of LINES[idx]) inLine.add(i);
    }
    board.querySelectorAll('.bingo-cell').forEach((cell) => {
      cell.classList.toggle('bingo-cell--in-line', inLine.has(cellIndex(cell)));
    });
  }

  updateProgress(state);
  updateLineBorders(state);

  // --- confetti -----------------------------------------------------
  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function fireConfetti() {
    if (!confettiEl || reducedMotion()) return;
    const colors = ['#ff5a3c', '#1a1a1a', '#ffb37a', '#2e7d32'];
    const pieces = [];
    for (let i = 0; i < 28; i++) {
      const span = document.createElement('span');
      span.style.left = `${Math.random() * 100}%`;
      span.style.background = colors[i % colors.length];
      span.style.animationDelay = `${Math.random() * 0.3}s`;
      confettiEl.appendChild(span);
      pieces.push(span);
    }
    window.setTimeout(() => pieces.forEach((p) => p.remove()), 2000);
  }

  // --- share ----------------------------------------------------------
  async function tryNativeShare(shareData) {
    if (!navigator.share) return false;
    try {
      await navigator.share(shareData);
      return true;
    } catch {
      return false; // Also covers a canceled share.
    }
  }

  async function tryClipboardShare(url) {
    if (!navigator.clipboard || !navigator.clipboard.writeText) return false;
    try {
      await navigator.clipboard.writeText(url);
      window.alert('Link copied. Paste it anywhere to share your card.');
      return true;
    } catch {
      return false;
    }
  }

  async function shareCard() {
    const shareData = {
      title: 'Digital Transit Bingo · Week Without Driving Las Vegas',
      text: 'I’m playing Digital Transit Bingo for Week Without Driving Las Vegas.',
      url: window.location.href,
    };
    if (await tryNativeShare(shareData)) return;
    if (await tryClipboardShare(shareData.url)) return;
    window.prompt('Copy this link to share your card:', shareData.url);
  }

  shareBtn?.addEventListener('click', shareCard);
  dialogShareBtn?.addEventListener('click', shareCard);

  // --- line / whole-card celebration -----------------------------------
  function joinWithAnd(items) {
    if (items.length <= 1) return items.join('');
    if (items.length === 2) return `${items[0]} and ${items[1]}`;
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  function openLineDialog({ heading, message, showGiveaway }) {
    if (!lineDialog) return;
    if (lineHeadingEl) lineHeadingEl.textContent = heading;
    if (lineMessageEl) lineMessageEl.textContent = message;
    if (lineSuggestionEl) lineSuggestionEl.textContent = celebrationSuggestion();
    if (dialogGiveawayBtn) dialogGiveawayBtn.style.display = showGiveaway ? '' : 'none';
    fireConfetti();
    if (typeof lineDialog.showModal === 'function') lineDialog.showModal();
    else lineDialog.setAttribute('open', '');
  }

  function closeLineDialog() {
    if (typeof lineDialog?.close === 'function') lineDialog.close();
    else lineDialog?.removeAttribute('open');
  }
  dialogCloseBtn?.addEventListener('click', closeLineDialog);

  function celebrateWholeCard() {
    openLineDialog({
      heading: 'You filled the whole card!',
      message: "That's all 24 squares and 12 bingos. Thank you for taking part.",
      showGiveaway: !isBeforeWeek && !isAfterWeek,
    });
  }

  function celebrateLines(names) {
    const message =
      names.length === 1
        ? `You finished a line: ${names[0]}.`
        : `You finished ${names.length} lines: ${joinWithAnd(names)}.`;
    openLineDialog({ heading: 'Bingo!', message, showGiveaway: !isBeforeWeek && !isAfterWeek });
  }

  function handleSquareChange(input) {
    const i = Number(input.dataset.index);
    const before = completedLines(state);
    const wasFull = markedCount(state) === 24;

    state = state.slice();
    state[i] = input.checked;
    saveState(state);
    updateProgress(state);
    updateLineBorders(state);
    if (clearedNoticeEl && !clearedNoticeEl.hidden) clearedNoticeEl.hidden = true;

    if (!input.checked) return; // Unmarking never opens a celebration.

    if (markedCount(state) === 24 && !wasFull) {
      celebrateWholeCard();
      return;
    }

    const newlyCompleted = completedLines(state).filter((idx) => !before.includes(idx));
    if (newlyCompleted.length > 0) celebrateLines(newlyCompleted.map((idx) => LINE_NAMES[idx]));
  }

  inputs.forEach((input) => {
    input.addEventListener('change', () => handleSquareChange(input));
  });

  // --- clear ------------------------------------------------------------
  function showClearDialog() {
    if (typeof clearDialog?.showModal === 'function') clearDialog.showModal();
    else clearDialog?.setAttribute('open', '');
  }
  function hideClearDialog() {
    if (typeof clearDialog?.close === 'function') clearDialog.close();
    else clearDialog?.removeAttribute('open');
  }
  function confirmClear() {
    state = new Array(SQUARE_COUNT).fill(false);
    state[FREE_INDEX] = true;
    saveState(state);
    inputs.forEach((input) => {
      input.checked = false;
    });
    updateProgress(state);
    updateLineBorders(state);
    if (clearedNoticeEl) clearedNoticeEl.hidden = false;
    hideClearDialog();
  }

  // For bingo-sync.js: read the card, or show a card loaded from the sign-up.
  window.lvwwdBingo = {
    state: () => state.slice(),
    apply(next) {
      state = next.map(Boolean);
      state[FREE_INDEX] = true;
      inputs.forEach((input) => {
        input.checked = state[Number(input.dataset.index)];
      });
      updateProgress(state);
      updateLineBorders(state);
      if (storageAvailable) {
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
          // The card still shows; it just isn't kept on this phone.
        }
      }
    },
  };

  clearBtn?.addEventListener('click', showClearDialog);
  clearCancelBtn?.addEventListener('click', hideClearDialog);
  clearConfirmBtn?.addEventListener('click', confirmClear);
})();
