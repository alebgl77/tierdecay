'use strict';

const crypto = require('node:crypto');

function normalizeNumber(value, serialize) {
  if (!Number.isFinite(value)) throw new TypeError('non-finite number');
  if (Object.is(value, -0)) return 0;
  if (!serialize) return value;
  return Number(value.toFixed(6));
}

function canonicalize(value, options = {}) {
  const serialize = options.serialize === true;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return normalizeNumber(value, serialize);
  if (Array.isArray(value)) return value.map((item) => canonicalize(item, options));
  if (typeof value !== 'object') throw new TypeError(`unsupported canonical value: ${typeof value}`);
  const result = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = canonicalize(value[key], options);
  }
  return result;
}

function stableStringify(value, options = {}) {
  return JSON.stringify(canonicalize(value, options));
}

function canonicalHash(value) {
  return crypto.createHash('sha256').update(stableStringify(value)).digest('hex');
}

function serialized(value) {
  return canonicalize(value, { serialize: true });
}

module.exports = { canonicalize, stableStringify, canonicalHash, serialized };
