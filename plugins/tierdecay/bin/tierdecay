#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { stableStringify, serialized } = require('../core/engine/canonical');
const { route } = require('../core/engine/route');
const { replay } = require('../core/engine/replay');
const { status } = require('../core/engine/status');
const { exportPosterior, FORMATS } = require('../core/engine/export');
const { bench } = require('../core/engine/bench');
const { doctor } = require('../core/engine/doctor');
const { validateObservation, appendObservation } = require('../core/engine/observation');
const { statePaths, loadState } = require('../core/engine/workspace');
const { VERSION } = require('../core/engine/version');

const COMMANDS = {
  route: ['request', 'ledger', 'playbook', 'config', 'policy', 'root'],
  observe: ['observation', 'append'],
  replay: ['scenario', 'ledger', 'playbook', 'config', 'policy', 'root'],
  status: ['ledger', 'playbook', 'epoch', 'root'],
  export: ['format', 'out', 'ledger', 'playbook', 'epoch', 'root'],
  bench: ['scenario', 'ledger', 'playbook', 'config', 'permutations', 'seed', 'root'],
  doctor: ['ledger', 'playbook', 'config', 'epoch', 'root'],
  mcp: ['ledger', 'playbook', 'config', 'root', 'allow-ledger-append'],
  completion: ['shell']
};

function usage() {
  return `TierDecay v${VERSION} — per-repo learning layer for AI coding model routers

Usage:
  tierdecay route --request FILE [--policy legacy|shadow|optimize] [STATE]
  tierdecay status [--epoch EPOCH] [STATE]
  tierdecay export --format ${FORMATS.join('|')} [--out DIR] [--epoch EPOCH] [STATE]
  tierdecay observe --observation FILE [--append LEDGER]
  tierdecay replay --scenario FILE --config FILE [--policy shadow|optimize] [STATE]
  tierdecay bench --scenario FILE --config FILE [--permutations N] [--seed S] [STATE]
  tierdecay doctor [--epoch EPOCH] [STATE]
  tierdecay mcp [--allow-ledger-append true] [STATE]
  tierdecay completion --shell bash
  tierdecay --version | --help

STATE: [--root DIR] [--ledger FILE] [--playbook FILE] [--config FILE]. Defaults resolve
from --root (default: cwd): .tierdecay/{ledger.md,playbook.md,router-config.json}, or the
native .claude/routing-ledger.md and .claude/skills/repo-playbook/SKILL.md when only those
exist. FILE may be - for stdin (once).

Output is canonical JSON without timestamps; observe prints one validated Markdown row
(--append inserts it into a measured ledger atomically under a lock); export
--format claude|codex|antigravity|cursor prints a Markdown routing table; --format skills
writes Agent Skills for live playbook entries under --out; mcp serves the same logic to any
MCP client over stdio (read-only unless --allow-ledger-append true).

Exit codes: 0 ok · 1 doctor found failures · 2 invalid input · 3 incoherent or locked state ·
4 replay missing potential outcomes · 5 internal error.`;
}

function fail(message, exitCode = 2) {
  return Object.assign(new Error(message), { exitCode });
}

function argumentsOf(argv) {
  const command = argv[0];
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, command)) throw fail(`unknown command: ${command}\n${usage()}`);
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw fail(`invalid arguments\n${usage()}`);
    const name = key.slice(2);
    if (!COMMANDS[command].includes(name)) throw fail(`unknown option: --${name}`);
    if (options[name] !== undefined) throw fail(`duplicate option: --${name}`);
    options[name] = value;
  }
  return { command, options };
}

let stdinCache;
function read(file) {
  if (!file) throw fail('missing required file option');
  if (file === '-') {
    if (stdinCache !== undefined) throw fail('stdin may be consumed only once');
    stdinCache = fs.readFileSync(0, 'utf8');
    return stdinCache;
  }
  return fs.readFileSync(file, 'utf8');
}

function json(file) {
  const source = read(file);
  try { return JSON.parse(source); }
  catch (error) { throw fail(`invalid JSON in ${file}: ${error.message}`); }
}

function integer(value, label) {
  if (value === undefined) return undefined;
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw fail(`${label} must be a non-negative integer`);
  return Number(value);
}

function boolean(value, label) {
  if (value === undefined) return false;
  if (value !== 'true' && value !== 'false') throw fail(`${label} must be true or false`);
  return value === 'true';
}

function output(value) {
  process.stdout.write(`${stableStringify(serialized(value))}\n`);
}

function where(options) {
  return statePaths(options.root, { ledger: options.ledger, playbook: options.playbook, config: options.config });
}

