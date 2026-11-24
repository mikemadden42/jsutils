const assert = require("assert");
const {
  formatBytes,
  formatUptime,
  getAvailableMem,
  summarizeCpus,
  printSysInfo,
} = require("../sysinfo");

// --- formatBytes ---

assert.strictEqual(formatBytes(0), "0 B");
assert.strictEqual(formatBytes(1), "1.00 B");
assert.strictEqual(formatBytes(1023), "1023.00 B");
assert.strictEqual(formatBytes(1024), "1.00 KB");
assert.strictEqual(formatBytes(1536), "1.50 KB");
assert.strictEqual(formatBytes(1024 ** 2), "1.00 MB");
assert.strictEqual(formatBytes(1024 ** 3 * 16), "16.00 GB");
assert.strictEqual(formatBytes(1024 ** 4), "1.00 TB");
// Past the largest unit, stay in TB rather than indexing off the end
assert.strictEqual(formatBytes(1024 ** 5), "1024.00 TB");

// Under 1 byte used to print "512.00 undefined"
assert.strictEqual(formatBytes(0.5), "0.50 B");

// Inputs that aren't byte counts are rejected
for (const bad of [-1, NaN, Infinity, -Infinity, "1024", undefined]) {
  assert.throws(() => formatBytes(bad), RangeError, `expected RangeError for ${String(bad)}`);
}

// --- formatUptime ---

assert.strictEqual(formatUptime(0), "0d 0h 0m");
assert.strictEqual(formatUptime(59), "0d 0h 0m");
assert.strictEqual(formatUptime(60), "0d 0h 1m");
assert.strictEqual(formatUptime(3600), "0d 1h 0m");
assert.strictEqual(formatUptime(86400), "1d 0h 0m");
assert.strictEqual(formatUptime(90061), "1d 1h 1m");
// os.uptime() can be fractional on some platforms
assert.strictEqual(formatUptime(90061.9), "1d 1h 1m");

// --- summarizeCpus ---

assert.strictEqual(summarizeCpus([]), "cpus: 0");

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

// Average is rounded to a whole MHz
assert.match(
  summarizeCpus([
    { model: "X", speed: 1000 },
    { model: "X", speed: 1001 },
  ]),
  /avg 1001 /,
);

// --- getAvailableMem (live system) ---

const mem = getAvailableMem();
assert.ok(Number.isFinite(mem.bytes) && mem.bytes > 0, `bad bytes: ${mem.bytes}`);
assert.ok(["available", "free"].includes(mem.label), `bad label: ${mem.label}`);

// --- printSysInfo smoke test (live system) ---

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

console.log("Sysinfo tests passed!");
