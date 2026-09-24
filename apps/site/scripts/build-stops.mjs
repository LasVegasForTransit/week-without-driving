#!/usr/bin/env node
// Turns RTC's GTFS feed into the two small files the "Find a bus" finder on
// /go reads in the browser: public/data/stops.json (every stop a scheduled
// trip serves, with its name, position and routes) and
// public/data/routes.json (every route's short name, long name and color).
// Both files carry the feed's version, which the finder shows under its
// results as "Stop and route data from RTC (<version>)."
//
// RTC (the Regional Transportation Commission of Southern Nevada) publishes
// its schedule as a GTFS feed (General Transit Feed Specification): a zip of
// comma-separated text files describing stops, routes, trips and stop
// times. This script reads those files, keeps only the fields the finder
// needs, and writes them out as compact JSON. The files are checked in, so
// a build never depends on RTC's server; docs/operations/how-to/
// update-stop-data.md says when and how to refresh them.
//
// Usage (from apps/site):
//   pnpm stops                                   download RTC's current feed
//                                                 and rewrite public/data
//   node scripts/build-stops.mjs --source <dir>   read unzipped GTFS files
//                                                 from <dir> instead
//   node scripts/build-stops.mjs --out <dir>      write the JSON somewhere
//                                                 other than public/data
//
// Downloading needs `curl` and `unzip` on PATH (present on macOS and most
// Linux images) because Node has no built-in zip reader.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE_ROOT = join(__dirname, '..');

// RTC's "For Developers" page (https://www.rtcsnv.com/ways-to-travel/transit-services/for-developers/)
// links its published GTFS feed here.
const FEED_URL = 'https://developer.rtcsnv.com/transitData/google_transit.zip';

const REQUIRED_FILES = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt', 'feed_info.txt'];

const MIN_STOP_COUNT = 3000;
const EARLIEST_ACCEPTABLE_FEED_END_DATE = '2026-10-09';
const SIZE_BUDGET_BYTES = 300 * 1024; // 300 KB, gzip-compressed, both files together
const DEFAULT_ROUTE_COLOR = '#6B6E75';

