/**
 * What kind of phone the site is open on. Shared by the install sheet
 * (app.js), the reminders section (reminders.js) and "Where to?"
 * (where-to.js).
 */

/** An iPhone, iPod or iPad, including an iPad that reports itself as a Mac. */
function isAppleTouch() {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

export { isAppleTouch };
