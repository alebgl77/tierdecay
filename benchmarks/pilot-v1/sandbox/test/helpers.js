'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('../src/cli');

function sink() {
  const chunks = [];
  return { write(chunk) { chunks.push(String(chunk)); }, text() { return chunks.join(''); } };
}

// Run the CLI in-process against a fresh temp store (optionally seeded).
function run(argv, { doc, file } = {}) {
  const storeFile = file || path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'kvlite-')), 'kvlite.json');
  if (doc) fs.writeFileSync(storeFile, JSON.stringify(doc));
  const stdout = sink();
  const stderr = sink();
  const code = main(argv, { env: { KVLITE_FILE: storeFile }, stdout, stderr });
  const saved = fs.existsSync(storeFile) ? JSON.parse(fs.readFileSync(storeFile, 'utf8')) : null;
  return { code, stdout: stdout.text(), stderr: stderr.text(), saved, file: storeFile };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

module.exports = { run, deepFreeze };
