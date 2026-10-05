/// <reference types="@cloudflare/workers-types" />
import type { County } from './validate';

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
  /**
   * "off" skips the Turnstile bot check on purpose, for the short time
   * before the lvwwd.org widget exists. Rate limits still apply. Anything
   * else, or unset, keeps the check on.
   */
  BOT_CHECK?: string;
  /** Resend's API key. Without it, email links are recorded but not sent. */
  RESEND_API_KEY?: string;
  /** "true" on the preview Worker only: API responses include the link. */
  PREVIEW_SHOW_LINKS?: string;
  /** A day number (0–9) the preview Worker treats as today, for testing. */
  CHECKIN_PREVIEW_DAY?: string;
  /**
   * The Cloudflare Access team domain in front of /admin:
   * lvbt.cloudflareaccess.com. Without it and ACCESS_AUD,
   * every admin request is refused.
   */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Application Audience (AUD) tag of the lvwwd.org admin Access application. */
  ACCESS_AUD?: string;
  /** "true" on the preview Worker only: the draw can run before October 14. */
  PREVIEW_DRAW_ANYTIME?: string;
  /**
   * The private key that signs every reminder notification (VAPID), as 32
   * bytes in base64url. A secret, never a var. The Worker works out the
   * public key from it. Without it, nobody can turn on notifications and
   * none are sent.
   */
  VAPID_PRIVATE_KEY?: string;
  /** Where push services can reach LVBT about its notifications, as a mailto: address. */
  VAPID_SUBJECT?: string;
  /** Explicit release switch; event reminders remain off until a phone test succeeds. */
  EVENT_REMINDERS_ENABLED?: string;
  /** Server-only Google Routes key. Never sent to the browser. */
  GOOGLE_ROUTES_API_KEY?: string;
  /** Beehiiv subscription write key; never exposed in a page or response. */
  LVBT_BEEHIIV_API_KEY?: string;
  /** The existing LVBT newsletter publication, as pub_<UUID>. */
  LVBT_BEEHIIV_PUBLICATION_ID?: string;
  /** Enabled only after sender registration and a real SMS acceptance test. */
  SMS_REMINDERS_ENABLED?: string;
  /** Canonical SMS link/callback origin; isolated previews must set their own. */
  SMS_ORIGIN?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_MESSAGING_SERVICE_SID?: string;
  TWILIO_VERIFY_SERVICE_SID?: string;
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
  county: County | null;
  instagram: string | null;
  age: AgeGroup;
}

/** What every API handler gets. `now` is read once so a request sees one time. */
export interface ApiContext {
  request: Request;
  url: URL;
  env: ApiEnv;
  ctx: ExecutionContext;
  now: Date;
}
