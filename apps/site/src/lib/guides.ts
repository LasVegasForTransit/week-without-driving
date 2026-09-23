import { getCollection, type CollectionEntry } from 'astro:content';

export type Guide = CollectionEntry<'guides'>;

// The five guide pages, in the fixed order from the Guides index (each
// entry's own `order` field, set in its Markdown frontmatter, is the
// source of truth). Sorting here means adding a guide is a new file, not a
// list to update in two places.
export async function getSortedGuides(): Promise<Guide[]> {
  const guides = await getCollection('guides');
  return guides.sort((a, b) => a.data.order - b.data.order);
}

// The guide that follows `currentId` in that fixed order, wrapping from
// the last guide back to the first (Do a sidewalk audit -> Pay your bus
// fare).
export function getNextGuide(guides: Guide[], currentId: string): Guide {
  const index = guides.findIndex((guide) => guide.id === currentId);
  const next = guides[(index + 1) % guides.length];
  if (!next) {
    throw new Error(`No guide follows "${currentId}"; is the guides collection empty?`);
  }
  return next;
}

export interface TextSegment {
  text: string;
  href?: string;
}

const INLINE_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

// A minimal "[label](url)" parser for the one or two guide sentences that
// need an inline link (the sidewalk audit guide's email and Instagram
// mentions). Every guide's body text comes from our own Markdown files
// under src/content/guides, never from a visitor, so this is safe without
// `set:html`: it only ever turns our own trusted text into real anchor
// elements, word by word, with no HTML parsing involved.
export function parseInlineLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(INLINE_LINK_PATTERN)) {
    const [full, label, href] = match;
    if (label === undefined || href === undefined) continue;
    const index = match.index;
    if (index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, index) });
    }
    segments.push({ text: label, href });
    lastIndex = index + full.length;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex) });
  }
  return segments;
}
