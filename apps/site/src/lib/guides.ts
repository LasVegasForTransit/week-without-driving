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
