import { expect, it } from 'vitest';

const { checkEmail } = await import('../public/modules/keep-going.js');

it('rejects missing, malformed and oversized newsletter addresses, and accepts a trimmed address', () => {
  for (const invalid of [
    '   ',
    'name',
    'name@',
    'name@example',
    'na me@example.com',
    `${'a'.repeat(250)}@x.org`,
  ]) {
    expect(checkEmail(invalid), invalid).not.toBe('');
  }
  expect(checkEmail(' Name@Example.COM ')).toBe('');
});
