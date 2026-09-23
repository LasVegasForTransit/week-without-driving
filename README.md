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

## Running production

`apps/site/platform.json` lists everything lvwwd.org needs in production: the participant database
and its migrations, the photo bucket, the Turnstile bot check, the volunteer admin sign-in through
Cloudflare Access and the `wwd-admin@lasvegasfortransit.org` Google Group, email through Resend, and
the deploy credentials. Maintainers run:

```bash
pnpm preflight --production   # report what production is missing, without changing anything
pnpm bootstrap --production   # set up whatever is missing, asking for values as it goes
```

[Set up lvwwd.org's production](docs/operations/how-to/set-up-production.md) walks through both,
including how to let volunteers into the admin views.

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
every push to `main` with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets of the
`production` environment, which `pnpm bootstrap --production` sets.

Lint, format, TypeScript, and test settings extend the `@lasvegasfortransit/*` packages from
[`LasVegasForTransit/repository-tooling`](https://github.com/LasVegasForTransit/repository-tooling).
