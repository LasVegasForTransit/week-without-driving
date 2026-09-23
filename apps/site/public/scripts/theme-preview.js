// Identity preview: the site defaults to Desert Daylight; ?theme=neon|desert|pop
// sets another theme for this tab;
// ?theme=lvbt returns to the inherited LVBT look. Remove once a theme is chosen.
(() => {
  const allowed = ['neon', 'desert', 'pop'];
  let theme;
  try {
    const fromUrl = new URLSearchParams(location.search).get('theme');
    if (fromUrl === 'lvbt') sessionStorage.removeItem('lvwwd_theme');
    else if (allowed.includes(fromUrl)) sessionStorage.setItem('lvwwd_theme', fromUrl);
    theme = sessionStorage.getItem('lvwwd_theme');
  } catch {
    theme = new URLSearchParams(location.search).get('theme');
  }
  if (allowed.includes(theme)) document.documentElement.dataset.wwdTheme = theme;
  if (new URLSearchParams(location.search).get('theme') === 'lvbt') {
    delete document.documentElement.dataset.wwdTheme;
  }
})();
