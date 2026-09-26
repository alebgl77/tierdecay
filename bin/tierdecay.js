#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stableStringify, serialized } = require('../core/engine/canonical');
const { CLASS_RE, TIERS, isIsoDate, parseLedger, parsePlaybook, observationRow } = require('../core/engine/markdown');
const { route } = require('../core/engine/route');
const { replay } = require('../core/engine/replay');

function usage() {
  return `TierDecay deterministic router v0.3.0

Usage:
  tierdecay route --request FILE [--ledger FILE] [--playbook FILE] [--config FILE] [--policy legacy|shadow|optimize]
  tierdecay observe --observation FILE
  tierdecay replay --scenario FILE [--ledger FILE] [--playbook FILE] --config FILE [--policy shadow|optimize]

FILE may be - for stdin (once). Defaults use .tierdecay/{ledger.md,playbook.md,router-config.json}.
Output is canonical JSON without timestamps; observe outputs one validated Markdown row.`;
}

function argumentsOf(argv) {
  const command = argv[0];
  if (!['route', 'observe', 'replay'].includes(command)) throw Object.assign(new Error(usage()), { exitCode: 2 });
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw Object.assign(new Error(`invalid arguments\n${usage()}`), { exitCode: 2 });
    if (options[key.slice(2)] !== undefined) throw Object.assign(new Error(`duplicate option: ${key}`), { exitCode: 2 });
    options[key.slice(2)] = value;
  }
  return { command, options };
}

let stdinCache;
function read(file, required = true) {
  if (!file) {
    if (required) throw Object.assign(new Error('missing required file option'), { exitCode: 2 });
    return null;
  }
  if (file === '-') {
    if (stdinCache !== undefined) throw Object.assign(new Error('stdin may be consumed only once'), { exitCode: 2 });
    stdinCache = fs.readFileSync(0, 'utf8');
    return stdinCache;
  }
  return fs.readFileSync(file, 'utf8');
}

function json(file, required = true) {
  const source = read(file, required);
  if (source === null) return null;
  try { return JSON.parse(source); }
  catch (error) { throw Object.assign(new Error(`invalid JSON in ${file}: ${error.message}`), { exitCode: 2 }); }
}

function defaultFile(name) {
  return path.join(process.cwd(), '.tierdecay', name);
}

function output(value) {
  process.stdout.write(`${stableStringify(serialized(value))}\n`);
}

function state(options) {
  const ledger = parseLedger(read(options.ledger || defaultFile('ledger.md')));
  const playbook = parsePlaybook(read(options.playbook || defaultFile('playbook.md')));
  return { ledger, playbook };
}

function validateObservation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Object.assign(new Error('observation must be an object'), { exitCode: 2 });
  const allowed = new Set(['date', 'class', 'predicted', 'executed', 'outcome', 'escalations', 'playbook', 'obsId', 'resourceCost', 'failures', 'incidentLoss', 'risk', 'epoch']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw Object.assign(new Error(`unknown observation property: ${key}`), { exitCode: 2 });
  for (const key of allowed) if (!(key in value)) throw Object.assign(new Error(`missing observation property: ${key}`), { exitCode: 2 });
  for (const key of ['date', 'class', 'predicted', 'executed', 'outcome', 'playbook', 'obsId', 'epoch']) {
    if (typeof value[key] !== 'string') throw Object.assign(new Error(`${key} must be a JSON string`), { exitCode: 2 });
  }
  if (!isIsoDate(value.date)) throw Object.assign(new Error('date must be a valid YYYY-MM-DD date'), { exitCode: 2 });
  if (!CLASS_RE.test(value.class)) throw Object.assign(new Error('class must be an exact 2-4 token signature'), { exitCode: 2 });
  if (!TIERS.has(value.predicted) || !TIERS.has(value.executed)) throw Object.assign(new Error('predicted and executed must be T1, T2, or T3'), { exitCode: 2 });
  if (!value.outcome) throw Object.assign(new Error('outcome must be non-empty'), { exitCode: 2 });
  if (value.playbook !== '—' && !/^PB-[1-9][0-9]*$/.test(value.playbook)) throw Object.assign(new Error('playbook must be PB-n or —'), { exitCode: 2 });
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value.obsId)) throw Object.assign(new Error('obsId is invalid or empty'), { exitCode: 2 });
  if (!value.epoch || /\s/.test(value.epoch)) throw Object.assign(new Error('epoch must be a non-empty token'), { exitCode: 2 });
  const numerics = [
    ['resourceCost', 'resource_cost', false], ['failures', 'failures', true],
    ['incidentLoss', 'incident_loss', false], ['risk', 'risk', true],
    ['escalations', 'esc', true]
  ];
  for (const [key, label, integer] of numerics) {
    if (typeof value[key] !== 'number' || !Number.isFinite(value[key])) {
      throw Object.assign(new Error(`${label} must be a finite JSON number`), { exitCode: 2 });
    }
    if (integer && (!Number.isInteger(value[key]) || value[key] < 0)) throw Object.assign(new Error(`${label} must be a non-negative integer`), { exitCode: 2 });
    if (integer && !Number.isSafeInteger(value[key])) throw Object.assign(new Error(`${label} exceeds the safe integer range`), { exitCode: 2 });
    if (!integer && value[key] < 0) throw Object.assign(new Error(`${label} must be finite and non-negative`), { exitCode: 2 });
  }
  if (value.risk > 3) throw Object.assign(new Error('risk must be between 0 and 3'), { exitCode: 2 });
  if (value.outcome === 'pass' && value.failures !== 0) throw Object.assign(new Error('pass observation must have zero failures'), { exitCode: 2 });
  if (value.outcome === 'fail' && value.failures === 0) throw Object.assign(new Error('fail observation must have failures'), { exitCode: 2 });
  try {
    const row = observationRow(value);
    const header = '| date | class | predicted | executed | outcome | esc | playbook | obs_id | resource_cost | failures | incident_loss | risk | epoch |';
    const separator = '|---|---|---|---|---|---|---|---|---|---|---|---|---|';
    parseLedger(`# Routing Ledger\n\n## LOG\n\n${header}\n${separator}\n${row}\n`);
    return row;
  } catch (error) {
    error.exitCode = 2;
    throw error;
  }
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h') || argv.length === 0) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const { command, options } = argumentsOf(argv);
  if (command === 'observe') {
    const allowed = new Set(['observation']);
    for (const key of Object.keys(options)) if (!allowed.has(key)) throw Object.assign(new Error(`unknown option: --${key}`), { exitCode: 2 });
    process.stdout.write(`${validateObservation(json(options.observation))}\n`);
    return;
  }
  const allowed = new Set(command === 'route'
    ? ['request', 'ledger', 'playbook', 'config', 'policy']
    : ['scenario', 'ledger', 'playbook', 'config', 'policy']);
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw Object.assign(new Error(`unknown option: --${key}`), { exitCode: 2 });
  const { ledger, playbook } = state(options);
  if (command === 'route') {
    const policy = options.policy || 'shadow';
    const config = policy === 'legacy' ? null : json(options.config || defaultFile('router-config.json'));
    output(route({ request: json(options.request), ledger, playbook, config, policy }));
  } else {
    const config = json(options.config || defaultFile('router-config.json'));
    output(replay({ jsonl: read(options.scenario), ledger, playbook, config, policy: options.policy || 'shadow' }));
  }
}

try { main(process.argv.slice(2)); }
catch (error) {
  process.stderr.write(`${error.name || 'Error'}: ${error.message}\n`);
  process.exitCode = error.exitCode || (error.code === 'ENOENT' ? 2 : 5);
}
