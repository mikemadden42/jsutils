# TODO

Findings from a project review (2026-11-24). Ordered most important first.

## Real issues

- [ ] **`tenure.js` counts against UTC "today", not local today.**
  `tenure.js:37-39` compares the target date to UTC midnight of `now`. West of
  UTC, the count is one day too high every evening (e.g. 8 pm in New York is
  already tomorrow in UTC). With `TZ=America/New_York`,
  `daysBetween(Jan 1 22:00, Jan 2 01:00)` returns `0`. Fix: build "today" from
  local date parts:
  ```js
  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  ```

- [ ] **`tenure.js` date validation has no tests.**
  The format regex, the round-trip check that rejects dates like `2023-02-30`,
  and the "until"/"since" choice all live inside the `require.main` block
  (`tenure.js:19-39`), so tests can't reach them. Move them into an exported
  `parseDate(str)` (and maybe `describe(target, now)`) and test those. Do this
  together with the timezone fix above so the fix is testable.

- [ ] **Misleading comment and ineffective DST tests in `tests/tenure.test.js:55-59`.**
  The comment says "must be 365 days for 2024" but the assertion is `366`.
  The DST tests also don't exercise DST: `new Date("YYYY-MM-DD")` parses as
  UTC, which has no DST. Construct dates in local time and run the tests under
  a fixed `TZ` to actually cover the timezone risk.

## Minor

- [ ] **Add tests for `sysinfo.js`.** `formatBytes`, `formatUptime` and
  `summarizeCpus` are exported but untested. Edge case: `formatBytes(0.5)`
  returns `"512.00 undefined"` because the unit index goes negative. Clamp with
  `Math.max(0, …)` or treat `bytes < 1` as bytes.

- [ ] **Give `generatePassword` defaults for library callers.**
  `generatePassword({ length: 12 })` throws "No character sets selected"
  because missing `include*` flags count as false. Merge in defaults as
  `parseArgs` does.

- [ ] **Consider moving tests to `node:test`.** Tests are plain assert scripts
  chained with `&&`, so the first failure stops everything and output is just a
  stack trace. `node:test` is built into every supported Node version; `node --test tests/` gives
  per-case output with no new dependencies.

- [ ] **Harden CI.** Add `permissions: { contents: read }` to the workflow.
  `npm ci` and the npm cache have nothing to install (no dependencies) and could
  be dropped, though they do no harm.

- [ ] **Reconsider the hardcoded default date in `tenure.js:19`.** `2020-07-06`
  is surprising for anyone else; showing usage when no argument is given might
  be clearer.

- [ ] **Rename `-w` (`--no-lowercase`).** Hard-to-guess letter; `-L` might be
  easier to remember. Cosmetic.

## Reviewed and fine as is

- The length check in both `parseArgs` and `generatePassword` is intentional:
  one validates CLI input, the other guards direct library calls.
- File modes are 755 with shebangs, `"private": true`, and the Node engine
  floor matches CI.
