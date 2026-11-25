const { describe, test, before, after } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const path = require("node:path");
const { execFile } = require("node:child_process");
const {
  DEFAULT_BASE_URL,
  baseUrlFrom,
  isVersion,
  formatLine,
  tagName,
  resolveChannel,
  run,
} = require("../codex-versions");

const SCRIPT = path.join(__dirname, "..", "codex-versions.js");

const meta = (tag) => JSON.stringify({ assets: [], tag_name: tag });

// Fake fetch serving `routes` (channel → body, or a number for an HTTP error).
function fakeFetch(routes) {
  const urls = [];
  const impl = async (url) => {
    urls.push(url);
    const body = routes[url.split("/").pop()];
    if (body === undefined || typeof body === "number") {
      return { ok: false, status: body ?? 404, text: async () => "" };
    }
    return { ok: true, status: 200, text: async () => body };
  };
  return { impl, urls };
}

describe("isVersion", () => {
  test("accepts release and pre-release versions", () => {
    for (const v of ["0.172.0", "0.174.0-alpha.5", "1.2.3-rc1", "10.0.0"]) {
      assert.ok(isVersion(v), v);
    }
  });

  test("rejects anything else, including forms claude-code-versions allows", () => {
    for (const v of [
      "",
      "1.2",
      "v1.2.3",
      "1.2.3.4",
      "1.2.3-a-b",
      "1.2.3-a_b",
      "1.2.3-",
    ]) {
      assert.ok(!isVersion(v), JSON.stringify(v));
    }
  });
});

describe("formatLine", () => {
  test("pads the channel to 11 columns like printf %-11s", () => {
    assert.strictEqual(formatLine("latest", "0.172.0"), "latest      0.172.0");
    assert.strictEqual(
      formatLine("prerelease", "0.174.0-alpha.5"),
      "prerelease  0.174.0-alpha.5",
    );
  });
});

describe("baseUrlFrom", () => {
  test("uses the environment override when set", () => {
    assert.strictEqual(
      baseUrlFrom({ CODEX_RELEASES_BASE_URL: "http://x" }),
      "http://x",
    );
  });

  test("falls back when unset or empty, like ${VAR:-default}", () => {
    assert.strictEqual(baseUrlFrom({}), DEFAULT_BASE_URL);
    assert.strictEqual(
      baseUrlFrom({ CODEX_RELEASES_BASE_URL: "" }),
      DEFAULT_BASE_URL,
    );
  });
});

describe("tagName", () => {
  test("returns a string tag_name", () => {
    assert.strictEqual(tagName(meta("rust-v0.172.0")), "rust-v0.172.0");
  });

  test("stringifies a numeric tag_name, like jq -r and Perl", () => {
    assert.strictEqual(tagName('{"tag_name":123}'), "123");
  });

  test("returns empty for anything that isn't an object with a plain tag_name", () => {
    for (const body of [
      "",
      "<html>oops</html>",
      '["rust-v1.2.3"]',
      '"rust-v1.2.3"',
      "null",
      '{"assets":[]}',
      '{"tag_name":null}',
      '{"tag_name":false}',
      '{"tag_name":true}',
      '{"tag_name":{"a":1}}',
      '{"tag_name":["rust-v1.2.3"]}',
    ]) {
      assert.strictEqual(tagName(body), "", body);
    }
  });
});

describe("resolveChannel", () => {
  test("fetches <base>/channels/<channel> and strips the rust-v prefix", async () => {
    const { impl, urls } = fakeFetch({ latest: meta("rust-v0.172.0") });
    assert.strictEqual(
      await resolveChannel("latest", {
        baseUrl: "http://base",
        fetchImpl: impl,
      }),
      "0.172.0",
    );
    assert.deepStrictEqual(urls, ["http://base/channels/latest"]);
  });

  test("rejects invalid channel names without fetching", async () => {
    const { impl, urls } = fakeFetch({});
    for (const bad of ["Bad", "1abc", "-x", "a_b", "", "../etc"]) {
      await assert.rejects(resolveChannel(bad, { fetchImpl: impl }), {
        message: `Error: invalid channel name '${bad}'.`,
      });
    }
    assert.deepStrictEqual(urls, []);
  });

  test("reports HTTP and network errors as a failed fetch", async () => {
    const { impl } = fakeFetch({ broken: 500 });
    for (const c of ["missing", "broken"]) {
      await assert.rejects(resolveChannel(c, { fetchImpl: impl }), {
        message: `Error: could not fetch channel '${c}'.`,
      });
    }
    const down = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(resolveChannel("latest", { fetchImpl: down }), {
      message: "Error: could not fetch channel 'latest'.",
    });
  });

  test("rejects tags without the rust-v prefix or with a bad version", async () => {
    const cases = {
      noprefix: ["v1.2.3", "v1.2.3"],
      bare: ["1.2.3", "1.2.3"],
      badver: ["rust-v1.2", "rust-v1.2"],
      onlyprefix: ["rust-v", "rust-v"],
    };
    const routes = Object.fromEntries(
      Object.entries(cases).map(([c, [tag]]) => [c, meta(tag)]),
    );
    const { impl } = fakeFetch(routes);
    for (const [c, [, shown]] of Object.entries(cases)) {
      await assert.rejects(resolveChannel(c, { fetchImpl: impl }), {
        message: `Error: channel '${c}' resolved to invalid tag '${shown}'.`,
      });
    }
  });

  test("an unparseable body is an invalid (empty) tag, not a fetch error", async () => {
    const { impl } = fakeFetch({ latest: "<html>oops</html>" });
    await assert.rejects(resolveChannel("latest", { fetchImpl: impl }), {
      message: "Error: channel 'latest' resolved to invalid tag ''.",
    });
  });
});