function stateOf(options) {
  const paths = where(options);
  if (options.ledger === '-' || options.playbook === '-') {
    const playbookText = options.playbook === '-' ? read('-') : fs.readFileSync(paths.playbook, 'utf8');
    const { parseLedger, parsePlaybook } = require('../core/engine/markdown');
    return { ledger: parseLedger(options.ledger === '-' ? read('-') : fs.readFileSync(paths.ledger, 'utf8')), playbook: parsePlaybook(playbookText), playbookText };
  }
  return loadState(paths);
}

const BASH_COMPLETION = `# bash completion for tierdecay — source it, or install it as
# /etc/bash_completion.d/tierdecay (or ~/.local/share/bash-completion/completions/tierdecay)
_tierdecay() {
  local cur prev
  cur="\${COMP_WORDS[COMP_CWORD]}"
  prev="\${COMP_WORDS[COMP_CWORD-1]}"
  if [ "$COMP_CWORD" -eq 1 ]; then
    COMPREPLY=( $(compgen -W "${Object.keys(COMMANDS).join(' ')} --help --version" -- "$cur") )
    return
  fi
  case "$prev" in
    --format) COMPREPLY=( $(compgen -W "${FORMATS.join(' ')}" -- "$cur") ); return ;;
    --policy) COMPREPLY=( $(compgen -W "legacy shadow optimize" -- "$cur") ); return ;;
    --shell) COMPREPLY=( $(compgen -W "bash" -- "$cur") ); return ;;
    --allow-ledger-append) COMPREPLY=( $(compgen -W "true false" -- "$cur") ); return ;;
    --out|--root) COMPREPLY=( $(compgen -d -- "$cur") ); return ;;
    --request|--ledger|--playbook|--config|--scenario|--observation|--append)
      COMPREPLY=( $(compgen -f -- "$cur") ); return ;;
  esac
  case "\${COMP_WORDS[1]}" in
${Object.entries(COMMANDS).map(([name, flags]) => `    ${name}) COMPREPLY=( $(compgen -W "${flags.map((flag) => `--${flag}`).join(' ')}" -- "$cur") ) ;;`).join('\n')}
  esac
}
complete -F _tierdecay tierdecay
`;

function main(argv) {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  if (argv[0] === '--version' || argv[0] === '-V') {
    process.stdout.write(`${VERSION}\n`);
    return;
  }
  const { command, options } = argumentsOf(argv);

  if (command === 'completion') {
    if ((options.shell || 'bash') !== 'bash') throw fail('only --shell bash is supported');
    process.stdout.write(BASH_COMPLETION);
    return;
  }
  if (command === 'observe') {
    const observation = json(options.observation);
    if (options.append) output(appendObservation(options.append, observation));
    else process.stdout.write(`${validateObservation(observation)}\n`);
    return;
  }
  if (command === 'doctor') {
    const report = doctor({ root: options.root, overrides: { ledger: options.ledger, playbook: options.playbook, config: options.config }, epoch: options.epoch });
    output(report);
    if (!report.healthy) process.exitCode = 1;
    return;
  }
  if (command === 'mcp') {
    const { serve } = require('../core/engine/mcp');
    serve({
      root: options.root,
      overrides: { ledger: options.ledger, playbook: options.playbook, config: options.config },
      allowAppend: boolean(options['allow-ledger-append'], '--allow-ledger-append')
    });
    return;
  }

  const paths = where(options);
  const { ledger, playbook, playbookText } = stateOf(options);
  if (command === 'status') {
    output(status({ ledger, playbook, epoch: options.epoch }));
  } else if (command === 'export') {
    if (!options.format) throw fail('export requires --format');
    if (options.out && options.format !== 'skills') throw fail('--out is only valid with --format skills');
    const result = exportPosterior({ ledger, playbook, playbookText, epoch: options.epoch, format: options.format, out: options.out });
    if (result.kind === 'json') output(result.value);
    else process.stdout.write(result.value);
  } else if (command === 'bench') {
    output(bench({
      jsonl: read(options.scenario), ledger, playbook, config: json(options.config || paths.config),
      permutations: integer(options.permutations, 'permutations') ?? 20,
      seed: integer(options.seed, 'seed') ?? 1
    }));
  } else if (command === 'route') {
    const policy = options.policy || 'shadow';
    const config = policy === 'legacy' ? null : json(options.config || paths.config);
    output(route({ request: json(options.request), ledger, playbook, config, policy }));
  } else {
    output(replay({ jsonl: read(options.scenario), ledger, playbook, config: json(options.config || paths.config), policy: options.policy || 'shadow' }));
  }
}

try { main(process.argv.slice(2)); }
catch (error) {
  process.stderr.write(`${error.name || 'Error'}: ${error.message}\n`);
  process.exitCode = error.exitCode || (error.code === 'ENOENT' ? 2 : 5);
}
