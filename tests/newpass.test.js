const assert = require("assert");
const { generatePassword } = require("../newpass");

// Test default length
const p1 = generatePassword({
  length: 12,
  includeLowercase: true,
  includeUppercase: true,
  includeNumbers: true,
  includeSymbols: true,
});
assert.strictEqual(p1.length, 12);

// Test custom length
const p2 = generatePassword({
  length: 20,
  includeLowercase: true,
  includeUppercase: true,
  includeNumbers: true,
  includeSymbols: true,
});
assert.strictEqual(p2.length, 20);

// Test inclusion of character types
const p3 = generatePassword({
  length: 4,
  includeLowercase: true,
  includeUppercase: true,
  includeNumbers: true,
  includeSymbols: true,
});
assert.strictEqual(p3.length, 4);
assert.match(p3, /[a-z]/);
assert.match(p3, /[A-Z]/);
assert.match(p3, /[0-9]/);
assert.match(p3, /[!@#$%^&*()-_+=[\]{}|;:,.<>?/~`]/);

console.log("Newpass tests passed!");
