/**
 * The bingo card picture: a 1080 by 1920 PNG of the player's card, the size
 * of a phone story, with its written description for screen readers.
 *
 * window.lvwwdBingoPicture.make(marks, squares) returns a picture
 * definition for the share screen (/scripts/share-screen.js):
 * { heading, fileName, width, height, choices, note, draw(canvas), describe() }.
 * `marks` is the card's 25 true or false values in card order (row 1 left
 * to right, then row 2, and so on; index 12 is the free square), and
 * `squares` is the card's 25 squares, each { label, free }.
 *
 * Everything happens on the phone: nothing is fetched or stored, and the
 * picture never shows a name or any other personal detail.
 */
(() => {
  const WIDTH = 1080;
  const HEIGHT = 1920;
  const FREE = 12;
  const COLORS = {
    background: '#0F1115',
    paper: '#F7F4EC',
    ember: '#FF8A5C',
    marked: '#B8360F',
    tile: '#FFFFFF',
    ink: '#0F1115',
  };
  // Every text on the picture and the color behind it, for the contrast check.
  const TEXT_PAIRS = [
    ['heading, campaign line and hashtag', COLORS.paper, COLORS.background],
    ['count line', COLORS.ember, COLORS.background],
    ['unmarked square', COLORS.ink, COLORS.tile],
    ['marked square', COLORS.tile, COLORS.marked],
    ['free square', COLORS.ink, COLORS.ember],
  ];
  const HEADING_FONT = 'Fraunces, Georgia, serif';
  const BODY_FONT = '"Atkinson Hyperlegible Next", system-ui, sans-serif';

  const GRID = { top: 480, left: 60, tile: 188, gap: 5 };
  const LABEL = { top: 56, bottom: 10, side: 12, size: 28, min: 20, lines: 4, leading: 1.15 };
  // The free square's words sit under its star.
  const FREE_LABEL_TOP = 76;

  const LINE_NAMES = [
    'row 1',
    'row 2',
    'row 3',
    'row 4',
    'row 5',
    'column 1',
    'column 2',
    'column 3',
    'column 4',
    'column 5',
    'the diagonal from top left',
    'the diagonal from top right',
  ];
  const LINES = [];
  for (let r = 0; r < 5; r++) LINES.push([0, 1, 2, 3, 4].map((c) => r * 5 + c));
  for (let c = 0; c < 5; c++) LINES.push([0, 1, 2, 3, 4].map((r) => r * 5 + c));
  LINES.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);

  /** The marks with the free square always marked. */
  function normalize(marks) {
    return Array.from({ length: 25 }, (_, i) => i === FREE || Boolean(marks[i]));
  }

  function tally(marks) {
    const card = normalize(marks);
    const marked = card.filter((on, i) => on && i !== FREE).length;
    const lines = LINES.map((line, i) => (line.every((s) => card[s]) ? i : -1)).filter(
      (i) => i >= 0,
    );
    return { card, marked, lines };
  }

  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

  function countLine(marks) {
    const { marked, lines } = tally(marks);
    if (marked === 0) return 'Ready to play';
    if (marked === 24) return 'All 24 squares · 12 bingos';
    const squares = plural(marked, 'square');
    return lines.length === 0 ? squares : `${squares} · ${plural(lines.length, 'bingo')}`;
  }

  function joinWithAnd(items) {
    if (items.length < 2) return items.join('');
    return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
  }

  function describe(marks, squares) {
    const { card, marked, lines } = tally(marks);
    const parts = [
      'Graphic: my Digital Transit Bingo card for Week Without Driving Las Vegas, October 1 to 8, 2026.',
    ];
    if (marked === 0) {
      parts.push('No squares marked yet; the middle square is free.');
    } else if (marked === 24) {
      parts.push('All 24 squares marked and 12 bingos.');
    } else {
      const squaresMarked = `${plural(marked, 'square')} marked`;
      parts.push(
        lines.length === 0
          ? `${squaresMarked}, no bingo yet.`
          : `${squaresMarked} and ${plural(lines.length, 'bingo')}.`,
      );
      const labels = squares
        .map((square, i) => (card[i] && i !== FREE ? square.label : null))
        .filter(Boolean);
      parts.push(`Marked: ${labels.join(', ')}.`);
      if (lines.length > 0)
        parts.push(`Bingo lines: ${joinWithAnd(lines.map((i) => LINE_NAMES[i]))}.`);
    }
    parts.push('lvwwd.org. #WeekWithoutDriving');
    return parts.join(' ');
  }

  function wrap(measure, text, maxWidth) {
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && measure(next) > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  /**
   * The largest size, from 28 down to 20 pixels, at which a label wraps
   * between words onto at most four lines inside its tile. `measure(text,
   * size)` returns the text's width in pixels at that size; `top` is where
   * the first line starts, in pixels from the top of the tile.
   */
  function fitLabel(measure, text, top = LABEL.top) {
    const maxWidth = GRID.tile - LABEL.side * 2;
    const maxHeight = GRID.tile - top - LABEL.bottom;
    let size = LABEL.size;
    for (; size >= LABEL.min; size -= 2) {
      const width = (t) => measure(t, size);
      const lines = wrap(width, text, maxWidth);
      const fits =
        lines.length <= LABEL.lines &&
        lines.every((line) => width(line) <= maxWidth) &&
        lines.length * size * LABEL.leading <= maxHeight;
      if (fits) return { size, lines, lineHeight: size * LABEL.leading };
    }
    size = LABEL.min;
    return {
      size,
      lines: wrap((t) => measure(t, size), text, maxWidth),
      lineHeight: size * LABEL.leading,
    };
  }

  function tileBox(i) {
    const step = GRID.tile + GRID.gap;
    return {
      x: GRID.left + (i % 5) * step,
      y: GRID.top + Math.floor(i / 5) * step,
      size: GRID.tile,
    };
  }

  function check(c, box) {
    const s = 48;
    const x = box.x + box.size - 12 - s;
    const y = box.y + 12;
    c.strokeStyle = COLORS.tile;
    c.lineWidth = 9;
    c.lineCap = 'round';
    c.lineJoin = 'round';
    // Drawn in the upper part of its 48-pixel box, clear of the label below.
    c.beginPath();
    c.moveTo(x + s * 0.1, y + s * 0.42);
    c.lineTo(x + s * 0.38, y + s * 0.7);
    c.lineTo(x + s * 0.92, y + s * 0.08);
    c.stroke();
  }

  function star(c, cx, cy, outer) {
    const inner = outer * 0.45;
    c.fillStyle = COLORS.ink;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const radius = i % 2 === 0 ? outer : inner;
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
    }
    c.closePath();
    c.fill();
  }

  /** Draws a label centered in its tile: { text, color, weight, top }. */
  function drawLabel(c, box, label) {
    const { text, color, weight, top } = label;
    const fit = fitLabel(
      (t, size) => {
        c.font = `${weight} ${size}px ${BODY_FONT}`;
        return c.measureText(t).width;
      },
      text,
      top,
    );
    c.font = `${weight} ${fit.size}px ${BODY_FONT}`;
    c.fillStyle = color;
    fit.lines.forEach((line, n) => {
      c.fillText(line, box.x + box.size / 2, box.y + top + n * fit.lineHeight);
    });
  }

  /** Draws one tile: `tile` is { index, label, marked, inLine }. */
  function drawTile(c, tile) {
    const box = tileBox(tile.index);
    if (tile.index === FREE) {
      c.fillStyle = COLORS.ember;
      c.fillRect(box.x, box.y, box.size, box.size);
      star(c, box.x + box.size / 2, box.y + 40, 28);
      drawLabel(c, box, { text: tile.label, color: COLORS.ink, weight: 700, top: FREE_LABEL_TOP });
    } else if (tile.marked) {
      c.fillStyle = COLORS.marked;
      c.fillRect(box.x, box.y, box.size, box.size);
      drawLabel(c, box, { text: tile.label, color: COLORS.tile, weight: 400, top: LABEL.top });
      check(c, box);
    } else {
      c.fillStyle = COLORS.tile;
      c.fillRect(box.x, box.y, box.size, box.size);
      c.strokeStyle = COLORS.ink;
      c.lineWidth = 2;
      c.strokeRect(box.x + 1, box.y + 1, box.size - 2, box.size - 2);
      drawLabel(c, box, { text: tile.label, color: COLORS.ink, weight: 400, top: LABEL.top });
    }
    if (tile.inLine) {
      c.strokeStyle = COLORS.ember;
      c.lineWidth = 8;
      c.strokeRect(box.x + 4, box.y + 4, box.size - 8, box.size - 8);
    }
  }

  function draw(canvas, marks, squares) {
    const c = canvas.getContext('2d');
    if (!c) return;
    const { card, lines } = tally(marks);
    const inLine = new Set(lines.flatMap((i) => LINES[i]));

    c.fillStyle = COLORS.background;
    c.fillRect(0, 0, WIDTH, HEIGHT);
    c.textAlign = 'center';
    c.textBaseline = 'top';

    c.fillStyle = COLORS.paper;
    c.font = `600 80px ${HEADING_FONT}`;
    c.fillText('Digital Transit Bingo', WIDTH / 2, 280);
    c.fillStyle = COLORS.ember;
    c.font = `400 56px ${BODY_FONT}`;
    c.fillText(countLine(marks), WIDTH / 2, 390);

    squares.forEach((square, index) =>
      drawTile(c, { index, label: square.label, marked: card[index], inLine: inLine.has(index) }),
    );

    c.fillStyle = COLORS.paper;
    c.font = `400 44px ${BODY_FONT}`;
    c.fillText('Week Without Driving Las Vegas ·', WIDTH / 2, 1480);
    c.fillText('October 1 to 8, 2026 · lvwwd.org', WIDTH / 2, 1536);
    c.font = `700 44px ${BODY_FONT}`;
    c.fillText('#WeekWithoutDriving', WIDTH / 2, 1600);
  }

  function make(marks, squares) {
    const card = normalize(marks);
    return {
      heading: 'Share your card',
      fileName: 'lvwwd-bingo.png',
      width: WIDTH,
      height: HEIGHT,
      choices: null,
      note: "A bingo card doesn't count as a trip. To enter, share a trip on My week.",
      fonts: [`600 80px ${HEADING_FONT}`, `400 28px ${BODY_FONT}`, `700 28px ${BODY_FONT}`],
      draw: (canvas) => draw(canvas, card, squares),
      describe: () => describe(card, squares),
    };
  }

  window.lvwwdBingoPicture = {
    make,
    countLine,
    describe,
    fitLabel,
    tileBox,
    COLORS,
    TEXT_PAIRS,
    FREE_LABEL_TOP,
  };
})();