function parseArgs(argv) {
  const args = { download: false, source: null, out: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--download') args.download = true;
    else if (arg === '--source') args.source = argv[++i];
    else if (arg === '--out') args.out = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

// A tiny RFC 4180 CSV line splitter. GTFS text files are plain
// comma-separated values; only route_desc in routes.txt quotes a field (it
// contains commas), so the common case (no quote in the line) takes a fast
// path and only routes.txt pays for the character-by-character scan.
function parseCsvLine(line) {
  if (!line.includes('"')) return line.split(',');
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && inQuotes && line[i + 1] === '"') {
      current += '"'; // an escaped quote ("") inside a quoted field
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ',' && !inQuotes) {
      fields.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  fields.push(current);
  return fields;
}

function splitLines(text) {
  // GTFS files may end with a trailing newline and may use CRLF.
  return text.split(/\r?\n/).filter((line) => line.length > 0);
}

// Parses a whole GTFS file into an array of plain objects keyed by header
// name. Used for the small files (routes, trips, feed_info); stop_times.txt
// is large enough (hundreds of thousands of rows) that it is scanned
// without allocating one object per row, in buildStopRouteIndex below.
function parseCsvFile(path) {
  const lines = splitLines(readFileSync(path, 'utf8'));
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    for (let column = 0; column < headers.length; column++) {
      row[headers[column]] = values[column] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function compareRouteShortNames(a, b) {
  const aIsNumeric = /^\d+$/.test(a);
  const bIsNumeric = /^\d+$/.test(b);
  if (aIsNumeric && bIsNumeric) return Number(a) - Number(b);
  if (aIsNumeric) return -1;
  if (bIsNumeric) return 1;
  return a.localeCompare(b);
}

function findSourceDir(source) {
  if (!existsSync(source)) {
    throw new Error(`GTFS source directory does not exist: ${source}.`);
  }
  return source;
}

function downloadAndExtractFeed() {
  const workDir = mkdtempSync(join(tmpdir(), 'lvwwd-gtfs-'));
  const zipPath = join(workDir, 'google_transit.zip');
  console.log(`Downloading RTC's GTFS feed from ${FEED_URL} ...`);
  const response = fetchSync(FEED_URL);
  writeFileSync(zipPath, response);
  const extractDir = join(workDir, 'extracted');
  mkdirSync(extractDir, { recursive: true });
  try {
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', extractDir]);
  } catch (error) {
    throw new Error(
      `Could not unzip the downloaded feed (is 'unzip' installed?): ${error.message}`,
      {
        cause: error,
      },
    );
  }
  return extractDir;
}

// A small synchronous wrapper so the rest of the script (and its error
// handling) does not need to be async. The feed is ~6 MB; buffering the
// whole download is fine for a script that runs a few times a year. curl
// is present on every platform this build runs on (macOS dev machines,
// Linux CI) and writes straight to a buffer without adding a dependency
// for a one-shot download.
function fetchSync(url) {
  return execFileSync('curl', ['-sSL', '--fail', url], { maxBuffer: 1024 * 1024 * 64 });
}

function assertRequiredFiles(dir) {
  const missing = REQUIRED_FILES.filter((name) => !existsSync(join(dir, name)));
  if (missing.length > 0) {
    throw new Error(`GTFS feed at ${dir} is missing required file(s): ${missing.join(', ')}`);
  }
}

function readFeedInfo(dir) {
  const rows = parseCsvFile(join(dir, 'feed_info.txt'));
  const row = rows[0];
  if (!row) throw new Error('feed_info.txt has no data row');
  return {
    feedVersion: row.feed_version?.trim(),
    feedEndDate: row.feed_end_date?.trim(), // YYYYMMDD
  };
}

function gtfsDateToIso(yyyymmdd) {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function readRoutes(dir) {
  const rows = parseCsvFile(join(dir, 'routes.txt'));
  const byId = new Map();
  const list = [];
  for (const row of rows) {
    const shortName = row.route_short_name?.trim();
    const longName = row.route_long_name?.trim() ?? '';
    const colorHex = row.route_color?.trim();
    const color = colorHex ? `#${colorHex.toUpperCase()}` : DEFAULT_ROUTE_COLOR;
    const route = { shortName, longName, color };
    byId.set(row.route_id, route);
    list.push(route);
  }
  list.sort((a, b) => compareRouteShortNames(a.shortName, b.shortName));
  return { byId, list };
}

function readTripRouteIndex(dir, routesById) {
  const rows = parseCsvFile(join(dir, 'trips.txt'));
  const tripIdToRouteShortName = new Map();
  for (const row of rows) {
    const route = routesById.get(row.route_id);
    if (route) tripIdToRouteShortName.set(row.trip_id, route.shortName);
  }
  return tripIdToRouteShortName;
}

// stop_times.txt is the largest file in the feed (hundreds of thousands of
// rows). This reads it once, column-index-based rather than building a
// keyed object per row, to keep the build step fast.
function buildStopRouteIndex(dir, tripIdToRouteShortName) {
  const text = readFileSync(join(dir, 'stop_times.txt'), 'utf8');
  const lines = splitLines(text);
  const headers = parseCsvLine(lines[0]);
  const tripIdColumn = headers.indexOf('trip_id');
  const stopIdColumn = headers.indexOf('stop_id');
  if (tripIdColumn === -1 || stopIdColumn === -1) {
    throw new Error('stop_times.txt is missing trip_id or stop_id');
  }
  const stopIdToRouteShortNames = new Map();
  for (let i = 1; i < lines.length; i++) {
    const fields = lines[i].includes('"') ? parseCsvLine(lines[i]) : lines[i].split(',');
    const tripId = fields[tripIdColumn];
    const stopId = fields[stopIdColumn];
    const shortName = tripIdToRouteShortName.get(tripId);
    if (!shortName) continue;
    let set = stopIdToRouteShortNames.get(stopId);
    if (!set) {
      set = new Set();
      stopIdToRouteShortNames.set(stopId, set);
    }
    set.add(shortName);
  }
  return stopIdToRouteShortNames;
}

function readStops(dir, stopIdToRouteShortNames) {
  const rows = parseCsvFile(join(dir, 'stops.txt'));
  const stops = [];
  for (const row of rows) {
    // Keep boarding points only (location_type empty or "0"), not station
    // entrances, generic stations or other GTFS location types.
    const locationType = row.location_type?.trim() ?? '';
    if (locationType !== '' && locationType !== '0') continue;
    const routeSet = stopIdToRouteShortNames.get(row.stop_id);
    if (!routeSet || routeSet.size === 0) continue; // no scheduled trip serves it
    const routes = [...routeSet].sort(compareRouteShortNames);
    stops.push({
      id: row.stop_id,
      name: row.stop_name.trim(),
      lat: Number(Number(row.stop_lat).toFixed(5)),
      lng: Number(Number(row.stop_lon).toFixed(5)),
      routes,
    });
  }
  return stops;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args.out ? args.out : join(SITE_ROOT, 'public', 'data');

  if (!args.download && !args.source) {
    throw new Error("Pass --download to fetch RTC's current feed, or --source <dir>.");
  }
  const sourceDir = args.source ? findSourceDir(args.source) : downloadAndExtractFeed();
  console.log(`Reading GTFS files from ${sourceDir}`);
  assertRequiredFiles(sourceDir);

  const { feedVersion, feedEndDate } = readFeedInfo(sourceDir);
  if (!feedVersion) throw new Error('feed_info.txt has no feed_version');
  if (!feedEndDate) throw new Error('feed_info.txt has no feed_end_date');
  const feedEndIso = gtfsDateToIso(feedEndDate);
  if (feedEndIso < EARLIEST_ACCEPTABLE_FEED_END_DATE) {
    throw new Error(
      `Feed ${feedVersion} ends ${feedEndIso}, before the campaign ends ` +
        `(${EARLIEST_ACCEPTABLE_FEED_END_DATE}). Get a newer feed from RTC before deploying.`,
    );
  }

  const { byId: routesById, list: routes } = readRoutes(sourceDir);
  const tripIdToRouteShortName = readTripRouteIndex(sourceDir, routesById);
  const stopIdToRouteShortNames = buildStopRouteIndex(sourceDir, tripIdToRouteShortName);
  const stops = readStops(sourceDir, stopIdToRouteShortNames);

  if (stops.length < MIN_STOP_COUNT) {
    throw new Error(
      `Only ${stops.length} stops found in feed ${feedVersion}; expected at least ${MIN_STOP_COUNT}. ` +
        'The feed may be truncated or malformed.',
    );
  }

  const builtAt = new Date().toISOString();
  const stopsFile = { feedVersion, builtAt, stops };
  const routesFile = { feedVersion, builtAt, routes };

  const stopsJson = JSON.stringify(stopsFile);
  const routesJson = JSON.stringify(routesFile);
  const compressedSize = gzipSync(stopsJson).byteLength + gzipSync(routesJson).byteLength;
  if (compressedSize >= SIZE_BUDGET_BYTES) {
    throw new Error(
      `stops.json + routes.json are ${compressedSize} bytes gzip-compressed, ` +
        `at or over the ${SIZE_BUDGET_BYTES}-byte budget. Trim fields before shipping.`,
    );
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'stops.json'), stopsJson);
  writeFileSync(join(outDir, 'routes.json'), routesJson);

  const stopsHash = createHash('sha256').update(stopsJson).digest('hex').slice(0, 12);
  console.log(`Feed version: ${feedVersion} (ends ${feedEndIso})`);
  console.log(`Stops: ${stops.length}, Routes: ${routes.length}`);
  console.log(
    `Compressed size: ${(compressedSize / 1024).toFixed(1)} KB of ${(SIZE_BUDGET_BYTES / 1024).toFixed(0)} KB budget`,
  );
  console.log(`Wrote ${join(outDir, 'stops.json')} (sha256 ${stopsHash}...) and routes.json`);
}

main();
