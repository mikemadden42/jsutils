#!/usr/bin/env node

/**
 * Node.js CLI Application: Random Password Generator
 *
 * This script generates a random password based on user-defined criteria.
 *
 * Usage:
 * node password-gen.js [options]
 * ./password-gen.js [options] (after making it executable)
 *
 * Options:
 * -l, --length <number>    Specify the password length (default: 12)
 * -n, --no-numbers         Exclude numbers from the password
 * -s, --no-symbols         Exclude symbols from the password
 * -u, --no-uppercase       Exclude uppercase letters from the password
 * -w, --no-lowercase       Exclude lowercase letters from the password
 * -h, --help               Display help information
 *
 * Example:
 * node password-gen.js
 * node password-gen.js -l 20
 * node password-gen.js --length 16 --no-symbols --no-numbers
 * ./password-gen.js -l 10 -w -u
 */

const crypto = require("crypto"); // Used for generating cryptographically strong random bytes
const process = require("process"); // Provides access to command line arguments and process information

// --- Configuration and Character Sets ---
const DEFAULT_PASSWORD_LENGTH = 12;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 128; // Practical limit

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

  // Iterate through arguments starting from the third element (node executable, script name, then args)
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
              `Error: Invalid length specified. Must be a number between ${MIN_PASSWORD_LENGTH} and ${MAX_PASSWORD_LENGTH}.`,
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
        console.warn(
          `Warning: Unknown option "${arg}". Use -h or --help for usage.`,
        );
        break;
    }
  }
  return options;
}

// --- Display Help Message ---
function showHelp() {
  console.log(`
Usage:
  node ${process.argv[1]} [options]
  ./${process.argv[1].split("/").pop()} [options] (after making it executable)

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
  const requiredChars = []; // To ensure at least one of each included type

  if (options.includeLowercase) {
    allowedChars += CHAR_SETS.lowercase;
    requiredChars.push(getRandomChar(CHAR_SETS.lowercase));
  }
  if (options.includeUppercase) {
    allowedChars += CHAR_SETS.uppercase;
    requiredChars.push(getRandomChar(CHAR_SETS.uppercase));
  }
  if (options.includeNumbers) {
    allowedChars += CHAR_SETS.numbers;
    requiredChars.push(getRandomChar(CHAR_SETS.numbers));
  }
  if (options.includeSymbols) {
    allowedChars += CHAR_SETS.symbols;
    requiredChars.push(getRandomChar(CHAR_SETS.symbols));
  }

  if (allowedChars.length === 0) {
    console.error(
      "Error: No character sets selected. Please include at least one type (e.g., lowercase, numbers).",
    );
    process.exit(1);
  }

  // Adjust length to accommodate required characters if any options exclude character types
  const finalLength = Math.max(options.length, requiredChars.length);
  if (finalLength > MAX_PASSWORD_LENGTH) {
    console.error(
      `Error: Resulting password length (${finalLength}) exceeds maximum allowed length (${MAX_PASSWORD_LENGTH}).`,
    );
    process.exit(1);
  }

  let password = "";
  // Add required characters first to ensure diversity
  password = requiredChars.join("");

  // Fill the rest of the password length
  for (let i = password.length; i < finalLength; i++) {
    password += getRandomChar(allowedChars);
  }

  // Shuffle the password to randomize the position of required characters
  return shuffleString(password);
}

/**
 * Returns a cryptographically secure random character from the given string.
 * @param {string} charSet The string of characters to choose from.
 * @returns {string} A single random character.
 */
function getRandomChar(charSet) {
  if (charSet.length === 0) {
    return "";
  }
  // Generate a random byte, map it to an index within the character set.
  // Use modulo to ensure the index is within bounds, and loop if the random byte
  // results in an index outside a perfect distribution to avoid bias.
  const max = 256 - (256 % charSet.length);
  let randomByte;
  do {
    randomByte = crypto.randomBytes(1)[0];
  } while (randomByte >= max);
  return charSet[randomByte % charSet.length];
}

/**
 * Shuffles a string using the Fisher-Yates (Knuth) algorithm.
 * @param {string} str The string to shuffle.
 * @returns {string} The shuffled string.
 */
function shuffleString(str) {
  const arr = str.split("");
  let currentIndex = arr.length;
  let randomIndex;

  // While there remain elements to shuffle.
  while (currentIndex !== 0) {
    // Pick a remaining element.
    // Use crypto.randomBytes for secure randomness.
    // Convert a random byte to a float between 0 and 1, then scale.
    randomIndex = Math.floor((crypto.randomBytes(1)[0] / 256) * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [arr[currentIndex], arr[randomIndex]] = [
      arr[randomIndex],
      arr[currentIndex],
    ];
  }

  return arr.join("");
}

// --- Main Execution ---
async function main() {
  const options = parseArgs(process.argv);

  if (options.showHelp) {
    showHelp();
    process.exit(0);
  }

  // Basic validation for character sets
  if (
    !options.includeLowercase &&
    !options.includeUppercase &&
    !options.includeNumbers &&
    !options.includeSymbols
  ) {
    console.error(
      "Error: At least one character type (lowercase, uppercase, numbers, or symbols) must be included.",
    );
    showHelp();
    process.exit(1);
  }

  try {
    const password = generatePassword(options);
    console.log(`Generated Password: ${password}`);
  } catch (error) {
    console.error(`An unexpected error occurred: ${error.message}`);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main();
}
