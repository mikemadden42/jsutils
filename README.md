# JS Utils

A collection of useful JavaScript CLI utilities.

## Utilities

### 1. Password Generator (`newpass.js`)
Generates a secure, random password using `crypto.randomInt`.

**Usage:**
```bash
npm run newpass -- [options]
# OR
node newpass.js [options]
```

**Options:**
- `-l, --length <number>`: Password length (4-128, default: 12)
- `-n, --no-numbers`: Exclude numbers
- `-s, --no-symbols`: Exclude symbols
- `-u, --no-uppercase`: Exclude uppercase letters
- `-w, --no-lowercase`: Exclude lowercase letters
- `-h, --help`: Display help

### 2. System Info (`sysinfo.js`)
Displays information about the current system, including Node.js version, OS details, memory, network interfaces, and CPU info.

**Usage:**
```bash
npm run sysinfo
# OR
node sysinfo.js
```

### 3. Tenure Calculator (`tenure.js`)
Calculates the number of days between a given date and today.

**Usage:**
```bash
npm run tenure -- [YYYY-MM-DD]
# OR
node tenure.js [YYYY-MM-DD]
```
*Default date is 2020-07-06 if not provided.*

## Development

### Run all utilities
```bash
npm run run-all
```

### Run tests
```bash
npm test
```
