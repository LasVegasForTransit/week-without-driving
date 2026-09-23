import { expect, test, type Page } from '@playwright/test';

// The color roles hold readable contrast in both schemes, the same contract
// the main LVBT site checks: body and secondary text 4.5:1, large accent
// text and the primary button pair 3:1, outlines 3:1. Colors are resolved
// in the browser from the role variables, so this follows whatever the
// tokens are set to rather than any fixed hex value.

const SCHEMES = ['light', 'dark'] as const;

type Pair = { name: string; fg: string; bg: string; min: number };

const PAIRS: Pair[] = [
  { name: 'text on the page', fg: 'on-surface', bg: 'surface', min: 4.5 },
  { name: 'secondary text on the page', fg: 'on-surface-variant', bg: 'surface', min: 4.5 },
  { name: 'text on cards', fg: 'on-surface', bg: 'surface-container', min: 4.5 },
  { name: 'secondary text on cards', fg: 'on-surface-variant', bg: 'surface-container', min: 4.5 },
  { name: 'links on the page', fg: 'link', bg: 'surface', min: 4.5 },
  { name: 'teal text on cards', fg: 'primary-ink', bg: 'surface-container', min: 4.5 },
  { name: 'text on the slab', fg: 'on-slab', bg: 'slab', min: 4.5 },
  { name: 'secondary text on the slab', fg: 'on-slab-variant', bg: 'slab', min: 4.5 },
  { name: 'large accent text on the slab', fg: 'on-slab-accent', bg: 'slab', min: 3 },
  { name: 'text on the primary button', fg: 'on-primary', bg: 'primary', min: 3 },
  {
    name: 'text on the primary container',
    fg: 'on-primary-container',
    bg: 'primary-container',
    min: 4.5,
  },
  { name: 'icons on the soft accent', fg: 'primary-ink', bg: 'primary-soft', min: 3 },
  { name: 'text on coral', fg: 'on-primary-warm', bg: 'primary-warm', min: 4.5 },
  { name: 'text in form fields', fg: 'on-surface', bg: 'field', min: 4.5 },
  { name: 'error text in forms', fg: 'error', bg: 'surface-container', min: 4.5 },
  { name: 'outlines on the page', fg: 'outline', bg: 'surface', min: 3 },
];

async function resolve(page: Page, role: string): Promise<[number, number, number]> {
  return page.evaluate((name) => {
    const probe = document.createElement('div');
    probe.style.color = `var(--color-${name})`;
    document.body.appendChild(probe);
    // Draw the color to a canvas pixel so every color syntax (rgb, color(),
    // color-mix) comes back as plain sRGB channels.
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No 2D canvas');
    context.fillStyle = getComputedStyle(probe).color;
    context.fillRect(0, 0, 1, 1);
    probe.remove();
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b] as [number, number, number];
  }, role);
}

function luminance([r, g, b]: [number, number, number]): number {
  const [lr = 0, lg = 0, lb = 0] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

function contrast(a: [number, number, number], b: [number, number, number]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

for (const scheme of SCHEMES) {
  test.describe(`${scheme} scheme`, () => {
    test.use({ colorScheme: scheme });

    test('every color role pair is readable', async ({ page }) => {
      await page.goto('/');
      const failures: string[] = [];
      for (const pair of PAIRS) {
        const ratio = contrast(await resolve(page, pair.fg), await resolve(page, pair.bg));
        if (ratio < pair.min) {
          failures.push(`${pair.name}: ${ratio.toFixed(2)} (needs ${pair.min})`);
        }
      }
      expect(failures).toEqual([]);
    });

    test('the page background follows the scheme', async ({ page }) => {
      await page.goto('/');
      const surface = await resolve(page, 'surface');
      const isDark = luminance(surface) < 0.2;
      expect(isDark).toBe(scheme === 'dark');
    });
  });
}
