/**
 * The partner kit on the Partners page. Picking an organization shows its
 * giveaway link, its QR code files, the banners and an embed snippet that
 * links to it, and puts #kit-<slug> in the page address so the choice can
 * be bookmarked or sent to a colleague. "None (general materials)" gives
 * LVBT's own link, which credits no one.
 *
 * From 12:00 am October 9, 2026, Las Vegas time, by the phone's clock, the
 * kit shows only its closing message. The copy buttons are run by
 * /scripts/partners.js. Nothing is fetched or stored.
 */
(() => {
  const ENDED = Date.parse('2026-10-09T07:00:00Z');
  const GENERAL = 'general';
  const SIZES = {
    '300x250': { width: 300, height: 250 },
    '728x90': { width: 728, height: 90 },
  };

  const kit = document.querySelector('[data-partner-kit]');
  if (!kit) return;
  const part = (name) => kit.querySelector(`[data-kit-${name}]`);
  const body = part('body');
  const ended = part('ended');
  if (Date.now() >= ENDED) {
    if (ended) ended.hidden = false;
    return;
  }
  if (body) body.hidden = false;

  const picker = part('picker');
  const hint = part('hint');
  const materials = part('materials');
  const link = part('link');
  const general = part('general');
  const qr = part('qr');
  const qrPng = part('qr-png');
  const qrSvg = part('qr-svg');
  const snippet = part('snippet');
  const preview = part('preview');
  const description = kit.dataset.description ?? '';
  if (!(picker instanceof HTMLSelectElement)) return;

  const slugs = new Set(Array.from(picker.options, (option) => option.value).filter(Boolean));
  const linkFor = (slug) =>
    slug === GENERAL ? 'https://lvwwd.org/giveaway' : `https://lvwwd.org/giveaway?ref=${slug}`;
  const chosenSize = () => kit.querySelector('[data-kit-size]:checked')?.value ?? '300x250';

  function snippetFor(href, size) {
    const { width, height } = SIZES[size];
    return [
      `<a href="${href}">`,
      `  <img src="https://lvwwd.org/partners/banners/${size}.png" width="${width}" height="${height}" style="max-width:100%;height:auto" alt="${description}">`,
      '</a>',
    ].join('\n');
  }

  function showSnippet(href) {
    const size = chosenSize();
    if (snippet) snippet.value = snippetFor(href, size);
    if (!preview) return;
    const { width, height } = SIZES[size];
    const anchor = document.createElement('a');
    anchor.href = href;
    const image = document.createElement('img');
    image.src = `/partners/banners/${size}.png`;
    image.width = width;
    image.height = height;
    image.alt = description;
    image.style.maxWidth = '100%';
    image.style.height = 'auto';
    anchor.append(image);
    preview.replaceChildren(anchor);
  }

  function show(slug) {
    const known = slugs.has(slug);
    if (hint) hint.hidden = known;
    if (materials) materials.hidden = !known;
    if (!known) return;
    const href = linkFor(slug);
    if (link) link.textContent = href;
    if (general) general.hidden = slug !== GENERAL;
    if (qr) {
      qr.src = `/partners/qr/${slug}.svg`;
      qr.alt = `QR code for ${href.replace('https://', '')}`;
    }
    qrPng?.setAttribute('href', `/partners/qr/${slug}.png`);
    qrSvg?.setAttribute('href', `/partners/qr/${slug}.svg`);
    showSnippet(href);
  }

  function fromAddress() {
    const slug = /^#kit-([a-z0-9-]+)$/.exec(window.location.hash)?.[1] ?? '';
    picker.value = slugs.has(slug) ? slug : '';
    show(picker.value);
  }

  picker.addEventListener('change', () => {
    const slug = picker.value;
    if (slugs.has(slug)) window.history.replaceState(null, '', `#kit-${slug}`);
    show(slug);
  });
  kit.querySelectorAll('[data-kit-size]').forEach((radio) => {
    radio.addEventListener('change', () => show(picker.value));
  });
  window.addEventListener('hashchange', fromAddress);
  fromAddress();
})();
