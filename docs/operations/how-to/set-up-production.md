# Set up lvwwd.org's production

This guide gets lvwwd.org's production complete: the participant database, the photo bucket, the bot
check on the sign-up forms, the email that sends "Open my week" links, the daily reminders by
browser notification, the volunteer admin views, and the credentials the deploy workflow uses.
Everything production needs is listed in
[`apps/site/platform.json`](../../../apps/site/platform.json). One command checks it and another
sets up what is missing, so you do not need to remember any of it.

## Before you start

- `pnpm bootstrap` passes on your machine, which means the GitHub CLI and Wrangler are signed in. If
  Wrangler is not, run `pnpm exec wrangler login` and sign in with your LVBT account.
- Your Cloudflare user can administer the Las Vegans for Better Transit account, including
  Cloudflare One, which Cloudflare used to call Zero Trust.
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
| Reminder key               | `VAPID_PRIVATE_KEY` generated (32 random bytes) and stored on the Worker, only if the Worker doesn't have one. See step 5.                                                              |
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

## 5. Check the daily reminders

Participants can turn on one browser notification each morning of the week, October 1 to 8, from the
"Remind me to share my trip" section of My week. Each one is signed with a key pair, so push
services (Google, Apple, Mozilla and Microsoft) deliver it as coming from lvwwd.org.

| Value               | Where it lives                           | What it is                                                                    |
| ------------------- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| `VAPID_PRIVATE_KEY` | A secret on the Worker                   | 32 random bytes in base64url (43 characters), generated by step 2             |
| Public key          | Nowhere to set                           | The Worker works it out from the private key and gives it to browsers         |
| `VAPID_SUBJECT`     | `vars` in `apps/site/wrangler.jsonc`     | `mailto:wwd@lasvegasfortransit.org`, already set                              |
| Send times          | `triggers` in `apps/site/wrangler.jsonc` | `1-59/2 15 1-8 10 *`: odd minutes, 8:01 to 8:59 am Las Vegas time, Oct 1 to 8 |
| Subscriptions       | Table `push_subscriptions` in `lvwwd`    | Added by migration `0006`, which step 2 applies                               |

You do nothing by hand. Step 2 generates the key once and applies the migration. Running it again
leaves the key alone, because a new key would silently stop every browser's reminders: browsers
accept notifications only from the key they subscribed with. Replace it only if it has leaked, and
know that everyone then has to turn reminders on again. To replace it, run
`pnpm exec wrangler secret delete VAPID_PRIVATE_KEY` in `apps/site`, then
`pnpm bootstrap --production`.

To test before October 1, open My week on your phone, tap "Turn on notifications" and allow it. On
an iPhone, add lvwwd.org to the Home Screen and open it from there first. Then open
<https://lvwwd.org/admin>, find "Browser reminders" and press "Send test reminder" on the newest
browser. Day 1's notification shows within a minute, and tapping it opens My week.

## 6. Turn on analytics

The analytics integration stays off until the production build has a Cloudflare Web Analytics token.

