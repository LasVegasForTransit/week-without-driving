# Set up lvwwd.org's production

This guide gets lvwwd.org's production complete: the participant database, the photo bucket, the bot
check on the sign-up forms, the email that sends "Open my week" links, the volunteer admin views,
and the credentials the deploy workflow uses. Everything production needs is listed in
[`apps/site/platform.json`](../../../apps/site/platform.json). One command checks it and another
sets up what is missing, so you do not need to remember any of it.

## Before you start

- `pnpm bootstrap` passes on your machine, which means the GitHub CLI and Wrangler are signed in. If
  Wrangler is not, run `pnpm exec wrangler login` and sign in with your LVBT account.
- Your Cloudflare user can administer the LVBT account (ID `2557b5c2e166292ded0f8425b73075e9`),
  including Cloudflare One, which Cloudflare used to call Zero Trust.
- Your GitHub user is an admin of `LasVegasForTransit/week-without-driving`.
- You can sign in to the LVBT Resend account.
- Only if Google Workspace is not yet connected to Cloudflare One (it is today), a Google Workspace
  super admin for lasvegasfortransit.org is at hand.

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
prints a link that opens Cloudflare's token page with the right permissions already chosen, and
[the steps below](#the-setup-token) say what to check. It asks for the token on every run, because
it cannot even check Turnstile and Access without it. The token stays in memory and is never saved.

For every value it asks for, the command says what the value is for, whether it is fine to skip, the
page to open, and numbered steps. Press Enter at any value to skip it for now; the next run asks
again. [What to enter in each dashboard](#what-to-enter-in-each-dashboard) has the same steps.

Cloudflare One is already on for the LVBT account, with the team domain `lvbt.cloudflareaccess.com`,
and Google Workspace is already its sign-in. The command confirms both and moves on. Only on a new
account does it print the first-time steps, offer to open the page, and wait for you. Run
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

To give a volunteer access, a Google Workspace admin opens <https://admin.google.com/ac/groups>,
clicks the group, then "Members", then "Add members", types the volunteer's @lasvegasfortransit.org
address, and clicks "Add To Group". Only accounts in the lasvegasfortransit.org Workspace can sign
in, so a personal Gmail address does not work even in the group. To take someone out, point to them
in the Members list and click "Remove". A removal takes effect at their next sign-in, within 24
hours.

## 5. Confirm lvwwd.org is ready

```bash
pnpm preflight --production
```

The last line should read `Ready for production.` Then delete the Cloudflare token from step 2 at
<https://dash.cloudflare.com/profile/api-tokens>, if it has not expired.

## Running it again

`pnpm bootstrap --production` is safe to run at any time. Each step checks before it acts: the
database, bucket, widget, and Access application are found by name and never created twice, a secret
that is already set is never asked for or replaced, applied migrations are skipped, and
`apps/site/wrangler.jsonc` is never edited. On a finished setup it changes nothing and says so.

To replace a secret on purpose, for example after a leak, name it:
`pnpm bootstrap --production --rotate RESEND_API_KEY`. The command asks before it replaces anything.
(`--rotate` arrives with repository tooling 0.4.2; until this repository updates, replace a value
with `pnpm exec wrangler secret put <NAME>` in `apps/site` or
`gh secret set <NAME> --env production`, which read the value from standard input.)

## What to enter in each dashboard

These are the steps the command prints, written for someone who has never used the service.

### The team domain

Cloudflare One (<https://one.dash.cloudflare.com/>, LVBT account) shows it under Overview, then
Account details. The Team domain is `lvbt.cloudflareaccess.com`: it is the address of the sign-in
page and the value of `ACCESS_TEAM_DOMAIN`. The Team name beside it, "Las Vegans for Better
Transit", is only a label and is never copied anywhere. Each has a pencil icon that edits it. Do not
change the team domain: the admin sign-in stops working until `ACCESS_TEAM_DOMAIN` and the Google
OAuth client are updated to match.

On a brand-new account only, Cloudflare asks for the team domain when Cloudflare One is first opened
(its documentation calls this the team name): type `lvbt`. If it asks for a team name too, type
`Las Vegans for Better Transit`. Choose the Zero Trust Free plan; Cloudflare asks for payment
details even for the Free plan but does not charge for it.

### Google Workspace sign-in

This is already done for LVBT. On a new account, a Google Workspace super admin follows the steps
the command prints. In short: create an OAuth client of type "Web application" in the Google Cloud
project "LVBT Access", with the JavaScript origin `https://lvbt.cloudflareaccess.com` and the
redirect URI `https://lvbt.cloudflareaccess.com/cdn-cgi/access/callback`; enable the Admin SDK API;
turn on "Trust internal apps" in the Google Admin console; then in Cloudflare One, under
Integrations, then Identity providers, add "Google Workspace" with the client's ID as "App ID", its
secret, and the domain `lasvegasfortransit.org`, approve the link it shows, and click "Test". The
standard's guide below has every step.

### The volunteer admin group

The admin pages let in only members of the Google Group `wwd-admin@lasvegasfortransit.org`. The
command cannot read Google Groups, so it shows these steps and then asks whether the group exists.
After a yes, it does not ask again on that computer. You need a Google Workspace admin account with
the Groups administrator privilege.

1. Open the Google Admin console at <https://admin.google.com> and go to Menu, then Directory, then
   Groups. If `wwd-admin@lasvegasfortransit.org` is listed, skip to step 5.
2. Click "Create group". Group name: `lvwwd.org volunteer admin`. Group email: `wwd-admin`, keeping
   the domain lasvegasfortransit.org. Description: "Volunteers who can open the lvwwd.org admin
   pages". Group owner(s): yourself and anyone who will manage volunteers.
3. Click "Next", tick "Security", and click "Next".
4. Set Access type to "Restricted" and "Who can join the group" to "Only invited users". Leave
   "Allow external members in the group" off. Click "Create Group".
5. Open the group, click "Members", then "Add members", type each volunteer's
   @lasvegasfortransit.org address, and click "Add To Group".

Step 4 below says how to add and remove volunteers later.

### The volunteer admin application

The command creates it when it has the setup token. To create it by hand, use exactly these names,
so the command recognizes it instead of creating a second one. The steps follow the page from top to
bottom.

1. In Cloudflare One, with the "Las Vegas for Better Transit" account, go to Access controls, then
   Applications. If "lvwwd.org volunteer admin" is listed, skip to step 8.
2. Click "Create new application" (some screens say "Add an application"). In the dialog, under
   "Self-hosted and private", choose the "Public DNS" tab, not "Private destinations", then click
   "Continue with Self-hosted and private".
3. Under "Destinations", fill in three public hostname rows ("+ Add public hostname" adds a row).
   Each has Subdomain empty and `lvwwd.org` chosen in the Domain dropdown; the paths are `admin`,
   `admin/*`, and `api/admin/*`. A path does not cover the paths under it, and a wildcard does not
   cover its parent, so all three are needed. If you see a "Private IPs" row instead, click "+ Add
   public hostname" and remove the empty private row.
4. Leave "Allow access through browser-based RDP, SSH, or VNC sessions" off.
5. Under "Access policies", choose `lvwwd.org volunteer admin allow` in "Add current policies" if it
   is there. Otherwise click "Create new policy", name it exactly `lvwwd.org volunteer admin allow`,
   set the action to "Allow", and add one Include rule: "Google Workspace groups" with
   `wwd-admin@lasvegasfortransit.org`. If that selector is not offered, Google Workspace sign-in is
   not connected; use an "Emails" rule listing the volunteers' addresses until it is, and the
   command switches it to the group later.
6. Skip "Policy tester". Under "Authentication", on the "Identity" tab, turn off "Accept all
   available identity providers", choose only "Google Workspace" in "Choose available identity
   providers", and turn on "Apply instant authentication". Leave "Authenticate with Cloudflare One
   Client" off.
7. Skip "Preview". Under "Details", type the name `lvwwd.org volunteer admin` and keep "Session
   Duration" at "24 hours". Click "Create".
8. Click "Configure" on the application, open the "Additional settings" tab, and copy "Application
   Audience (AUD) Tag", 64 lowercase letters and digits. It is `ACCESS_AUD`.

### The Turnstile widget

Open Turnstile in the Cloudflare dashboard with the LVBT account. If there is no widget named
`lvwwd.org`, click "Add widget", name it `lvwwd.org`, add the hostname `lvwwd.org` under "Hostname
management", choose the mode "Managed", leave pre-clearance off, and click "Create". The Secret Key
is `TURNSTILE_SECRET`, which the command stores. The Site Key is public and goes into
`apps/site/wrangler.jsonc` as step 3 describes. Both start with `0x`.

### The setup token

The link the command prints opens "Create Custom Token". Name it `lvbt setup lvwwd.org`. Check that
"Permissions" has exactly three rows, each set to "Account": "Turnstile" with "Edit", "Access: Apps
and Policies" with "Edit", and "Access: Organizations, Identity Providers, and Groups" with "Read".
Under "Account Resources", choose "Include" and "Las Vegas for Better Transit". Set the "TTL" end
date to tomorrow, click "Continue to summary", then "Create Token", and copy it; Cloudflare shows it
only once.

### The deploy token

It becomes the GitHub secret `CLOUDFLARE_API_TOKEN` in the `production` environment, which the
Deploy workflow uses.

1. Open <https://dash.cloudflare.com/profile/api-tokens> and click "Create Token".
2. Next to "Edit Cloudflare Workers", click "Use template". It grants Workers Scripts, Workers KV
   Storage, and Workers R2 Storage with "Edit", Workers Tail and Account Settings with "Read",
   Workers Routes on the zone with "Edit", and User Details and Memberships with "Read". The deploy
   applies no migrations, so it needs no D1 permission.
3. Under "Account Resources", choose "Include" and "Las Vegas for Better Transit", not "All
   accounts". Under "Zone Resources", choose "Include", then "Specific zone", then `lvwwd.org`.
4. Rename it `lvwwd.org deploy (GitHub Actions)`, leave "TTL" empty, click "Continue to summary",
   then "Create Token", and copy it. Paste it when the command asks for `CLOUDFLARE_API_TOKEN`.

The command copies `CLOUDFLARE_ACCOUNT_ID` into the same environment itself.

### Resend

1. Sign in at <https://resend.com/login>, or sign up at <https://resend.com/signup> with your
   @lasvegasfortransit.org address and ask a maintainer to invite you to the LVBT team.
2. On <https://resend.com/domains>, if `lvwwd.org` is not listed, click "Add Domain", type
   `lvwwd.org`, choose the region "North Virginia (us-east-1)", and click "Add".
3. On the domain's page, click "Sign in to Cloudflare" and approve the request; it adds the DNS
   records. By hand, they are, each with TTL "Auto" and Proxy status "DNS only": MX `send` →
   `feedback-smtp.us-east-1.amazonses.com` with priority 10; TXT `send` →
   `v=spf1 include:amazonses.com ~all`; TXT `resend._domainkey` → the `p=` value Resend shows; and
   the recommended TXT `_dmarc` → `v=DMARC1; p=none;`.
4. Click "Verify DNS Records" and wait until the domain says "Verified", usually a few minutes.
5. On <https://resend.com/api-keys>, click "Create API Key", name it `lvwwd.org Worker`, choose
   "Sending access" and the domain `lvwwd.org`, and click "Add". Copy the key, which starts with
   `re_` and is shown only once. It is `RESEND_API_KEY`.

### Cloudflare Web Analytics

The site does not count visits yet. When it does, it needs the Web Analytics token at build time. In
the Cloudflare dashboard, open Web Analytics, click "Add a site", type `lvwwd.org`, and choose
"Enable with JS Snippet installation", not the automatic option. Open "Manage site" and copy only
the token inside `data-cf-beacon='{"token": "..."}'`. It is public, so it is a GitHub environment
variable, not a secret: in the repository's Settings, then Environments, then `production`, under
"Environment variables", click "Add environment variable", name it `PUBLIC_LVBT_CWA_TOKEN`, and
paste the token.

## Further reading

The standard's guide,
[Set up a repository's production platform](https://github.com/LasVegasForTransit/repository-tooling/blob/main/docs/how-to/set-up-production.md),
explains every message the commands print and what to do when one goes wrong.
