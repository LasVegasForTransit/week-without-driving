export interface TextSegment {
  text: string;
  href?: string;
}

const INLINE_LINK_PATTERN = /\[([^\]]+)\]\(([^)]+)\)/g;

// A minimal "[label](url)" parser for the few sentences that need an inline
// link: the sidewalk audit guide's email and Instagram mentions, and the
// "Places to go" steps that point to a guide. The text is always the
// site's own (src/content/guides and src/lib/destinations.ts), never a
// visitor's, and this only splits it into plain text and link segments for
// the page to render as elements, with no HTML parsing involved.
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
