const assert = require("assert");
const { daysBetween, getUTCMidnight, parseDate, describe } = require("../tenure");

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

// Full leap year: 2024 has 366 days.
assert.strictEqual(
  daysBetween(new Date("2024-01-01"), new Date("2025-01-01")),
  366,
);

// --- parseDate ---

assert.strictEqual(parseDate("2020-07-06").toISOString(), "2020-07-06T00:00:00.000Z");
assert.strictEqual(parseDate("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");

// Bad format
for (const bad of ["2020-7-6", "20200706", "2020/07/06", "", "2020-07-06T00:00:00Z"]) {
  assert.throws(() => parseDate(bad), /Invalid date format/, `expected format error for "${bad}"`);
}

// Impossible calendar dates (Date would silently roll these forward)
for (const bad of ["2023-02-29", "2023-02-30", "2023-04-31", "2023-13-01", "2023-00-10"]) {
  assert.throws(() => parseDate(bad), /not a valid calendar date/, `expected calendar error for "${bad}"`);
}

// --- describe: "today" is the user's LOCAL calendar day ---
//
// Each case pins a timezone, then picks a `now` instant whose local date
// differs from its UTC date. A UTC-based "today" gets these wrong.
function inTZ(tz, fn) {
  const saved = process.env.TZ;
  process.env.TZ = tz;
  try {
    fn();
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
}

inTZ("America/New_York", () => {
  // 2024-01-02T01:00Z is still Jan 1, 8 pm in New York.
  const now = new Date("2024-01-02T01:00:00Z");
  assert.strictEqual(now.getDate(), 1, "TZ override not applied");
  assert.deepStrictEqual(describe(parseDate("2024-01-01"), now), { verb: "since", days: 0 });
  assert.deepStrictEqual(describe(parseDate("2023-12-31"), now), { verb: "since", days: 1 });
  // Jan 2 is tomorrow locally, even though it's already Jan 2 in UTC.
  assert.deepStrictEqual(describe(parseDate("2024-01-02"), now), { verb: "until", days: 1 });
});

inTZ("Asia/Tokyo", () => {
  // 2024-01-01T20:00Z is already Jan 2, 5 am in Tokyo.
  const now = new Date("2024-01-01T20:00:00Z");
  assert.strictEqual(now.getDate(), 2, "TZ override not applied");
  assert.deepStrictEqual(describe(parseDate("2024-01-01"), now), { verb: "since", days: 1 });
  assert.deepStrictEqual(describe(parseDate("2024-01-02"), now), { verb: "since", days: 0 });
});

inTZ("America/New_York", () => {
  // DST: US spring-forward was 2024-03-10 (a 23-hour local day) and
  // fall-back was 2024-11-03 (25 hours). Counts must stay whole days.
  const afterSpring = new Date(2024, 2, 10, 23, 30); // local time
  assert.deepStrictEqual(describe(parseDate("2024-03-09"), afterSpring), { verb: "since", days: 1 });
  assert.deepStrictEqual(describe(parseDate("2024-03-11"), afterSpring), { verb: "until", days: 1 });

  const afterFall = new Date(2024, 10, 3, 23, 30); // local time
  assert.deepStrictEqual(describe(parseDate("2024-11-02"), afterFall), { verb: "since", days: 1 });
  assert.deepStrictEqual(describe(parseDate("2024-01-01"), afterFall), { verb: "since", days: 307 });
});

console.log("Tenure tests passed!");
