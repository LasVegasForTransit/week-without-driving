export const APEX = 'lvwwd.org';

/**
 * Old addresses of the campaign, answered with one permanent redirect
 * before any page or file is looked up:
 *
 * - www.lvwwd.org, on any path, goes to the same path and query on the apex.
 *   Workers serve a custom domain as-is, so this has to live here.
 * - /wwd and /wwd/, the campaign's old address, go to Home.
 * - A page address that ends in a slash goes to the same address without
 *   it, which is the address in the page's canonical link. The API and the
 *   volunteer admin views answer their own addresses as they are.
 *
 * Each request gets at most one redirect, straight to where it ends up:
 * www.lvwwd.org/wwd/ goes to lvwwd.org/ in one step. Old section links of
 * the one-page site, such as /#giveaway, never reach the Worker (browsers
 * don't send the part after #); public/scripts/old-links.js on Home
 * handles those.
 */
export function redirectFor(request: Request): Response | undefined {
  const url = new URL(request.url);
  const www = url.hostname.toLowerCase() === `www.${APEX}`;
  const path = legacyPath(request.method, url.pathname);
  if (!www && path === url.pathname) return undefined;
  const origin = www ? `https://${APEX}` : url.origin;
  return Response.redirect(`${origin}${path}${url.search}`, 301);
}

/** Where an old path now lives, or the path itself when nothing moved. */
function legacyPath(method: string, path: string): string {
  if (/^\/wwd\/?$/i.test(path)) return '/';
  const readable = method === 'GET' || method === 'HEAD';
  const own = path.startsWith('/api/') || path.startsWith('/admin/');
  if (!readable || own || path === '/' || !path.endsWith('/')) return path;
  return path.replace(/\/+$/, '') || '/';
}