1. Open the [Cloudflare dashboard](https://dash.cloudflare.com/), choose the Las Vegans for Better
   Transit account, then open **Web Analytics**. If `lvwwd.org` is absent, click **Add a site**,
   choose `lvwwd.org`, then click **Done**.
2. Click **Manage site** for `lvwwd.org` and choose **Enable with JS Snippet installation**. Leave
   Cloudflare's automatic setup off so it does not bypass the site's privacy check or count twice.
   The build adds the snippet; do not paste it into a page.
3. Copy the token from the snippet: the 32 letters and digits after `"token":`, without quotes.
4. In GitHub, open the `week-without-driving` repository's Settings → Environments → `production`.
   Add an **environment variable** named `PUBLIC_LVBT_CWA_TOKEN` and paste the token.
5. Redeploy from `main`, then verify the live site and collector as described in
   [Analytics](../reference/analytics.md#check-it).

## 7. Confirm lvwwd.org is ready

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

This is already done for LVBT; skip it unless Cloudflare One's Integrations, then Identity
providers, does not list "Google Workspace". A Google Workspace super admin for
lasvegasfortransit.org does the Google steps.

1. Open <https://console.cloud.google.com/apis/library/admin.googleapis.com?project=lvbt-core> in
   LVBT's Google Cloud project, "LVBT Core", and click "Enable" on "Admin SDK API" (it says "Manage"
   if it is already on). Access uses it to read group membership. If Google shows a Free Trial
   banner, dismiss it; none of this needs billing.
2. Open <https://console.cloud.google.com/auth/overview?project=lvbt-core>. If the Clients page says
   "Google Auth Platform not configured yet", click "Get started" and complete the four steps: App
   Information — App name `Las Vegans for Better Transit`, User support email
   `tech@lasvegasfortransit.org` (a shared LVBT address, never a person's), then "Next"; Audience —
   "Internal", then "Next"; Contact Information — `tech@lasvegasfortransit.org`, then "Next"; Finish
   — tick the box agreeing to the Google API Services: User Data Policy, click "Continue", then
   "Create". Optional: under "Branding", upload the square LVBT logo from the "Marketing &
   Communications" shared drive as the App logo. Then open "Clients" again.
3. Open <https://admin.google.com/ac/owl> (Security, then Access and data control, then API
   controls), click "Settings", turn on "Trust internal apps", and save.
4. In a new browser tab, open Cloudflare One, go to Integrations, then Identity providers — not
   "Cloud & SaaS" just above it: that is a different feature that asks for a service account, so
   leave it alone — and click "Add new identity provider", then "Google Workspace". Keep this tab
   open; it shows the callback URL the Google client uses next.
5. Back in Google Cloud, open <https://console.cloud.google.com/auth/clients?project=lvbt-core>. If
   a client named "Cloudflare Access" is listed, open it and under "Client secrets" click "Add
   secret"; otherwise click "Create client", choose "Web application", and name it
   `Cloudflare Access`.
6. Under "Authorized JavaScript origins", add exactly `https://lvbt.cloudflareaccess.com`. Under
   "Authorized redirect URIs", add exactly
   `https://lvbt.cloudflareaccess.com/cdn-cgi/access/callback`. Click "Create" (or "Save").
7. Copy the Client ID and paste it into the field labelled "Client ID" in the Cloudflare tab (an
   older Cloudflare UI calls this "App ID").
8. Copy the Client secret and paste it into "Client secret" in the Cloudflare tab.
9. Type `lasvegasfortransit.org` as the Google Workspace domain. Leave "Proof Key for Code Exchange
   (PKCE)" on. Leave "Enable SCIM" off, along with "Enable user deprovisioning" and "Remove user
   seat on deprovision", and leave the SCIM identity update behavior as "No action" — Google
   Workspace only sends SCIM to a handful of apps in its own catalog, and Cloudflare does not
   document SCIM support for Google Workspace at all; Access re-checks group membership every
   sign-in instead. Leave the email claim and OIDC Claims fields empty. Click "Save". Open the link
   Cloudflare shows, signed in as the super admin, and approve it.
10. Add yourself to `wwd-admin@lasvegasfortransit.org` (the next section), then click "Test" next to
    Google Workspace. It should show your name and that group.

MFA belongs in Google, not Cloudflare: a Workspace admin enforces it under Security → Authentication
→ 2-step verification in the Google Admin console, with Enforcement "On". Do not add a Cloudflare
"Authentication method" MFA rule to the volunteer admin policy below; Google does not reliably send
that signal, and it can lock everyone out.

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
   @lasvegasfortransit.org address and your own (so you can test the sign-in), and click "Add To
   Group".

Step 4 below says how to add and remove volunteers later.

### The volunteer admin application

The command creates it when it has the setup token. To create it by hand, use exactly these names,
so the command recognizes it instead of creating a second one. The steps follow the page from top to
bottom.

1. In Cloudflare One, with the "Las Vegans for Better Transit" account, go to Access controls, then
   Applications. If "lvwwd.org volunteer admin" is listed, skip to step 8.
2. Click "Create new application" at the top right (some screens say "Add an application"); an
   account with no applications shows only a list of prerequisites, with the button still at the top
   right. In the dialog, under "Self-hosted and private", choose the "Public DNS" tab, not "Private
   destinations", then click "Continue with Self-hosted and private".
3. Under "Destinations", fill in three public hostname rows ("+ Add public hostname" adds a row).
   Each has Subdomain empty and `lvwwd.org` chosen in the Domain dropdown; the paths are `admin`,
   `admin/*`, and `api/admin/*`. A path does not cover the paths under it, and a wildcard does not
   cover its parent, so all three are needed. If you see a "Private IPs" row instead, click "+ Add
   public hostname" and remove the empty private row.
4. Leave "Allow access through browser-based RDP, SSH, or VNC sessions" off.
5. Under "Access policies", choose `lvwwd.org volunteer admin allow` in "Add current policies" if it
   is there. Otherwise click "Create new policy", name it exactly `lvwwd.org volunteer admin allow`,
   set the action to "Allow", leave "Policy session duration" at "Same as application session
   duration", and add one Include rule: "Google Groups" (an older Cloudflare UI calls this "Google
   Workspace groups") with `wwd-admin@lasvegasfortransit.org`. If that selector is not offered,
   Google Workspace sign-in is not connected; use an "Emails" rule listing the volunteers' addresses
   until it is, and the command switches it to the group later. Leave "Override global multi-factor
   authentication settings (MFA)" and "Just-in-time access" off.
6. Skip "Policy tester". Under "Authentication", on the "Identity" tab, turn off "Accept all
   available identity providers", choose only "Google Workspace" in "Choose available identity
   providers", and turn on "Apply instant authentication". Leave "Authenticate with Cloudflare One
   Client" off.
7. Skip "Preview". Under "Details", type the name `lvwwd.org volunteer admin` and keep "Session
   Duration" at "24 hours". Click "Create".
8. Open the application's "Configure" page, then "Additional settings" → "Cookie settings", and turn
   on "Enable Binding Cookie". Leave "HTTP Only" on and "SameSite" set to "Lax".
9. When the command asks for `ACCESS_AUD`, still under "Additional settings", copy "Application
   Audience (AUD) Tag" (64 lowercase letters and digits), and paste it at the prompt.

### The Turnstile widget

Open Turnstile in the Cloudflare dashboard with the LVBT account. If there is no widget named
`lvwwd.org`, click "Add widget", name it `lvwwd.org`, add the hostname `lvwwd.org` under "Hostname
management", choose the mode "Managed", leave pre-clearance off, and click "Create". When the
command asks for `TURNSTILE_SECRET`, copy the Secret Key and paste it at the prompt. After that,
copy the Site Key and paste it into `apps/site/wrangler.jsonc` as step 3 describes. Both start with
`0x`; only the Site Key is public.

### The setup token

The link the command prints opens "Create Custom Token". Name it `lvbt setup lvwwd.org`. Check that
"Permissions" has exactly three rows, each set to "Account": "Turnstile" with "Edit", "Access: Apps
and Policies" with "Edit", and "Access: Organizations, Identity Providers, and Groups" with "Read".
Under "Account Resources", choose "Include" and "Las Vegans for Better Transit". Set the "TTL" end
date to tomorrow, click "Continue to summary", then "Create Token", copy it (Cloudflare shows it
only once), and paste it at the command's prompt.

### The deploy token

It becomes the GitHub secret `CLOUDFLARE_API_TOKEN` in the `production` environment, which the
Deploy workflow uses. Make it an account API token, which belongs to the LVBT account rather than to
you, so deploys keep working after you leave; creating one needs the Super Administrator role. It
works with Wrangler because the workflow also sets `CLOUDFLARE_ACCOUNT_ID`.

1. In the Cloudflare dashboard, choose "Las Vegans for Better Transit" and go to Manage Account,
   then "Account API Tokens". Click "Create Token", then "Create Custom Token".
2. Name it `lvwwd.org deploy (GitHub Actions)`.
3. Under "Permissions", add three rows: "Account", "Workers Scripts", "Edit"; "Account", "Account
   Settings", "Read"; and "Zone", "Workers Routes", "Edit". The deploy applies no migrations, so it
   needs no D1 permission.
4. Under "Zone Resources", choose "Include", then "Specific zone", then `lvwwd.org`.
5. Leave the expiration empty, click "Continue to summary", then "Create Token", and copy it;
   Cloudflare shows it only once.

Store it in the repository's `production` GitHub environment one of two ways:

- Paste it when `pnpm bootstrap --production` asks for `CLOUDFLARE_API_TOKEN`; the command stores it
  and `CLOUDFLARE_ACCOUNT_ID` itself.
- Or, without running the command, store both directly. In the repository, run
  `gh secret set CLOUDFLARE_API_TOKEN --env production`, then paste the token and press Enter (it is
  read from standard input, so it never appears as a command argument or in your shell history).
  Then run `gh secret set CLOUDFLARE_ACCOUNT_ID --env production` and paste the Account ID shown on
  the account's Cloudflare dashboard at the prompt. Only a repository admin can set environment
  secrets.

The Deploy workflow (`.github/workflows/deploy.yml`) cannot publish lvwwd.org until both secrets
exist in the `production` environment; a push to `main` fails at the Deploy step until they do. The
setup token stays a personal token that expires the next day, because account API tokens cannot
manage Turnstile.

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
   `re_` and is shown only once, and paste it when the command asks for `RESEND_API_KEY`.

### Cloudflare Web Analytics

The site does not count visits yet. When it does, it needs the Web Analytics token at build time. In
the Cloudflare dashboard, open Web Analytics, click "Add a site", type `lvwwd.org`, and choose
"Enable with JS Snippet installation", not the automatic option. The token is public, so it is a
GitHub environment variable, not a secret. In the repository's Settings, open Environments, then
`production`, and under "Environment variables" click "Add environment variable" and name it
`PUBLIC_LVBT_CWA_TOKEN`. Then, in Web Analytics, open "Manage site", copy only the token inside
`data-cf-beacon='{"token": "..."}'`, and paste it as the variable's value.

## Further reading

The standard's guide,
[Set up a repository's production platform](https://github.com/LasVegasForTransit/repository-tooling/blob/main/docs/how-to/set-up-production.md),
explains every message the commands print and what to do when one goes wrong.
