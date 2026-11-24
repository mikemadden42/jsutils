const { describe, test } = require("node:test");
const assert = require("node:assert");
const { generatePassword, parseArgs, DEFAULT_OPTIONS } = require("../newpass");

// argv-style: parseArgs ignores args[0] and args[1] (node, script path).
const argv = (...rest) => ["node", "newpass.js", ...rest];

const ALL_ON = {
  includeLowercase: true,
  includeUppercase: true,
  includeNumbers: true,
  includeSymbols: true,
};

const SYMBOL_RE = /[!@#$%^&*()\-_+=[\]{}|;:,.<>?/~`]/;
const hasAllClasses = (p) =>
  /[a-z]/.test(p) && /[A-Z]/.test(p) && /[0-9]/.test(p) && SYMBOL_RE.test(p);

describe("generatePassword", () => {
  test("default length", () => {
    assert.strictEqual(generatePassword({ length: 12, ...ALL_ON }).length, 12);
  });

  test("custom length", () => {
    assert.strictEqual(generatePassword({ length: 20, ...ALL_ON }).length, 20);
  });

  test("all classes present at minimum length", () => {
    const p = generatePassword({ length: 4, ...ALL_ON });
    assert.strictEqual(p.length, 4);
    assert.match(p, /[a-z]/);
    assert.match(p, /[A-Z]/);
    assert.match(p, /[0-9]/);
    assert.match(p, SYMBOL_RE);
  });

  // Many trials per exclusion to catch positional regressions (e.g. a bug
  // where only the guaranteed slots respect the exclusion).
  const exclusions = [
    ["symbols", "includeSymbols", SYMBOL_RE],
    ["numbers", "includeNumbers", /[0-9]/],
    ["uppercase", "includeUppercase", /[A-Z]/],
    ["lowercase", "includeLowercase", /[a-z]/],
  ];
  for (const [name, key, re] of exclusions) {
    test(`excludes ${name}`, () => {
      for (let i = 0; i < 200; i++) {
        const p = generatePassword({ ...ALL_ON, length: 32, [key]: false });
        assert.strictEqual(p.length, 32);
        assert.doesNotMatch(p, re);
      }
    });
  }

  test("single class: lowercase only", () => {
    const p = generatePassword({
      length: 16,
      includeLowercase: true,
      includeUppercase: false,
      includeNumbers: false,
      includeSymbols: false,
    });
    assert.match(p, /^[a-z]+$/);
  });

  test("throws when no character sets are selected", () => {
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
  });

  test("throws when length is below the required class count", () => {
    assert.throws(
      () => generatePassword({ length: 3, ...ALL_ON }),
      /less than the number of required character classes/,
    );
  });

  test("throws when length exceeds the maximum", () => {
    assert.throws(
      () => generatePassword({ length: 200, ...ALL_ON }),
      /exceeds maximum allowed length/,
    );
  });
});

describe("generatePassword defaults (library callers)", () => {
  test("no arguments: default length, every class present", () => {
    const p = generatePassword();
    assert.strictEqual(p.length, DEFAULT_OPTIONS.length);
    assert.ok(hasAllClasses(p), `expected all classes in "${p}"`);
  });

  test("only length given: other classes default on", () => {
    const p = generatePassword({ length: 20 });
    assert.strictEqual(p.length, 20);
    assert.ok(hasAllClasses(p), `expected all classes in "${p}"`);
  });

  test("one class off, the rest default on", () => {
    for (let i = 0; i < 50; i++) {
      const p = generatePassword({ includeSymbols: false });
      assert.strictEqual(p.length, DEFAULT_OPTIONS.length);
      assert.doesNotMatch(p, SYMBOL_RE);
      assert.match(p, /[a-z]/);
      assert.match(p, /[A-Z]/);
      assert.match(p, /[0-9]/);
    }
  });

  test("explicit undefined falls back to the default", () => {
    assert.match(generatePassword({ length: 8, includeNumbers: undefined }), /[0-9]/);
  });

  test("defaults are frozen and the caller's object is not mutated", () => {
    assert.ok(Object.isFrozen(DEFAULT_OPTIONS));
    const callerOpts = { length: 16 };
    generatePassword(callerOpts);
    assert.deepStrictEqual(callerOpts, { length: 16 });
  });
});

describe("parseArgs", () => {
  test("defaults", () => {
    const o = parseArgs(argv());
    assert.strictEqual(o.length, 12);
    assert.strictEqual(o.includeLowercase, true);
    assert.strictEqual(o.includeUppercase, true);
    assert.strictEqual(o.includeNumbers, true);
    assert.strictEqual(o.includeSymbols, true);
    assert.strictEqual(o.quiet, false);
    assert.strictEqual(o.showHelp, false);
  });

  test("long and short forms set the same option", () => {
    assert.strictEqual(parseArgs(argv("-l", "20")).length, 20);
    assert.strictEqual(parseArgs(argv("--length", "20")).length, 20);
    assert.strictEqual(parseArgs(argv("-q")).quiet, true);
    assert.strictEqual(parseArgs(argv("--quiet")).quiet, true);
    assert.strictEqual(parseArgs(argv("-n")).includeNumbers, false);
    assert.strictEqual(parseArgs(argv("-s")).includeSymbols, false);
    assert.strictEqual(parseArgs(argv("-u")).includeUppercase, false);
    assert.strictEqual(parseArgs(argv("-L")).includeLowercase, false);
    assert.strictEqual(parseArgs(argv("--no-lowercase")).includeLowercase, false);
    assert.strictEqual(parseArgs(argv("-h")).showHelp, true);
  });

  test("strict integer parsing rejects trailing garbage", () => {
    for (const bad of ["12foo", "", "-5", "1.5"]) {
      assert.throws(() => parseArgs(argv("-l", bad)), /Must be an integer/, `"${bad}"`);
    }
  });

  test("--length without a value", () => {
    assert.throws(() => parseArgs(argv("-l")), /requires a number/);
  });

  test("length out of range", () => {
    assert.throws(() => parseArgs(argv("-l", "0")), /out of range/);
    assert.throws(() => parseArgs(argv("-l", "129")), /out of range/);
  });

  test("length boundaries accepted", () => {
    assert.strictEqual(parseArgs(argv("-l", "1")).length, 1);
    assert.strictEqual(parseArgs(argv("-l", "128")).length, 128);
  });

  test("unknown option rejected", () => {
    assert.throws(() => parseArgs(argv("--lenght", "20")), /Unknown option/);
    // -w was renamed to -L; the old letter is intentionally not kept.
    assert.throws(() => parseArgs(argv("-w")), /Unknown option/);
  });
});
