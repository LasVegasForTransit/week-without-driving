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
  /** Only for a destination whose steps cross a bridge or other hard part. */
  note?: { heading: string; text: string };
}

export const destinations: readonly Destination[] = [
  {
    anchor: 'downtown',
    heading: 'Downtown Las Vegas and the Arts District',
    intro:
      'Fremont Street and the Arts District (also called 18b) sit side by side downtown, about a 15-minute walk or roll apart.',
    steps: [
      "From elsewhere in the valley, take any route that stops at Bonneville Transit Center, downtown's main RTC bus station. These include the RED LINE, BHX, CX, DVX and routes 105, 106, 108, 113, 206, 207, 208, 214, 215 and 401.",
      'From the Strip, take the Deuce north. It runs along Las Vegas Boulevard 24 hours a day and ends downtown. The Deuce can cost more than other routes; see [Pay your bus fare](/guides/pay-your-fare).',
      'For the Arts District, get off the Deuce at Casino Center at Coolidge, in the middle of the district, or walk or roll about 10 minutes south from Bonneville Transit Center. For Fremont Street, stay on the Deuce past Bonneville Transit Center and get off at 4th Street at Fremont Street Experience, or walk or roll about 10 minutes north from Bonneville Transit Center. Route 108 also runs through the Arts District on Main Street and Commerce Street.',
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
      'Take Route 215 (Bonanza) along Bonanza Road. Going east, get off at Bonanza after 28th. Going west, get off at Bonanza after Wardelle. Both stops are within 0.1 mile of the library, a short walk or roll.',
      "Route 215 starts at Bonneville Transit Center, downtown's main RTC bus station. If you're on Route 110 (Eastern), change to Route 215 at Eastern Avenue and Bonanza Road.",
      'To head home, catch Route 215 from the stop across the street, going the other way. The library is a cool place to rest while you wait.',
    ],
    buttonRows: [{ placeName: 'East Las Vegas Library', lat: 36.1729, lng: -115.1105 }],
  },
  {
    anchor: 'craig-ranch-park',
    heading: 'Craig Ranch Regional Park, North Las Vegas',
    intro:
      'A large city park on Craig Road in North Las Vegas, with paths, playgrounds and an amphitheater.',
    steps: [
      'Take Route 219 (Craig Rd) along Craig Road and get off at Craig after Revere. There is a stop on each side of the road, and the park is about 0.1 mile away, a short walk or roll.',
      'From downtown, take Route 105 (Martin L. King) north from Bonneville Transit Center. Get off at Camino Al Norte after Craig and change to Route 219 going east.',
      'To head home, take the same routes going the other way, from the stops across the street.',
    ],
    buttonRows: [{ placeName: 'Craig Ranch Regional Park', lat: 36.2403, lng: -115.154 }],
  },
  {
    anchor: 'water-street-henderson',
    heading: 'Water Street District, Henderson',
    intro: 'Downtown Henderson, with shops and places to eat along Water Street.',
    steps: [
      'Take the BHX (Boulder Highway Express), which runs between Bonneville Transit Center downtown and Henderson along Boulder Highway. Only some BHX buses stop near Water Street: take a bus marked BHX-A and get off at Basic after Water. From there, walk or roll about 0.2 mile to Water Street.',
      'From elsewhere in the valley, change to the BHX at Bonneville Transit Center or at any BHX stop on Boulder Highway.',
      'To head home, catch the BHX at Basic after Texas, going west.',
    ],
    buttonRows: [{ placeName: 'Water Street District', lat: 36.0306, lng: -114.982 }],
  },
  {
    anchor: 'unlv',
    heading: 'UNLV campus',
    intro:
      'The University of Nevada, Las Vegas (UNLV) campus is on Maryland Parkway between Flamingo Road and Tropicana Avenue.',
    steps: [
      "Take the RED LINE, RTC's rapid bus along Maryland Parkway, and get off at University Road. Going north, the stop is Maryland after University Rd. Going south, it is Maryland before University Rd.",
      'Or take Route 201 (Tropicana) and get off at Tropicana after Maryland, at the south end of campus.',
      'From Maryland Parkway and University Road, walk or roll west into campus. The Student Union is about 3 minutes away.',
    ],
    buttonRows: [{ placeName: 'the UNLV campus', lat: 36.10605, lng: -115.1387 }],
  },
  {
    anchor: 'sunset-park',
    heading: 'Sunset Park',
    intro:
      'A large county park with shady picnic areas, a lake and paths, at Eastern Avenue and Sunset Road.',
    steps: [
      "Take Route 110 (Eastern). Going north, get off at Eastern at Sunset Park. Going south, get off at Eastern after Pama. Both stops are on the park's west side.",
      "Or take Route 212 (Sunset) along Sunset Road and get off at Eastern Avenue, at the park's northwest corner.",
      "To head home, catch the same route from the stop across the street, going the other way. Bring water, because the park's paths are long and some are in full sun. [Walk or roll in the heat](/guides/heat) has more tips.",
    ],
    buttonRows: [{ placeName: 'Sunset Park', lat: 36.06431, lng: -115.11359 }],
  },
  {
    anchor: 'allegiant-stadium',
    heading: 'Allegiant Stadium on Raiders game day',
    intro:
      'The Raiders play the Kansas City Chiefs at Allegiant Stadium on Sunday, October 4, at 1:25 pm, during the week.',
    steps: [
      "Take RTC's Game Day Express, RTC's special event bus service to stadium games. On Raiders home game days it runs from six casinos: Red Rock (Summerlin), Santa Fe Station (Centennial Hills), Aliante (North Las Vegas), Sam's Town (East Las Vegas), Green Valley Ranch (Henderson) and M Resort (West Henderson). A round trip costs $4. Buy it in the rideRTC, Transit or Uber app up to seven days ahead, or pay $4 when you board with a debit card, credit card, phone wallet or cash, and you get a pass for the ride back.",
      'For the 1:25 pm kickoff, the buses run from 10:30 am until 12:30 pm, an hour before kickoff. They drop you at the southeast corner of the stadium on Dean Martin Drive, next to Gate 11.',
      "After the game, buses leave from the same corner for up to 40 minutes after it ends. If you're heading to the Strip instead, walk or roll east over the Hacienda Avenue bridge to Las Vegas Boulevard, about 20 minutes, and catch the Deuce at Mandalay Bay.",
    ],
    buttonRows: [{ placeName: 'Allegiant Stadium', lat: 36.09074, lng: -115.18333 }],
    note: {
      heading: 'Getting there by wheelchair or walker',
      text: "The Hacienda Avenue bridge in step 3 is long and slopes up and down. If that's hard for you, take the Game Day Express back from the stadium instead.",
    },
  },
];
