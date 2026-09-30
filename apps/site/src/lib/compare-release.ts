// Publish the comparison link only after a real route and its fallbacks have
// been checked on lvwwd.org with the production Google Routes key.
export const comparePublished = process.env.COMPARE_PUBLISHED === 'true';
