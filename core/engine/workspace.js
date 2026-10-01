'use strict';

// Locating and loading TierDecay state for one project root. Shared by the CLI
// and the MCP server so every entry point resolves state identically.
const fs = require('node:fs');
const path = require('node:path');
const { parseLedger, parsePlaybook } = require('./markdown');

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UsageError';
    this.exitCode = 2;
  }
}

// Non-native adapters keep state in .tierdecay/; the native Claude Code
// adapter and plugin keep it in .claude/. Explicit paths always win.
function statePaths(root, overrides = {}) {
  const base = path.resolve(root || process.cwd());
  const portable = {
    layout: 'portable',
    ledger: path.join(base, '.tierdecay', 'ledger.md'),
    playbook: path.join(base, '.tierdecay', 'playbook.md')
  };
  const native = {
    layout: 'claude-native',
    ledger: path.join(base, '.claude', 'routing-ledger.md'),
    playbook: path.join(base, '.claude', 'skills', 'repo-playbook', 'SKILL.md')
  };
  const chosen = !fs.existsSync(portable.ledger) && fs.existsSync(native.ledger) ? native : portable;
  return {
    root: base,
    layout: overrides.ledger || overrides.playbook ? 'explicit' : chosen.layout,
    ledger: overrides.ledger ? path.resolve(base, overrides.ledger) : chosen.ledger,
    playbook: overrides.playbook ? path.resolve(base, overrides.playbook) : chosen.playbook,
    config: overrides.config ? path.resolve(base, overrides.config) : path.join(base, '.tierdecay', 'router-config.json'),
    models: path.join(base, '.tierdecay', 'MODELS.md')
  };
}

function readText(file, label) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') throw new UsageError(`${label} not found: ${file}`);
    throw error;
  }
}

function loadState(paths) {
  const playbookText = readText(paths.playbook, 'playbook');
  return {
    ledger: parseLedger(readText(paths.ledger, 'ledger')),
    playbook: parsePlaybook(playbookText),
    playbookText
  };
}

// Returns the parsed router configuration, or null when the file is absent.
function loadConfig(paths) {
  if (!fs.existsSync(paths.config)) return null;
  try {
    return JSON.parse(fs.readFileSync(paths.config, 'utf8'));
  } catch (error) {
    throw new UsageError(`invalid JSON in ${paths.config}: ${error.message}`);
  }
}

module.exports = { UsageError, statePaths, loadState, loadConfig, readText };
