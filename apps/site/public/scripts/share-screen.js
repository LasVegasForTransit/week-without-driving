/**
 * The share screen: a full-screen panel that makes a picture on the phone
 * and offers it to the phone's share sheet, with its written description.
 * The markup is src/components/ShareScreen.astro.
 *
 * window.lvwwdShareScreen.open(picture, opener) shows a picture definition:
 * { heading, fileName, width, height, note, fonts, draw(canvas), describe() }.
 * Closing it (Close, Escape, or the phone's back gesture) puts focus back
 * on `opener`. The picture is made from what is on the phone: nothing is
 * uploaded and nothing is stored.
 */
(() => {
  const dialog = document.querySelector('[data-share-screen]');
  if (!(dialog instanceof HTMLDialogElement)) return;

  const part = (name) => dialog.querySelector(`[data-share-screen-${name}]`);
  const heading = part('heading');
  const making = part('making');
  const image = part('image');
  const shareButton = part('share');
  const copyButton = part('copy');
  const saved = part('saved');
  const copied = part('copied');
  const description = part('description');
  const note = part('note');

  let opener = null;
  let current = null;
  let run = 0;

  const say = (el, text) => {
    if (el) el.textContent = text;
  };

  function waitForFonts(fonts) {
    const loads = Promise.all((fonts ?? []).map((font) => document.fonts.load(font)));
    const limit = new Promise((resolve) => window.setTimeout(resolve, 3000));
    return Promise.race([loads, limit]).catch(() => undefined);
  }

  async function make(picture) {
    await waitForFonts(picture.fonts);
    const canvas = document.createElement('canvas');
    canvas.width = picture.width;
    canvas.height = picture.height;
    picture.draw(canvas);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    return {
      file: new File([blob], picture.fileName, { type: 'image/png' }),
      url: URL.createObjectURL(blob),
      text: picture.describe(),
      fileName: picture.fileName,
    };
  }

  function save() {
    if (!current) return;
    const link = document.createElement('a');
    link.href = current.url;
    link.download = current.fileName;
    document.body.append(link);
    link.click();
    link.remove();
    say(saved, `Image saved. Look for ${current.fileName} in your downloads.`);
  }

  function canShareFile(file) {
    try {
      return Boolean(navigator.canShare?.({ files: [file] }));
    } catch {
      return false;
    }
  }

  async function share() {
    if (!current) return;
    if (!canShareFile(current.file)) {
      save();
      return;
    }
    try {
      await navigator.share({ files: [current.file] });
    } catch (error) {
      if (error?.name !== 'AbortError') save();
    }
  }

  async function copy() {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(current.text);
      say(copied, 'Description copied.');
    } catch {
      say(copied, "Couldn't copy. Press and hold the description above to select and copy it.");
    }
  }

  function close(fromHistory) {
    if (!dialog.open) return;
    run++;
    dialog.close();
    if (current) URL.revokeObjectURL(current.url);
    current = null;
    if (!fromHistory && window.history.state?.lvwwdShareScreen) window.history.back();
    opener?.focus();
  }

  async function open(picture, from) {
    opener = from ?? null;
    const thisRun = ++run;
    say(heading, picture.heading);
    say(note, picture.note ?? '');
    if (note) note.hidden = !picture.note;
    say(description, '');
    say(saved, '');
    say(copied, '');
    if (making) making.hidden = false;
    if (image) image.hidden = true;
    [shareButton, copyButton].forEach((button) => {
      if (button) button.disabled = true;
    });

    if (!dialog.open) {
      dialog.showModal();
      window.history.pushState({ lvwwdShareScreen: true }, '');
    }
    heading?.focus();

    const made = await make(picture);
    if (thisRun !== run || !made) return;
    current = made;
    if (image instanceof HTMLImageElement) {
      image.src = made.url;
      image.alt = made.text;
      image.hidden = false;
    }
    if (making) making.hidden = true;
    say(description, made.text);
    say(shareButton, canShareFile(made.file) ? 'Share image' : 'Save image');
    [shareButton, copyButton].forEach((button) => {
      if (button) button.disabled = false;
    });
  }

  part('close')?.addEventListener('click', () => close(false));
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close(false);
  });
  window.addEventListener('popstate', () => close(true));
  shareButton?.addEventListener('click', share);
  copyButton?.addEventListener('click', copy);

  window.lvwwdShareScreen = { open };
})();
