import { describe, expect, it } from 'vitest';

import { sniffImage } from '../worker/api/photo';

describe('sniffImage', () => {
  const bytes = (...values: (number | string)[]) =>
    new Uint8Array(
      values.flatMap((value) =>
        typeof value === 'number' ? [value] : [...new TextEncoder().encode(value)],
      ),
    );

  it('knows the photo types phones take', () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))?.type).toBe('image/jpeg');
    expect(sniffImage(bytes(0x89, 'PNG\r\n', 0x1a, '\n'))?.type).toBe('image/png');
    expect(sniffImage(bytes('RIFF', 0, 0, 0, 0, 'WEBP'))?.type).toBe('image/webp');
    expect(sniffImage(bytes(0, 0, 0, 24, 'ftypheic'))?.type).toBe('image/heic');
    expect(sniffImage(bytes(0, 0, 0, 24, 'ftypmif1'))?.type).toBe('image/heif');
  });

  it('refuses anything else, whatever it is called', () => {
    expect(sniffImage(bytes('<svg xmlns='))).toBeNull();
    expect(sniffImage(bytes('GIF89a'))).toBeNull();
    expect(sniffImage(bytes(0, 0, 0, 24, 'ftypisom'))).toBeNull();
  });
});
