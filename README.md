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
- `apps/site/worker/` is the Worker in front of the assets. It sends `www.lvwwd.org` to the apex and
  runs the participant API behind "Sign up to win" and "My week" under `/api/`; its D1 database
  schema is in `apps/site/migrations/`
- `apps/site/wrangler.jsonc` names the Worker, its two custom domains, its daily cleanup, which
  deletes all participant data from November 30, 2026, and the morning send of the daily reminders
- `apps/site/src/data/reminders.json` holds the eight daily reminder messages. Every build checks
  them, and the Worker sends each morning's by browser notification (`apps/site/worker/push/`)
- `apps/site/wrangler.api-preview.jsonc` is the API preview on workers.dev. It has its own database,
  shows each "Open my week" link on the page, treats every day as Day 3 of the week, and sends Day
  3's reminder to each browser that turns reminders on. Deploy it with
  `pnpm build && pnpm exec wrangler deploy -c wrangler.api-preview.jsonc` from `apps/site`

`pnpm run deploy` builds and runs `wrangler deploy`; `.github/workflows/deploy.yml` does the same on
every push to `main` with the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets of the
`production` environment, which `pnpm bootstrap --production` sets.

Lint, format, TypeScript, and test settings extend the `@lasvegasfortransit/*` packages from
[`LasVegasForTransit/repository-tooling`](https://github.com/LasVegasForTransit/repository-tooling).
