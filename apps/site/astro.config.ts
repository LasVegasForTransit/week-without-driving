import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { defineConfig } from 'astro/config';

export default defineConfig({
  // The canonical URL. The sitemap and absolute links are built from it.
  site: 'https://lvwwd.org',
  output: 'static',
  // Iconify-backed icons, tree-shaken to the names the page references.
  integrations: [sitemap(), icon()],
  vite: {
    plugins: [tailwindcss()],
  },
});
