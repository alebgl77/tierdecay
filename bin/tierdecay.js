#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { stableStringify, serialized } = require('../core/engine/canonical');
const { CLASS_RE, TIERS, isIsoDate, parseLedger, parsePlaybook, observationRow } = require('../core/engine/markdown');
const { route } = require('../core/engine/route');
const { replay } = require('../core/engine/replay');
const { status } = require('../core/engine/status');
const { exportPosterior } = require('../core/engine/export');
const { bench } = require('../core/engine/bench');

function usage() {
  return `TierDecay deterministic router v0.4.0

Usage:
  tierdecay route --request FILE [--ledger FILE] [--playbook FILE] [--config FILE] [--policy legacy|shadow|optimize]
  tierdecay observe --observation FILE
  tierdecay replay --scenario FILE [--ledger FILE] [--playbook FILE] --config FILE [--policy shadow|optimize]
  tierdecay status [--ledger FILE] [--playbook FILE] [--epoch EPOCH]
  tierdecay export --format json|claude|cursor|skills [--out DIR] [--ledger FILE] [--playbook FILE] [--epoch EPOCH]
  tierdecay bench --scenario FILE --config FILE [--ledger FILE] [--playbook FILE] [--permutations N] [--seed S]

FILE may be - for stdin (once). Defaults use .tierdecay/{ledger.md,playbook.md,router-config.json},
or the native .claude/routing-ledger.md and .claude/skills/repo-playbook/SKILL.md when only those exist.
Output is canonical JSON without timestamps; observe outputs one validated Markdown row;
export --format claude|cursor outputs a Markdown routing table; export --format skills writes
Agent Skills for live playbook entries under --out and never touches the ledger or playbook.`;
}

function argumentsOf(argv) {
  const command = argv[0];
  if (!['route', 'observe', 'replay', 'status', 'export', 'bench'].includes(command)) throw Object.assign(new Error(usage()), { exitCode: 2 });
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

// Non-native adapters keep state in .tierdecay/; the native Claude Code
// adapter and plugin keep it in .claude/. Explicit options always win.
function defaultStatePaths() {
  const nativeLedger = path.join(process.cwd(), '.claude', 'routing-ledger.md');
  if (!fs.existsSync(defaultFile('ledger.md')) && fs.existsSync(nativeLedger)) {
    return { ledger: nativeLedger, playbook: path.join(process.cwd(), '.claude', 'skills', 'repo-playbook', 'SKILL.md') };
  }
  return { ledger: defaultFile('ledger.md'), playbook: defaultFile('playbook.md') };
}

function state(options) {
  const defaults = defaultStatePaths();
  const ledger = parseLedger(read(options.ledger || defaults.ledger));
  const playbookText = read(options.playbook || defaults.playbook);
  const playbook = parsePlaybook(playbookText);
  return { ledger, playbook, playbookText };
}

function integer(value, label) {
  if (value === undefined) return undefined;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw Object.assign(new Error(`${label} must be a non-negative integer`), { exitCode: 2 });
  return Number(value);
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
  const allowedByCommand = {
    route: ['request', 'ledger', 'playbook', 'config', 'policy'],
    replay: ['scenario', 'ledger', 'playbook', 'config', 'policy'],
    status: ['ledger', 'playbook', 'epoch'],
    export: ['format', 'out', 'ledger', 'playbook', 'epoch'],
    bench: ['scenario', 'ledger', 'playbook', 'config', 'permutations', 'seed']
  };
  const allowed = new Set(allowedByCommand[command]);
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw Object.assign(new Error(`unknown option: --${key}`), { exitCode: 2 });
  const { ledger, playbook, playbookText } = state(options);
  if (command === 'status') {
    output(status({ ledger, playbook, epoch: options.epoch }));
  } else if (command === 'export') {
    if (!options.format) throw Object.assign(new Error('export requires --format'), { exitCode: 2 });
    if (options.out && options.format !== 'skills') throw Object.assign(new Error('--out is only valid with --format skills'), { exitCode: 2 });
    const result = exportPosterior({ ledger, playbook, playbookText, epoch: options.epoch, format: options.format, out: options.out });
    if (result.kind === 'json') output(result.value);
    else process.stdout.write(result.value);
  } else if (command === 'bench') {
    const config = json(options.config || defaultFile('router-config.json'));
    output(bench({
      jsonl: read(options.scenario), ledger, playbook, config,
      permutations: integer(options.permutations, 'permutations') ?? 20,
      seed: integer(options.seed, 'seed') ?? 1
    }));
  } else if (command === 'route') {
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
