const { describe, test } = require("node:test");
const assert = require("node:assert");
const {
  FEED_URL,
  formatTime,
  formatQuake,
  fetchQuakes,
  describeError,
} = require("../quakes");

// Shaped like a real feature from the USGS all_day feed (trimmed).
const feature = (overrides = {}) => ({
  type: "Feature",
  properties: {
    mag: 2.03,
    place: "5 km SSW of Pāhala, Hawaii",
    time: 1795609386540,
    type: "earthquake",
    ...overrides,
  },
  geometry: {
    type: "Point",
    coordinates: [-155.494171142578, 19.1555004119873, 32.75],
  },
});

// Minimal stand-in for a fetch Response.
const fakeFetch = (body, { ok = true, status = 200 } = {}) => {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    return { ok, status, json: async () => body };
  };
  return { impl, calls };
};

describe("formatTime", () => {
  test("formats epoch ms as UTC, truncating milliseconds", () => {
    assert.strictEqual(formatTime(1795609386540), "2026-11-25 12:23:06");
    assert.strictEqual(formatTime(0), "1970-01-01 00:00:00");
    assert.strictEqual(formatTime(999), "1970-01-01 00:00:00");
  });
});

describe("formatQuake", () => {
  test("prints date, type, magnitude, place and depth", () => {
    assert.strictEqual(
      formatQuake(feature()),
      "2026-11-25 12:23:06 earthquake 2.03 5 km SSW of Pāhala, Hawaii 32.75",
    );
  });

  test("keeps non-earthquake event types", () => {
    assert.match(
      formatQuake(feature({ type: "quarry blast" })),
      / quarry blast /,
    );
  });

  test("shows missing values as n/a", () => {
    assert.strictEqual(
      formatQuake(feature({ mag: null, place: null })),
      "2026-11-25 12:23:06 earthquake n/a n/a 32.75",
    );
    const noGeometry = { ...feature(), geometry: null };
    assert.match(formatQuake(noGeometry), / n\/a$/);
  });

  test("keeps a magnitude of 0 (not treated as missing)", () => {
    assert.match(formatQuake(feature({ mag: 0 })), / earthquake 0 /);
  });
});

describe("fetchQuakes", () => {
  test("returns the features from the default feed URL", async () => {
    const { impl, calls } = fakeFetch({ features: [feature(), feature()] });
    const features = await fetchQuakes({ fetchImpl: impl });
    assert.strictEqual(features.length, 2);
    assert.strictEqual(calls[0].url, FEED_URL);
    assert.ok(calls[0].init.signal instanceof AbortSignal);
  });

  test("throws on a non-2xx response", async () => {
    const { impl } = fakeFetch({}, { ok: false, status: 503 });
    await assert.rejects(fetchQuakes({ fetchImpl: impl }), /HTTP 503/);
  });

  test("throws when the response has no features array", async () => {
    const { impl } = fakeFetch({ type: "FeatureCollection" });
    await assert.rejects(fetchQuakes({ fetchImpl: impl }), /no features/);
  });

  test("times out a request that never answers", async () => {
    // AbortSignal.timeout() uses an unref'd timer, so on its own it won't
    // keep the event loop alive; Node 22's test runner then cancels the
    // test before the timeout fires. A real request holds an open socket,
    // so stand in for it with a ref'd timer until the abort arrives.
    const hang = (url, { signal }) =>
      new Promise((_, reject) => {
        const socket = setInterval(() => {}, 1000);
        signal.addEventListener("abort", () => {
          clearInterval(socket);
          reject(signal.reason);
        });
      });
    await assert.rejects(
      fetchQuakes({ fetchImpl: hang, timeoutMs: 20 }),
      (err) => err.name === "TimeoutError",
    );
  });
});

describe("describeError", () => {
  test("includes Node's error.cause detail", () => {
    const err = new TypeError("fetch failed", {
      cause: new Error("getaddrinfo ENOTFOUND example.invalid"),
    });
    assert.strictEqual(
      describeError(err),
      "fetch failed: getaddrinfo ENOTFOUND example.invalid",
    );
  });

  test("uses the message alone when there is no extra cause", () => {
    assert.strictEqual(describeError(new Error("HTTP 503")), "HTTP 503");
  });

  test("reports timeouts in seconds", () => {
    const err = new DOMException("aborted", "TimeoutError");
    assert.strictEqual(describeError(err), "request timed out after 10s");
  });
});
