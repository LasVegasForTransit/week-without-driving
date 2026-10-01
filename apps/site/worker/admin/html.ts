import { STYLES } from './styles';

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
    "default-src 'none'; style-src 'unsafe-inline'; font-src 'self'; img-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
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
        ${body}
      </body>
    </html>`;
  return new Response(document.text, { status, headers: HEADERS });
}

/** A page with a heading and one line, for refusals and errors. */
export function messagePage(status: number, title: string, message: string): Response {
  return page(
    title,
    html`<main class="message">
      <h1>${title}</h1>
      <p>${message}</p>
      <p><a class="button-link quiet" href="/admin">Back to admin</a></p>
    </main>`,
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
