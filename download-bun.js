#!/usr/bin/env node

"use strict";

// Download the latest stable Bun release for this OS and CPU from GitHub
// (https://github.com/oven-sh/bun/releases) into the current directory, and
// verify it against the size and SHA-256 digest GitHub publishes.
//
// Picks the same build variant as Bun's install script: musl on musl Linux,
// "baseline" on x64 CPUs without AVX2, and the native arm64 build when an
// x64 process is running under Rosetta 2 on Apple silicon.
//
// Usage: download-bun.js
//
// Environment:
//   GITHUB_TOKEN          optional; raises the API rate limit (60/hour without)
//   BUN_RELEASE_API_URL   override the release metadata URL (for mirrors/tests)

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");

const DEFAULT_API_URL =
  "https://api.github.com/repos/oven-sh/bun/releases/latest";
const API_TIMEOUT_MS = 30_000;
const MIB = 1024 * 1024;

// --- choosing the build ------------------------------------------------------

const OS_NAMES = {
  darwin: "darwin",
  linux: "linux",
  win32: "windows",
  freebsd: "freebsd",
  android: "linux", // Bun ships Android as linux-<arch>-android
};
const ARCH_NAMES = { arm64: "aarch64", x64: "x64" };

// Pure: host facts → release target such as "linux-x64-musl-baseline".
function selectTarget({ platform, arch, musl, avx2, rosetta }) {
  const os = OS_NAMES[platform];
  if (!os) throw new Error(`unsupported operating system: ${platform}`);
  // An x64 process under Rosetta 2 can run the native arm64 build.
  const cpu = ARCH_NAMES[platform === "darwin" && rosetta ? "arm64" : arch];
  if (!cpu) throw new Error(`unsupported CPU architecture: ${arch}`);

  let target = `${os}-${cpu}`;
  if (platform === "android") target += "-android";
  else if (platform === "linux" && musl) target += "-musl";
  if (cpu === "x64" && !avx2) target += "-baseline";
  return target;
}

const sysctl = (name) => {
  try {
    return execFileSync("sysctl", ["-n", name], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
};

// Impure: look at the machine we're on. Only probes what matters for the
// result, and assumes AVX2 where it can't tell (as Bun's installer does).
function detectHost() {
  const { platform, arch } = process;
  const host = { platform, arch, musl: false, avx2: true, rosetta: false };

  if (platform === "linux") {
    // glibcVersionRuntime is only reported when linked against glibc.
    host.musl = !process.report?.getReport().header.glibcVersionRuntime;
    if (arch === "x64") {
      try {
        host.avx2 = /\bavx2\b/.test(fs.readFileSync("/proc/cpuinfo", "utf8"));
      } catch {
        // keep the assumption
      }
    }
  } else if (platform === "darwin" && arch === "x64") {
    host.rosetta = sysctl("sysctl.proc_translated") === "1";
    if (!host.rosetta) {
      host.avx2 = /\bAVX2\b/.test(sysctl("machdep.cpu.leaf7_features"));
    }
  }
  return host;
}

// --- release metadata --------------------------------------------------------

// "bun-v1.4.5" → "1.4.5"
const versionOf = (tag) => tag.replace(/^bun-v/, "");

// Find the asset for `target` and the digest to check it against: GitHub's
// own `digest` field, or failing that the release's SHASUMS256.txt.
function pickAsset(release, target) {
  const name = `bun-${target}.zip`;
  const asset = release.assets?.find((a) => a.name === name);
  if (!asset) {
    throw new Error(`release ${release.tag_name} has no ${name}`);
  }
  const digest = /^sha256:([0-9a-f]{64})$/.exec(asset.digest ?? "")?.[1];
  const sums = release.assets.find((a) => a.name === "SHASUMS256.txt");
  return {
    name,
    url: asset.browser_download_url,
    size: asset.size,
    digest: digest ?? null,
    sumsUrl: sums?.browser_download_url ?? null,
  };
}

// "<sha256>  <file>" lines → Map(file → sha256)
function parseShasums(text) {
  const sums = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) [ *](.+)$/.exec(line.trim());
    if (m) sums.set(m[2], m[1]);
  }
  return sums;
}

function apiHeaders(env) {
  const headers = {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
  };
  if (env.GITHUB_TOKEN) headers.authorization = `Bearer ${env.GITHUB_TOKEN}`;
  return headers;
}

