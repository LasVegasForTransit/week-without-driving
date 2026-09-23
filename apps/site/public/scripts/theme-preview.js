// Identity preview: ?theme=neon|desert|pop sets the site theme for this tab;
// ?theme=lvbt returns to the inherited LVBT look. Remove once a theme is chosen.
(() => {
  const allowed = ['neon', 'desert', 'pop'];
  let theme = null;
  try {
    const fromUrl = new URLSearchParams(location.search).get('theme');
    if (fromUrl === 'lvbt') sessionStorage.removeItem('lvwwd_theme');
    else if (allowed.includes(fromUrl)) sessionStorage.setItem('lvwwd_theme', fromUrl);
    theme = sessionStorage.getItem('lvwwd_theme');
  } catch {
    theme = new URLSearchParams(location.search).get('theme');
  }
  if (allowed.includes(theme)) document.documentElement.dataset.wwdTheme = theme;
})();
