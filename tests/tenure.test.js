const assert = require("assert");
const { daysBetween, getUTCMidnight } = require("../tenure");

// getUTCMidnight zeroes out time-of-day
const date = new Date("2023-05-15T10:00:00Z");
const midnight = getUTCMidnight(date);
assert.strictEqual(new Date(midnight).getUTCHours(), 0);
assert.strictEqual(new Date(midnight).getUTCMinutes(), 0);
assert.strictEqual(new Date(midnight).getUTCSeconds(), 0);

// One day apart
assert.strictEqual(
  daysBetween(new Date("2023-01-01"), new Date("2023-01-02")),
  1,
);

// Same day
assert.strictEqual(
  daysBetween(new Date("2023-01-01"), new Date("2023-01-01")),
  0,
);

// Same calendar day, different times — should still be 0
assert.strictEqual(
  daysBetween(
    new Date("2023-01-01T00:00:00Z"),
    new Date("2023-01-01T23:59:59Z"),
  ),
  0,
);

// Symmetry: order of arguments must not matter
const a = new Date("2020-07-06");
const b = new Date("2024-03-15");
assert.strictEqual(daysBetween(a, b), daysBetween(b, a));

// Year/month boundary
assert.strictEqual(
  daysBetween(new Date("2023-12-31"), new Date("2024-01-02")),
  2,
);

// Leap year: Feb has 29 days in 2024
assert.strictEqual(
  daysBetween(new Date("2024-02-28"), new Date("2024-03-01")),
  2,
);

// Non-leap year: Feb has 28 days in 2023
assert.strictEqual(
  daysBetween(new Date("2023-02-28"), new Date("2023-03-01")),
  1,
);

// DST-spanning span (US "spring forward" 2024-03-10, "fall back" 2024-11-03).
// In any timezone, the UTC-anchored count must be 365 days for 2024.
assert.strictEqual(
  daysBetween(new Date("2024-01-01"), new Date("2025-01-01")),
  366, // 2024 is a leap year
);
assert.strictEqual(
  daysBetween(new Date("2023-03-09"), new Date("2023-03-13")),
  4,
);

console.log("Tenure tests passed!");
