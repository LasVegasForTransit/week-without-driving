# Publish a reviewed release

Merging to `main` builds a retained release and updates protected staging. It does not publish
lvwwd.org. A maintainer explicitly promotes the reviewed staging release with `pnpm promote` or the
**Promote Week Without Driving release** workflow. Production continues to use the existing
`production` GitHub environment and its `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.
No production credential or database is copied to staging.

## Prepare protected staging

A maintainer must complete this configuration before the first staged release. The agent migration
creates no Worker, database, bucket, Access policy or secret.

1. Allocate the isolated D1 database `lvwwd-preview` and R2 bucket `lvwwd-preview-photos` in the
   LVBT Cloudflare account. Keep production's `lvwwd` database and `lvwwd-photos` bucket unchanged.
   The existing manual API preview has different resources and remains separate.
2. Choose a reviewed HTTPS custom origin for the `lvwwd-preview` Worker. Set the repository Actions
   variable `LVBT_PREVIEW_URL` to that origin, without a path. It must differ from lvwwd.org and
   www.
3. Copy the production binding declarations from `apps/deploy/cloudflare.config.ts` into the
   repository Actions variable `LVBT_PREVIEW_BINDINGS` as a JSON object. Include every binding.
   Replace `DB` with `{ "type": "d1", "name": "lvwwd-preview", "id": "<preview database UUID>" }`
   and `PHOTOS` with `{ "type": "r2", "name": "lvwwd-preview-photos" }`. Keep `ASSETS` as
   `{ "type": "assets" }`. Each secret is only `{ "type": "secret" }`; the JSON contains no
   credential values. Use test integration credentials on the preview Worker. Keep
   `EVENT_REMINDERS_ENABLED` and `SMS_REMINDERS_ENABLED` false, use the test Turnstile site key, and
   set `SMS_ORIGIN` to the selected preview origin.
4. Configure Worker-specific Cloudflare Access for `lvwwd-preview`, covering **All traffic**,
   including its versioned workers.dev candidates. Allow the approved staff identity policy and a
   dedicated verification service token through a preview-only **Service Auth** policy.
5. Create the GitHub environment `worker-preview`. Add its preview deployment token as
   `CLOUDFLARE_API_TOKEN`, the account selector as `CLOUDFLARE_ACCOUNT_ID`, and the verification
   service token as `CF_ACCESS_CLIENT_ID` and `CF_ACCESS_CLIENT_SECRET`. Never reuse production
   credentials. The release checks reject another Workers account before sending Access headers.
6. Review the existing production token's permissions. Saved SQL migrations require D1 Edit on the
   selected database as well as Worker upload and activation permissions. Do not rotate or replace
   an existing token merely to migrate the repository.

The production platform manifest lists the preview resources and GitHub configuration requirements.
The release workflow additionally verifies anonymous denial on the protected preview and renders its
phone homepage and first-ride guide. Presence of Access service credentials alone does not prove
that the Worker-wide policy is correct.

For local maintainer inspection, export the two public preview configuration values and regenerate
the compatibility mirror through the shared adapter:

```sh
export LVBT_PREVIEW_URL="$(gh variable get LVBT_PREVIEW_URL)"
export LVBT_PREVIEW_BINDINGS="$(gh variable get LVBT_PREVIEW_BINDINGS)"
pnpm -C apps/deploy compat:generate
pnpm preflight --production
```

Ordinary local development does not require these release inputs. The generated
`apps/site/wrangler.jsonc` remains the local runtime and recovery mirror; edit canonical typed
configuration, then regenerate the mirror.

## Review and promote

The shared build workflow reads the existing public analytics token and `COMPARE_PUBLISHED` switch
from the `production` environment, preserving the production-shaped static build without using its
deployment credential. A saved artifact includes its compiled Worker, assets, configuration, binding
declarations and exact SQL migration files, all covered by the release inventory hash. Staging uses
the isolated database and bucket and disables scheduled jobs; production keeps both existing cron
schedules and release switches.

After checking the staging homepage, first-ride guide and affected product flows, run:

```sh
pnpm promote
# Or select a particular successful main staging run:
pnpm promote --run-id <run-id>
```

Promotion resolves the selected staging marker and successful originating run, verifies the saved
artifact, applies its saved SQL to the production database, checks the candidate, and activates that
exact version. It performs no rebuild. Failed migration or activation can have a partial or unknown
outcome; inspect the exact run and database migration history before retrying. Reminders and live
route comparisons retain their separate provider and real-device acceptance gates.

New staging artifacts carry signed proof from the pinned shared signing workflow; promotion verifies
that proof against the retained inventory before writes. The optional `expected_version` workflow
input checks the reviewed current production Worker version before each production write. Use
`pnpm promote --expected-version <version-id>` for the same guard from the command line. First
adoption requires this explicit current version when production has no shared release marker.

`pnpm run deploy` remains an explicit recovery command. It is not the main-push publication path.
