import { SESSION_COOKIE, readCookie } from './cookies';
import type { AgeGroup, ContactType, Participant } from './env';
import { SIGNED_IN_UNTIL } from './time';
import { TOKEN_PATTERN, newToken, sha256 } from './tokens';

/**
 * Sessions: the database row behind the HttpOnly cookie. There are no
 * passwords; a phone is signed in by signing up on it or by opening an
 * "Open my week" link, and stays signed in until the data is deleted.
 */

interface ParticipantRow {
  id: string;
  first_name: string;
  contact: string;
  contact_type: ContactType;
  zip: string;
  instagram: string | null;
  age: AgeGroup;
  newsletter: number;
}

export function toParticipant(row: ParticipantRow): Participant {
  return {
    id: row.id,
    firstName: row.first_name,
    contact: row.contact,
    contactType: row.contact_type,
    zip: row.zip,
    instagram: row.instagram,
    age: row.age,
    newsletter: row.newsletter === 1,
  };
}

/**
 * A new session for someone: the token for their cookie, and the insert to
 * run (on its own or in a batch with the sign-up).
 */
export async function newSession(
  db: D1Database,
  participantId: string,
  now: Date,
): Promise<{ token: string; insert: D1PreparedStatement }> {
  const token = newToken();
  const insert = db
    .prepare(
      `INSERT INTO sessions (token_hash, participant_id, created_at, expires_at)
       VALUES (?1, ?2, ?3, ?4)`,
    )
    .bind(await sha256(token), participantId, now.toISOString(), SIGNED_IN_UNTIL.toISOString());
  return { token, insert };
}

/** The session token's hash from the request's cookie, or null. */
export async function sessionHash(request: Request): Promise<string | null> {
  const token = readCookie(request, SESSION_COOKIE);
  return token && TOKEN_PATTERN.test(token) ? sha256(token) : null;
}

/** Who is signed in on this phone, in one query, or null. */
export async function signedInParticipant(
  db: D1Database,
  request: Request,
  now: Date,
): Promise<Participant | null> {
  const hash = await sessionHash(request);
  if (!hash) return null;
  const row = await db
    .prepare(
      `SELECT p.id, p.first_name, p.contact, p.contact_type, p.zip, p.instagram, p.age, p.newsletter
       FROM sessions s JOIN participants p ON p.id = s.participant_id
       WHERE s.token_hash = ?1 AND s.expires_at > ?2`,
    )
    .bind(hash, now.toISOString())
    .first<ParticipantRow>();
  return row ? toParticipant(row) : null;
}
