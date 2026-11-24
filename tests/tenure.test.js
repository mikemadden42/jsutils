const { describe, test } = require("node:test");
const assert = require("node:assert");
const { daysBetween, getUTCMidnight, parseDate, describe: describeDate } = require("../tenure");

describe("getUTCMidnight", () => {
  test("zeroes out time-of-day", () => {
    const m = new Date(getUTCMidnight(new Date("2023-05-15T10:00:00Z")));
    assert.strictEqual(m.getUTCHours(), 0);
    assert.strictEqual(m.getUTCMinutes(), 0);
    assert.strictEqual(m.getUTCSeconds(), 0);
  });
});

describe("daysBetween", () => {
  const cases = [
    ["one day apart", "2023-01-01", "2023-01-02", 1],
    ["same day", "2023-01-01", "2023-01-01", 0],
    ["same calendar day, different times", "2023-01-01T00:00:00Z", "2023-01-01T23:59:59Z", 0],
    ["year/month boundary", "2023-12-31", "2024-01-02", 2],
    ["leap February (2024)", "2024-02-28", "2024-03-01", 2],
    ["non-leap February (2023)", "2023-02-28", "2023-03-01", 1],
    ["full leap year (2024)", "2024-01-01", "2025-01-01", 366],
  ];
  for (const [name, a, b, expected] of cases) {
    test(name, () => {
      assert.strictEqual(daysBetween(new Date(a), new Date(b)), expected);
    });
  }

  test("is symmetric", () => {
    const a = new Date("2020-07-06");
    const b = new Date("2024-03-15");
    assert.strictEqual(daysBetween(a, b), daysBetween(b, a));
  });
});

describe("parseDate", () => {
  test("accepts valid dates as UTC midnight", () => {
    assert.strictEqual(parseDate("2020-07-06").toISOString(), "2020-07-06T00:00:00.000Z");
    assert.strictEqual(parseDate("2024-02-29").toISOString(), "2024-02-29T00:00:00.000Z");
  });

  test("rejects bad formats", () => {
    for (const bad of ["2020-7-6", "20200706", "2020/07/06", "", "2020-07-06T00:00:00Z"]) {
      assert.throws(() => parseDate(bad), /Invalid date format/, `"${bad}"`);
    }
  });

  test("rejects impossible calendar dates", () => {
    // Date would silently roll these forward.
    for (const bad of ["2023-02-29", "2023-02-30", "2023-04-31", "2023-13-01", "2023-00-10"]) {
      assert.throws(() => parseDate(bad), /not a valid calendar date/, `"${bad}"`);
    }
  });
});

// "Today" is the user's LOCAL calendar day. Each case pins a timezone, then
// picks a `now` instant whose local date differs from its UTC date; a
// UTC-based "today" gets these wrong.
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

describe("describe (local-day handling)", () => {
  test("New York evening: UTC is already tomorrow", () => {
    inTZ("America/New_York", () => {
      // 2024-01-02T01:00Z is still Jan 1, 8 pm in New York.
      const now = new Date("2024-01-02T01:00:00Z");
      assert.strictEqual(now.getDate(), 1, "TZ override not applied");
      assert.deepStrictEqual(describeDate(parseDate("2024-01-01"), now), { verb: "since", days: 0 });
      assert.deepStrictEqual(describeDate(parseDate("2023-12-31"), now), { verb: "since", days: 1 });
      assert.deepStrictEqual(describeDate(parseDate("2024-01-02"), now), { verb: "until", days: 1 });
    });
  });

  test("Tokyo early morning: UTC is still yesterday", () => {
    inTZ("Asia/Tokyo", () => {
      // 2024-01-01T20:00Z is already Jan 2, 5 am in Tokyo.
      const now = new Date("2024-01-01T20:00:00Z");
      assert.strictEqual(now.getDate(), 2, "TZ override not applied");
      assert.deepStrictEqual(describeDate(parseDate("2024-01-01"), now), { verb: "since", days: 1 });
      assert.deepStrictEqual(describeDate(parseDate("2024-01-02"), now), { verb: "since", days: 0 });
    });
  });

  test("DST transitions keep whole-day counts", () => {
    inTZ("America/New_York", () => {
      // US spring-forward was 2024-03-10 (23-hour day), fall-back 2024-11-03 (25 hours).
      const afterSpring = new Date(2024, 2, 10, 23, 30); // local time
      assert.deepStrictEqual(describeDate(parseDate("2024-03-09"), afterSpring), { verb: "since", days: 1 });
      assert.deepStrictEqual(describeDate(parseDate("2024-03-11"), afterSpring), { verb: "until", days: 1 });

      const afterFall = new Date(2024, 10, 3, 23, 30); // local time
      assert.deepStrictEqual(describeDate(parseDate("2024-11-02"), afterFall), { verb: "since", days: 1 });
      assert.deepStrictEqual(describeDate(parseDate("2024-01-01"), afterFall), { verb: "since", days: 307 });
    });
  });
});
