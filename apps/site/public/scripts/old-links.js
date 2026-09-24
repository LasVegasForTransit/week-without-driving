/**
 * Old section links of the one-page lvwwd.org, such as lvwwd.org/#giveaway,
 * open the page that section became. Browsers never send the part after #
 * to the server, so the Worker can't redirect these; this runs in the head
 * of Home, before the page shows. It replaces the address rather than
 * adding one, so Back returns to where the visitor came from. Any other
 * section link, or none, stays on Home. Without JavaScript, Home opens.
 */
(() => {
  const MOVED = {
    '#how-to-participate': '/take-part',
    '#giveaway': '/giveaway',
    '#resources': '/resources',
    '#partners': '/partners',
  };
  const to = MOVED[window.location.hash.toLowerCase()];
  if (to) window.location.replace(to + window.location.search);
})();
