# Week Without Driving Las Vegas

The site at [lvwwd.org](https://lvwwd.org): the Las Vegas edition of the national
[Week Without Driving](https://weekwithoutdriving.org/) challenge, run by
[Las Vegans for Better Transit](https://lasvegasfortransit.org). It is one page under `apps/site`,
built with Astro and deployed to Cloudflare Workers as static assets, in a Turborepo workspace that
follows the LVBT repository standard.

## Getting started

```bash
pnpm bootstrap   # install, wire git hooks, run preflight
pnpm check       # the same check CI runs
pnpm dev         # the site at http://127.0.0.1:4321
```

## Where things are

- `apps/site/src/pages/index.astro` is the page; `apps/site/src/lib/wwd.ts` holds the dates,
  hashtag, giveaway rules, partner roster, and resource links, so the yearly update is a few values
  there rather than a copy-edit of the page
- `apps/site/src/layouts/BaseLayout.astro` carries the campaign bar, the LVBT credit footer, and the
  meta tags
- `apps/site/worker/index.ts` is the Worker in front of the assets; it only sends `www.lvwwd.org` to
  the apex
- `apps/site/wrangler.jsonc` names the Worker and its two custom domains

`pnpm run deploy` builds and runs `wrangler deploy`; `.github/workflows/deploy.yml` does the same on
every push to `main` with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

Lint, format, TypeScript, and test settings extend the `@lvbt/*` packages from
[`LasVegasForTransit/repository-tooling`](https://github.com/LasVegasForTransit/repository-tooling).
