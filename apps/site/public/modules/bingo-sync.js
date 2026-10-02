/**
 * Keeps a signed-in person's bingo card on their sign-up, so it follows
 * them to another phone. On load it merges the saved card with this
 * phone's (a square marked on either stays marked), then saves each change
 * a moment after it happens. People who aren't signed in keep their card
 * on this phone only, and nothing is sent.
 */
import { api } from './participant-api.js';
import { bingo } from './bingo.js';

const SQUARES = 25;
const signedIn = /(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie);
let timer = 0;
let participantId = null;
const save = (state) => api.call('PUT', '/api/bingo', { participantId, state });

function watch() {
  document.addEventListener('lvwwd:bingo-saved', (event) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(async () => {
      const response = await save(event.detail);
      if (response.status === 409) await load();
    }, 800);
  });
}

async function load() {
  const { ok, data } = await api.call('GET', '/api/bingo');
  if (!ok || typeof data.participantId !== 'string') return false;
  const previousParticipant = participantId;
  participantId = data.participantId;
  let owner = null;
  try {
    owner = localStorage.getItem('lvwwd_bingo_owner');
  } catch {
    // Without local storage, use only the authenticated saved card.
  }
  const sameParticipant =
    (!previousParticipant || previousParticipant === data.participantId) &&
    (owner === data.participantId || owner === 'anonymous');
  const here = sameParticipant
    ? bingo.state()
    : Array.from({ length: SQUARES }, (_, index) => index === 12);
  try {
    if (typeof data.participantId === 'string')
      localStorage.setItem('lvwwd_bingo_owner', data.participantId);
  } catch {
    // Storage is optional; the saved card still works.
  }
  const saved = Array.isArray(data.state) && data.state.length === SQUARES ? data.state : null;
  if (!saved) {
    bingo.apply(here);
    await save(here);
    return true;
  }
  const merged = here.map((marked, i) => marked || Boolean(saved[i]));
  bingo.apply(merged);
  if (merged.some((marked, i) => marked !== Boolean(saved[i]))) await save(merged);
  return true;
}

// bingo is null on a page without the card.
if (bingo && signedIn) {
  let watching = false;
  const reconcile = async () => {
    if (watching || !(await load())) return;
    watch();
    watching = true;
  };
  void reconcile();
  window.addEventListener('online', () => void reconcile());
}

if (bingo && !signedIn) {
  try {
    if (!localStorage.getItem('lvwwd_bingo_owner'))
      localStorage.setItem('lvwwd_bingo_owner', 'anonymous');
  } catch {
    // An anonymous card also works without local storage.
  }
}
