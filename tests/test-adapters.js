'use strict';

// Codex and Antigravity adapters: the role files, profiles, rules, subagents,
// skills, and MCP configs encode the same tier binding as the engine export,
// and stay within each tool's documented schema.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BINDINGS } = require('../core/engine/export');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8').replace(/\r\n/g, '\n');
const ROLES = { T0: 'scout', T1: 'executor', T2: 'heavy-executor', T3: 'oracle' };

let count = 0;
function test(name, fn) {
  try { fn(); count += 1; process.stdout.write(`ok ${count} - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok ${count + 1} - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}

// Top-level `key = "string"` and `key = """multi-line"""` pairs; tables are
// reported by name. Enough for the flat role and profile files we ship.
function tomlTopLevel(text) {
  const keys = {};
  const tables = [];
  const lines = text.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    const table = /^\[([^\]]+)\]$/.exec(line);
    if (table) { tables.push(table[1]); continue; }
    if (tables.length) continue;
    const multi = /^([A-Za-z0-9_]+)\s*=\s*"""(.*)$/.exec(line);
    if (multi) {
      const body = [];
      let rest = multi[2];
      while (!rest.trimEnd().endsWith('"""')) {
        body.push(rest);
        index += 1;
        if (index >= lines.length) throw new Error(`unterminated """ for ${multi[1]}`);
        rest = lines[index];
      }
      body.push(rest.trimEnd().slice(0, -3));
      keys[multi[1]] = body.join('\n').trim();
      continue;
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"\s*(#.*)?$/.exec(line);
    assert.ok(pair, `unsupported TOML line: ${line}`);
    keys[pair[1]] = pair[2];
  }
  return { keys, tables };
}

function frontmatter(text) {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  assert.ok(match, 'missing YAML frontmatter');
  const fields = {};
  for (const line of match[1].split('\n')) {
    const pair = /^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
    assert.ok(pair, `unsupported frontmatter line: ${line}`);
    fields[pair[1]] = pair[2].trim();
  }
  return fields;
}

// Codex role files deny unknown fields: keep to the documented role keys.
const CODEX_ROLE_KEYS = new Set(['name', 'description', 'developer_instructions', 'model', 'model_reasoning_effort', 'sandbox_mode', 'nickname_candidates']);

test('Codex roles bind each tier to the engine effort and a matching sandbox', () => {
  for (const [tier, role] of Object.entries(ROLES)) {
    const { keys, tables } = tomlTopLevel(read(`adapters/codex/.codex/agents/${role}.toml`));
    assert.deepEqual(tables, [], `${role}: role files are flat`);
    for (const key of Object.keys(keys)) assert.ok(CODEX_ROLE_KEYS.has(key), `${role}: unexpected key ${key}`);
    assert.equal(keys.name, role);
    assert.ok(keys.description && keys.developer_instructions, `${role}: description and instructions required`);
    assert.equal(keys.model_reasoning_effort, BINDINGS.codex[tier].effort, `${role}: effort`);
    assert.equal(BINDINGS.codex[tier].role, role);
    const writes = role === 'executor' || role === 'heavy-executor';
    assert.equal(keys.sandbox_mode, writes ? 'workspace-write' : 'read-only', `${role}: sandbox`);
    assert.equal(keys.model, undefined, `${role}: roles inherit the session model; pins belong in MODELS.md first`);
    if (writes) assert.match(keys.developer_instructions, /\.tierdecay\//, `${role}: must forbid state writes`);
  }
});

test('Codex single-session profiles match the role efforts', () => {
  for (const [tier, binding] of Object.entries(BINDINGS.codex)) {
    const file = `adapters/codex/profiles/${binding.profile}.config.toml`;
    const { keys } = tomlTopLevel(read(file));
    assert.equal(keys.model_reasoning_effort, binding.effort, `${file}`);
    assert.equal(tier, `T${binding.profile.slice(-1)}`);
  }
});

test('Codex project config registers the read-only MCP advisor', () => {
  const text = read('adapters/codex/.codex/config.toml');
  assert.match(text, /^\[mcp_servers\.tierdecay\]\ncommand = "tierdecay"\nargs = \["mcp"\]$/m);
  assert.doesNotMatch(text, /allow-ledger-append/);
  assert.doesNotMatch(text, /^\s*(profile|profiles)\b/m, 'project config cannot set profiles');
});

test('Codex hook guards apply_patch and Bash for executor roles only', () => {
  const hooks = JSON.parse(read('adapters/codex/.codex/hooks.json'));
  const [entry] = hooks.hooks.PreToolUse;
  const matcher = new RegExp(`^(?:${entry.matcher})$`);
  for (const tool of ['apply_patch', 'Bash']) assert.ok(matcher.test(tool), tool);
  assert.ok(!matcher.test('Read'));
  const [hook] = entry.hooks;
  assert.equal(hook.type, 'command');
  assert.match(hook.command, /\.codex\/hooks\/tierdecay-guard\.sh" --executors-only$/);
  assert.equal(
    read('adapters/codex/.codex/hooks/tierdecay-guard.sh'),
    read('adapters/claude-code/.claude/hooks/tierdecay-guard.sh'),
    'the Codex guard is a generated mirror (node scripts/build-plugin.js)'
  );
});

test('Codex AGENTS.md fits the 32 KiB project-doc budget with room to spare', () => {
  assert.ok(Buffer.byteLength(read('adapters/codex/AGENTS.md')) < 16 * 1024);
});

test('Antigravity rule is always on', () => {
  const fields = frontmatter(read('adapters/antigravity/.agents/rules/tierdecay.md'));
  assert.equal(fields.trigger, 'always_on');
  assert.ok(fields.description);
});

test('Antigravity subagents bind each tier to the engine model class and a safe policy', () => {
  for (const [tier, role] of Object.entries(ROLES)) {
    const fields = frontmatter(read(`adapters/antigravity/.agents/agents/${role}.md`));
    assert.equal(fields.name, role);
    assert.ok(fields.description);
    assert.equal(fields.model, BINDINGS.antigravity[tier].model, `${role}: model`);
    assert.equal(BINDINGS.antigravity[tier].subagent, role);
    assert.ok(['inherit', 'flash', 'pro'].includes(fields.model));
    const writes = role === 'executor' || role === 'heavy-executor';
    assert.equal(fields.commandExecutionPolicy, writes ? 'sandbox' : 'off', `${role}: policy`);
    assert.equal(fields.subagent, 'true');
    assert.equal(fields.mainAgent, 'false');
  }
});

test('Antigravity MCP config runs the read-only advisor', () => {
  const config = JSON.parse(read('adapters/antigravity/.agents/mcp_config.json'));
  assert.deepEqual(config, { mcpServers: { tierdecay: { command: 'tierdecay', args: ['mcp'] } } });
});

test('shared Agent Skills follow the open skill format', () => {
  const skills = fs.readdirSync(path.join(ROOT, 'core/agent-skills')).sort();
  assert.deepEqual(skills, ['tierdecay-distill', 'tierdecay-execution', 'tierdecay-routing']);
  for (const skill of skills) {
    const text = read(`core/agent-skills/${skill}/SKILL.md`);
    const fields = frontmatter(text);
    assert.equal(fields.name, skill);
    assert.match(fields.name, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(fields.name.length <= 64);
    assert.ok(fields.description && fields.description.length <= 1024);
    assert.ok(text.split('\n').length <= 120, `${skill}: keep skills short`);
  }
});

process.stdout.write(`${process.exitCode ? 'FAIL' : 'PASS'}: ${count} adapter checks\n`);
