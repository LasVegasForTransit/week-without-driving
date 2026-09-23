/**
 * The participant API, from the browser. Sign up, My week and Get my link
 * load this before their own script and use window.lvwwdApi:
 *
 * - call(method, path, body) talks to the Worker and always resolves, to
 *   { ok, status, data }. data.message is a plain sentence to show when
 *   something went wrong, including when the phone is offline.
 * - botCheck(container, action) runs Turnstile in the container. The
 *   Worker writes the site key into its data-sitekey attribute.
 * - showPreviewLink(container, link) shows the "Open my week" link on the
 *   preview Worker, which returns it instead of only sending it.
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

    if (sitekey) {
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
    }

    return {
      token() {
        // No site key (a Worker without Turnstile set up): let the Worker answer.
        if (!sitekey || current) return Promise.resolve(current);
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

  window.lvwwdApi = { call, botCheck, showPreviewLink, OFFLINE };
})();
