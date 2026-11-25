#!/usr/bin/env node

"use strict";

// Port of pyutils/src/quakes.py: print the past day's earthquakes from the
// USGS GeoJSON summary feed, one line per event.

const FEED_URL =
  "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson";
const TIMEOUT_MS = 10_000;

// Missing values (the feed sometimes has a null magnitude) print as "n/a".
const show = (value) => (value === null || value === undefined ? "n/a" : value);

// Epoch milliseconds → "YYYY-MM-DD HH:MM:SS" in UTC.
function formatTime(ms) {
  return new Date(ms).toISOString().slice(0, 19).replace("T", " ");
}

// One feature → "date type mag place depth", matching the Python output.
function formatQuake(feature) {
  const { time, type, mag, place } = feature.properties;
  const depth = feature.geometry?.coordinates?.[2];
  return [formatTime(time), type, show(mag), show(place), show(depth)].join(
    " ",
  );
}

// Fetch the feed and return its features. `fetchImpl` is injectable for tests.
async function fetchQuakes({
  url = FEED_URL,
  timeoutMs = TIMEOUT_MS,
  fetchImpl = fetch,
} = {}) {
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) {
    throw new Error(`USGS feed returned HTTP ${res.status}`);
  }
  const data = await res.json();
  if (!Array.isArray(data?.features)) {
    throw new Error("USGS feed response has no features array");
  }
  return data.features;
}

// Node's fetch reports network failures as a bare "fetch failed" and puts the
// real reason (e.g. "getaddrinfo ENOTFOUND ...") in error.cause.
function describeError(error) {
  if (error.name === "TimeoutError") {
    return `request timed out after ${TIMEOUT_MS / 1000}s`;
  }
  const cause = error.cause?.message;
  return cause && cause !== error.message
    ? `${error.message}: ${cause}`
    : error.message;
}

async function main() {
  try {
    for (const feature of await fetchQuakes()) {
      console.log(formatQuake(feature));
    }
  } catch (error) {
    console.error(`Error: ${describeError(error)}`);
    process.exit(1);
  }
}

module.exports = {
  FEED_URL,
  formatTime,
  formatQuake,
  fetchQuakes,
  describeError,
};

if (require.main === module) {
  main();
}
