const {
  describe,
  test,
  beforeEach,
  afterEach,
  before,
  after,
} = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const {
  selectTarget,
  detectHost,
  versionOf,
  pickAsset,
  parseShasums,
  apiHeaders,
  isAllowedUrl,
  download,
  main,
} = require("../download-bun");

const SCRIPT = path.join(__dirname, "..", "download-bun.js");

// Non-profile .zip assets published in bun-v1.4.5.
const RELEASED = new Set([
  "bun-darwin-aarch64.zip",
  "bun-darwin-x64-baseline.zip",
  "bun-darwin-x64.zip",
  "bun-freebsd-aarch64.zip",
  "bun-freebsd-x64-baseline.zip",
  "bun-freebsd-x64.zip",
  "bun-linux-aarch64-android.zip",
  "bun-linux-aarch64-musl.zip",
  "bun-linux-aarch64.zip",
  "bun-linux-x64-android-baseline.zip",
  "bun-linux-x64-android.zip",
  "bun-linux-x64-baseline.zip",
  "bun-linux-x64-musl-baseline.zip",
  "bun-linux-x64-musl.zip",
  "bun-linux-x64.zip",
  "bun-windows-aarch64.zip",
  "bun-windows-x64-baseline.zip",
  "bun-windows-x64.zip",
]);

const host = (o) => ({ musl: false, avx2: true, rosetta: false, ...o });
const sha256 = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

describe("selectTarget", () => {
  const cases = [
    [{ platform: "darwin", arch: "arm64" }, "darwin-aarch64"],
    [{ platform: "darwin", arch: "x64" }, "darwin-x64"],
    [{ platform: "darwin", arch: "x64", avx2: false }, "darwin-x64-baseline"],
    // x64 process under Rosetta 2 → native arm64 build (and AVX2 is moot)
    [
      { platform: "darwin", arch: "x64", rosetta: true, avx2: false },
      "darwin-aarch64",
    ],
    [{ platform: "linux", arch: "x64" }, "linux-x64"],
    [{ platform: "linux", arch: "x64", avx2: false }, "linux-x64-baseline"],
    [{ platform: "linux", arch: "x64", musl: true }, "linux-x64-musl"],
    [
      { platform: "linux", arch: "x64", musl: true, avx2: false },
      "linux-x64-musl-baseline",
    ],
    [{ platform: "linux", arch: "arm64" }, "linux-aarch64"],
    [{ platform: "linux", arch: "arm64", musl: true }, "linux-aarch64-musl"],
    // aarch64 has no baseline build; AVX2 only matters on x64
    [{ platform: "linux", arch: "arm64", avx2: false }, "linux-aarch64"],
    [{ platform: "android", arch: "arm64" }, "linux-aarch64-android"],
    [{ platform: "android", arch: "x64" }, "linux-x64-android"],
    [
      { platform: "android", arch: "x64", avx2: false },
      "linux-x64-android-baseline",
    ],
    // musl only means something on Linux
    [{ platform: "darwin", arch: "arm64", musl: true }, "darwin-aarch64"],
    [
      { platform: "android", arch: "arm64", musl: true },
      "linux-aarch64-android",
    ],
    [{ platform: "win32", arch: "x64" }, "windows-x64"],
    [{ platform: "win32", arch: "x64", avx2: false }, "windows-x64-baseline"],
    [{ platform: "win32", arch: "arm64" }, "windows-aarch64"],
    [{ platform: "freebsd", arch: "x64" }, "freebsd-x64"],
    [{ platform: "freebsd", arch: "arm64" }, "freebsd-aarch64"],
  ];
  for (const [facts, expected] of cases) {
    test(`${JSON.stringify(facts)} → ${expected}`, () => {
      const target = selectTarget(host(facts));
      assert.strictEqual(target, expected);
      assert.ok(
        RELEASED.has(`bun-${target}.zip`),
        `bun-${target}.zip is not a real asset`,
      );
    });
  }

  test("rejects unsupported systems and CPUs", () => {
    assert.throws(
      () => selectTarget(host({ platform: "aix", arch: "x64" })),
      /unsupported operating system: aix/,
    );
    assert.throws(
      () => selectTarget(host({ platform: "linux", arch: "ia32" })),
      /unsupported CPU architecture: ia32/,
    );
    assert.throws(
      () => selectTarget(host({ platform: "darwin", arch: "ppc64" })),
      /unsupported CPU/,
    );
  });
});

