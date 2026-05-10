#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const path = require("path");

// --- Configuration and Character Sets ---
const DEFAULT_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 128;

const CHAR_SETS = {
  lowercase: "abcdefghijklmnopqrstuvwxyz",
  uppercase: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  numbers: "0123456789",
  symbols: "!@#$%^&*()-_+=[]{}|;:,.<>?/~`",
};

// --- Command Line Argument Parsing ---
function parseArgs(args) {
  const options = {
    length: DEFAULT_PASSWORD_LENGTH,
    includeLowercase: true,
    includeUppercase: true,
    includeNumbers: true,
    includeSymbols: true,
    showHelp: false,
  };

  for (let i = 2; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case "-l":
      case "--length":
        if (i + 1 < args.length) {
          const len = parseInt(args[++i], 10);
          if (
            !isNaN(len) &&
            len >= MIN_PASSWORD_LENGTH &&
            len <= MAX_PASSWORD_LENGTH
          ) {
            options.length = len;
          } else {
            console.error(
              `Error: Invalid length specified. Must be between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH}.`,
            );
            process.exit(1);
          }
        } else {
          console.error("Error: --length or -l requires a number.");
          process.exit(1);
        }
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
        console.error(
          `Error: Unknown option "${arg}". Use -h or --help for usage.`,
        );
        process.exit(1);
    }
  }
  return options;
}

// --- Display Help Message ---
function showHelp() {
  const scriptName = path.basename(process.argv[1]);
  console.log(`
Usage:
  node ${scriptName} [options]

Options:
  -l, --length <number>    Specify the password length (default: ${DEFAULT_PASSWORD_LENGTH})
                           Min: ${MIN_PASSWORD_LENGTH}, Max: ${MAX_PASSWORD_LENGTH}
  -n, --no-numbers         Exclude numbers (0-9)
  -s, --no-symbols         Exclude symbols (!@#$%^&*()-_+=[]{}|;:,.<>?/~)
  -u, --no-uppercase       Exclude uppercase letters (A-Z)
  -w, --no-lowercase       Exclude lowercase letters (a-z)
  -h, --help               Display this help message
`);
}

// --- Password Generation Logic ---
function generatePassword(options) {
  let allowedChars = "";
  const passwordArr = []; // Keep as an array for easier handling

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

  // Shuffle the array and return as a string
  return shuffleArray(passwordArr).join("");
}

// Replaced manual math with crypto.randomInt
function getRandomChar(charSet) {
  if (charSet.length === 0) return "";
  return charSet[crypto.randomInt(0, charSet.length)];
}

// Replaced Math.floor and division with crypto.randomInt to fix tiny bias
function shuffleArray(arr) {
  let currentIndex = arr.length;

  while (currentIndex !== 0) {
    const randomIndex = crypto.randomInt(0, currentIndex);
    currentIndex--;

    // Swap
    [arr[currentIndex], arr[randomIndex]] = [
      arr[randomIndex],
      arr[currentIndex],
    ];
  }

  return arr;
}

module.exports = { generatePassword };

// --- Main Execution ---
async function main() {
  const options = parseArgs(process.argv);

  if (options.showHelp) {
    showHelp();
    process.exit(0);
  }

  try {
    const password = generatePassword(options);
    console.log(`Generated Password: ${password}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
