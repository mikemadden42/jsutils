#!/usr/bin/env node

"use strict";

// Port of shell-utils/codex-versions.{bash,pl}: print the Codex CLI version
// each release channel currently points at. Each channel is a
// release-metadata JSON document on releases.openai.com; the version is its
// tag_name without the rust-v prefix.
//
// latest is the current stable release. prerelease tracks the newest alpha;
// it is not documented and the official install.sh never reads it, so it may
// move or disappear.
//
// Usage: codex-versions.js [CHANNEL...]   (defaults to latest prerelease)

const DEFAULT_BASE_URL = "https://releases.openai.com/codex";
const DEFAULT_CHANNELS = ["latest", "prerelease"];
// curl used --max-time 30; fetch has one overall limit rather than curl's
// separate connect and total timeouts.
const TIMEOUT_MS = 30_000;

const CHANNEL_RE = /^[a-z][a-z0-9-]*$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.]+)?$/;
const TAG_PREFIX = "rust-v";

// Like the shell's ${VAR:-default}, an empty variable falls back too.
const baseUrlFrom = (env) => env.CODEX_RELEASES_BASE_URL || DEFAULT_BASE_URL;

const isVersion = (v) => VERSION_RE.test(v);

// printf '%-11s %s\n'
const formatLine = (channel, version) => `${channel.padEnd(11)} ${version}`;

// The metadata's tag_name, or "" when the body isn't a JSON object with a
// plain (string or number) tag_name, like the Perl version's tag_name().
function tagName(body) {
  let doc;
  try {
    doc = JSON.parse(body);
  } catch {
    return "";
  }
  if (doc === null || typeof doc !== "object" || Array.isArray(doc)) return "";
  const tag = doc.tag_name;
  return typeof tag === "string" || typeof tag === "number" ? String(tag) : "";
}

// Resolve one channel to its version. Throws an Error whose message is the
// exact line the original scripts print to stderr.
async function resolveChannel(
  channel,
  {
    baseUrl = DEFAULT_BASE_URL,
    timeoutMs = TIMEOUT_MS,
    fetchImpl = fetch,
  } = {},
) {
  if (!CHANNEL_RE.test(channel)) {
    throw new Error(`Error: invalid channel name '${channel}'.`);
  }

  let body;
  try {
    const res = await fetchImpl(`${baseUrl}/channels/${channel}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // like curl -f
    body = await res.text();
  } catch {
    throw new Error(`Error: could not fetch channel '${channel}'.`);
  }

  // tag_name looks like rust-v0.154.0; the release version is the part after.
  const tag = tagName(body);
  const version = tag.startsWith(TAG_PREFIX)
    ? tag.slice(TAG_PREFIX.length)
    : tag;
  if (!tag.startsWith(TAG_PREFIX) || !isVersion(version)) {
    throw new Error(
      `Error: channel '${channel}' resolved to invalid tag '${tag}'.`,
    );
  }
  return version;
}

// Look up every channel and print results in argument order. Lookups run
// concurrently, but output is printed only once all are done, so stdout and
// stderr lines stay in channel order. Returns the exit status.
async function run(
  channels,
  { log = console.log, warn = console.error, ...options } = {},
) {
  const list = channels.length > 0 ? channels : DEFAULT_CHANNELS;
  const results = await Promise.allSettled(
    list.map((c) => resolveChannel(c, options)),
  );
  let status = 0;
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      log(formatLine(list[i], result.value));
    } else {
      warn(result.reason.message);
      status = 1;
    }
  });
  return status;
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_CHANNELS,
  baseUrlFrom,
  isVersion,
  formatLine,
  tagName,
  resolveChannel,
  run,
};

if (require.main === module) {
  run(process.argv.slice(2), { baseUrl: baseUrlFrom(process.env) }).then(
    (status) => {
      process.exitCode = status;
    },
  );
}
