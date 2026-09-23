/**
 * Share a trip: draws a picture of today's car-free trip and offers it to
 * the phone's share sheet, with a caption to paste, so posting the trip
 * (which is how people enter the giveaway) takes a few taps.
 *
 * Exposes window.lvwwdShareTrip.setUp(root, trip), where root is the
 * element holding the [data-share-*] parts and trip is
 * { day, modes: ['bus' | 'walk' | 'bike' | 'ride'] }.
 */
(() => {
  const WIDTH = 1080;
  const HEIGHT = 1350;
  const COLORS = {
    slab: '#0e5f66',
    sand: '#fbf4e6',
    mist: '#cfe7e4',
    coral: '#ff6b4a',
    onCoral: '#1a1210',
  };
  const MODE_SHORT = { bus: 'Bus', walk: 'Walk', bike: 'Bike', ride: 'Ride' };
  const MODE_WORDS = {
    bus: 'by bus',
    walk: 'walking or rolling',
    bike: 'by bike or scooter',
    ride: 'with a ride',
  };

  function modesPhrase(modes) {
    const words = modes.map((mode) => MODE_WORDS[mode]).filter(Boolean);
    if (words.length <= 1) return words[0] ?? 'without driving';
    return `${words.slice(0, -1).join(', ')} and ${words.at(-1)}`;
  }

  function caption(trip) {
    return `I skipped the car today, ${modesPhrase(trip.modes)}, for #WeekWithoutDriving in Las Vegas. Try it October 1–8 and you could win a free month of bus rides: lvwwd.org @lasvegasfortransit`;
  }

  // Splits text into lines that fit maxWidth at the context's current font.
  function wrap(context, text, maxWidth) {
    const lines = [];
    let line = '';
    text.split(' ').forEach((word) => {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function pill(context, box) {
    context.beginPath();
    context.roundRect(box.x, box.y, box.w, box.h, box.h / 2);
    context.fill();
  }

  async function draw(trip) {
    await Promise.all([
      document.fonts.load('600 110px Fraunces'),
      document.fonts.load('800 44px "Atkinson Hyperlegible Next"'),
    ]).catch(() => undefined);

    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const c = canvas.getContext('2d');
    if (!c) return null;

    c.fillStyle = COLORS.slab;
    c.fillRect(0, 0, WIDTH, HEIGHT);

    const pad = 90;
    c.fillStyle = COLORS.mist;
    c.font = '800 34px "Atkinson Hyperlegible Next", sans-serif';
    c.fillText('WEEK WITHOUT DRIVING · LAS VEGAS', pad, 150);

    c.fillStyle = COLORS.coral;
    pill(c, { x: pad, y: 210, w: 330, h: 84 });
    c.fillStyle = COLORS.onCoral;
    c.font = '800 40px "Atkinson Hyperlegible Next", sans-serif';
    c.fillText(`DAY ${trip.day} OF 8`, pad + 42, 267);

    c.fillStyle = COLORS.sand;
    c.font = '600 118px Fraunces, Georgia, serif';
    const headline = wrap(c, 'I skipped the car today.', WIDTH - pad * 2);
    headline.forEach((line, i) => c.fillText(line, pad, 460 + i * 128));

    // The ways they got around, big, in coral: "Bus + Walk".
    const afterHeadline = 460 + headline.length * 128 + 150;
    c.fillStyle = COLORS.coral;
    c.font = '600 150px Fraunces, Georgia, serif';
    const short = trip.modes
      .map((mode) => MODE_SHORT[mode])
      .filter(Boolean)
      .join(' + ');
    const big = wrap(c, short || 'Car-free', WIDTH - pad * 2);
    big.forEach((line, i) => c.fillText(line, pad, afterHeadline + i * 160));

    c.fillStyle = COLORS.mist;
    c.font = '700 48px "Atkinson Hyperlegible Next", sans-serif';
    const how = wrap(c, `I got around ${modesPhrase(trip.modes)}.`, WIDTH - pad * 2);
    const howTop = afterHeadline + (big.length - 1) * 160 + 90;
    how.forEach((line, i) => c.fillText(line, pad, howTop + i * 60));

    c.fillStyle = COLORS.coral;
    c.fillRect(pad, HEIGHT - 300, 120, 10);
    c.fillStyle = COLORS.sand;
    c.font = '800 50px "Atkinson Hyperlegible Next", sans-serif';
    c.fillText('Try it Oct 1–8 · lvwwd.org', pad, HEIGHT - 205);
    c.fillStyle = COLORS.mist;
    c.font = '700 38px "Atkinson Hyperlegible Next", sans-serif';
    c.fillText('#WeekWithoutDriving  @lasvegasfortransit', pad, HEIGHT - 140);

    return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  }

  function setStatus(root, text) {
    const status = root.querySelector('[data-share-status]');
    if (status) status.textContent = text;
  }

  async function share(root, file, text) {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text });
        return;
      } catch {
        return; // The person closed the share sheet.
      }
    }
    save(root, file);
    setStatus(root, 'Picture saved. Post it from your photos, and paste the caption.');
  }

  function save(root, file) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(file);
    link.download = file.name;
    document.body.append(link);
    link.click();
    link.remove();
    setStatus(root, 'Picture saved to your downloads.');
  }

  // The picture and caption each share area currently offers, so its
  // buttons are wired once and always share the latest picture.
  const current = new WeakMap();

  function bind(root) {
    root.querySelector('[data-share-image]')?.addEventListener('click', () => {
      const { file, text } = current.get(root) ?? {};
      if (file) share(root, file, text);
    });
    root.querySelector('[data-save-image]')?.addEventListener('click', () => {
      const { file } = current.get(root) ?? {};
      if (file) save(root, file);
    });
    root.querySelector('[data-copy-caption]')?.addEventListener('click', async () => {
      const { text } = current.get(root) ?? {};
      try {
        await navigator.clipboard.writeText(text ?? '');
        setStatus(root, 'Caption copied.');
      } catch {
        setStatus(root, 'Press and hold the caption to copy it.');
      }
    });
  }

  async function setUp(root, trip) {
    const text = caption(trip);
    const captionEl = root.querySelector('[data-share-caption]');
    if (captionEl) captionEl.textContent = text;

    const blob = await draw(trip);
    if (!blob) return;
    const file = new File([blob], `week-without-driving-day-${trip.day}.png`, {
      type: 'image/png',
    });
    const preview = root.querySelector('[data-share-preview]');
    if (preview instanceof HTMLImageElement) {
      preview.src = URL.createObjectURL(blob);
      preview.alt = `A picture that says: Day ${trip.day} of 8. I skipped the car today. I got around ${modesPhrase(trip.modes)}.`;
      preview.hidden = false;
    }
    if (!current.has(root)) bind(root);
    current.set(root, { file, text });
  }

  window.lvwwdShareTrip = { setUp };
})();