describe("detectHost", () => {
  test("describes this machine as a supported target", () => {
    const h = detectHost();
    assert.strictEqual(h.platform, process.platform);
    assert.strictEqual(h.arch, process.arch);
    for (const k of ["musl", "avx2", "rosetta"])
      assert.strictEqual(typeof h[k], "boolean", k);
    assert.ok(RELEASED.has(`bun-${selectTarget(h)}.zip`));
  });
});

describe("release metadata", () => {
  const release = {
    tag_name: "bun-v1.4.5",
    assets: [
      {
        name: "bun-linux-x64.zip",
        size: 10,
        digest: `sha256:${"a".repeat(64)}`,
        browser_download_url: "https://x/bun-linux-x64.zip",
      },
      {
        name: "bun-linux-x64-profile.zip",
        size: 99,
        digest: `sha256:${"b".repeat(64)}`,
        browser_download_url: "https://x/p.zip",
      },
      {
        name: "bun-darwin-x64.zip",
        size: 12,
        browser_download_url: "https://x/bun-darwin-x64.zip",
      },
      {
        name: "SHASUMS256.txt",
        size: 1,
        browser_download_url: "https://x/SHASUMS256.txt",
      },
    ],
  };

  test("versionOf strips the bun-v prefix", () => {
    assert.strictEqual(versionOf("bun-v1.4.5"), "1.4.5");
  });

  test("pickAsset finds the exact asset (not the profile build) and its digest", () => {
    assert.deepStrictEqual(pickAsset(release, "linux-x64"), {
      name: "bun-linux-x64.zip",
      url: "https://x/bun-linux-x64.zip",
      size: 10,
      digest: "a".repeat(64),
      sumsUrl: "https://x/SHASUMS256.txt",
    });
  });

  test("pickAsset leaves digest null when GitHub has none", () => {
    assert.strictEqual(pickAsset(release, "darwin-x64").digest, null);
  });

  test("pickAsset errors when the target isn't published", () => {
    assert.throws(
      () => pickAsset(release, "windows-aarch64"),
      /bun-v1\.4\.5 has no bun-windows-aarch64\.zip/,
    );
  });

  test("parseShasums reads sha256sum output", () => {
    const sums = parseShasums(
      `${"c".repeat(64)}  bun-a.zip\r\n${"d".repeat(64)} *bun-b.zip\nnot a line\n`,
    );
    assert.deepStrictEqual(
      [...sums],
      [
        ["bun-a.zip", "c".repeat(64)],
        ["bun-b.zip", "d".repeat(64)],
      ],
    );
  });

  test("apiHeaders adds a bearer token only when GITHUB_TOKEN is set", () => {
    assert.strictEqual(apiHeaders({}).authorization, undefined);
    assert.strictEqual(
      apiHeaders({ GITHUB_TOKEN: "t" }).authorization,
      "Bearer t",
    );
    assert.strictEqual(apiHeaders({}).accept, "application/vnd.github+json");
  });
});

describe("isAllowedUrl", () => {
  test("allows HTTPS and plain HTTP to this machine only", () => {
    for (const u of [
      "https://github.com/x",
      "http://127.0.0.1:8080/x",
      "http://localhost/x",
      "http://[::1]/x",
    ]) {
      assert.ok(isAllowedUrl(u), u);
    }
    for (const u of [
      "http://github.com/x",
      "ftp://x/y",
      "file:///etc/passwd",
      "not a url",
      "http://127.0.0.1.evil.com/x",
    ]) {
      assert.ok(!isAllowedUrl(u), u);
    }
  });
});

// --- download and main, using temp dirs and a fake fetch -------------------

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "download-bun-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

const ZIP = Buffer.from("pretend this is a zip file\n".repeat(1000));
const silent = { update() {}, done() {} };

// Fake fetch: route URL → Buffer/string/object body, or a number for HTTP errors.
function fakeFetch(routes) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url, headers: init.headers ?? {} });
    const r = routes[url];
    if (r === undefined) return new Response("nope", { status: 404 });
    if (typeof r === "number")
      return new Response("", {
        status: r,
        headers: r === 403 ? { "x-ratelimit-remaining": "0" } : {},
      });
    if (Buffer.isBuffer(r) || typeof r === "string") return new Response(r);
    return Response.json(r);
  };
  return { impl, calls };
}

