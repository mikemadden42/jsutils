#!/usr/bin/env node

"use strict";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

// Helper function to lock any date to midnight UTC
function getUTCMidnight(dateInput) {
  const d = new Date(dateInput);

  // Date.UTC() creates a pure timestamp, completely ignoring local timezones
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

const daysBetween = (d1, d2) => {
  const utc1 = getUTCMidnight(d1);
  const utc2 = getUTCMidnight(d2);

  // Because both are strict UTC midnights, this divides perfectly.
  // Math.floor is completely safe to use here.
  return Math.floor(Math.abs(utc1 - utc2) / MS_PER_DAY);
};

module.exports = { daysBetween, getUTCMidnight };

// Get the target date from arguments or use the default
if (require.main === module) {
  const inputDate = process.argv[2] || "2020-07-06";
  const targetDate = new Date(inputDate);

  if (isNaN(targetDate.getTime())) {
    console.error("Error: Invalid date format. Please use YYYY-MM-DD.");
    process.exit(1);
  }

  console.log(
    "Days since %s: %s days",
    inputDate,
    daysBetween(targetDate, new Date()),
  );
}
