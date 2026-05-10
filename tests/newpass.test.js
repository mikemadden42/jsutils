const assert = require("assert");
const { generatePassword } = require("../newpass");

const ALL_ON = {
  includeLowercase: true,
  includeUppercase: true,
  includeNumbers: true,
  includeSymbols: true,
};

// Default length
const p1 = generatePassword({ length: 12, ...ALL_ON });
assert.strictEqual(p1.length, 12);

// Custom length
const p2 = generatePassword({ length: 20, ...ALL_ON });
assert.strictEqual(p2.length, 20);

// All classes present at minimum length
const p3 = generatePassword({ length: 4, ...ALL_ON });
assert.strictEqual(p3.length, 4);
assert.match(p3, /[a-z]/);
assert.match(p3, /[A-Z]/);
assert.match(p3, /[0-9]/);
assert.match(p3, /[!@#$%^&*()\-_+=[\]{}|;:,.<>?/~`]/);

// Exclusion: no symbols. Run many trials to catch positional regressions
// (e.g. a bug where only the guaranteed slots respect the exclusion).
for (let i = 0; i < 200; i++) {
  const p = generatePassword({ ...ALL_ON, length: 32, includeSymbols: false });
  assert.strictEqual(p.length, 32);
  assert.doesNotMatch(p, /[!@#$%^&*()\-_+=[\]{}|;:,.<>?/~`]/);
}

// Exclusion: no numbers
for (let i = 0; i < 200; i++) {
  const p = generatePassword({ ...ALL_ON, length: 32, includeNumbers: false });
  assert.doesNotMatch(p, /[0-9]/);
}

// Exclusion: no uppercase
for (let i = 0; i < 200; i++) {
  const p = generatePassword({ ...ALL_ON, length: 32, includeUppercase: false });
  assert.doesNotMatch(p, /[A-Z]/);
}

// Exclusion: no lowercase
for (let i = 0; i < 200; i++) {
  const p = generatePassword({ ...ALL_ON, length: 32, includeLowercase: false });
  assert.doesNotMatch(p, /[a-z]/);
}

// Single-class: lowercase only
const lonly = generatePassword({
  length: 16,
  includeLowercase: true,
  includeUppercase: false,
  includeNumbers: false,
  includeSymbols: false,
});
assert.match(lonly, /^[a-z]+$/);

// Empty selection throws
assert.throws(
  () =>
    generatePassword({
      length: 12,
      includeLowercase: false,
      includeUppercase: false,
      includeNumbers: false,
      includeSymbols: false,
    }),
  /No character sets selected/,
);

// Length below required class count throws (was silently bumped before)
assert.throws(
  () => generatePassword({ length: 3, ...ALL_ON }),
  /less than the number of required character classes/,
);

// Length above max throws
assert.throws(
  () => generatePassword({ length: 200, ...ALL_ON }),
  /exceeds maximum allowed length/,
);

console.log("Newpass tests passed!");
