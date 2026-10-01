import type { Env } from '../env';
import { accessEmail } from './access';
import { messagePage } from './html';

/** All admin environments require a signed token from the configured Access application. */
export async function volunteerFor(request: Request, env: Env, now: Date): Promise<string | null> {
  return accessEmail(request, env, now);
}

export function forbiddenPage(): Response {
  return messagePage(
    403,
    'Volunteers only',
    'This page is for Week Without Driving volunteers. Sign in through the volunteer sign-in, then open it again.',
  );
}
