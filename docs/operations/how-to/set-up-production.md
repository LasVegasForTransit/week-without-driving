# Set up lvwwd.org's production

This guide gets lvwwd.org's production complete: the participant database, the photo bucket, the bot
check on the sign-up forms, the email that sends "Open my week" links, the volunteer admin views,
and the credentials the deploy workflow uses. Everything production needs is listed in
[`apps/site/platform.json`](../../../apps/site/platform.json). One command checks it and another
sets up what is missing, so you do not need to remember any of it.

## Before you start

- `pnpm bootstrap` passes on your machine, which means the GitHub CLI and Wrangler are signed in. If
  Wrangler is not, run `pnpm exec wrangler login` and sign in with your LVBT account.
- Your Cloudflare user can administer the LVBT account (Las Vegas for Better Transit), including
  Zero Trust.
- Your GitHub user is an admin of `LasVegasForTransit/week-without-driving`.
- You can sign in to the LVBT Resend account.
- For the first volunteer sign-in setup only, a Google Workspace admin for lasvegasfortransit.org is
  at hand.

## 1. See what is missing

```bash
pnpm preflight --production
```

After the usual machine checks, this prints one line per item and changes nothing. `ok` means
production has it. `FAIL` means production needs it now; the `next:` line under it says what fixes
it. `WARN` marks something recommended, or something production is allowed to carry for now, such as
`BOT_CHECK`. The last line says whether lvwwd.org is ready.

## 2. Set up what is missing

```bash
pnpm bootstrap --production
```

It prints the same report, lists what it is about to do, and asks once before starting. For
lvwwd.org, it works through these, skipping anything already in place:

| Item                       | What happens                                                                                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Database `lvwwd`           | Created if missing; every migration in `apps/site/migrations` applied (Wrangler asks to confirm).                                                                                       |
| Bucket `lvwwd-photos`      | Created if missing. It holds the screenshots of shared posts.                                                                                                                           |
| Turnstile widget           | Created for lvwwd.org; its secret is stored as `TURNSTILE_SECRET`, and its site key is printed.                                                                                         |
| Volunteer sign-in (Access) | The application for `lvwwd.org/admin`, `/admin/*`, and `/api/admin/*`, allowing only the Google Group `wwd-admin@lasvegasfortransit.org`; `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` stored. |
| Email                      | Steps to verify lvwwd.org in Resend, then it asks for `RESEND_API_KEY`.                                                                                                                 |
| GitHub `production`        | `CLOUDFLARE_ACCOUNT_ID` stored; it asks for `CLOUDFLARE_API_TOKEN`, with steps to create it.                                                                                            |
| Preview-only values        | Checked; if `PREVIEW_ADMIN_KEY` or another preview value is on production, it offers to delete it.                                                                                      |

Turnstile and Access need a Cloudflare API token that Wrangler's sign-in cannot provide. The command
prints a link that opens Cloudflare's token page with the right permissions already chosen. Create
the token with an end date of tomorrow and paste it; it stays in memory and is never saved.

Turning on Zero Trust and connecting Google Workspace have no API. When they are missing, the
command prints numbered steps, offers to open the page, and waits for you. Run
`pnpm bootstrap --production` again afterwards; it picks up where it stopped.

## 3. Commit the site key and turn the bot check on

The command never edits `apps/site/wrangler.jsonc`, because a config change should be reviewed.
After the Turnstile widget exists, it prints its public site key. On a branch, in
`apps/site/wrangler.jsonc`, add it to `vars` as `"TURNSTILE_SITE_KEY": "<the site key>"`, remove
`"BOT_CHECK": "off"`, and open a pull request. The deploy from `main` turns the bot check on.

## 4. Let volunteers into the admin views

The admin views, where volunteers review entries and run the prize draw, are at
<https://lvwwd.org/admin>. Cloudflare Access sends each visitor to a Google sign-in and lets in only
members of the Google Group `wwd-admin@lasvegasfortransit.org`. The Worker then checks the signed
token Access adds, using `ACCESS_TEAM_DOMAIN` and `ACCESS_AUD`; without those two secrets it refuses
every admin request with "Volunteers only".

To give a volunteer access, a Google Workspace admin adds the volunteer's @lasvegasfortransit.org
account to the group at <https://admin.google.com/ac/groups>. Only accounts in the
lasvegasfortransit.org Workspace can sign in, so a personal Gmail address does not work even in the
group. Removing someone from the group takes effect at their next sign-in, within 24 hours.

## 5. Confirm lvwwd.org is ready

```bash
pnpm preflight --production
```

The last line should read `Ready for production.` Then delete the Cloudflare token from step 2 at
<https://dash.cloudflare.com/profile/api-tokens>, if it has not expired.

The standard's guide,
[Set up a repository's production platform](https://github.com/LasVegasForTransit/repository-tooling/blob/main/docs/how-to/set-up-production.md),
explains every message the commands print and what to do when one goes wrong.
