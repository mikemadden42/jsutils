const assert = require("assert");
const { daysBetween, getUTCMidnight } = require("../tenure");

// Test getUTCMidnight
const date = new Date("2023-05-15T10:00:00Z");
const midnight = getUTCMidnight(date);
assert.strictEqual(new Date(midnight).getUTCHours(), 0);
assert.strictEqual(new Date(midnight).getUTCMinutes(), 0);
assert.strictEqual(new Date(midnight).getUTCSeconds(), 0);

// Test daysBetween
const d1 = new Date("2023-01-01");
const d2 = new Date("2023-01-02");
assert.strictEqual(daysBetween(d1, d2), 1);

const d3 = new Date("2023-01-01");
const d4 = new Date("2023-01-01");
assert.strictEqual(daysBetween(d3, d4), 0);

console.log("Tenure tests passed!");
