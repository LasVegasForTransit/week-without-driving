import { utf8 } from './bytes';
import { type BrowserKeys, encryptMessage } from './encrypt';
import { type Vapid, vapidAuthorization } from './vapid';

/**
 * Sending one notification to one browser through its push service.
 */

/** A push subscription as stored in push_subscriptions. */
export interface StoredSubscription extends BrowserKeys {
  id: string;
  endpoint: string;
}

/** What a notification says. Tapping it always opens My week. */
export interface Notice {
  title: string;
  body: string;
}

/**
 * sent: the push service took it. gone: the subscription has expired or
 * was cancelled, so its record should be deleted. failed: anything else;
 * try again later.
 */
export type Outcome = 'sent' | 'gone' | 'failed';

export interface PushResult {
  outcome: Outcome;
  /** The push service's HTTP status, or 0 when there was no answer. */
  status: number;
}

// The browser makers' push services. Subscriptions anywhere else are
// refused, so nobody can use the Worker to send requests to other sites.
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
];
const PUSH_HOST_SUFFIXES = ['.notify.windows.com'];

/** A notification that arrives more than 12 hours late is dropped. */
export const TTL_SECONDS = 12 * 60 * 60;

const WAIT_MS = 10_000;

/** Whether an endpoint is an https address at a known push service. */
export function isPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    return (
      url.protocol === 'https:' &&
      url.port === '' &&
      (PUSH_HOSTS.includes(url.hostname) ||
        PUSH_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix)))
    );
  } catch {
    return false;
  }
}

/**
 * Signs pushes for one run: one token per push service, made the first
 * time the run sends to it and reused for the rest of the run.
 */
export function authorizer(vapid: Vapid, now: Date): (endpoint: string) => Promise<string> {
  const tokens = new Map<string, Promise<string>>();
  return (endpoint) => {
    const origin = new URL(endpoint).origin;
    let token = tokens.get(origin);
    if (!token) {
      token = vapidAuthorization(vapid, origin, now);
      tokens.set(origin, token);
    }
    return token;
  };
}

export async function sendPush(
  subscription: StoredSubscription,
  notice: Notice,
  authorize: (endpoint: string) => Promise<string>,
): Promise<PushResult> {
  let body: Uint8Array;
  try {
    body = await encryptMessage(utf8(JSON.stringify(notice)), subscription);
  } catch {
    // The keys were checked when the subscription was saved, so this
    // shouldn't happen. Keep the record rather than lose a phone to a bug.
    return { outcome: 'failed', status: 0 };
  }
  try {
    const response = await fetch(subscription.endpoint, {
      method: 'POST',
      headers: {
        Authorization: await authorize(subscription.endpoint),
        TTL: String(TTL_SECONDS),
        Urgency: 'normal',
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
      },
      body,
      signal: AbortSignal.timeout(WAIT_MS),
    });
    // Nothing in the answer is needed; don't keep the connection waiting.
    await response.body?.cancel();
    if (response.ok) return { outcome: 'sent', status: response.status };
    const gone = response.status === 404 || response.status === 410;
    return { outcome: gone ? 'gone' : 'failed', status: response.status };
  } catch {
    return { outcome: 'failed', status: 0 };
  }
}

/** The push service's host, the one detail about a subscription that is safe to log. */
export function pushHost(endpoint: string): string {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return 'unknown';
  }
}
