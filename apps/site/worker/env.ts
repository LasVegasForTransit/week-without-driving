/// <reference types="@cloudflare/workers-types" />

/**
 * What the Worker is given. Everything past ASSETS is optional so the same
 * code runs on the production Worker before its database exists (the API
 * then answers 503 and the static pages keep working), on the preview
 * Worker, and in tests.
 */
export interface Env {
  ASSETS: Fetcher;
  /** Participants, sessions, links, check-ins and the rest. See migrations/. */
  DB?: D1Database;
  /** Uploaded photos. Without it, the photo form says photos are coming soon. */
  PHOTOS?: R2Bucket;
  /** Turnstile's public key, written into the sign-up and link pages. */
  TURNSTILE_SITE_KEY?: string;
  /** Turnstile's secret. A secret, never a var. Without it, forms are refused. */
  TURNSTILE_SECRET?: string;
  /** Resend's API key. Without it, email links are recorded but not sent. */
  RESEND_API_KEY?: string;
  /** "true" on the preview Worker only: API responses include the link. */
  PREVIEW_SHOW_LINKS?: string;
  /** A day number (0–9) the preview Worker treats as today, for testing. */
  CHECKIN_PREVIEW_DAY?: string;
  /**
   * The Cloudflare Access team domain in front of /admin, such as
   * lasvegasfortransit.cloudflareaccess.com. Without it and ACCESS_AUD,
   * every admin request is refused.
   */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Application Audience (AUD) tag of the lvwwd.org admin Access application. */
  ACCESS_AUD?: string;
  /**
   * Preview Worker only, and always a secret: a key that lets a tester into
   * /admin without Access (see worker/admin/gate.ts). Production must never
   * set it.
   */
  PREVIEW_ADMIN_KEY?: string;
  /** "true" on the preview Worker only: the draw can run before October 14. */
  PREVIEW_DRAW_ANYTIME?: string;
}

/** The environment once the API has checked the database is there. */
export type ApiEnv = Env & { DB: D1Database };

export type ContactType = 'phone' | 'email';
export type AgeGroup = 'adult' | 'teen';

/** One signed-up person, as the API handlers see them. */
export interface Participant {
  id: string;
  firstName: string;
  contact: string;
  contactType: ContactType;
  zip: string;
  instagram: string | null;
  age: AgeGroup;
  newsletter: boolean;
}

/** What every API handler gets. `now` is read once so a request sees one time. */
export interface ApiContext {
  request: Request;
  url: URL;
  env: ApiEnv;
  ctx: ExecutionContext;
  now: Date;
}
