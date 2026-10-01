'use strict';

// Observation rows: strict validation, and the one sanctioned ledger write —
// an atomic, lock-protected append of a validated measured row. Parallel
// writers (several agents, CI jobs, or terminals on one checkout) serialize on
// an exclusive lock file; readers never see a partial file because the new
// ledger is written to a temporary file and renamed over the old one.
const fs = require('node:fs');
const path = require('node:path');
const { CLASS_RE, TIERS, isIsoDate, parseLedger, observationRow } = require('./markdown');

const FIELDS = ['date', 'class', 'predicted', 'executed', 'outcome', 'escalations', 'playbook', 'obsId', 'resourceCost', 'failures', 'incidentLoss', 'risk', 'epoch'];
const MEASURED_HEADER = '| date | class | predicted | executed | outcome | esc | playbook | obs_id | resource_cost | failures | incident_loss | risk | epoch |';
const MEASURED_SEPARATOR = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
const LOCK_STALE_MS = 30000;
const LOCK_TIMEOUT_MS = 10000;

function invalid(message) {
  return Object.assign(new Error(message), { name: 'ValidationError', exitCode: 2 });
}

function validateObservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid('observation must be an object');
  for (const key of Object.keys(value)) if (!FIELDS.includes(key)) throw invalid(`unknown observation property: ${key}`);
  for (const key of FIELDS) if (!(key in value)) throw invalid(`missing observation property: ${key}`);
  for (const key of ['date', 'class', 'predicted', 'executed', 'outcome', 'playbook', 'obsId', 'epoch']) {
    if (typeof value[key] !== 'string') throw invalid(`${key} must be a JSON string`);
  }
  if (!isIsoDate(value.date)) throw invalid('date must be a valid YYYY-MM-DD date');
  if (!CLASS_RE.test(value.class)) throw invalid('class must be an exact 2-4 token signature');
  if (!TIERS.has(value.predicted) || !TIERS.has(value.executed)) throw invalid('predicted and executed must be T1, T2, or T3');
  if (!value.outcome) throw invalid('outcome must be non-empty');
  if (value.playbook !== '—' && !/^PB-[1-9][0-9]*$/.test(value.playbook)) throw invalid('playbook must be PB-n or —');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value.obsId)) throw invalid('obsId is invalid or empty');
  if (!value.epoch || /\s/.test(value.epoch)) throw invalid('epoch must be a non-empty token');
  const numerics = [
    ['resourceCost', 'resource_cost', false], ['failures', 'failures', true],
    ['incidentLoss', 'incident_loss', false], ['risk', 'risk', true],
    ['escalations', 'esc', true]
  ];
  for (const [key, label, integer] of numerics) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) throw invalid(`${label} must be a finite JSON number`);
    if (integer && (!Number.isInteger(value[key]) || value[key] < 0)) throw invalid(`${label} must be a non-negative integer`);
    if (integer && !Number.isSafeInteger(value[key])) throw invalid(`${label} exceeds the safe integer range`);
    if (!integer && value[key] < 0) throw invalid(`${label} must be finite and non-negative`);
  }
  if (value.risk > 3) throw invalid('risk must be between 0 and 3');
  if (value.outcome === 'pass' && value.failures !== 0) throw invalid('pass observation must have zero failures');
  if (value.outcome === 'fail' && value.failures === 0) throw invalid('fail observation must have failures');
  try {
    const row = observationRow(value);
    parseLedger(`# Routing Ledger\n\n## LOG\n\n${MEASURED_HEADER}\n${MEASURED_SEPARATOR}\n${row}\n`);
    return row;
  } catch (error) {
    error.exitCode = 2;
    throw error;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

// Windows reports a file that another process is deleting or holding open as
// EPERM / EACCES / EBUSY rather than EEXIST; treat those as contention.
const TRANSIENT = new Set(['EPERM', 'EACCES', 'EBUSY']);
const transient = (error) => process.platform === 'win32' && TRANSIENT.has(error.code);

function renameWithRetry(from, to) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (error) {
      if (!transient(error) || attempt >= 8) throw error;
      sleep(25 * 2 ** Math.min(attempt, 4));
    }
  }
}

function withLock(target, fn, { timeoutMs = LOCK_TIMEOUT_MS, staleMs = LOCK_STALE_MS } = {}) {
  const lock = `${target}.lock`;
  const deadline = Date.now() + timeoutMs;
  let fd = null;
  for (let attempt = 0; fd === null; attempt += 1) {
    try {
      fd = fs.openSync(lock, 'wx', 0o600);
      fs.writeSync(fd, `${process.pid}\n`);
    } catch (error) {
      if (fd !== null) {
        fs.closeSync(fd);
        try { fs.unlinkSync(lock); } catch (_) { /* best effort */ }
        throw error;
      }
      if (error.code !== 'EEXIST' && !transient(error)) throw error;
      let age = 0;
      try { age = Date.now() - fs.statSync(lock).mtimeMs; } catch (_) {
        if (Date.now() > deadline) throw Object.assign(new Error(`ledger is locked: ${lock}`), { exitCode: 3 });
        continue;
      }
      if (age > staleMs) {
        try { fs.unlinkSync(lock); } catch (_) { /* another writer broke it first */ }
        continue;
      }
      if (Date.now() > deadline) throw Object.assign(new Error(`ledger is locked: ${lock}`), { exitCode: 3 });
      sleep(Math.min(25 * 2 ** Math.min(attempt, 5), 500));
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    try { fs.unlinkSync(lock); } catch (_) { /* already gone */ }
  }
}

// Inserts a validated measured row at the top of the LOG table (newest first).
// The ledger must already use the canonical measured header; legacy ledgers
// are never silently converted.
function appendObservation(ledgerPath, observation, options = {}) {
  const row = validateObservation(observation);
  const target = path.resolve(ledgerPath);
  return withLock(target, () => {
    const text = fs.readFileSync(target, 'utf8');
    const eol = text.includes('\r\n') ? '\r\n' : '\n';
    const lines = text.split(/\r?\n/);
    const header = lines.findIndex((line) => line.trim() === MEASURED_HEADER);
    if (header < 0 || !/^\|(?:\s*:?-{3,}:?\s*\|){13}$/.test((lines[header + 1] || '').trim())) {
      throw Object.assign(new Error('ledger LOG table is not in the measured format; migrate it deliberately (ROUTER.md)'), { exitCode: 3 });
    }
    const before = parseLedger(text);
    if (before.observations.some((existing) => existing.obsId === observation.obsId)) {
      throw Object.assign(new Error(`duplicate obs_id: ${observation.obsId}`), { exitCode: 2 });
    }
    lines.splice(header + 2, 0, row);
    const next = lines.join(eol);
    parseLedger(next);
    const temp = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.tmp`);
    const mode = fs.statSync(target).mode & 0o777;
    try {
      const fd = fs.openSync(temp, 'w', mode);
      try {
        fs.writeSync(fd, next);
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      renameWithRetry(temp, target);
    } catch (error) {
      try { fs.unlinkSync(temp); } catch (_) { /* nothing to clean */ }
      throw error;
    }
    return { appended: row, ledger: target, observations: before.observations.length + 1 };
  }, options);
}

module.exports = { FIELDS, MEASURED_HEADER, MEASURED_SEPARATOR, validateObservation, appendObservation, withLock };
