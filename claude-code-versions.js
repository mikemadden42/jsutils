#!/usr/bin/env node

"use strict";

// Port of shell-utils/claude-code-versions.{bash,pl}: print the Claude Code
// version each release channel currently points at. Each channel is a
// plain-text object in the release bucket holding a single version string.
//
// Usage: claude-code-versions.js [CHANNEL...]   (defaults to stable latest)

const DEFAULT_BASE_URL =
  "https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases";
const DEFAULT_CHANNELS = ["stable", "latest"];
// curl used --max-time 30; fetch has one overall limit rather than curl's
// separate connect and total timeouts.
const TIMEOUT_MS = 30_000;

const CHANNEL_RE = /^[a-z][a-z0-9-]*$/;
const VERSION_RE = /^[0-9]+\.[0-9]+\.[0-9]+(?:[.-][A-Za-z0-9.-]+)?$/;

// Like the shell's ${VAR:-default}, an empty variable falls back too.
const baseUrlFrom = (env) =>
  env.CLAUDE_CODE_RELEASES_BASE_URL || DEFAULT_BASE_URL;

const isVersion = (v) => VERSION_RE.test(v);

// printf '%-8s %s\n'
const formatLine = (channel, version) => `${channel.padEnd(8)} ${version}`;

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
    const res = await fetchImpl(`${baseUrl}/${channel}`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`); // like curl -f
    body = await res.text();
  } catch {
    throw new Error(`Error: could not fetch channel '${channel}'.`);
  }

  const version = body.replace(/[\r\n\t ]/g, "");
  if (!isVersion(version)) {
    throw new Error(
      `Error: channel '${channel}' resolved to invalid version '${version}'.`,
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
