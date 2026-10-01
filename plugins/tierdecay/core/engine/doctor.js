'use strict';

// `tierdecay doctor`: a read-only health check for a project's TierDecay
// installation, designed for CI gates on Linux runners. Every check reports
// ok / warn / fail with a one-line detail; any fail makes the command exit 1.
const fs = require('node:fs');
const path = require('node:path');
const { parseLedger, parsePlaybook } = require('./markdown');
const { validateConfig } = require('./statistics');
const { statePaths } = require('./workspace');
const { status } = require('./status');

const PLAYBOOK_CAP = 150;

function check(id, state, detail) {
  return { id, status: state, detail };
}

function nodeVersion() {
  const major = Number(process.versions.node.split('.')[0]);
  return major >= 18
    ? check('node', 'ok', `Node.js ${process.versions.node}`)
    : check('node', 'fail', `Node.js ${process.versions.node} is below the supported 18`);
}

function permissions(file, label) {
  if (process.platform === 'win32' || !fs.existsSync(file)) return null;
  const mode = fs.statSync(file).mode;
  if (mode & 0o002) return check(`${label}-permissions`, 'fail', `${file} is world-writable (mode ${(mode & 0o777).toString(8)})`);
  return check(`${label}-permissions`, 'ok', `mode ${(mode & 0o777).toString(8)}`);
}

// Lines that count against the playbook's 150-line hard cap: PATTERNS and
// QUARANTINE content, excluding fenced documentation.
function playbookLines(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => line === '## PATTERNS');
  return start < 0 ? 0 : lines.slice(start).filter((line) => line.trim()).length;
}

function doctor({ root, overrides = {}, epoch } = {}) {
  const paths = statePaths(root, overrides);
  const checks = [nodeVersion()];
  let ledger = null;
  let playbook = null;

  for (const [label, file, parse] of [['ledger', paths.ledger, parseLedger], ['playbook', paths.playbook, parsePlaybook]]) {
    if (!fs.existsSync(file)) {
      checks.push(check(label, 'fail', `missing: ${path.relative(paths.root, file) || file} (run the installer or /tierdecay:init)`));
      continue;
    }
    const text = fs.readFileSync(file, 'utf8');
    try {
      const parsed = parse(text);
      if (label === 'ledger') ledger = parsed; else playbook = parsed;
      const crlf = text.includes('\r\n');
      checks.push(check(label, crlf ? 'warn' : 'ok', `${paths.layout} layout: ${path.relative(paths.root, file)}${crlf ? ' (CRLF line endings; LF recommended)' : ''}`));
    } catch (error) {
      checks.push(check(label, 'fail', `${path.relative(paths.root, file)}: ${error.message}`));
    }
    const mode = permissions(file, label);
    if (mode) checks.push(mode);
    if (label === 'playbook' && playbook) {
      const used = playbookLines(text);
      checks.push(check('playbook-cap', used > PLAYBOOK_CAP ? 'fail' : used > PLAYBOOK_CAP * 0.9 ? 'warn' : 'ok', `${used}/${PLAYBOOK_CAP} lines`));
    }
  }

  checks.push(fs.existsSync(paths.models)
    ? check('models', 'ok', '.tierdecay/MODELS.md present')
    : check('models', 'warn', '.tierdecay/MODELS.md missing: binding policy is not recorded in this repo'));

  let config = null;
  if (!fs.existsSync(paths.config)) {
    checks.push(check('router-config', 'ok', 'no router config: advisor runs the protocol (legacy/shadow) only'));
  } else {
    try {
      config = validateConfig(JSON.parse(fs.readFileSync(paths.config, 'utf8')));
      checks.push(check('router-config', 'ok', config.enabled ? `calibrated for epoch ${config.bindingEpoch}` : 'disabled (shadow falls back to the protocol)'));
    } catch (error) {
      checks.push(check('router-config', 'fail', `${path.relative(paths.root, paths.config)}: ${error.message}`));
    }
  }

  if (paths.layout === 'claude-native') {
    const guard = path.join(paths.root, '.claude', 'hooks', 'tierdecay-guard.sh');
    if (fs.existsSync(guard)) {
      const executable = process.platform === 'win32' || (fs.statSync(guard).mode & 0o111) !== 0;
      checks.push(check('guard', executable ? 'ok' : 'fail', executable ? 'executor guard hook installed' : `${guard} is not executable`));
    } else {
      checks.push(check('guard', 'warn', 'no copied guard hook (expected when the Claude Code plugin provides it)'));
    }
  }

  const effectiveEpoch = epoch || (config && config.enabled ? config.bindingEpoch : undefined);
  if (ledger && playbook) {
    const view = status({ ledger, playbook, epoch: effectiveEpoch });
    // Probes are routing, not debt: only bookkeeping the orchestrator owes counts.
    const owed = view.classes.filter((row) => /^(decay|recertify|add a PRIORS|revise)/.test(row.next));
    checks.push(check('bookkeeping', owed.length ? 'warn' : 'ok', owed.length
      ? `${owed.length} class(es) need orchestrator action: ${owed.map((row) => `${row.class} → ${row.next.split(':')[0]}`).join('; ')}`
      : `${view.summary.classes} class(es), nothing owed`));
    const unepoched = playbook.entries.filter((entry) => entry.status === 'live' && !entry.bindingEpoch).length;
    if (unepoched) checks.push(check('epochs', 'warn', `${unepoched} live entr${unepoched === 1 ? 'y has' : 'ies have'} no epoch: line; model changes cannot trigger recertification for them`));
  }

  const summary = { ok: 0, warn: 0, fail: 0 };
  for (const item of checks) summary[item.status] += 1;
  return { schemaVersion: 1, root: paths.root, layout: paths.layout, epoch: effectiveEpoch || null, healthy: summary.fail === 0, summary, checks };
}

module.exports = { doctor, PLAYBOOK_CAP };
