import { signOutCookies } from '../cookies';
import type { ApiContext, ApiEnv, Env, Participant } from '../env';
import { MESSAGES, isSameOriginWrite, json, problem } from '../http';
import { signedInParticipant } from '../session';
import { getMe, signOut, updateMe } from './me';
import { addPhoto } from './photo';
import { sendMyLink, signUp } from './sign-up';
import { checkIn, getBingo, putBingo, setReminders } from './week';

/**
 * The participant API under /api/. Every route says whether it needs a
 * signed-in phone, and every write is checked for our own Origin and a
 * JSON (or, for the photo, multipart) body before anything else runs.
 */

type Route = { method: string; path: string; multipart?: true } & (
  | { signedIn: false; handler: (c: ApiContext) => Promise<Response> }
  | { signedIn: true; handler: (c: ApiContext, me: Participant) => Promise<Response> }
);

const ROUTES: Route[] = [
  { method: 'POST', path: '/api/signup', signedIn: false, handler: signUp },
  { method: 'POST', path: '/api/link', signedIn: false, handler: sendMyLink },
  { method: 'POST', path: '/api/signout', signedIn: false, handler: signOut },
  { method: 'GET', path: '/api/me', signedIn: true, handler: getMe },
  { method: 'PATCH', path: '/api/me', signedIn: true, handler: updateMe },
  { method: 'POST', path: '/api/checkin', signedIn: true, handler: checkIn },
  { method: 'POST', path: '/api/reminders', signedIn: true, handler: setReminders },
  { method: 'POST', path: '/api/photo', signedIn: true, multipart: true, handler: addPhoto },
  { method: 'GET', path: '/api/bingo', signedIn: true, handler: getBingo },
  { method: 'PUT', path: '/api/bingo', signedIn: true, handler: putBingo },
];

function hasDatabase(env: Env): env is ApiEnv {
  return env.DB !== undefined;
}

async function run(route: Route, c: ApiContext): Promise<Response> {
  if (!route.signedIn) return route.handler(c);
  const me = await signedInParticipant(c.env.DB, c.request, c.now);
  // The flag cookie would keep saying "signed in", so clear it with the stale session.
  if (!me) return json({ message: MESSAGES.notSignedIn }, 401, signOutCookies());
  return route.handler(c, me);
}

export async function handleApi(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const url = new URL(request.url);
  const onPath = ROUTES.filter((route) => route.path === url.pathname);
  if (onPath.length === 0) return problem(404, MESSAGES.notFound);
  const route = onPath.find((candidate) => candidate.method === request.method);
  if (!route) return problem(405, MESSAGES.badRequest);
  if (route.method !== 'GET' && !isSameOriginWrite(request, url, route.multipart === true)) {
    return problem(403, MESSAGES.forbidden);
  }
  if (!hasDatabase(env)) return problem(503, MESSAGES.notOpen);
  try {
    return await run(route, { request, url, env, ctx, now: new Date() });
  } catch (error) {
    console.error('API request failed', request.method, url.pathname, error);
    return problem(500, MESSAGES.serverError);
  }
}
