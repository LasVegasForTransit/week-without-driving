import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { defineCollection } from 'astro:content';

// The five "Guides" pages (/guides/<slug>) share one layout and one shape,
// so a copy edit is a Markdown frontmatter change, not a component change.
// Each entry's `order` is the fixed order from the Guides index and also
// drives "Next guide" (guides/index.ts wraps from the last entry to the
// first). A step's `note`/`links` render as a small callout under that
// step, used where a guide depends on an RTC fact this rewrite could not
// verify (see the comment at the top of each affected page).
const guides = defineCollection({
  loader: glob({ pattern: '*.md', base: './src/content/guides' }),
  schema: z.object({
    title: z.string(),
    order: z.number().int().positive(),
    // Icon shown on the Guides index card and as this guide's own accent.
    // Must be a valid `mdi:*` name from @iconify-json/mdi.
    icon: z.string(),
    // One line, used both as the Guides index card summary and as the
    // page's meta description.
    cardSummary: z.string(),
    intro: z.string(),
    steps: z
      .array(
        z.object({
          heading: z.string(),
          // A valid `mdi:*` name, or "shade-diagram" for the heat guide's
          // custom morning/afternoon shade illustration.
          icon: z.string(),
          body: z.array(z.string()).min(1),
          note: z.string().optional(),
          links: z
            .array(
              z.object({
                label: z.string(),
                href: z.string(),
              }),
            )
            .optional(),
        }),
      )
      .length(3),
  }),
});

export const collections = { guides };
