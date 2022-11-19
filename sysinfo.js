'use strict';

const os = require('os');
const dns = require('dns');

console.log("architecture: " + os.arch());
console.log("endianness: " + os.endianness());
console.log("hostname: " + os.hostname());
console.log("loadavg: " + os.loadavg());
console.log("machine: " + os.machine());
console.log("platform: " + os.platform());
console.log("release: " + os.release());
console.log("totalmem: " + os.totalmem());
console.log("type: " + os.type());
console.log("uptime: " + os.uptime());
console.log("version: " + os.version());

for (const server of dns.getServers()) {
  console.log("DNS server: " + server);
}

console.log("cpus: " + os.cpus().length);
for (const core of os.cpus()) {
  console.log("core: " + core.model)
}

var nets = os.networkInterfaces()
for (const name of Object.keys(nets)) {
  console.log(`net: ${name}`);
  for (const net of nets[name]) {
    console.log("\t", net.address, net.mac)
  }
}