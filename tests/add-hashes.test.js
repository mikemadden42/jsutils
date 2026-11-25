const { describe, test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const {
  findArchives,
  sumsLine,
  sha256File,
  addHashes,
} = require("../add-hashes");

const SCRIPT = path.join(__dirname, "..", "add-hashes.js");

// Known SHA-256 digests.
const EMPTY =
  "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
const HELLO = // "hello\n"
  "5891b5b522d5df086d0ff0b110fbd9d21bb4fc7163af34d08286a2e846f6be03";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "add-hashes-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (name, content = "hello\n") =>
  fs.writeFileSync(path.join(dir, name), content);
const read = (name) => fs.readFileSync(path.join(dir, name), "utf8");
const has = (name) => fs.existsSync(path.join(dir, name));

// Run addHashes on `dir`, capturing log/warn output.
async function run() {
  const out = [];
  const err = [];
  const ok = await addHashes(dir, {
    log: (m) => out.push(m),
    warn: (m) => err.push(m),
  });
  return { ok, out, err };
}

describe("findArchives", () => {
  test("groups by extension in shell order, each group sorted", () => {
    assert.deepStrictEqual(
      findArchives(["b.zip", "a.zip", "c.tgz", "z.tar", "a.tar", "m.txz"]),
      ["a.tar", "z.tar", "c.tgz", "m.txz", "a.zip", "b.zip"],
    );
  });

  test("ignores other files, dotfiles and other letter case", () => {
    assert.deepStrictEqual(
      findArchives([
        "notes.txt",
        "a.tar.gz",
        "a.tar.sha256",
        ".hidden.zip",
        "UPPER.ZIP",
        "keep.zip",
      ]),
      ["keep.zip"],
    );
  });
});

describe("sumsLine", () => {
  test("matches sha256sum's text format", () => {
    assert.strictEqual(sumsLine(HELLO, "a.zip"), `${HELLO}  a.zip\n`);
  });

  test("keeps spaces and quotes as-is", () => {
    assert.strictEqual(
      sumsLine(HELLO, "my 'file'.zip"),
      `${HELLO}  my 'file'.zip\n`,
    );
  });

  test("escapes backslash, newline and CR with a leading backslash", () => {
    assert.strictEqual(
      sumsLine(HELLO, "a\\b\nc\rd.zip"),
      `\\${HELLO}  a\\\\b\\nc\\rd.zip\n`,
    );
  });
});

describe("sha256File", () => {
  test("hashes file contents", async () => {
    write("hello.tar");
    write("empty.tar", "");
    assert.strictEqual(await sha256File(path.join(dir, "hello.tar")), HELLO);
    assert.strictEqual(await sha256File(path.join(dir, "empty.tar")), EMPTY);
  });

  test("handles files larger than one stream chunk", async () => {
    const big = Buffer.alloc(1024 * 1024 + 7, 0x61);
    write("big.tar", big);
    const expected = require("node:crypto")
      .createHash("sha256")
      .update(big)
      .digest("hex");
    assert.strictEqual(await sha256File(path.join(dir, "big.tar")), expected);
  });
});

describe("addHashes", () => {
  test("writes a .sha256 next to each archive", async () => {
    write("a.tar");
    write("b.zip", "");
    const { ok, out, err } = await run();
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(err, []);
    assert.deepStrictEqual(out, [
      "Creating sha256 for 'a.tar'...",
      "Creating sha256 for 'b.zip'...",
    ]);
    assert.strictEqual(read("a.tar.sha256"), `${HELLO}  a.tar\n`);
    assert.strictEqual(read("b.zip.sha256"), `${EMPTY}  b.zip\n`);
  });

  test("leaves existing .sha256 files alone", async () => {
    write("a.tar");
    write("a.tar.sha256", "existing\n");
    const { ok, out } = await run();
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(out, []);
    assert.strictEqual(read("a.tar.sha256"), "existing\n");
  });

  test("is a no-op on a second run", async () => {
    write("a.tar");
    await run();
    const { out } = await run();
    assert.deepStrictEqual(out, []);
  });

  test("ignores non-archives", async () => {
    write("notes.txt");
    write(".hidden.zip");
    const { out } = await run();
    assert.deepStrictEqual(out, []);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), [
      ".hidden.zip",
      "notes.txt",
    ]);
  });

  test("an unreadable archive is reported, leaves no .sha256, and the rest still run", async () => {
    fs.mkdirSync(path.join(dir, "folder.tar")); // a directory can't be hashed
    write("good.zip");
    const { ok, out, err } = await run();
    assert.strictEqual(ok, false);
    assert.strictEqual(err.length, 1);
    assert.match(err[0], /^Error: cannot read folder\.tar: /);
    assert.strictEqual(has("folder.tar.sha256"), false);
    assert.deepStrictEqual(out, [
      "Creating sha256 for 'folder.tar'...",
      "Creating sha256 for 'good.zip'...",
    ]);
    assert.strictEqual(read("good.zip.sha256"), `${HELLO}  good.zip\n`);
  });

  test("skips a dangling symlink", async () => {
    fs.symlinkSync(path.join(dir, "missing"), path.join(dir, "broken.zip"));
    const { ok, out } = await run();
    assert.strictEqual(ok, true);
    assert.deepStrictEqual(out, []);
  });

  test("follows a symlink to a real archive", async () => {
    write("real.bin");
    fs.symlinkSync(path.join(dir, "real.bin"), path.join(dir, "link.zip"));
    await run();
    assert.strictEqual(read("link.zip.sha256"), `${HELLO}  link.zip\n`);
  });
});

