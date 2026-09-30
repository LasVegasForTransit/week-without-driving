import { defineConfig } from '@playwright/test';

import { foregroundServerEnvironment, sharedConfig } from '@lasvegasfortransit/playwright-config';

const port = Number(process.env.LVWWD_E2E_PORT ?? '4322');
const url = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...sharedConfig,
  use: { ...sharedConfig.use, baseURL: url },
  webServer: {
    command: `pnpm exec astro preview --outDir dist-e2e --host 127.0.0.1 --port ${port} --allowed-hosts lvwwd.org`,
    env: foregroundServerEnvironment,
    url,
    reuseExistingServer: false,
  },
});
