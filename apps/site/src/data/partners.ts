import type { RosterItem } from '../lib/partners';

// The partner roster: every organization taking part in Week Without
// Driving Las Vegas 2026. It is the only place partner details live. The
// Partners page, each partner's link and QR code files, and the home page
// all read it, so adding a partner is adding one item here and publishing
// the site. docs/operations/how-to/add-a-partner.md walks through it.
//
// Add an organization only after it has confirmed its sentence and type by
// email. Once its link or QR code has been shared, never change its slug:
// printed codes and posted links carry it.
//
// Each item looks like this (a made-up partner, for the format only):
//
//   {
//     slug: 'example-club',
//     name: 'Example Club',
//     url: 'https://example.org',
//     logo: '/partners/logos/example-club.png',
//     type: 'Student groups',
//     sentence: 'Our members are taking the bus to class together on October 6.',
//   },
//
// `url` and `logo` are optional. Put supplied logos in public/partners/logos.
// `type` is one of the six in PARTNER_TYPES in
// src/lib/partners.ts, spelled exactly. The build stops with a message
// naming the partner if an item breaks a rule.
export const roster: RosterItem[] = [
  {
    slug: 'rtc-southern-nevada',
    name: 'RTC of Southern Nevada',
    url: 'https://www.rtcsnv.com/',
    logo: '/partners/logos/rtc-southern-nevada.png',
    type: 'Public agencies',
    sentence: 'RTC provides bus service and trip planning information across Southern Nevada.',
  },
  {
    slug: 'sierra-club-toiyabe',
    name: 'Sierra Club Toiyabe Chapter',
    url: 'https://www.sierraclub.org/toiyabe',
    type: 'Environmental and justice groups',
    sentence: 'The Toiyabe Chapter works on environmental issues in Nevada.',
  },
];
