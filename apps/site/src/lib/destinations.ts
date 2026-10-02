// What the Go page (/go) knows about places: the seven places a visitor can
// pick in "Find a bus" instead of sharing their location, and the seven
// destinations under "Places to go", each with three numbered steps and the
// points its map buttons lead to.
//
// Every route number and stop name in the steps below was checked on
// September 23, 2026 against RTC's GTFS feed "August 2026_20260730" (the
// same feed the stop data in public/data comes from; see
// docs/operations/how-to/update-stop-data.md). The Game Day Express details
// and the "BHX-A" label were checked the same day on rtcsnv.com: the Game
// Day Express page for the Raiders and the BHX timetable. Check them again
// whenever RTC publishes a new feed, and against the Game Day Express page
// in the week before the section goes live each year.
//
// A step is plain text. "[label](/path)" inside a step becomes a link to
// another page of the site; see parseInlineLinks in ./guides.

export interface Place {
  /** The name shown in the "Or pick a place:" list. */
  label: string;
  lat: number;
  lng: number;
}

/**
 * The places in "Or pick a place:", in the list's alphabetical order. Each
 * point was checked against OpenStreetMap on September 23, 2026: it sits at
 * the named place, on public ground.
 */
export const finderPlaces: readonly Place[] = [
  // In Craig Ranch Regional Park, just north of Craig Road.
  { label: 'Craig Ranch Park, North Las Vegas', lat: 36.2403, lng: -115.154 },
  // Fremont Street Experience.
  { label: 'Downtown Las Vegas', lat: 36.17048, lng: -115.14353 },
  // The library at 2851 E Bonanza Rd.
  { label: 'East Las Vegas Library', lat: 36.1729, lng: -115.1105 },
  // Water Street at Basic Road.
  { label: 'Henderson Water Street', lat: 36.03001, lng: -114.97951 },
  // Downtown Summerlin.
  { label: 'Summerlin Centre', lat: 36.14977, lng: -115.33355 },
  // Las Vegas Boulevard at Flamingo Road.
  { label: 'The Strip at Flamingo', lat: 36.1162, lng: -115.1745 },
  // The UNLV Student Union.
  { label: 'UNLV', lat: 36.10605, lng: -115.1387 },
];

export interface ButtonRow {
  /** Shown above the row when a destination has more than one. */
  rowLabel?: string;
  /** The name the map buttons read out: "Directions to <placeName> in …". */
  placeName: string;
  lat: number;
  lng: number;
}

export interface Destination {
  /** The section's id, so /go#<anchor> opens at it. */
  anchor: string;
  heading: string;
  intro: string;
  /** Exactly three steps. */
  steps: readonly [string, string, string];
  buttonRows: readonly ButtonRow[];
  /** Important access or temporary service information for a destination. */
  note?: {
    heading: string;
    text: string;
    details?: readonly string[];
    source?: { label: string; href: string };
  };
}

