#!/usr/bin/env node

"use strict";

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function getUTCMidnight(date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

// Symmetric by design: order of arguments doesn't matter.
const daysBetween = (d1, d2) =>
  Math.floor(Math.abs(getUTCMidnight(d1) - getUTCMidnight(d2)) / MS_PER_DAY);

module.exports = { daysBetween, getUTCMidnight };

if (require.main === module) {
  const inputDate = process.argv[2] || "2020-07-06";

  if (!DATE_RE.test(inputDate)) {
    console.error("Error: Invalid date format. Please use YYYY-MM-DD.");
    process.exit(1);
  }

  const targetDate = new Date(`${inputDate}T00:00:00Z`);
  // The Date constructor rolls overflow dates forward (e.g. 2023-02-30 → Mar 2),
  // so check that the parsed components round-trip back to the input.
  if (
    isNaN(targetDate.getTime()) ||
    targetDate.toISOString().slice(0, 10) !== inputDate
  ) {
    console.error(`Error: ${inputDate} is not a valid calendar date.`);
    process.exit(1);
  }

  const now = new Date();
  const verb = getUTCMidnight(targetDate) > getUTCMidnight(now) ? "until" : "since";
  console.log(`Days ${verb} ${inputDate}: ${daysBetween(targetDate, now)} days`);
}