describe("run", () => {
  const capture = async (channels, routes) => {
    const out = [];
    const err = [];
    const status = await run(channels, {
      fetchImpl: fakeFetch(routes).impl,
      log: (m) => out.push(m),
      warn: (m) => err.push(m),
    });
    return { status, out, err };
  };

  test("defaults to latest and prerelease", async () => {
    const r = await capture([], {
      latest: meta("rust-v0.172.0"),
      prerelease: meta("rust-v0.174.0-alpha.5"),
    });
    assert.strictEqual(r.status, 0);
    assert.deepStrictEqual(r.out, [
      "latest      0.172.0",
      "prerelease  0.174.0-alpha.5",
    ]);
    assert.deepStrictEqual(r.err, []);
  });

  test("keeps going after errors, in argument order, and returns 1", async () => {
    const r = await capture(["latest", "nope", "Bad", "prerelease"], {
      latest: meta("rust-v0.172.0"),
      prerelease: meta("rust-v0.174.0-alpha.5"),
    });
    assert.strictEqual(r.status, 1);
    assert.deepStrictEqual(r.out, [
      "latest      0.172.0",
      "prerelease  0.174.0-alpha.5",
    ]);
    assert.deepStrictEqual(r.err, [
      "Error: could not fetch channel 'nope'.",
      "Error: invalid channel name 'Bad'.",
    ]);
  });

  test("prints in argument order even when lookups finish out of order", async () => {
    const delays = { slow: 30, fast: 0 };
    const impl = async (url) => {
      const c = url.split("/").pop();
      await new Promise((r) => setTimeout(r, delays[c]));
      return {
        ok: true,
        status: 200,
        text: async () => meta(c === "slow" ? "rust-v1.0.0" : "rust-v2.0.0"),
      };
    };
    const out = [];
    await run(["slow", "fast"], { fetchImpl: impl, log: (m) => out.push(m) });
    assert.deepStrictEqual(out, ["slow        1.0.0", "fast        2.0.0"]);
  });
});

// End to end: real fetch against a local server via the env override.
describe("CLI", () => {
  let server;
  let baseUrl;
  before(async () => {
    const bodies = {
      latest: meta("rust-v0.172.0"),
      prerelease: meta("rust-v0.174.0-alpha.5"),
      junk: "not json",
    };
    server = http.createServer((req, res) => {
      const channel = req.url.split("/").pop();
      if (channel === "hang") return; // never respond
      if (req.url.startsWith("/codex/channels/") && channel in bodies) {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(bodies[channel]);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${server.address().port}/codex`;
  });
  after(() => {
    server.closeAllConnections(); // drop the "hang" request
    return new Promise((r) => server.close(r));
  });

  // Async exec: spawnSync would block the event loop and starve the server.
  const cli = (...args) =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [SCRIPT, ...args],
        { env: { ...process.env, CODEX_RELEASES_BASE_URL: baseUrl } },
        (error, stdout, stderr) =>
          resolve({ status: error ? error.code : 0, stdout, stderr }),
      );
    });

  test("default channels", async () => {
    const r = await cli();
    assert.strictEqual(r.status, 0);
    assert.strictEqual(
      r.stdout,
      "latest      0.172.0\nprerelease  0.174.0-alpha.5\n",
    );
    assert.strictEqual(r.stderr, "");
  });

  test("mixed good and bad channels exit 1", async () => {
    const r = await cli("latest", "missing", "junk", "Bad", "prerelease");
    assert.strictEqual(r.status, 1);
    assert.strictEqual(
      r.stdout,
      "latest      0.172.0\nprerelease  0.174.0-alpha.5\n",
    );
    assert.strictEqual(
      r.stderr,
      [
        "Error: could not fetch channel 'missing'.",
        "Error: channel 'junk' resolved to invalid tag ''.",
        "Error: invalid channel name 'Bad'.",
        "",
      ].join("\n"),
    );
  });

  test("a channel that never answers times out as a failed fetch", async () => {
    await assert.rejects(resolveChannel("hang", { baseUrl, timeoutMs: 100 }), {
      message: "Error: could not fetch channel 'hang'.",
    });
  });
});