describe("download", () => {
  test("writes the file after checking size and digest", async () => {
    const dest = path.join(dir, "out.zip");
    const { impl } = fakeFetch({ "https://dl/out.zip": ZIP });
    await download("https://dl/out.zip", dest, {
      size: ZIP.length,
      digest: sha256(ZIP),
      fetchImpl: impl,
      progress: silent,
    });
    assert.ok(fs.readFileSync(dest).equals(ZIP));
    assert.ok(!fs.existsSync(`${dest}.part`));
  });

  for (const [name, opts, re] of [
    [
      "checksum mismatch",
      { size: ZIP.length, digest: "0".repeat(64) },
      /checksum mismatch for out\.zip/,
    ],
    [
      "size mismatch",
      { size: ZIP.length + 1, digest: sha256(ZIP) },
      /size mismatch for out\.zip/,
    ],
  ]) {
    test(`${name} leaves neither the file nor a .part behind`, async () => {
      const dest = path.join(dir, "out.zip");
      const { impl } = fakeFetch({ "https://dl/out.zip": ZIP });
      await assert.rejects(
        download("https://dl/out.zip", dest, {
          ...opts,
          fetchImpl: impl,
          progress: silent,
        }),
        re,
      );
      assert.deepStrictEqual(fs.readdirSync(dir), []);
    });
  }

  test("refuses non-HTTPS URLs before fetching", async () => {
    const { impl, calls } = fakeFetch({});
    await assert.rejects(
      download("http://example.com/x.zip", path.join(dir, "x.zip"), {
        size: 1,
        digest: "x",
        fetchImpl: impl,
        progress: silent,
      }),
      /refusing to download non-HTTPS URL/,
    );
    assert.strictEqual(calls.length, 0);
  });

  test("refuses a redirect that lands on plain HTTP", async () => {
    const impl = async () => {
      const res = new Response(ZIP);
      Object.defineProperty(res, "url", {
        value: "http://cdn.example.com/x.zip",
      });
      return res;
    };
    await assert.rejects(
      download("https://dl/x.zip", path.join(dir, "x.zip"), {
        size: ZIP.length,
        digest: sha256(ZIP),
        fetchImpl: impl,
        progress: silent,
      }),
      /redirected to non-HTTPS URL/,
    );
    assert.deepStrictEqual(fs.readdirSync(dir), []);
  });

  test("reports HTTP errors", async () => {
    const { impl } = fakeFetch({ "https://dl/x.zip": 500 });
    await assert.rejects(
      download("https://dl/x.zip", path.join(dir, "x.zip"), {
        size: 1,
        digest: "x",
        fetchImpl: impl,
        progress: silent,
      }),
      /download of https:\/\/dl\/x\.zip failed: HTTP 500/,
    );
  });
});

