import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import { defineConfig } from 'astro/config';

import { minifyScripts } from './src/integrations/minify-scripts';
import { reminderCheck } from './src/integrations/reminder-check';
import { serviceWorker } from './src/integrations/service-worker';

export default defineConfig({
  // The canonical URL. The sitemap and absolute links are built from it.
  site: 'https://lvwwd.org',
  // Page addresses have no trailing slash (/guides, not /guides/), matching
  // the site's links and the Worker's html_handling in wrangler.jsonc.
  trailingSlash: 'never',
  output: 'static',
  // reminderCheck() stops the build when a daily reminder in
  // src/data/reminders.json breaks one of its rules. Iconify-backed icons
  // are tree-shaken to the names the page references. After the build,
  // minifyScripts() shrinks dist/scripts, then serviceWorker() writes the
  // offline precache list into dist/sw.js (in that order, so the list
  // fingerprints the files phones download).
  //
  // Analytics are not wired yet. @lasvegasfortransit/analytics 0.1.0 is
  // published, but its event list has no lvwwd.org events, and lvwwd.org
  // has no Cloudflare Web Analytics token. Once both exist: add
  // `lvbtAnalytics({ site: 'lvwwd.org', exclude: ['^/admin'] })` from
  // '@lasvegasfortransit/analytics/astro' to this list, set
  // PUBLIC_LVBT_CWA_TOKEN for production builds only, and add the
  // analytics origins to the Content-Security-Policy in public/_headers.
  //
  // The sitemap leaves out the pages that ask search engines not to list
  // them (BaseLayout's `noindex`): My week, Get my link and the offline page.
  integrations: [
    reminderCheck(),
    sitemap({ filter: (page) => !/\/(?:my-week|offline)(?:\/|$)/.test(new URL(page).pathname) }),
    icon(),
    minifyScripts(),
    serviceWorker(),
  ],
  vite: {
    plugins: [tailwindcss()],
  },
});
