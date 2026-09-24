# Analytics

lvwwd.org counts how people use it with LVBT's shared analytics, the
[`@lasvegasfortransit/analytics`](https://github.com/LasVegasForTransit/analytics) package. The
counts show whether the Week Without Driving campaign works: how many people sign up, enter trips,
play bingo, and use Find a bus, without learning who any of them are.

Two services do the counting:

- [Cloudflare Web Analytics](../../development/reference/glossary.md#web-analytics) counts page
  visits, where visitors came from, and how fast pages load. lvwwd.org has its own Web Analytics
  site in the LVBT Cloudflare account.
- LVBT's [collector](../../development/reference/glossary.md#collector), at
  `events.lasvegasfortransit.org`, counts the campaign events in the table below.

Neither sets a cookie or gives a visitor an identifier. A browser that sends Global Privacy Control
or Do Not Track sends nothing to either. The site's [privacy page](https://lvwwd.org/privacy) tells
visitors the same thing, and the analytics repository's
[privacy contract](https://github.com/LasVegasForTransit/analytics/blob/main/docs/security/reference/privacy-contract.md)
is the rule every event follows.

## When analytics run

The analytics runtime is added only when a build has `PUBLIC_LVBT_CWA_TOKEN`, lvwwd.org's Web
Analytics token. The Deploy workflow reads it from the `production` environment's variables. Local,
pull-request, and preview builds have no runtime or beacon, so event calls send nothing.

Without the token the site builds and works normally, with no analytics. The package treats a
missing token as "not production", so the campaign events stay off too until the token exists.
[Set up lvwwd.org's production](../how-to/set-up-production.md#6-turn-on-analytics) shows how to
create it.

In the browser, the package checks again before it counts anything. It runs only on `lvwwd.org` or
`www.lvwwd.org`, never in a frame, never on `/admin`, and never when the browser asks not to be
tracked.

## Events

Every value is a campaign day, a running count, or a fixed label. No event carries a name, phone
number, email address, Instagram handle, post link, or location.

| Event                  | Sent when                                                                    | Script                          | Properties                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------- | --------------------------------------------------------------------------- |
| `campaign_signup`      | A new sign-up is saved                                                       | `sign-up.js`                    | None                                                                        |
| `week_link_requested`  | Get my link is sent, or a sign-up turns out to exist and its link is sent    | `my-week-link.js`, `sign-up.js` | `method`: `link_form` or `signup_form`                                      |
| `trip_entry_submitted` | A day's trip entry is saved                                                  | `my-week.js`                    | `day`: `1` to `8`; `method`: `link`, `screenshot`, or `link_and_screenshot` |
| `trip_picture_shared`  | The trip picture goes to the phone's share sheet or is downloaded            | `share-trip.js`                 | `method`: `share_sheet` or `download`                                       |
| `bingo_square_marked`  | A bingo square is marked                                                     | `bingo.js`                      | `marked`: how many squares are marked now, `1` to `24`                      |
| `bingo_completed`      | Marking a square finishes a line                                             | `bingo.js`                      | `lines`: how many lines are complete now, `1` to `12`                       |
| `bus_finder_used`      | Find a bus lists stops                                                       | `nearest-routes.js`             | `method`: `my_location` or `place`                                          |
| `app_installed`        | The browser reports an install, or the site first opens from the home screen | `app.js`                        | `method`: `browser` or `home_screen`                                        |
| `material_printed`     | A print starts on a page marked `data-print-item`                            | `app.js`                        | `item`: `partner_flyer` or `bingo_card`                                     |
| `mail_in_viewed`       | Half of the element marked `data-seen-event` is on screen                    | `app.js`                        | None                                                                        |

An identical event is sent once per page load, so marking, unmarking, and marking the same count
again on one page counts once. A trip entry that replaces the day's earlier entry counts again.

iPhones never report an install, so the first time the site opens from the home screen counts
instead. To count that once, `app.js` keeps `wwd-install-counted` set to `1` in the browser's
storage after an install is counted. It holds nothing else.

## Installing the package

The package comes from GitHub Packages, where it is private to the organization. CI and the Deploy
workflow install it with the workflow's own token, which works only while the package grants this
repository read access. If an install fails with `ERR_PNPM_FETCH_403`, a maintainer opens the
[package settings](https://github.com/orgs/LasVegasForTransit/packages/npm/package/analytics/settings),
clicks **Add Repository** under **Manage Actions access**, chooses `week-without-driving`, and keeps
the role **Read**. Contributors install it with their own token, as
[Start here](../../development/tutorials/start-here.md#before-you-start) shows.

## Check it

`pnpm test:e2e` builds the site with a stand-in token and runs the browser tests locally. The
analytics test opens that build as lvwwd.org and intercepts the beacon and collector requests.

After a production deploy with the token, check the live site and the collector:

```bash
pnpm --filter @lasvegasfortransit/site exec lvbt-analytics verify https://lvwwd.org --site lvwwd.org --expect present
curl --fail https://events.lasvegasfortransit.org/health
```

The first command needs Playwright's Chromium (`pnpm exec playwright install chromium`). Totals
appear in the analytics repository's weekly report issue and its `pnpm report` command.

## Change it

The collector accepts only events listed in the package. To count something new, add the event to
the package first, following
[Add a conversion event](https://github.com/LasVegasForTransit/analytics/blob/main/docs/development/how-to/add-a-conversion-event.md),
release it, raise the catalog version in `pnpm-workspace.yaml`, and then call `window.lvbt?.track`
at the successful action.
