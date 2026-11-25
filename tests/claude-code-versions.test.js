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
  resolveChannel,
  run,
} = require("../claude-code-versions");

const SCRIPT = path.join(__dirname, "..", "claude-code-versions.js");

// Fake fetch serving `routes` (channel → body, or a number for an HTTP error).
function fakeFetch(routes) {
  const urls = [];
  const impl = async (url) => {
    urls.push(url);
    const channel = url.split("/").pop();
    const body = routes[channel];
    if (body === undefined)
      return { ok: false, status: 404, text: async () => "" };
    if (typeof body === "number")
      return { ok: false, status: body, text: async () => "" };
    return { ok: true, status: 200, text: async () => body };
  };
  return { impl, urls };
}

describe("isVersion", () => {
  test("accepts release and pre-release versions", () => {
    for (const v of [
      "2.1.326",
      "0.0.1",
      "10.20.30",
      "1.2.3-beta.1",
      "1.2.3.4",
      "1.2.3-rc-2",
    ]) {
      assert.ok(isVersion(v), v);
    }
  });

  test("rejects anything else", () => {
    for (const v of [
      "",
      "2.1",
      "v2.1.326",
      "2.1.326-",
      "2.1.326 ",
      "<html>",
      "2.1.326\n2.1.327",
      "1.2.3_x",
    ]) {
      assert.ok(!isVersion(v), JSON.stringify(v));
    }
  });
});

describe("formatLine", () => {
  test("pads the channel to 8 columns like printf %-8s", () => {
    assert.strictEqual(formatLine("stable", "2.1.326"), "stable   2.1.326");
    assert.strictEqual(
      formatLine("verylongname", "1.0.0"),
      "verylongname 1.0.0",
    );
  });
});

describe("baseUrlFrom", () => {
  test("uses the environment override when set", () => {
    assert.strictEqual(
      baseUrlFrom({ CLAUDE_CODE_RELEASES_BASE_URL: "http://x" }),
      "http://x",
    );
  });

  test("falls back when unset or empty, like ${VAR:-default}", () => {
    assert.strictEqual(baseUrlFrom({}), DEFAULT_BASE_URL);
    assert.strictEqual(
      baseUrlFrom({ CLAUDE_CODE_RELEASES_BASE_URL: "" }),
      DEFAULT_BASE_URL,
    );
  });
});

describe("resolveChannel", () => {
  test("fetches <base>/<channel> and strips whitespace", async () => {
    const { impl, urls } = fakeFetch({ stable: " 2.1.326\r\n\t" });
    assert.strictEqual(
      await resolveChannel("stable", {
        baseUrl: "http://base",
        fetchImpl: impl,
      }),
      "2.1.326",
    );
    assert.deepStrictEqual(urls, ["http://base/stable"]);
  });

  test("rejects invalid channel names without fetching", async () => {
    const { impl, urls } = fakeFetch({});
    for (const bad of ["Bad", "1abc", "-x", "a_b", "", "../etc", "a/b"]) {
      await assert.rejects(resolveChannel(bad, { fetchImpl: impl }), {
        message: `Error: invalid channel name '${bad}'.`,
      });
    }
    assert.deepStrictEqual(urls, []);
  });

  test("reports HTTP errors as a failed fetch", async () => {
    const { impl } = fakeFetch({ gone: 404, broken: 500 });
    for (const c of ["gone", "broken"]) {
      await assert.rejects(resolveChannel(c, { fetchImpl: impl }), {
        message: `Error: could not fetch channel '${c}'.`,
      });
    }
  });

  test("reports network errors as a failed fetch", async () => {
    const impl = async () => {
      throw new TypeError("fetch failed");
    };
    await assert.rejects(resolveChannel("stable", { fetchImpl: impl }), {
      message: "Error: could not fetch channel 'stable'.",
    });
  });

  test("rejects a body that isn't a version", async () => {
    const { impl } = fakeFetch({ stable: "<html>Not Found</html>" });
    await assert.rejects(resolveChannel("stable", { fetchImpl: impl }), {
      message:
        "Error: channel 'stable' resolved to invalid version '<html>NotFound</html>'.",
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

  test("defaults to stable and latest", async () => {
    const r = await capture([], { stable: "2.1.326", latest: "2.1.332" });
    assert.strictEqual(r.status, 0);
    assert.deepStrictEqual(r.out, ["stable   2.1.326", "latest   2.1.332"]);
    assert.deepStrictEqual(r.err, []);
  });

  test("keeps going after errors, in argument order, and returns 1", async () => {
    const r = await capture(["stable", "nope", "Bad", "latest"], {
      stable: "2.1.326",
      latest: "2.1.332",
    });
    assert.strictEqual(r.status, 1);
    assert.deepStrictEqual(r.out, ["stable   2.1.326", "latest   2.1.332"]);
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
        text: async () => (c === "slow" ? "1.0.0" : "2.0.0"),
      };
    };
    const out = [];
    await run(["slow", "fast"], { fetchImpl: impl, log: (m) => out.push(m) });
    assert.deepStrictEqual(out, ["slow     1.0.0", "fast     2.0.0"]);
  });
});

// End to end: real fetch against a local server via the env override.
describe("CLI", () => {
  let server;
  let baseUrl;
  before(async () => {
    const bodies = { stable: "2.1.326\n", latest: "2.1.332\n", junk: "oops" };
    server = http.createServer((req, res) => {
      const channel = req.url.split("/").pop();
      if (channel === "hang") return; // never respond
      if (req.url.startsWith("/releases/") && channel in bodies) {
        res.writeHead(200, { "content-type": "text/plain" });
        res.end(bodies[channel]);
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    baseUrl = `http://127.0.0.1:${server.address().port}/releases`;
  });
  after(() => {
    server.closeAllConnections(); // drop the "hang" request
    return new Promise((r) => server.close(r));
  });

  test("a channel that never answers times out as a failed fetch", async () => {
    await assert.rejects(resolveChannel("hang", { baseUrl, timeoutMs: 100 }), {
      message: "Error: could not fetch channel 'hang'.",
    });
  });

  // Async exec: spawnSync would block the event loop and starve the server.
  const cli = (...args) =>
    new Promise((resolve) => {
      execFile(
        process.execPath,
        [SCRIPT, ...args],
        { env: { ...process.env, CLAUDE_CODE_RELEASES_BASE_URL: baseUrl } },
        (error, stdout, stderr) =>
          resolve({ status: error ? error.code : 0, stdout, stderr }),
      );
    });

  test("default channels", async () => {
    const r = await cli();
    assert.strictEqual(r.status, 0);
    assert.strictEqual(r.stdout, "stable   2.1.326\nlatest   2.1.332\n");
    assert.strictEqual(r.stderr, "");
  });

  test("mixed good and bad channels exit 1", async () => {
    const r = await cli("stable", "missing", "junk", "Bad", "latest");
    assert.strictEqual(r.status, 1);
    assert.strictEqual(r.stdout, "stable   2.1.326\nlatest   2.1.332\n");
    assert.strictEqual(
      r.stderr,
      [
        "Error: could not fetch channel 'missing'.",
        "Error: channel 'junk' resolved to invalid version 'oops'.",
        "Error: invalid channel name 'Bad'.",
        "",
      ].join("\n"),
    );
  });
});
