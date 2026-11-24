#!/usr/bin/env node

"use strict";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_DATE = "2020-07-06";

function getUTCMidnight(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// The user's *local* calendar day, encoded as UTC midnight so it can be
// compared directly against dates from parseDate(). Using the UTC date here
// would put "today" a day ahead every evening west of UTC.
function localDayAsUTC(date) {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
}

// Symmetric by design: order of arguments doesn't matter.
const daysBetween = (d1, d2) =>
  Math.floor(Math.abs(getUTCMidnight(d1) - getUTCMidnight(d2)) / MS_PER_DAY);

// Parse a strict YYYY-MM-DD string into a Date at UTC midnight.
// Throws on bad format or impossible calendar dates.
function parseDate(input) {
  if (!DATE_RE.test(input)) {
    throw new Error("Invalid date format. Please use YYYY-MM-DD.");
  }
  const date = new Date(`${input}T00:00:00Z`);
  // The Date constructor rolls overflow dates forward (e.g. 2023-02-30 → Mar 2),
  // so check that the parsed components round-trip back to the input.
  if (isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== input) {
    throw new Error(`${input} is not a valid calendar date.`);
  }
  return date;
}

// Compare a parsed target date against the local calendar day of `now`.
function describe(target, now = new Date()) {
  const targetDay = getUTCMidnight(target);
  const today = localDayAsUTC(now);
  return {
    verb: targetDay > today ? "until" : "since",
    days: Math.abs(targetDay - today) / MS_PER_DAY,
  };
}

module.exports = { daysBetween, getUTCMidnight, localDayAsUTC, parseDate, describe };

if (require.main === module) {
  const input = process.argv[2] || DEFAULT_DATE;
  let target;
  try {
    target = parseDate(input);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
  const { verb, days } = describe(target);
  console.log(`Days ${verb} ${input}: ${days} days`);
}
