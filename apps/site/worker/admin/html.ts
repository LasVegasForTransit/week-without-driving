/**
 * Server-rendered HTML for the admin views. Everything participants typed
 * (names, notes, links, handles) is escaped by the `html` template, so it
 * shows as text and never runs. The pages have no script at all; the
 * Content-Security-Policy below allows none.
 */

export class Html {
  constructor(readonly text: string) {}
}

export type Content = Html | string | number | null | undefined | false | readonly Content[];

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (character) => ESCAPES[character] ?? character);
}

function render(value: Content): string {
  if (value instanceof Html) return value.text;
  if (Array.isArray(value)) return (value as readonly Content[]).map(render).join('');
  if (typeof value === 'string') return escapeHtml(value);
  if (typeof value === 'number') return String(value);
  return '';
}

/** A template whose values are escaped, unless they are Html already. */
export function html(strings: TemplateStringsArray, ...values: Content[]): Html {
  let text = strings[0] ?? '';
  values.forEach((value, index) => {
    text += render(value) + (strings[index + 1] ?? '');
  });
  return new Html(text);
}

// The site's colors (src/styles/global.css), light and dark.
const STYLES = `
:root{--surface:#fbf4e6;--on-surface:#3b2a20;--muted:#6b5646;--container:#f2e4c8;--primary:#0e7c86;
--link:#0a5e66;--field:#fff;--error:#b3261e;--line:#3b2a20;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--surface:#17130f;--on-surface:#fbf4e6;--muted:#c9bba9;
--container:#221c16;--link:#6fd3db;--field:#1d1813;--error:#ffb4ab;--line:#7f7164}}
*{box-sizing:border-box}
body{margin:0;background:var(--surface);color:var(--on-surface);font:16px/1.5 system-ui,sans-serif}
main{max-width:60rem;margin:0 auto;padding:1rem}
h1{font-size:1.6rem;margin:.5rem 0}h2{font-size:1.3rem;margin:2rem 0 .5rem}h3{font-size:1.05rem;margin:0}
a{color:var(--link)}
table{border-collapse:collapse;margin:.5rem 0}th,td{border:1px solid var(--line);padding:.25rem .5rem;text-align:right}
th:first-child,td:first-child{text-align:left}
.notice{padding:.75rem 1rem;border-radius:.5rem;background:var(--container);border-left:.4rem solid var(--primary)}
.notice.problem{border-left-color:var(--error)}
.muted{color:var(--muted)}
.tabs a{margin-right:1rem}.tabs a[aria-current]{font-weight:700;color:var(--on-surface)}
.entry{background:var(--container);border-radius:.5rem;padding:.75rem 1rem;margin:.75rem 0}
.entry p{margin:.25rem 0}
.entry img{display:block;max-width:100%;max-height:24rem;margin:.5rem 0;border:1px solid var(--line)}
.actions{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;margin-top:.5rem}
form.stack{display:grid;gap:.75rem;max-width:32rem}
.stack label>input:not([type=checkbox]),.stack label>select,.stack label>textarea{display:block;width:100%;margin-top:.25rem}
caption{text-align:left}
label{display:block}
input,select,textarea,button{font:inherit;color:inherit}
input,select,textarea{background:var(--field);border:1px solid var(--line);border-radius:.25rem;padding:.35rem .5rem;max-width:100%}
input[type=checkbox]{width:1.1rem;height:1.1rem}
button{background:var(--primary);color:#fff;border:0;border-radius:999px;padding:.45rem 1rem;font-weight:600;cursor:pointer}
button.quiet{background:transparent;color:var(--on-surface);border:1px solid var(--line)}
fieldset{border:1px solid var(--line);border-radius:.25rem}
.winner{font-size:1.1rem}
`;

const HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex, nofollow',
  // Not no-referrer: with it, browsers send "Origin: null" with a form, and
  // the Origin check would refuse every form. Links to posts carry
  // rel="noreferrer", so other sites still learn nothing.
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy':
    "default-src 'none'; style-src 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
};

export function page(title: string, body: Content, status = 200): Response {
  const document = html`<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
        <title>${title} · lvwwd.org volunteers</title>
        <style>
          ${new Html(STYLES)}
        </style>
      </head>
      <body>
        <main>${body}</main>
      </body>
    </html>`;
  return new Response(document.text, { status, headers: HEADERS });
}

/** A page with a heading and one line, for refusals and errors. */
export function messagePage(status: number, title: string, message: string): Response {
  return page(
    title,
    html`<h1>${title}</h1>
      <p>${message}</p>`,
    status,
  );
}

/** Back to a page after a form, so reloading it doesn't send the form again. */
export function seeOther(location: string): Response {
  return new Response(null, {
    status: 303,
    headers: { Location: location, 'Cache-Control': 'no-store' },
  });
}
