# Copy and campaign states

Each page has a distinct job. Shared navigation, safety instructions and legal requirements may
repeat where a visitor needs them; campaign announcements should not crowd out the task at hand.

| Page                         | What it helps a visitor do                                                                                             |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Home                         | Understand the campaign’s status, why it matters and where to go next. Keep the thank-you and next-year farewell here. |
| How it works                 | Understand the challenge and choose a practical way to participate.                                                    |
| Plan a trip and rider guides | Make an everyday trip without an account. Keep this copy useful outside the campaign dates.                            |
| Bingo                        | Understand whether the digital card can be changed, revisit marks and print a game for any time.                       |
| My week and sign-in          | Reach personal records or recover access. Membership is a secondary invitation after the participant’s own tasks.      |
| Giveaway and Official Rules  | Find dated prize and eligibility information. Keep closed-entry language specific to the giveaway.                     |
| Partners                     | Meet participating organizations, discuss joining and understand what happens to old promotional links.                |
| Resources and Press          | Find relevant sources or a media contact, without repeating the home page’s farewell.                                  |

## Preparing another campaign

Changing the year in one file does not reopen the campaign. Review these together before launch:

- Confirm dates, prizes, eligibility, drawing and retention dates. Update campaign data in
  `apps/site/src/lib/wwd.ts`, `campaign.ts` and `newsletter.ts`, plus the corresponding Worker
  rules.
- Review browser modules for campaign boundaries, account storage keys, planner dates and reminder
  deadlines. The browser and Worker must agree about when an action is available.
- Review dated pages, navigation labels, share captions, generated pictures, printed Bingo cards,
  partner banners and the flyer. Do not promote a historical giveaway as a current one.
- Keep an accurate record of published legal rules rather than silently relabeling them for another
  year. Confirm new rules before opening entries.
- Check before, during and after the campaign, including signed-out, signed-in, offline and service
  failure states. Check mobile layouts, printing and the no-JavaScript fallbacks.
- Run `pnpm check`, build the browser-test site and run the browser suite. Visually review the home,
  tools, account paths, archive materials and footer before publishing.

The playful guide cards and illustrations are part of the experience. Tightening copy should make
those choices easier to understand, without replacing them with undifferentiated lists.