async function getJson(url, { headers, fetchImpl = fetch }) {
  const res = await fetchImpl(url, {
    headers,
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) {
    let hint = "";
    if (
      (res.status === 403 || res.status === 429) &&
      res.headers.get("x-ratelimit-remaining") === "0"
    ) {
      hint = " (GitHub API rate limit reached; set GITHUB_TOKEN to raise it)";
    }
    throw new Error(`could not fetch ${url}: HTTP ${res.status}${hint}`);
  }
  return res.json();
}

async function getText(url, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(url, {
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`could not fetch ${url}: HTTP ${res.status}`);
  return res.text();
}

// --- downloading -------------------------------------------------------------

// HTTPS only, except plain HTTP to this machine (local mirrors and tests).
function isAllowedUrl(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return true;
  return (
    u.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
  );
}

async function sha256File(file) {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

// Draws a simple progress bar on a terminal; silent otherwise.
function progressReporter(total, stream = process.stderr) {
  if (!stream.isTTY || !total) return { update() {}, done() {} };
  const width = 40;
  return {
    update(done) {
      const f = Math.min(done / total, 1);
      const filled = Math.floor(f * width);
      stream.write(
        `\r  ${"#".repeat(filled)}${" ".repeat(width - filled)} ${(f * 100).toFixed(1).padStart(5)}%`,
      );
    },
    done() {
      stream.write("\n");
    },
  };
}

// Stream `url` to `dest` via a .part file, then check size and digest before
// renaming it into place, so a failed or corrupt download never looks done.
async function download(
  url,
  dest,
  { size, digest, fetchImpl = fetch, progress = progressReporter(size) },
) {
  if (!isAllowedUrl(url)) {
    throw new Error(`refusing to download non-HTTPS URL ${url}`);
  }
  const res = await fetchImpl(url);
  if (!res.ok || !res.body) {
    throw new Error(`download of ${url} failed: HTTP ${res.status}`);
  }
  // fetch follows redirects (GitHub sends downloads to its CDN); make sure
  // none of them downgraded to plain HTTP.
  if (res.url && !isAllowedUrl(res.url)) {
    throw new Error(`refusing download redirected to non-HTTPS URL ${res.url}`);
  }

  const part = `${dest}.part`;
  const hash = crypto.createHash("sha256");
  let received = 0;
  try {
    await pipeline(
      Readable.fromWeb(res.body),
      async function* (source) {
        for await (const chunk of source) {
          hash.update(chunk);
          received += chunk.length;
          progress.update(received);
          yield chunk;
        }
      },
      fs.createWriteStream(part),
    );
    progress.done();

    if (size != null && received !== size) {
      throw new Error(
        `size mismatch for ${path.basename(dest)}: expected ${size}, got ${received}`,
      );
    }
    const actual = hash.digest("hex");
    if (actual !== digest) {
      throw new Error(
        `checksum mismatch for ${path.basename(dest)}\n  expected ${digest}\n  actual   ${actual}`,
      );
    }
    fs.renameSync(part, dest);
    return actual;
  } catch (error) {
    fs.rmSync(part, { force: true });
    throw error;
  }
}

// --- main --------------------------------------------------------------------

async function main({
  env = process.env,
  dir = process.cwd(),
  host = detectHost(),
  fetchImpl = fetch,
  log = console.log,
} = {}) {
  const target = selectTarget(host);
  const apiUrl = env.BUN_RELEASE_API_URL || DEFAULT_API_URL;

  log("Fetching latest Bun release...");
  const release = await getJson(apiUrl, {
    headers: apiHeaders(env),
    fetchImpl,
  });
  if (release.draft || release.prerelease) {
    throw new Error(`${release.tag_name} is not a stable release`);
  }
  const version = versionOf(release.tag_name);
  const asset = pickAsset(release, target);

  if (!asset.digest) {
    if (!asset.sumsUrl) {
      throw new Error(`release ${release.tag_name} publishes no checksum`);
    }
    asset.digest = parseShasums(
      await getText(asset.sumsUrl, { fetchImpl }),
    ).get(asset.name);
    if (!asset.digest) {
      throw new Error(`SHASUMS256.txt has no entry for ${asset.name}`);
    }
  }

  // Keep the version in the local name; the asset name alone doesn't have it.
  const file = `bun-v${version}-${target}.zip`;
  const dest = path.join(dir, file);
  log(
    `Bun ${version} for ${target}: ${file} (${Math.round(asset.size / MIB)} MiB)`,
  );

  if (fs.existsSync(dest) && (await sha256File(dest)) === asset.digest) {
    log("  already downloaded and verified, skipping");
  } else {
    await download(asset.url, dest, {
      size: asset.size,
      digest: asset.digest,
      fetchImpl,
    });
    log(`  verified ${asset.digest}`);
  }
  log(`Saved ${dest}`);
  return dest;
}

module.exports = {
  selectTarget,
  detectHost,
  versionOf,
  pickAsset,
  parseShasums,
  apiHeaders,
  download,
  isAllowedUrl,
  main,
};

if (require.main === module) {
  const USAGE =
    "Usage: download-bun.js\n\n" +
    "Download the latest stable Bun release for this OS and CPU into the\n" +
    "current directory. Set GITHUB_TOKEN to raise the GitHub API rate limit.";
  const arg = process.argv[2];
  if (arg === "-h" || arg === "--help") {
    console.log(USAGE);
    process.exit(0);
  }
  if (arg !== undefined) {
    console.error(`Error: unexpected argument '${arg}'.\n\n${USAGE}`);
    process.exit(1);
  }
  main().catch((error) => {
    console.error(`Error: ${error.message}`);
    process.exitCode = 1;
  });
}
