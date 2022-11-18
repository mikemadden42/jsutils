'use strict';

const crypto = require("crypto");

function generatePassword() {
    return Array(24)
        .fill("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz")
        .map(function (x) {
            return x[crypto.randomInt(0, 10_000) % x.length];
        })
        .join("");
}

console.log(generatePassword())