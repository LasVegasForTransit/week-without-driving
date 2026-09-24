/**
 * The participant API, from the browser. Sign up, My week, Get my link and
 * Bingo load this before their own script and use window.lvwwdApi:
 *
 * - call(method, path, body) talks to the Worker and always resolves, to
 *   { ok, status, data }. data.message is a plain sentence to show when
 *   something went wrong, including when the phone is offline.
 * - botCheck(container, action) runs Turnstile in the container. The
 *   Worker writes the site key into its data-sitekey attribute.
 * - showPreviewLink(container, link) shows the "Open my week" link on the
 *   preview Worker, which returns it instead of only sending it.
 * - whereFrom() is what the sign-up sends about where it came from: the
 *   partner link opened in this tab (site-nav.js keeps it) and whether a
 *   volunteer is signing people up on this device.
 * - signUpSomeoneElse() is "Sign up someone else": it signs this device
 *   out, clears what it kept for the last person, and remembers for this
 *   tab that it is a shared device. It resolves to { ok, message }.
 */
(() => {
  const OFFLINE = 'Couldn’t reach lvwwd.org. Check your connection and try again.';
  const BROKEN = 'Something went wrong on our side. Try again in a minute.';
  const BOT_FAILED = 'We couldn’t check that you’re a person. Reload the page and try again.';
  const TURNSTILE =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=lvwwdTurnstileReady';
  // A challenge that needs a tap can take a while; past this, ask to try again.
  const BOT_WAIT_MS = 30_000;

  function requestInit(method, body) {
    const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    return init;
  }

  async function call(method, path, body) {
    let response;
    try {
      response = await fetch(path, requestInit(method, body));
    } catch {
      return { ok: false, status: 0, data: { message: OFFLINE } };
    }
    let data = {};
    try {
      data = await response.json();
    } catch {
      // Not JSON: a proxy or the network answered instead of the Worker.
    }
    if (!response.ok && !data.message) data.message = response.status >= 500 ? BROKEN : OFFLINE;
    return { ok: response.ok, status: response.status, data };
  }

  let turnstileLoading = null;
  function loadTurnstile() {
    // Added from here rather than the page, so it only loads where a form needs it.
    turnstileLoading ??= new Promise((resolve, reject) => {
      window.lvwwdTurnstileReady = () => resolve(window.turnstile);
      const script = document.createElement('script');
      script.src = TURNSTILE;
      script.async = true;
      script.addEventListener('error', () => reject(new Error('Turnstile did not load')));
      document.head.append(script);
    });
    return turnstileLoading;
  }

  /**
   * token() resolves to a fresh Turnstile answer, or rejects with a message
   * to show. reset() asks for a new answer; each one works only once.
   */
  function botCheck(container, action) {
    const sitekey = container?.getAttribute('data-sitekey') ?? '';
    let current = '';
    let failure = '';
    let widget = null;
    let waiting = [];
    const settle = (error) => {
      waiting.forEach((wait) => (error ? wait.reject(new Error(error)) : wait.resolve(current)));
      waiting = [];
    };

    let started = false;
    const start = () => {
      if (started || !sitekey) return;
      started = true;
      loadTurnstile()
        .then((turnstile) => {
          widget = turnstile.render(container, {
            sitekey,
            action,
            appearance: 'interaction-only',
            size: 'flexible',
            callback: (token) => {
              current = token;
              settle();
            },
            'expired-callback': () => (current = ''),
            'error-callback': () => settle(BOT_FAILED),
          });
        })
        .catch(() => {
          failure = OFFLINE;
          settle(OFFLINE);
        });
    };
    // Turnstile is the biggest download on these pages, so it loads when
    // someone starts on the form rather than with the page. Filling in the
    // form gives it the few seconds it needs.
    const form = container?.closest('form');
    if (form) {
      form.addEventListener('focusin', start, { once: true });
      form.addEventListener('pointerdown', start, { once: true });
    } else {
      start();
    }

    return {
      token() {
        // No site key (a Worker without Turnstile set up): let the Worker answer.
        if (!sitekey || current) return Promise.resolve(current);
        start();
        if (failure) return Promise.reject(new Error(failure));
        return new Promise((resolve, reject) => {
          waiting.push({ resolve, reject });
          window.setTimeout(() => reject(new Error(BOT_FAILED)), BOT_WAIT_MS);
        });
      },
      reset() {
        current = '';
        if (widget !== null) window.turnstile?.reset(widget);
      },
    };
  }

  function showPreviewLink(container, link) {
    if (!container || !link) return;
    const title = document.createElement('p');
    title.className = 'preview-link__title';
    title.textContent = 'Preview only';
    const note = document.createElement('p');
    note.textContent =
      'On lvwwd.org this link is only sent by email or text. The preview shows it so you can test it:';
    const anchor = document.createElement('a');
    anchor.href = link;
    anchor.textContent = link;
    anchor.className = 'body-link';
    container.replaceChildren(title, note, anchor);
    container.hidden = false;
  }

  const REF_KEY = 'lvwwd_ref';
  const SHARED_KEY = 'lvwwd_shared_device';
  const NEXT_KEY = 'lvwwd_next_person';
  const UNREACHABLE = 'We couldn’t reach the server. Check your connection and try again.';

  // Session storage lasts as long as the tab, and a private window keeps
  // nothing after it closes. Any of it may be refused.
  function stored(storage, key) {
    try {
      return window[storage].getItem(key);
    } catch {
      return null;
    }
  }
  function store(storage, key, value) {
    try {
      if (value === null) window[storage].removeItem(key);
      else window[storage].setItem(key, value);
    } catch {
      // Refused: the page works the same, only without the memory.
    }
  }

  function whereFrom() {
    const ref = stored('sessionStorage', REF_KEY);
    return {
      ...(ref ? { ref } : {}),
      sharedDevice: stored('sessionStorage', SHARED_KEY) === '1',
    };
  }

  async function signUpSomeoneElse() {
    const { ok, status, data } = await call('POST', '/api/signout', {});
    // 401: the session had already ended, which is the same result.
    if (!ok && status !== 401) return { ok: false, message: status ? data.message : UNREACHABLE };
    // The last person's bingo marks are saved with their sign-up; the next
    // person starts a fresh card. The key is bingo.js's STORAGE_KEY.
    store('localStorage', 'lvwwd_bingo_2026', null);
    store('sessionStorage', 'lvwwd_preview_link', null);
    store('sessionStorage', SHARED_KEY, '1');
    store('sessionStorage', NEXT_KEY, '1');
    document.dispatchEvent(new CustomEvent('lvwwd:signed-out'));
    return { ok: true, message: '' };
  }

  /** True once, on the first sign-up form shown after "Sign up someone else". */
  function readyForNextPerson() {
    const ready = stored('sessionStorage', NEXT_KEY) === '1';
    store('sessionStorage', NEXT_KEY, null);
    return ready;
  }

  window.lvwwdApi = {
    call,
    botCheck,
    showPreviewLink,
    whereFrom,
    signUpSomeoneElse,
    readyForNextPerson,
    OFFLINE,
  };
})();
