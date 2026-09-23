/**
 * Keeps a signed-in person's bingo card on their sign-up, so it follows
 * them to another phone. On load it merges the saved card with this
 * phone's (a square marked on either stays marked), then saves each change
 * a moment after it happens. People who aren't signed in keep their card
 * on this phone only, and nothing is sent.
 */
(() => {
  const api = window.lvwwdApi;
  const bingo = window.lvwwdBingo;
  if (!api || !bingo) return;
  if (!/(?:^|; )lvwwd_signed_in=1(?:;|$)/.test(document.cookie)) return;

  const SQUARES = 25;
  let timer = 0;
  const save = (state) => api.call('PUT', '/api/bingo', { state });

  document.addEventListener('lvwwd:bingo-saved', (event) => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void save(event.detail), 800);
  });

  async function load() {
    const { ok, data } = await api.call('GET', '/api/bingo');
    if (!ok) return;
    const here = bingo.state();
    const saved = Array.isArray(data.state) && data.state.length === SQUARES ? data.state : null;
    if (!saved) {
      await save(here);
      return;
    }
    const merged = here.map((marked, i) => marked || Boolean(saved[i]));
    bingo.apply(merged);
    if (merged.some((marked, i) => marked !== Boolean(saved[i]))) await save(merged);
  }

  void load();
})();
