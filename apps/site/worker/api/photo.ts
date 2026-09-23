import type { ApiContext, Participant } from '../env';
import { problem } from '../http';
import { randomHex } from '../tokens';

/**
 * Screenshots of shared posts, for people whose account is private. They
 * are stored in R2 under photos/<participant>/ so the cleanup on November
 * 30 can delete them all by prefix.
 */

export const MAX_SCREENSHOT_BYTES = 10 * 1024 * 1024;

export const SCREENSHOT_REPLIES = {
  comingSoon: 'Screenshots are coming soon. Paste the link to your post instead.',
  tooBig: 'That screenshot is over 10 MB. Try a smaller one.',
  wrongType: 'Use a JPEG, PNG, HEIC or WebP screenshot.',
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

/**
 * Checks and stores one screenshot, returning its key, or the problem to
 * send back when there is no bucket or the file isn't an image.
 */
export async function storeScreenshot(
  c: ApiContext,
  me: Participant,
  day: number,
  file: File,
): Promise<string | Response> {
  const bucket = c.env.PHOTOS;
  if (!bucket) return problem(503, SCREENSHOT_REPLIES.comingSoon);
  if (file.size > MAX_SCREENSHOT_BYTES) return problem(413, SCREENSHOT_REPLIES.tooBig);
  const image = sniffImage(new Uint8Array(await file.slice(0, 16).arrayBuffer()));
  if (!image) return problem(415, SCREENSHOT_REPLIES.wrongType);
  const key = `photos/${me.id}/${day}-${randomHex(8)}.${image.ext}`;
  await bucket.put(key, file, { httpMetadata: { contentType: image.type } });
  return key;
}