export const destinations: readonly Destination[] = [
  {
    anchor: 'downtown',
    heading: 'Downtown Las Vegas and the Arts District',
    intro:
      'Fremont Street and the Arts District (also called 18b) are next to each other downtown. They are about a 15-minute walk or roll apart.',
    steps: [
      "Take any bus that stops at Bonneville Transit Center. It is downtown's main bus station. Many buses stop there, like the RED LINE, BHX, CX, DVX and routes 105, 106, 108, 113, 206, 207, 208, 214, 215 and 401.",
      'From the Strip, take the Deuce north. It runs on Las Vegas Boulevard all day and all night, and it ends downtown. The Deuce can cost more. See [Pay your bus fare](/guides/pay-your-fare).',
      'Arts District: get off the Deuce at Casino Center at Coolidge. Or walk or roll about 10 minutes south from Bonneville Transit Center. Route 108 also goes through the Arts District, on Main Street and Commerce Street. Fremont Street: stay on the Deuce past Bonneville Transit Center. Get off at 4th Street at Fremont Street Experience. Or walk or roll about 10 minutes north from Bonneville Transit Center.',
    ],
    buttonRows: [
      { rowLabel: 'Fremont Street', placeName: 'Fremont Street', lat: 36.17048, lng: -115.14353 },
      {
        rowLabel: 'Arts District',
        placeName: 'the Arts District',
        lat: 36.15953,
        lng: -115.15128,
      },
    ],
  },
  {
    anchor: 'east-las-vegas-library',
    heading: 'East Las Vegas Library',
    intro: 'A public library at 2851 E Bonanza Rd in East Las Vegas.',
    steps: [
      'Take Route 215 (Bonanza) on Bonanza Road. Going east, get off at Bonanza after 28th. Going west, get off at Bonanza after Wardelle. The library is a short walk or roll from either stop.',
      "Route 215 starts at Bonneville Transit Center, downtown's main bus station. On Route 110 (Eastern)? Change to Route 215 at Eastern Avenue and Bonanza Road.",
      'To go home, take Route 215 from the stop across the street. The library is a cool place to wait.',
    ],
    buttonRows: [{ placeName: 'East Las Vegas Library', lat: 36.1729, lng: -115.1105 }],
  },
  {
    anchor: 'craig-ranch-park',
    heading: 'Craig Ranch Regional Park, North Las Vegas',
    intro:
      'A big city park on Craig Road in North Las Vegas. It has paths, playgrounds and an outdoor stage.',
    steps: [
      'Take Route 219 (Craig Rd) on Craig Road. Get off at Craig after Revere. There is a stop on each side of the road. The park is a short walk or roll away.',
      'From downtown, take Route 105 (Martin L. King) north from Bonneville Transit Center. Get off at Camino Al Norte after Craig. Change to Route 219 going east.',
      'To go home, take the same buses from the stops across the street.',
    ],
    buttonRows: [{ placeName: 'Craig Ranch Regional Park', lat: 36.2403, lng: -115.154 }],
  },
  {
    anchor: 'water-street-henderson',
    heading: 'Water Street District, Henderson',
    intro: 'Downtown Henderson, with shops and places to eat along Water Street.',
    steps: [
      'Take the BHX (Boulder Highway Express). It runs on Boulder Highway between Bonneville Transit Center and Henderson. Only some BHX buses stop near Water Street. Look for BHX-A on the sign. The usual stop is Basic after Water, a short walk or roll from Water Street. Going October 1–4? See the stop change below.',
      'Coming from somewhere else? Change to the BHX at Bonneville Transit Center, or at any BHX stop on Boulder Highway.',
      'To go home, the usual BHX-A stop is Basic after Texas, going west. Going October 1–4? See the stop change below.',
    ],
    buttonRows: [{ placeName: 'Water Street District', lat: 36.0306, lng: -114.982 }],
    note: {
      heading: 'BHX-A stop changes October 1–4',
      text: 'RTC plans to close four BHX-A stops for Henderson Hot Rod Days. The closing runs from 11 pm October 1 to 1 am October 4. Use these stops instead:',
      details: [
        'Toward Water Street: Basic after Water (stop 149) → southbound Boulder Highway after Basic (stop 246).',
        'Toward Water Street: Water after Victory (stop 6247) → southbound Boulder Highway before Lake Mead (stop 6253).',
        'Heading back: Basic after Texas (stop 5636) → northbound Boulder Highway after Basic (stop 245).',
        'Heading back: Water after Victory (stop 6251) → northbound Boulder Highway after Lake Mead (stop 276).',
      ],
      source: {
        label: 'Check RTC’s current stop closures before you leave',
        href: 'https://www.rtcsnv.com/ways-to-travel/schedules-maps/bus-stop-closures/',
      },
    },
  },
  {
    anchor: 'unlv',
    heading: 'UNLV campus',
    intro:
      'The University of Nevada, Las Vegas. It is on Maryland Parkway, between Flamingo Road and Tropicana Avenue.',
    steps: [
      "Take the RED LINE, RTC's fast bus on Maryland Parkway. Get off at University Road. Going north, the stop is Maryland after University Rd. Going south, it is Maryland before University Rd.",
      'Or take Route 201 (Tropicana). Get off at Tropicana after Maryland, at the south end of campus.',
      'From Maryland Parkway and University Road, walk or roll west into campus. The Student Union is about 3 minutes away.',
    ],
    buttonRows: [{ placeName: 'the UNLV campus', lat: 36.10605, lng: -115.1387 }],
  },
  {
    anchor: 'sunset-park',
    heading: 'Sunset Park',
    intro:
      'A big county park at Eastern Avenue and Sunset Road. It has a lake, paths and shady picnic spots.',
    steps: [
      "Take Route 110 (Eastern). Going north, get off at Eastern at Sunset Park. Going south, get off at Eastern after Pama. Both stops are on the park's west side.",
      "Or take Route 212 (Sunset) on Sunset Road. Get off at Eastern Avenue, at the park's northwest corner.",
      'To go home, take the same bus from the stop across the street. Bring water. The paths are long, and some have no shade. [Walk or roll in the heat](/guides/heat) has more tips.',
    ],
    buttonRows: [{ placeName: 'Sunset Park', lat: 36.06431, lng: -115.11359 }],
  },
  {
    anchor: 'allegiant-stadium',
    heading: 'Allegiant Stadium on Raiders game day',
    intro: 'The Raiders play the Kansas City Chiefs on Sunday, October 4, at 1:25 pm.',
    steps: [
      "Take RTC's Game Day Express, a special bus to the game. It leaves from six casinos: Red Rock (Summerlin), Santa Fe Station (Centennial Hills), Aliante (North Las Vegas), Sam's Town (East Las Vegas), Green Valley Ranch (Henderson) and M Resort (West Henderson). A round trip costs $4. Buy it in the rideRTC, Transit or Uber app, up to seven days early. Or pay $4 in cash when you get on. Paying by card or phone? Tap twice when you get on, to get a ride back.",
      "For the 1:25 pm game, buses run from three hours before kickoff until one hour before it. Check [RTC's Game Day Express page](https://www.rtcsnv.com/ways-to-travel/transit-services/game-day-express-raiders/) for the latest times. Buses drop you off on Dean Martin Drive, next to Gate 11.",
      'After the game, buses leave from the same spot for up to 40 minutes. Going to the Strip instead? Walk or roll east over the Hacienda Avenue bridge to Las Vegas Boulevard. It takes about 20 minutes. Then catch the Deuce at Mandalay Bay.',
    ],
    buttonRows: [{ placeName: 'Allegiant Stadium', lat: 36.09074, lng: -115.18333 }],
    note: {
      heading: 'Getting there by wheelchair or walker',
      text: 'The Hacienda Avenue bridge in step 3 is long, with hills. If that is hard for you, take the Game Day Express back instead.',
    },
  },
];

/**
 * The routes a step names, in the order it names them: "Route 215",
 * "routes 105, 106 and 108", the lettered routes (RED LINE, BHX, CX, DVX,
 * SX) and the Deuce. Places to go shows them as colored badges, and the
 * tests check each one against RTC's stop data.
 */
export function routesIn(step: string): string[] {
  const found: Array<{ at: number; route: string }> = [];
  for (const match of step.matchAll(/\bRoute (\d+)/g)) {
    found.push({ at: match.index, route: match[1] ?? '' });
  }
  for (const match of step.matchAll(/\broutes (?:\d+(?:, | and ))*\d+/g)) {
    for (const number of match[0].matchAll(/\d+/g)) {
      found.push({ at: match.index + number.index, route: number[0] });
    }
  }
  for (const named of ['RED LINE', 'BHX', 'CX', 'DVX', 'SX']) {
    const match = new RegExp(`\\b${named}\\b`).exec(step);
    if (match) found.push({ at: match.index, route: named });
  }
  const deuce = /\bDeuce\b/.exec(step);
  if (deuce) found.push({ at: deuce.index, route: 'DEUCE' });
  return found.sort((a, b) => a.at - b.at).map((item) => item.route);
}
