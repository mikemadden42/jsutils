const { describe, test } = require("node:test");
const assert = require("node:assert");
const {
  formatBytes,
  formatUptime,
  getAvailableMem,
  summarizeCpus,
  printSysInfo,
} = require("../sysinfo");

describe("formatBytes", () => {
  const cases = [
    [0, "0 B"],
    [1, "1.00 B"],
    [1023, "1023.00 B"],
    [1024, "1.00 KB"],
    [1536, "1.50 KB"],
    [1024 ** 2, "1.00 MB"],
    [1024 ** 3 * 16, "16.00 GB"],
    [1024 ** 4, "1.00 TB"],
    // Past the largest unit, stay in TB rather than indexing off the end
    [1024 ** 5, "1024.00 TB"],
    // Under 1 byte used to print "512.00 undefined"
    [0.5, "0.50 B"],
  ];
  for (const [input, expected] of cases) {
    test(`${input} → ${expected}`, () => {
      assert.strictEqual(formatBytes(input), expected);
    });
  }

  test("rejects inputs that aren't byte counts", () => {
    for (const bad of [-1, NaN, Infinity, -Infinity, "1024", undefined]) {
      assert.throws(() => formatBytes(bad), RangeError, String(bad));
    }
  });
});

describe("formatUptime", () => {
  const cases = [
    [0, "0d 0h 0m"],
    [59, "0d 0h 0m"],
    [60, "0d 0h 1m"],
    [3600, "0d 1h 0m"],
    [86400, "1d 0h 0m"],
    [90061, "1d 1h 1m"],
    // os.uptime() can be fractional on some platforms
    [90061.9, "1d 1h 1m"],
  ];
  for (const [input, expected] of cases) {
    test(`${input}s → ${expected}`, () => {
      assert.strictEqual(formatUptime(input), expected);
    });
  }
});

describe("summarizeCpus", () => {
  test("empty list", () => {
    assert.strictEqual(summarizeCpus([]), "cpus: 0");
  });

  test("groups by model with min/avg/max", () => {
    assert.strictEqual(
      summarizeCpus([
        { model: "Fast", speed: 3000 },
        { model: "Fast", speed: 3200 },
        { model: "Fast", speed: 3100 },
        { model: "Slow", speed: 1000 },
      ]),
      [
        "cpus: 4",
        "  3× Fast (min 3000 / avg 3100 / max 3200 MHz)",
        "  1× Slow (min 1000 / avg 1000 / max 1000 MHz)",
      ].join("\n"),
    );
  });

  test("rounds the average to a whole MHz", () => {
    assert.match(
      summarizeCpus([
        { model: "X", speed: 1000 },
        { model: "X", speed: 1001 },
      ]),
      /avg 1001 /,
    );
  });
});

describe("live system", () => {
  test("getAvailableMem returns a positive byte count and known label", () => {
    const mem = getAvailableMem();
    assert.ok(Number.isFinite(mem.bytes) && mem.bytes > 0, `bad bytes: ${mem.bytes}`);
    assert.ok(["available", "free"].includes(mem.label), `bad label: ${mem.label}`);
  });

  test("printSysInfo prints a clean report", () => {
    const lines = [];
    const origLog = console.log;
    console.log = (...args) => lines.push(args.join(" "));
    try {
      printSysInfo();
    } finally {
      console.log = origLog;
    }
    const out = lines.join("\n");
    assert.match(out, /^runtime: (node|bun) /m);
    assert.match(out, /^totalmem: \d/m);
    assert.match(out, /^cpus: \d+/m);
    assert.doesNotMatch(out, /undefined|NaN/, "output contains undefined/NaN");
  });
});
