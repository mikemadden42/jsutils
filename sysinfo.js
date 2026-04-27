#!/usr/bin/env node

"use strict";

const os = require("os");
const dns = require("dns");

// Helper functions to format raw bytes and seconds into human-readable strings
const formatBytes = (bytes) => (bytes / 1024 ** 3).toFixed(2) + " GB";
const formatUptime = (seconds) => {
  const d = Math.floor(seconds / (3600 * 24));
  const h = Math.floor((seconds % (3600 * 24)) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${d}d ${h}h ${m}m`;
};

// --- Node / Process Context ---
console.log(`Node.js Version: ${process.version}`);
console.log(`Process Uptime: ${formatUptime(process.uptime())}`);
console.log("----------------------------------------");

// --- General System OS ---
console.log(`architecture: ${os.arch()}`);
console.log(`endianness: ${os.endianness()}`);
console.log(`hostname: ${os.hostname()}`);
console.log(`machine: ${os.machine()}`);
console.log(`platform: ${os.platform()}`);
console.log(`release: ${os.release()}`);
console.log(`type: ${os.type()}`);
console.log(`version: ${os.version()}`);
console.log(`system uptime: ${formatUptime(os.uptime())}`);

// Format load averages to 2 decimal places and join them
const load = os
  .loadavg()
  .map((avg) => avg.toFixed(2))
  .join(", ");
console.log(`loadavg (1m, 5m, 15m): ${load}`);
console.log("----------------------------------------");

// --- Memory ---
console.log(`totalmem: ${formatBytes(os.totalmem())}`);
console.log(`freemem: ${formatBytes(os.freemem())}`);
console.log("----------------------------------------");

// --- User & Directories ---
console.log(`homedir: ${os.homedir()}`);
console.log(`tmpdir: ${os.tmpdir()}`);
try {
  const user = os.userInfo();
  console.log(`user: ${user.username} (Shell: ${user.shell || "N/A"})`);
} catch (error) {
  // Catching error in case userInfo() fails (e.g., in some containerized environments)
  console.log(`user: Information unavailable`);
}
console.log("----------------------------------------");

// --- Network & DNS ---
try {
  for (const server of dns.getServers()) {
    console.log(`DNS server: ${server}`);
  }
} catch (error) {
  console.log("DNS servers: Information unavailable");
}

const nets = os.networkInterfaces();
for (const name of Object.keys(nets)) {
  console.log(`net: ${name}`);
  for (const net of nets[name]) {
    console.log(`\tAddress: ${net.address} | MAC: ${net.mac}`);
  }
}
console.log("----------------------------------------");

// --- CPUs ---
const cpus = os.cpus();
console.log(`cpus: ${cpus.length}`);
for (const core of cpus) {
  // Added core speed for a bit more detail
  console.log(`\tcore: ${core.model} (${core.speed} MHz)`);
}