describe("CLI", () => {
  const cli = () =>
    spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });

  test("hashes archives in the current directory", () => {
    write("a.tgz");
    const r = cli();
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "Creating sha256 for 'a.tgz'...\n");
    assert.strictEqual(read("a.tgz.sha256"), `${HELLO}  a.tgz\n`);
  });

  test("exits 1 when an archive can't be hashed", () => {
    fs.mkdirSync(path.join(dir, "folder.zip"));
    const r = cli();
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /cannot read folder\.zip/);
  });

  // Round-trip: the files we write must verify with the real tool.
  //
  // Check stdout/stderr, not just the exit code: macOS's sha256sum prints
  // "WARNING: 1 line is improperly formatted" for a line it can't parse but
  // still exits 0, which would make a broken line look like a pass.
  const version = (cmd) =>
    spawnSync(cmd, ["--version"], { encoding: "utf8" }).stdout ?? "";
  const anySum = version("sha256sum") ? "sha256sum" : null;
  // Escaped names (leading "\") are a GNU coreutils format; macOS's
  // sha256sum doesn't read them. Homebrew installs GNU as gsha256sum.
  const gnuSum = ["sha256sum", "gsha256sum"].find((c) =>
    version(c).includes("GNU coreutils"),
  );

  const verify = (cmd, f) => {
    const r = spawnSync(cmd, ["-c", `${f}.sha256`], {
      cwd: dir,
      encoding: "utf8",
    });
    const detail = `${cmd} -c ${f}.sha256: ${r.stdout}${r.stderr}`;
    assert.strictEqual(r.status, 0, detail);
    assert.match(r.stdout, /: OK$/m, detail);
    assert.doesNotMatch(r.stderr, /WARNING|improperly formatted/, detail);
  };

  test(
    "plain names verify with sha256sum -c",
    { skip: !anySum && "sha256sum not installed" },
    () => {
      write("plain.tar");
      write("with space.zip", "");
      assert.strictEqual(cli().status, 0);
      verify(anySum, "plain.tar");
      verify(anySum, "with space.zip");
    },
  );

  test(
    "escaped names verify with GNU sha256sum -c",
    { skip: !gnuSum && "GNU sha256sum not installed" },
    () => {
      write("back\\slash.txz", "x");
      assert.strictEqual(cli().status, 0);
      assert.match(read("back\\slash.txz.sha256"), /^\\/);
      verify(gnuSum, "back\\slash.txz");
    },
  );
});
