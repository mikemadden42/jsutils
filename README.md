# JS Utils

A collection of useful JavaScript CLI utilities.

**Requires Node.js 22 or newer, or Bun.** CI runs everything under both.

To run the npm scripts under Bun instead of Node, use `bun --bun run <script>`
(plain `bun run` still invokes `node` for scripts that call it).

## Utilities

### 1. Password Generator (`newpass.js`)

Generates a secure, random password using `crypto.randomInt`.

**Usage:**

```bash
npm run newpass -- [options]
# OR
node newpass.js [options]
```

**Options:**

- `-l, --length <number>`: Password length (1-128, default: 12; must be >= number of included character classes)
- `-n, --no-numbers`: Exclude numbers
- `-s, --no-symbols`: Exclude symbols
- `-u, --no-uppercase`: Exclude uppercase letters
- `-L, --no-lowercase`: Exclude lowercase letters
- `-q, --quiet`: Print only the password (suitable for piping)
- `-h, --help`: Display help

### 2. System Info (`sysinfo.js`)

Displays information about the current system, including Node.js version, OS details, memory, network interfaces, and CPU info.

**Usage:**

```bash
npm run sysinfo
# OR
node sysinfo.js
```

### 3. Tenure Calculator (`tenure.js`)

Calculates the number of days between a given date and today.

**Usage:**

```bash
npm run tenure -- <YYYY-MM-DD>
# OR
node tenure.js <YYYY-MM-DD>
```

_The date is required; run with no arguments or `-h` to see usage._

### 4. Recent Earthquakes (`quakes.js`)

Prints every seismic event (earthquakes, quarry blasts, ...) from the past day using the
[USGS GeoJSON feed](https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php),
one per line: UTC time, event type, magnitude, place, and depth (km). Missing
values print as `n/a`. Needs network access; times out after 10 seconds.

**Usage:**

```bash
npm run quakes
# OR
node quakes.js
```

### 5. Archive Checksums (`add-hashes.js`)

Writes a `<name>.sha256` file next to each `.tar`, `.tgz`, `.txz` and `.zip`
in the current directory that doesn't already have one. The files use the
format `sha256sum` writes, so `sha256sum -c file.zip.sha256` verifies them.
Existing `.sha256` files are left alone, so it's safe to re-run.

A name containing a backslash or newline is written in GNU's escaped form,
which macOS's built-in `sha256sum` can't read; use GNU `sha256sum`
(`gsha256sum` from Homebrew coreutils) to verify those.

It works on the directory you run it from, so there's no npm script for it.

**Usage:**

```bash
cd ~/Downloads
node ~/src/jsutils/add-hashes.js
```

### 6. Claude Code Release Channels (`claude-code-versions.js`)

Prints the Claude Code version each release channel currently points at,
looked up from the public release bucket. With no arguments it checks
`stable` and `latest`. Lookups run in parallel and print in argument order.
An unknown or invalid channel prints an error to stderr and makes the exit
status 1, but the remaining channels are still shown.

Set `CLAUDE_CODE_RELEASES_BASE_URL` to use a different bucket or a mirror.

**Usage:**

```bash
npm run claude-code-versions -- [CHANNEL...]
# OR
node claude-code-versions.js [CHANNEL...]
```

```text
$ node claude-code-versions.js
stable   2.1.326
latest   2.1.332
```

## Development

### Run all utilities

```bash
npm run run-all
```

### Check formatting

Formatting uses `bun fmt` with its defaults; CI runs the check.

```bash
bun fmt --check   # report files that need formatting
bun fmt           # fix them
```

### Run tests

Tests use the built-in `node:test` module, so there are no dependencies.

```bash
npm test           # Node: node --test
bun run test:bun   # Bun: bun test
```