describe("main", () => {
  const API = "https://api/latest";
  const linux = host({ platform: "linux", arch: "x64" });
  const release = (overrides = {}) => ({
    tag_name: "bun-v1.4.5",
    draft: false,
    prerelease: false,
    assets: [
      {
        name: "bun-linux-x64.zip",
        size: ZIP.length,
        digest: `sha256:${sha256(ZIP)}`,
        browser_download_url: "https://dl/bun-linux-x64.zip",
      },
      {
        name: "SHASUMS256.txt",
        size: 1,
        browser_download_url: "https://dl/SHASUMS256.txt",
      },
    ],
    ...overrides,
  });
  const runMain = (routes, extra = {}) => {
    const logs = [];
    const { impl, calls } = fakeFetch(routes);
    const p = main({
      env: { BUN_RELEASE_API_URL: API },
      dir,
      host: linux,
      fetchImpl: impl,
      log: (m) => logs.push(m),
      ...extra,
    });
    return { p, logs, calls };
  };

  test("downloads and verifies the build for this host", async () => {
    const { p, logs } = runMain({
      [API]: release(),
      "https://dl/bun-linux-x64.zip": ZIP,
    });
    const dest = await p;
    assert.strictEqual(dest, path.join(dir, "bun-v1.4.5-linux-x64.zip"));
    assert.ok(fs.readFileSync(dest).equals(ZIP));
    assert.deepStrictEqual(logs, [
      "Fetching latest Bun release...",
      "Bun 1.4.5 for linux-x64: bun-v1.4.5-linux-x64.zip (0 MiB)",
      `  verified ${sha256(ZIP)}`,
      `Saved ${dest}`,
    ]);
  });

  test("skips a file that's already there and verified", async () => {
    fs.writeFileSync(path.join(dir, "bun-v1.4.5-linux-x64.zip"), ZIP);
    const { p, logs, calls } = runMain({ [API]: release() });
    await p;
    assert.ok(logs.includes("  already downloaded and verified, skipping"));
    assert.deepStrictEqual(
      calls.map((c) => c.url),
      [API],
    ); // no download
  });

  test("re-downloads a file that's there but corrupt", async () => {
    fs.writeFileSync(path.join(dir, "bun-v1.4.5-linux-x64.zip"), "corrupt");
    const { p } = runMain({
      [API]: release(),
      "https://dl/bun-linux-x64.zip": ZIP,
    });
    assert.ok(fs.readFileSync(await p).equals(ZIP));
  });

  test("falls back to SHASUMS256.txt when GitHub has no digest", async () => {
    const r = release();
    delete r.assets[0].digest;
    const { p } = runMain({
      [API]: r,
      "https://dl/SHASUMS256.txt": `${"e".repeat(64)}  bun-other.zip\n${sha256(ZIP)}  bun-linux-x64.zip\n`,
      "https://dl/bun-linux-x64.zip": ZIP,
    });
    assert.ok(fs.readFileSync(await p).equals(ZIP));
  });

  test("errors when no checksum can be found", async () => {
    const r = release();
    delete r.assets[0].digest;
    const { p } = runMain({ [API]: r, "https://dl/SHASUMS256.txt": "" });
    await assert.rejects(
      p,
      /SHASUMS256\.txt has no entry for bun-linux-x64\.zip/,
    );
  });

  test("refuses drafts and prereleases", async () => {
    for (const flag of ["draft", "prerelease"]) {
      const { p } = runMain({ [API]: release({ [flag]: true }) });
      await assert.rejects(p, /bun-v1\.4\.5 is not a stable release/);
    }
  });

  test("explains a GitHub rate-limit error", async () => {
    const { p } = runMain({ [API]: 403 });
    await assert.rejects(
      p,
      /HTTP 403 \(GitHub API rate limit reached; set GITHUB_TOKEN/,
    );
  });

  test("sends GITHUB_TOKEN to the API but not to the download", async () => {
    const { p, calls } = runMain(
      { [API]: release(), "https://dl/bun-linux-x64.zip": ZIP },
      { env: { BUN_RELEASE_API_URL: API, GITHUB_TOKEN: "secret" } },
    );
    await p;
    assert.strictEqual(calls[0].headers.authorization, "Bearer secret");
    assert.strictEqual(calls[1].headers.authorization, undefined);
  });
});

// End to end: run the script against a local server standing in for GitHub.
describe("CLI", () => {
  let server;
  let base;
  let requests;
  before(async () => {
    requests = [];
    server = http.createServer((req, res) => {
      requests.push(req.url);
      const target = selectTarget(detectHost());
      if (req.url === "/latest") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            tag_name: "bun-v9.9.9",
            draft: false,
            prerelease: false,
            assets: [
              {
                name: `bun-${target}.zip`,
                size: ZIP.length,
                digest: `sha256:${sha256(ZIP)}`,
                browser_download_url: `${base}/dl/bun-${target}.zip`,
              },
            ],
          }),
        );
      } else if (req.url.startsWith("/dl/")) {
        res.writeHead(200);
        res.end(ZIP);
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => new Promise((r) => server.close(r)));

  const cli = (...args) =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [SCRIPT, ...args],
        {
          cwd: dir,
          env: {
            ...process.env,
            BUN_RELEASE_API_URL: `${base}/latest`,
            GITHUB_TOKEN: "",
          },
        },
        (error, stdout, stderr) =>
          resolve({ status: error ? error.code : 0, stdout, stderr }),
      );
    });

  test("downloads the build for this machine into the current directory", async () => {
    const r = await cli();
    assert.strictEqual(r.status, 0, r.stderr);
    const file = `bun-v9.9.9-${selectTarget(detectHost())}.zip`;
    assert.ok(fs.readFileSync(path.join(dir, file)).equals(ZIP));
    assert.match(r.stdout, new RegExp(`Saved .*${file.replace(/\./g, "\\.")}`));
  });

  test("--help prints usage and exits 0 without fetching", async () => {
    requests.length = 0;
    const r = await cli("--help");
    assert.strictEqual(r.status, 0);
    assert.match(r.stdout, /^Usage: download-bun\.js/);
    assert.deepStrictEqual(requests, []);
  });

  test("an unexpected argument exits 1", async () => {
    const r = await cli("1.2.3");
    assert.strictEqual(r.status, 1);
    assert.match(r.stderr, /unexpected argument '1\.2\.3'/);
  });
});
