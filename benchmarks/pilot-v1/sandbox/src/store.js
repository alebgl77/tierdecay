'use strict';

const fs = require('node:fs');
const { migrate, CURRENT_VERSION } = require('./migrations');
const { SchemaError } = require('./errors');

// The document is { version, records: { [key]: record } } where a record is
// { value, createdAt?, ... }. Loading always migrates to CURRENT_VERSION.
// Mutations are in-memory until save() is called.
class Store {
  constructor(file) {
    this.file = file;
    this.doc = null;
  }

  load() {
    let raw = { version: 1, records: {} };
    if (fs.existsSync(this.file)) raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    if (!raw || typeof raw !== 'object' || typeof raw.records !== 'object') throw new SchemaError('corrupt store document');
    this.doc = migrate(raw);
    return this;
  }

  has(key) { return Object.prototype.hasOwnProperty.call(this.doc.records, key); }
  get(key) { return this.has(key) ? this.doc.records[key] : undefined; }
  keys() { return Object.keys(this.doc.records).sort(); }
  put(key, record) { this.doc.records[key] = record; }
  remove(key) { delete this.doc.records[key]; }

  save() {
    if (this.doc.version !== CURRENT_VERSION) throw new SchemaError('refusing to save an unmigrated document');
    fs.writeFileSync(this.file, `${JSON.stringify(this.doc, null, 2)}\n`);
  }
}

module.exports = { Store };
