/** SMS keeps the private token in a fragment until the same-origin sign-in request. */
const token = window.location.hash.slice(1);
const path = /^[A-Za-z0-9_-]{22}$/.test(token)
  ? `/my-week?t=${encodeURIComponent(token)}`
  : '/my-week/link?expired=1';
window.location.replace(path);
