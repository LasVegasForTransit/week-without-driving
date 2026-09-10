export const APEX = 'lvwwd.org';

// Workers serve a custom domain as-is, so the www redirect has to live here.
export function redirectFor(request: Request): Response | undefined {
  const url = new URL(request.url);
  if (url.hostname.toLowerCase() !== `www.${APEX}`) return undefined;
  return Response.redirect(`https://${APEX}${url.pathname}${url.search}`, 301);
}
