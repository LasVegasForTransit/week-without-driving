/// <reference types="@cloudflare/workers-types" />

import { redirectFor } from './redirect';

interface Env {
  ASSETS: Fetcher;
}

// Only the default export: the runtime reads every named export of the entry
// module as another entrypoint.
export default {
  async fetch(request, env): Promise<Response> {
    return redirectFor(request) ?? env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
