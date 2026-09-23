import type { ApiEnv, Env } from '../env';
import type { AdminContext } from './common';
import { drawWinner } from './draw';
import { entriesCsv, screenshot } from './files';
import { forbiddenPage, previewLogin, volunteerFor } from './gate';
import { messagePage } from './html';
import { logMail, logTag } from './log';
import { showAdmin } from './respond';
import { markChecked, removeEntry, restoreEntry } from './review';

/**
 * The volunteer admin views: /admin and /api/admin/*, rendered by the
 * Worker, with no static page behind them. Every request must come from a
 * volunteer (gate.ts) before anything else runs, and every form must come
 * from these pages (its Origin must be this site). Each request records
 * the volunteer's email, so they can never win the draw.
 *
 * Nothing here logs a contact, handle or post link.
 */

type Handler =
  | { method: 'GET'; run: (c: AdminContext) => Promise<Response> }
  | { method: 'POST'; run: (c: AdminContext, form: FormData) => Promise<Response> };

const ROUTES: Record<string, Handler> = {
  '/admin': { method: 'GET', run: showAdmin },
  '/admin/entries/check': { method: 'POST', run: markChecked },
  '/admin/entries/remove': { method: 'POST', run: removeEntry },
  '/admin/entries/restore': { method: 'POST', run: restoreEntry },
  '/admin/tags': { method: 'POST', run: logTag },
  '/admin/mail': { method: 'POST', run: logMail },
  '/admin/draw': { method: 'POST', run: drawWinner },
  '/api/admin/entries.csv': { method: 'GET', run: entriesCsv },
};

const SCREENSHOTS = '/api/admin/screenshot/';

export function isAdminPath(path: string): boolean {
  return (
    path === '/admin' ||
    path.startsWith('/admin/') ||
    path === '/api/admin' ||
    path.startsWith('/api/admin/')
  );
}

function routeFor(path: string): Handler | undefined {
  if (path.startsWith(SCREENSHOTS)) return { method: 'GET', run: screenshot };
  const normal = path.length > 1 ? path.replace(/\/$/, '') : path;
  return Object.hasOwn(ROUTES, normal) ? ROUTES[normal] : undefined;
}

async function readForm(request: Request): Promise<FormData | null> {
  try {
    return await request.formData();
  } catch {
    return null;
  }
}

async function run(route: Handler, c: AdminContext): Promise<Response> {
  if (route.method === 'GET') return route.run(c);
  const form = await readForm(c.request);
  if (!form) return messagePage(400, 'Something’s wrong', 'Reload the page and try again.');
  return route.run(c, form);
}

function hasDatabase(env: Env): env is ApiEnv {
  return env.DB !== undefined;
}

export async function handleAdmin(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/admin/preview-login') return previewLogin(url, env);
  const now = new Date();
  const volunteer = await volunteerFor(request, env, now);
  if (!volunteer) return forbiddenPage();
  const route = routeFor(url.pathname);
  if (!route) return messagePage(404, 'Not found', 'There’s nothing here.');
  if (route.method !== request.method) return messagePage(405, 'Not allowed', 'Reload the page.');
  // A form on another site can't send this site's Origin.
  if (request.method !== 'GET' && request.headers.get('Origin') !== url.origin) {
    return forbiddenPage();
  }
  if (!hasDatabase(env)) return messagePage(503, 'Not set up yet', 'The database isn’t set up.');
  try {
    await env.DB.prepare(
      'INSERT INTO volunteers (email, first_seen_at) VALUES (?1, ?2) ON CONFLICT (email) DO NOTHING',
    )
      .bind(volunteer, now.toISOString())
      .run();
    return await run(route, { request, url, env, ctx, now, volunteer });
  } catch (error) {
    // The route, never the address: a screenshot's address names a participant.
    console.error('Admin request failed', request.method, route.run.name, error);
    return messagePage(500, 'Something went wrong', 'Try again in a minute.');
  }
}
