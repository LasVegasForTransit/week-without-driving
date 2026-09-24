import { crc32, deflateSync } from 'node:zlib';

import { QUIET_ZONE, type QrCode } from './qrcode';

// Writes a QR code as a black-and-white PNG when the site is built, with
// Node's own zlib, so no image library is needed. One bit per pixel keeps
// the 1024-pixel files to a few kilobytes.

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  body.set(new TextEncoder().encode(type), 0);
  body.set(data, 4);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(body, 4);
  view.setUint32(8 + data.length, crc32(body));
  return out;
}

/**
 * The code as a square PNG `pixels` wide, black modules on white, with its
 * four-module quiet zone. Each module covers a whole number of pixels, give
 * or take one, so the code stays sharp at any printed size.
 */
export function qrPng(qr: QrCode, pixels = 1024): Uint8Array<ArrayBuffer> {
  const modules = qr.size + QUIET_ZONE * 2;
  const rowBytes = Math.ceil(pixels / 8);
  const raw = new Uint8Array((rowBytes + 1) * pixels);
  const moduleAt = (p: number) => Math.floor((p * modules) / pixels) - QUIET_ZONE;
  for (let y = 0; y < pixels; y++) {
    const row = qr.matrix[moduleAt(y)];
    const start = y * (rowBytes + 1) + 1; // each row starts with filter type 0
    for (let x = 0; x < pixels; x++) {
      const dark = row?.[moduleAt(x)] === true;
      // In one-bit grayscale, 1 is white.
      if (!dark) raw[start + (x >> 3)] = (raw[start + (x >> 3)] ?? 0) | (0x80 >> (x & 7));
    }
  }
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, pixels);
  view.setUint32(4, pixels);
  header.set([1, 0, 0, 0, 0], 8); // bit depth 1, grayscale, no interlace
  const parts = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', new Uint8Array(0)),
  ];
  const file = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    file.set(part, offset);
    offset += part.length;
  }
  return file;
}
