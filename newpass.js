#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const path = require("path");

const DEFAULT_PASSWORD_LENGTH = 12;
const MAX_PASSWORD_LENGTH = 128;

const CHAR_SETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_+=[]{}|;:,.<>?/~`",
};

function parseArgs(args) {
  const options = {
    length: DEFAULT_PASSWORD_LENGTH,
    includeLowercase: true,
    includeUppercase: true,
    includeNumbers: true,
    includeSymbols: true,
    quiet: false,
    showHelp: false,
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "-l":
      case "--length": {
        const raw = args[++i];
        if (raw === undefined) {
          throw new Error("--length or -l requires a number.");
        }
        if (!/^\d+$/.test(raw)) {
          throw new Error(`Invalid length "${raw}". Must be an integer.`);
        }
        const len = parseInt(raw, 10);
        if (len < 1 || len > MAX_PASSWORD_LENGTH) {
          throw new Error(
            `Length ${len} out of range. Must be between 1 and ${MAX_PASSWORD_LENGTH}.`,
          );
        }
        options.length = len;
        break;
      }
      case "-q":
      case "--quiet":
        options.quiet = true;
        break;
      case "-n":
      case "--no-numbers":
        options.includeNumbers = false;
        break;
      case "-s":
      case "--no-symbols":
        options.includeSymbols = false;
        break;
      case "-u":
      case "--no-uppercase":
        options.includeUppercase = false;
        break;
      case "-w":
      case "--no-lowercase":
        options.includeLowercase = false;
        break;
      case "-h":
      case "--help":
        options.showHelp = true;
        break;
      default:
        throw new Error(
          `Unknown option "${arg}". Use -h or --help for usage.`,
        );
    }
  }
  return options;
}

function showHelp() {
  const scriptName = path.basename(process.argv[1]);
  console.log(`
Usage:
  node ${scriptName} [options]

Options:
  -l, --length <number>    Specify the password length (default: ${DEFAULT_PASSWORD_LENGTH})
                           Min: 1, Max: ${MAX_PASSWORD_LENGTH}
                           (must be >= number of included character classes)
  -n, --no-numbers         Exclude numbers (0-9)
  -s, --no-symbols         Exclude symbols (!@#$%^&*()-_+=[]{}|;:,.<>?/~\`)
  -u, --no-uppercase       Exclude uppercase letters (A-Z)
  -w, --no-lowercase       Exclude lowercase letters (a-z)
  -q, --quiet              Print only the password (suitable for piping)
  -h, --help               Display this help message
`);
}

function generatePassword(options) {
  let allowedChars = "";
  const passwordArr = [];

  if (options.includeLowercase) {
    allowedChars += CHAR_SETS.lowercase;
    passwordArr.push(getRandomChar(CHAR_SETS.lowercase));
  }
  if (options.includeUppercase) {
    allowedChars += CHAR_SETS.uppercase;
    passwordArr.push(getRandomChar(CHAR_SETS.uppercase));
  }
  if (options.includeNumbers) {
    allowedChars += CHAR_SETS.numbers;
    passwordArr.push(getRandomChar(CHAR_SETS.numbers));
  }
  if (options.includeSymbols) {
    allowedChars += CHAR_SETS.symbols;
    passwordArr.push(getRandomChar(CHAR_SETS.symbols));
  }

  if (allowedChars.length === 0) {
    throw new Error(
      "No character sets selected. Please include at least one type.",
    );
  }

  if (options.length < passwordArr.length) {
    throw new Error(
      `Requested length (${options.length}) is less than the number of required character classes (${passwordArr.length}).`,
    );
  }
  if (options.length > MAX_PASSWORD_LENGTH) {
    throw new Error(
      `Requested length (${options.length}) exceeds maximum allowed length (${MAX_PASSWORD_LENGTH}).`,
    );
  }

  for (let i = passwordArr.length; i < options.length; i++) {
    passwordArr.push(getRandomChar(allowedChars));
  }

  return shuffleArray(passwordArr).join("");
}

function getRandomChar(charSet) {
  return charSet[crypto.randomInt(0, charSet.length)];
}

function shuffleArray(arr) {
  let currentIndex = arr.length;

  while (currentIndex !== 0) {
    const randomIndex = crypto.randomInt(0, currentIndex);
    currentIndex--;

    [arr[currentIndex], arr[randomIndex]] = [
      arr[randomIndex],
      arr[currentIndex],
    ];
  }

  return arr;
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  if (options.showHelp) {
    showHelp();
    process.exit(0);
  }

  try {
    const password = generatePassword(options);
    console.log(options.quiet ? password : `Generated Password: ${password}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { generatePassword, parseArgs };
