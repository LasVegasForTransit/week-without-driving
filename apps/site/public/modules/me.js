/**
 * The signed-in participant on this page, shared between My week
 * (my-week.js), which loads it from /api/me, and the "Keep going after the
 * week" card (keep-going.js), which waits for it. A module runs once per
 * page, so both scripts see the same value.
 */
let current = null;
const waiting = [];

/** Called by My week once /api/me has answered. */
export function setMe(me) {
  current = me;
  waiting.splice(0).forEach((callback) => callback(me));
}

/** Calls `callback` with the participant now, or as soon as My week has one. */
export function whenMe(callback) {
  if (current) callback(current);
  else waiting.push(callback);
}
