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

// Test it out with your original date and "today"
console.log("diff: %s days", daysBetween("2020-07-06", new Date()));
