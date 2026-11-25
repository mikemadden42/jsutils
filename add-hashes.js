#!/usr/bin/env node

"use strict";

// Port of shell-utils/add-hashes.sh: write a <name>.sha256 next to each
// archive in the current directory that doesn't have one yet, in the format
// `sha256sum` prints and `sha256sum -c` reads.

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream/promises");

// Expanded and sorted one pattern at a time, in this order, as the shell does
// with `for i in *.tar *.tgz *.txz *.zip`.
const EXTENSIONS = [".tar", ".tgz", ".txz", ".zip"];

// Like a shell glob: non-recursive, case-sensitive, and skipping dotfiles.
function findArchives(names) {
  const visible = names.filter((n) => !n.startsWith("."));
  return EXTENSIONS.flatMap((ext) =>
    visible.filter((n) => n.endsWith(ext)).sort(),
  );
}

// The line sha256sum writes for `file`. Like GNU coreutils, a name holding a
// backslash, newline or carriage return is escaped and the line marked with a
// leading backslash, so the result still reads back one entry per line.
function sumsLine(digest, file) {
  if (!/[\\\n\r]/.test(file)) return `${digest}  ${file}\n`;
  const escaped = file.replace(
    /[\\\n\r]/g,
    (c) => ({ "\\": "\\\\", "\n": "\\n", "\r": "\\r" })[c],
  );
  return `\\${digest}  ${escaped}\n`;
}

// Stream the file through SHA-256 so large archives aren't read into memory.
async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

const exists = (p) => {
  try {
    fs.statSync(p); // follows symlinks, like `[ -e ]`
    return true;
  } catch {
    return false;
  }
};

const isFile = (p) => {
  try {
    return fs.statSync(p).isFile(); // follows symlinks, like `[ -f ]`
  } catch {
    return false;
  }
};

// Hash every archive in `dir` that lacks a .sha256. Returns true if all
// succeeded. `log`/`warn` are injectable for tests.
async function addHashes(
  dir = process.cwd(),
  { log = console.log, warn = console.error } = {},
) {
  let ok = true;
  for (const name of findArchives(fs.readdirSync(dir))) {
    const file = path.join(dir, name);
    if (!exists(file)) continue; // e.g. a dangling symlink
    if (isFile(`${file}.sha256`)) continue;

    log(`Creating sha256 for '${name}'...`);

    // Hash first and write after, so a file that can't be read leaves no
    // empty .sha256 behind to be mistaken for a finished one on the next run.
    let digest;
    try {
      digest = await sha256File(file);
    } catch (error) {
      warn(`Error: cannot read ${name}: ${error.message}`);
      ok = false;
      continue;
    }

    try {
      fs.writeFileSync(`${file}.sha256`, sumsLine(digest, name));
    } catch (error) {
      warn(`Error: cannot write ${name}.sha256: ${error.message}`);
      ok = false;
    }
  }
  return ok;
}

module.exports = { EXTENSIONS, findArchives, sumsLine, sha256File, addHashes };

if (require.main === module) {
  addHashes().then(
    (ok) => {
      process.exitCode = ok ? 0 : 1;
    },
    (error) => {
      console.error(`Error: ${error.message}`);
      process.exitCode = 1;
    },
  );
}
