import type { ApiContext, Participant } from '../env';
import { json, problem } from '../http';
import { todayNumber } from '../time';
import { randomHex } from '../tokens';

/**
 * POST /api/photo: an optional photo of the day. It never adds an entry.
 * Photos are stored in R2 under photos/<participant>/ so the cleanup on
 * November 30 can delete them all by prefix.
 */

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
// Enough for anyone's week, and a cap on what one account can store.
const MAX_PHOTOS = 24;

export const PHOTO_REPLIES = {
  comingSoon: 'Photos are coming soon.',
  noPhoto: 'Choose a photo first.',
  tooBig: 'That photo is over 10 MB. Try a screenshot instead.',
  wrongType: 'Use a JPEG, PNG, HEIC or WebP photo.',
  tooMany: 'You’ve added as many photos as we can keep. Thank you!',
} as const;

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1']);

/**
 * The photo's real type, from its first bytes rather than its name, so
 * only images are ever stored.
 */
export function sniffImage(head: Uint8Array): { type: string; ext: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...head.subarray(from, to));
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
    return { type: 'image/jpeg', ext: 'jpg' };
  }
  if (ascii(0, 8) === '\x89PNG\r\n\x1a\n') return { type: 'image/png', ext: 'png' };
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return { type: 'image/webp', ext: 'webp' };
  if (ascii(4, 8) === 'ftyp' && HEIF_BRANDS.has(ascii(8, 12))) {
    const heic = ascii(8, 12).startsWith('he');
    return heic ? { type: 'image/heic', ext: 'heic' } : { type: 'image/heif', ext: 'heif' };
  }
  return null;
}

export async function addPhoto(c: ApiContext, me: Participant): Promise<Response> {
  const photos = c.env.PHOTOS;
  if (!photos) return problem(503, PHOTO_REPLIES.comingSoon);
  // Refuse an oversized upload before reading it; the form adds a little on top of the file.
  if (Number(c.request.headers.get('Content-Length') ?? '0') > MAX_PHOTO_BYTES + 64 * 1024) {
    return problem(413, PHOTO_REPLIES.tooBig);
  }
  const form = await c.request.formData();
  const file = form.get('photo');
  if (!(file instanceof File) || file.size === 0) return problem(400, PHOTO_REPLIES.noPhoto);
  if (file.size > MAX_PHOTO_BYTES) return problem(413, PHOTO_REPLIES.tooBig);
  const image = sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!image) return problem(415, PHOTO_REPLIES.wrongType);

  const count = await c.env.DB.prepare('SELECT count(*) AS n FROM photos WHERE participant_id = ?1')
    .bind(me.id)
    .first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_PHOTOS) return problem(409, PHOTO_REPLIES.tooMany);

  const day = todayNumber(c.env.CHECKIN_PREVIEW_DAY, c.now);
  const share = form.get('share') === '1';
  const key = `photos/${me.id}/${day}-${randomHex(8)}.${image.ext}`;
  await photos.put(key, file, { httpMetadata: { contentType: image.type } });
  await c.env.DB.prepare(
    `INSERT INTO photos (id, participant_id, day, object_key, content_type, size, share, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  )
    .bind(
      crypto.randomUUID(),
      me.id,
      day,
      key,
      image.type,
      file.size,
      share ? 1 : 0,
      c.now.toISOString(),
    )
    .run();
  return json({ day, share }, 201);
}
