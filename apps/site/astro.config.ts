import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { defineConfig } from 'astro/config';

import { serviceWorker } from './src/integrations/service-worker';

export default defineConfig({
  // The canonical URL. The sitemap and absolute links are built from it.
  site: 'https://lvwwd.org',
  output: 'static',
  // Iconify-backed icons, tree-shaken to the names the page references.
  // serviceWorker() writes the offline precache list into dist/sw.js.
  integrations: [sitemap(), icon(), serviceWorker()],
  vite: {
    plugins: [tailwindcss()],
  },
});
