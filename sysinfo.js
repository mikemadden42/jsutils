#!/usr/bin/env node

"use strict";

const os = require("os");
const dns = require("dns");
const fs = require("fs");

const formatBytes = (bytes) => {
  const units = ["B", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 B";
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** i).toFixed(2)} ${units[i]}`;
};

const formatUptime = (seconds) => {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

// On Linux, MemAvailable is a much better signal than os.freemem() (MemFree),
// since it accounts for reclaimable cache. Falls back to os.freemem() elsewhere.
function getAvailableMem() {
  if (process.platform === "linux") {
    try {
      const meminfo = fs.readFileSync("/proc/meminfo", "utf8");
      const match = meminfo.match(/^MemAvailable:\s+(\d+)\s+kB/m);
      if (match) return { bytes: parseInt(match[1], 10) * 1024, label: "available" };
    } catch (_) {
      // fall through
    }
  }
  return { bytes: os.freemem(), label: "free" };
}

function summarizeCpus(cpus) {
  const byModel = new Map();
  for (const c of cpus) {
    if (!byModel.has(c.model)) byModel.set(c.model, []);
    byModel.get(c.model).push(c.speed);
  }
  const lines = [`cpus: ${cpus.length}`];
  for (const [model, speeds] of byModel) {
    const min = Math.min(...speeds);
    const max = Math.max(...speeds);
    const avg = Math.round(speeds.reduce((a, b) => a + b, 0) / speeds.length);
    lines.push(
      `  ${speeds.length}× ${model} (min ${min} / avg ${avg} / max ${max} MHz)`,
    );
  }
  return lines.join("\n");
}

function printSysInfo() {
  // --- node / process context ---
  console.log(`node.js version: ${process.version}`);
  console.log("----------------------------------------");

  // --- general system OS ---
  console.log(`architecture: ${os.arch()}`);
  console.log(`endianness: ${os.endianness()}`);
  console.log(`hostname: ${os.hostname()}`);
  console.log(`machine: ${os.machine()}`);
  console.log(`platform: ${os.platform()}`);
  console.log(`release: ${os.release()}`);
  console.log(`type: ${os.type()}`);
  console.log(`version: ${os.version()}`);
  console.log(`system uptime: ${formatUptime(os.uptime())}`);

  const load = os
    .loadavg()
    .map((avg) => avg.toFixed(2))
    .join(", ");
  console.log(`loadavg (1m, 5m, 15m): ${load}`);
  console.log("----------------------------------------");

  // --- memory ---
  const avail = getAvailableMem();
  console.log(`totalmem: ${formatBytes(os.totalmem())}`);
  console.log(`${avail.label}mem: ${formatBytes(avail.bytes)}`);
  console.log("----------------------------------------");

  // --- user & directories ---
  console.log(`homedir: ${os.homedir()}`);
  console.log(`tmpdir: ${os.tmpdir()}`);
  try {
    const user = os.userInfo();
    console.log(`user: ${user.username} (shell: ${user.shell || "n/a"})`);
  } catch (_) {
    console.log("user: information unavailable");
  }
  console.log("----------------------------------------");

  // --- network & DNS ---
  try {
    for (const server of dns.getServers()) {
      console.log(`dns server: ${server}`);
    }
  } catch (_) {
    console.log("dns servers: information unavailable");
  }

  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    console.log(`net: ${name}`);
    for (const net of nets[name]) {
      if (net.internal) {
        console.log(`  address: ${net.address}`);
      } else {
        console.log(`  address: ${net.address} | mac: ${net.mac}`);
      }
    }
  }
  console.log("----------------------------------------");

  // --- CPUs ---
  console.log(summarizeCpus(os.cpus()));
}

module.exports = {
  formatBytes,
  formatUptime,
  getAvailableMem,
  summarizeCpus,
  printSysInfo,
};

if (require.main === module) {
  printSysInfo();
}
