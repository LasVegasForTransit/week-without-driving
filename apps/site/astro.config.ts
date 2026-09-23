import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { defineConfig } from 'astro/config';

import { minifyScripts } from './src/integrations/minify-scripts';
import { serviceWorker } from './src/integrations/service-worker';

export default defineConfig({
  // The canonical URL. The sitemap and absolute links are built from it.
  site: 'https://lvwwd.org',
  output: 'static',
  // Iconify-backed icons, tree-shaken to the names the page references.
  // After the build, minifyScripts() shrinks dist/scripts, then
  // serviceWorker() writes the offline precache list into dist/sw.js
  // (in that order, so the list fingerprints the files phones download).
  integrations: [sitemap(), icon(), minifyScripts(), serviceWorker()],
  vite: {
    plugins: [tailwindcss()],
  },
});
