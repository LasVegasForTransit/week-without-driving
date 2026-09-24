# Update the bus stop data

"Find a bus" on lvwwd.org/go shows the bus stops nearest a visitor. It reads two small files,
[`apps/site/public/data/stops.json`](../../../apps/site/public/data/stops.json) and
[`routes.json`](../../../apps/site/public/data/routes.json), made from the schedule data RTC (the
Regional Transportation Commission of Southern Nevada) publishes for app makers. This guide says
where that data comes from, when it was last checked, and how to refresh it when RTC changes its
routes.

## Where the data comes from

RTC's [For Developers](https://www.rtcsnv.com/ways-to-travel/transit-services/for-developers/) page
links its GTFS feed (General Transit Feed Specification, the standard format for bus schedules) at
`https://developer.rtcsnv.com/transitData/google_transit.zip`. Each version of the feed has a name,
which the finder shows under its results: "Stop and route data from RTC (August 2026_20260730)."

## Last check

On September 23, 2026, the feed RTC served was version "August 2026_20260730". It is valid from
August 23, 2026 to August 21, 2027, and RTC last changed the file on July 30, 2026. The stop data on
the site was rebuilt from that download and matches it: 3,785 stops on 39 routes.

The same day, each of the seven places in "Or pick a place:" was checked. Every point sits at the
place it names, on public ground, and each shows five stops within a mile, nearest first:

| Place                             | First stop                                   | Distance     | Routes   |
| --------------------------------- | -------------------------------------------- | ------------ | -------- |
| Craig Ranch Park, North Las Vegas | Craig after Revere (westbound)               | 0.1 mi       | 219      |
| Downtown Las Vegas                | Casino Center before Fremont (southbound)    | Under 0.1 mi | 401, CX  |
| East Las Vegas Library            | Bonanza after 28th (eastbound)               | 0.1 mi       | 215      |
| Henderson Water Street            | Basic after Water (eastbound)                | Under 0.1 mi | BHX      |
| Summerlin Centre                  | Pavilion Center after Sage Park (northbound) | 0.2 mi       | SX       |
| The Strip at Flamingo             | Flamingo after Las Vegas (westbound)         | 0.1 mi       | 202      |
| UNLV                              | Maryland before University Rd (southbound)   | 0.1 mi       | RED LINE |

Every route number and stop name in "Places to go" on the same page was checked against the same
feed.

## When to refresh it

RTC changes its routes a few times a year, and its
[Schedules & Maps](https://www.rtcsnv.com/ways-to-travel/schedules-maps/) page says when the current
schedules started. Refresh the stop data when that date changes, and in the week before each Week
Without Driving.

## Refresh it

1. From `apps/site`, run:

   ```bash
   pnpm stops
   ```

   It downloads the current feed and rewrites both files. It prints the feed version, the number of
   stops, and how big the files are once compressed. It stops without writing anything if the feed
   is missing a file, has fewer than 3,000 stops, ends before the week is over, or would make the
   files too big to download on a phone.

2. If the version it prints is the same as the one above, nothing changed: undo the rewrite with
   `git checkout -- public/data` and stop here.

3. If the version is new, recheck "Places to go" in
   [`apps/site/src/lib/destinations.ts`](../../../apps/site/src/lib/destinations.ts): every route
   number and stop name in its steps must still exist in the new feed. Then open `/go` with
   `pnpm dev`, pick each place in "Or pick a place:", and compare the first stop with the table
   above. Update the table and the "Last check" section with the new version and date.

4. Commit both data files together with any changes to the steps, and open a pull request.
