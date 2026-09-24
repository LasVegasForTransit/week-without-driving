# Add a partner organization

This guide puts an organization on the [Partners page](https://lvwwd.org/partners) and gives it its
own link and QR code. Do it once the organization has confirmed, by email, the sentence and type you
proposed.

## Before you start

- You can open a pull request on `LasVegasForTransit/week-without-driving`.
- You have the organization's name as it wants it shown, its website or social media page (if it has
  one), its type, and its one sentence.

## 1. Choose its slug

The slug is the organization's short name in its link, such as `example-club` in
`https://lvwwd.org/giveaway?ref=example-club`. Use lowercase letters and digits, with single hyphens
between words, at most 40 characters. `general` is kept for LVBT's own materials.

Once the organization has shared its link or printed its QR code, never change its slug.

## 2. Add one item to the roster

Open [`apps/site/src/data/partners.ts`](../../../apps/site/src/data/partners.ts) and add one item to
the `roster` list:

```ts
{
  slug: 'example-club',
  name: 'Example Club',
  url: 'https://example.org',
  type: 'Student groups',
  sentence: 'Our members are taking the bus to class together on October 6.',
},
```

- `url` is optional. When there is one, it starts with `https://`.
- `type` is exactly one of: `Community and neighborhood groups`, `Student groups`,
  `Environmental and justice groups`, `Disability and senior advocates`, `Employers and businesses`,
  `Public agencies`.
- `sentence` is at most 200 characters.

The order of the list does not matter. The page sorts partners by name.

## 3. Check it and publish

```bash
pnpm build
```

If an item breaks a rule, the build stops and names the organization and the problem. Fix it and
build again. Then open a pull request. Once it merges, the site deploys, and the organization
appears on the Partners page, in the partner kit's list, and on the home page. Its QR code files are
at `/partners/qr/<slug>.png` and `/partners/qr/<slug>.svg`.

## Change or remove a partner

Edit or delete its item in the same file within 3 days of the organization's email, and publish the
same way. Keep the slug of a partner that stays.
