'use strict';

// Production surfaces: MCP server, locked atomic ledger append (including
// concurrent writers), doctor, workspace resolution, completion, versioning.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createServer, PROTOCOL_VERSIONS } = require('../core/engine/mcp');
const { appendObservation, withLock, MEASURED_HEADER, MEASURED_SEPARATOR } = require('../core/engine/observation');
const { doctor } = require('../core/engine/doctor');
const { statePaths } = require('../core/engine/workspace');
const { parseLedger } = require('../core/engine/markdown');
const { VERSION } = require('../core/engine/version');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin/tierdecay.js');
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tierdecay-prod-'));
const cli = (args, options = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...options });

let count = 0;
const pending = [];
function test(name, fn) {
  const run = async () => {
    try { await fn(); count += 1; process.stdout.write(`ok ${count} - ${name}\n`); }
    catch (error) { process.stderr.write(`not ok ${count + 1} - ${name}\n${error.stack}\n`); process.exitCode = 1; }
  };
  pending.push(run);
}

function project({ measured = true, entries = '' } = {}) {
  const dir = tmpdir();
  fs.mkdirSync(path.join(dir, '.tierdecay'));
  const log = measured
    ? `${MEASURED_HEADER}\n${MEASURED_SEPARATOR}\n`
    : '| date | class | predicted | executed | outcome | esc | playbook |\n|---|---|---|---|---|---|---|\n';
  fs.writeFileSync(path.join(dir, '.tierdecay', 'ledger.md'), `# Routing Ledger\n\n## LOG\n\n${log}`);
  fs.writeFileSync(path.join(dir, '.tierdecay', 'playbook.md'), `# Repo Playbook\n\n## PATTERNS\n\n${entries}\n## QUARANTINE\n\n`);
  return dir;
}

const ENTRY = '### PB-1 · add-thing-cli\nprovenance: T2 2026-10 · hits: 0\nrisk: 1\nepoch: e1\nWHEN: adding a thing.\nDO: follow the registry.\nVERIFY: npm test.\n';
const observation = (overrides = {}) => ({
  date: '2026-10-01', class: 'add-thing-cli', predicted: 'T1', executed: 'T1', outcome: 'pass', escalations: 0,
  playbook: 'PB-1', obsId: 'o-1', resourceCost: 1.5, failures: 0, incidentLoss: 0, risk: 1, epoch: 'e1', ...overrides
});

// ---------------------------------------------------------------- versioning

test('engine version equals package.json and the plugin manifest', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins/tierdecay/.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(VERSION, pkg.version);
  assert.equal(plugin.version, pkg.version);
  assert.equal(cli(['--version']).stdout.trim(), pkg.version);
});

// ----------------------------------------------------------------------- MCP

function rpc(server, method, params, id = 1) {
  return server.handle({ jsonrpc: '2.0', id, method, params });
}

test('MCP initialize negotiates the protocol version and advertises tools', () => {
  const server = createServer({ root: project({ entries: ENTRY }) });
  for (const version of PROTOCOL_VERSIONS) assert.equal(rpc(server, 'initialize', { protocolVersion: version }).result.protocolVersion, version);
  const result = rpc(server, 'initialize', { protocolVersion: '1999-01-01' }).result;
  assert.equal(result.protocolVersion, PROTOCOL_VERSIONS[0]);
  assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
  assert.equal(result.serverInfo.name, 'tierdecay');
  assert.equal(result.serverInfo.version, VERSION);
  assert.equal(server.handle({ jsonrpc: '2.0', method: 'notifications/initialized' }), null);
  assert.deepEqual(rpc(server, 'ping').result, {});
});

test('MCP is read-only by default; the record tool exists only when enabled', () => {
  const dir = project({ entries: ENTRY });
  const readOnly = createServer({ root: dir });
  const names = rpc(readOnly, 'tools/list').result.tools.map((tool) => tool.name);
  assert.ok(!names.includes('tierdecay_record'));
  for (const tool of rpc(readOnly, 'tools/list').result.tools) assert.equal(tool.annotations.readOnlyHint, true, tool.name);
  assert.equal(rpc(readOnly, 'tools/call', { name: 'tierdecay_record', arguments: { observation: observation() } }).error.code, -32602);
  const writer = createServer({ root: dir, allowAppend: true });
  assert.ok(rpc(writer, 'tools/list').result.tools.some((tool) => tool.name === 'tierdecay_record'));
  const recorded = rpc(writer, 'tools/call', { name: 'tierdecay_record', arguments: { observation: observation() } }).result;
  assert.equal(recorded.isError, undefined);
  assert.equal(parseLedger(fs.readFileSync(path.join(dir, '.tierdecay', 'ledger.md'), 'utf8')).observations.length, 1);
});

test('MCP tools route, look up playbooks, score the rubric, and report errors as tool results', () => {
  const server = createServer({ root: project({ entries: ENTRY }) });
  const request = { class: 'add-thing-cli', risk: 1, critical: false, recurring: true, horizon: 3, epoch: 'e1', playbook: 'PB-1', rubric: { ambiguity: 1, reasoning: 1, blastRadius: 1, riskSurface: 1 } };
  const routed = rpc(server, 'tools/call', { name: 'tierdecay_route', arguments: { request } }).result;
  assert.equal(routed.structuredContent.policy, 'legacy', 'no router config: legacy');
  assert.equal(routed.structuredContent.effective.tier, 'T1');
  assert.equal(routed.structuredContent.effective.action, 'probe');
  const recert = rpc(server, 'tools/call', { name: 'tierdecay_route', arguments: { request: { ...request, epoch: 'e2' } } }).result;
  assert.equal(recert.structuredContent.effective.action, 'recertify');
  const entry = rpc(server, 'tools/call', { name: 'tierdecay_playbook', arguments: { class: 'add-thing-cli', epoch: 'e1' } }).result.structuredContent;
  assert.equal(entry.status, 'live');
  assert.match(entry.quote, /^### PB-1 · add-thing-cli\nprovenance: T2/);
  assert.equal(entry.decay.requiredHits, 4);
  assert.equal(rpc(server, 'tools/call', { name: 'tierdecay_playbook', arguments: { class: 'other-thing-cli' } }).result.structuredContent.status, 'none');
  assert.deepEqual(rpc(server, 'tools/call', { name: 'tierdecay_rubric', arguments: { rubric: { ambiguity: 2, reasoning: 3, blastRadius: 0, riskSurface: 0 } } }).result.structuredContent, { score: 5, tier: 'T3' });
  const bad = rpc(server, 'tools/call', { name: 'tierdecay_route', arguments: { request: { ...request, risk: 2 } } }).result;
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /risk must equal rubric.riskSurface/);
  const table = rpc(server, 'tools/call', { name: 'tierdecay_export', arguments: { format: 'claude' } }).result;
  assert.match(table.content[0].text, /TierDecay routes \(Claude Code\)/);
  assert.equal(rpc(server, 'nope').error.code, -32601);
  assert.equal(server.handle({ id: 9, method: 'ping' }).error.code, -32600);
});

test('MCP stdio transport speaks newline-delimited JSON-RPC', async () => {
  const dir = project({ entries: ENTRY });
  const child = spawn(process.execPath, [CLI, 'mcp', '--root', dir], { stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (chunk) => { out += chunk; });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
  child.stdin.write('not json\n');
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'tierdecay_status', arguments: {} } })}\n`);
  child.stdin.end();
  await new Promise((resolve) => child.on('close', resolve));
  const messages = out.trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(messages.length, 3);
  assert.equal(messages[0].result.protocolVersion, '2025-06-18');
  assert.equal(messages[1].error.code, -32700);
  assert.equal(messages[2].result.structuredContent.summary.classes, 1);
});

// ------------------------------------------------------------ ledger append

test('append inserts a validated row newest-first and refuses duplicates and legacy ledgers', () => {
  const dir = project();
  const ledger = path.join(dir, '.tierdecay', 'ledger.md');
  appendObservation(ledger, observation({ obsId: 'a' }));
  appendObservation(ledger, observation({ obsId: 'b' }));
  const lines = fs.readFileSync(ledger, 'utf8').split('\n').filter((line) => /^\| 2026/.test(line));
  assert.match(lines[0], /\| b \|/);
  assert.match(lines[1], /\| a \|/);
  assert.throws(() => appendObservation(ledger, observation({ obsId: 'a' })), /duplicate obs_id/);
  assert.throws(() => appendObservation(path.join(project({ measured: false }), '.tierdecay', 'ledger.md'), observation()), /not in the measured format/);
  assert.equal(fs.existsSync(`${ledger}.lock`), false);
  assert.deepEqual(fs.readdirSync(path.dirname(ledger)).filter((name) => name.endsWith('.tmp')), []);
});

test('concurrent writers never lose or corrupt rows', async () => {
  const dir = project();
  const ledger = path.join(dir, '.tierdecay', 'ledger.md');
  const writers = 8;
  const perWriter = 6;
  const script = `
    const { appendObservation } = require(${JSON.stringify(path.join(ROOT, 'core/engine/observation.js'))});
    const [ledger, writer, n] = process.argv.slice(1);
    for (let i = 0; i < Number(n); i += 1) {
      appendObservation(ledger, { date: '2026-10-01', class: 'add-thing-cli', predicted: 'T1', executed: 'T1', outcome: 'pass',
        escalations: 0, playbook: '—', obsId: 'w' + writer + '-' + i, resourceCost: 1, failures: 0, incidentLoss: 0, risk: 0, epoch: 'e1' });
    }`;
  const children = Array.from({ length: writers }, (_, writer) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['-e', script, ledger, String(writer), String(perWriter)], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (chunk) => { err += chunk; });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err))));
  }));
  await Promise.all(children);
  const parsed = parseLedger(fs.readFileSync(ledger, 'utf8'));
  assert.equal(parsed.observations.length, writers * perWriter);
  assert.equal(new Set(parsed.observations.map((row) => row.obsId)).size, writers * perWriter);
});

test('a stale lock is broken; a live lock times out with exit code 3', () => {
  const dir = project();
  const ledger = path.join(dir, '.tierdecay', 'ledger.md');
  fs.writeFileSync(`${ledger}.lock`, '1\n');
  const old = new Date(Date.now() - 60000);
  fs.utimesSync(`${ledger}.lock`, old, old);
  appendObservation(ledger, observation({ obsId: 'after-stale' }));
  assert.equal(fs.existsSync(`${ledger}.lock`), false);
  fs.writeFileSync(`${ledger}.lock`, '1\n');
  const error = (() => { try { withLock(ledger, () => null, { timeoutMs: 100 }); } catch (caught) { return caught; } return null; })();
  assert.ok(error);
  assert.equal(error.exitCode, 3);
  fs.unlinkSync(`${ledger}.lock`);
});

test('CLI observe --append writes atomically and keeps the file mode', () => {
  const dir = project();
  const ledger = path.join(dir, '.tierdecay', 'ledger.md');
  if (process.platform !== 'win32') fs.chmodSync(ledger, 0o640);
  const file = path.join(dir, 'obs.json');
  fs.writeFileSync(file, JSON.stringify(observation()));
  const result = cli(['observe', '--observation', file, '--append', ledger]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).observations, 1);
  if (process.platform !== 'win32') assert.equal(fs.statSync(ledger).mode & 0o777, 0o640);
  assert.equal(cli(['observe', '--observation', file, '--append', ledger]).status, 2, 'duplicate');
});

// -------------------------------------------------------------------- doctor

test('doctor reports a healthy project and fails on a broken one', () => {
  const healthy = project({ entries: ENTRY });
  fs.writeFileSync(path.join(healthy, '.tierdecay', 'MODELS.md'), '# models\n');
  const report = doctor({ root: healthy });
  assert.equal(report.healthy, true);
  assert.equal(report.layout, 'portable');
  assert.equal(report.summary.fail, 0);
  const broken = project();
  fs.writeFileSync(path.join(broken, '.tierdecay', 'playbook.md'), '### PB-x · nope\n');
  const bad = doctor({ root: broken });
  assert.equal(bad.healthy, false);
  assert.equal(bad.checks.find((item) => item.id === 'playbook').status, 'fail');
  if (process.platform !== 'win32') {
    fs.chmodSync(path.join(healthy, '.tierdecay', 'ledger.md'), 0o666);
    assert.equal(doctor({ root: healthy }).checks.find((item) => item.id === 'ledger-permissions').status, 'fail');
  }
  const run = cli(['doctor', '--root', broken]);
  assert.equal(run.status, 1);
  assert.equal(JSON.parse(run.stdout).healthy, false);
});

test('doctor flags a playbook over the 150-line cap and live entries without an epoch', () => {
  const entries = Array.from({ length: 35 }, (_, i) => `### PB-${i + 1} · add-thing${i}-cli\nprovenance: T2 2026-10 · hits: 0\nWHEN: w\nDO: d\nVERIFY: v\n`).join('\n');
  const report = doctor({ root: project({ entries }) });
  assert.equal(report.checks.find((item) => item.id === 'playbook-cap').status, 'fail');
  assert.equal(report.checks.find((item) => item.id === 'epochs').status, 'warn');
});

test('workspace resolves portable, native, and explicit layouts', () => {
  const native = tmpdir();
  fs.mkdirSync(path.join(native, '.claude'), { recursive: true });
  fs.writeFileSync(path.join(native, '.claude', 'routing-ledger.md'), '');
  assert.equal(statePaths(native).layout, 'claude-native');
  assert.equal(statePaths(project()).layout, 'portable');
  assert.equal(statePaths(native, { ledger: 'x.md' }).layout, 'explicit');
});

test('bash completion is valid shell and lists every command', () => {
  const result = cli(['completion', '--shell', 'bash']);
  assert.equal(result.status, 0);
  for (const command of ['route', 'status', 'export', 'observe', 'doctor', 'mcp', 'bench']) assert.match(result.stdout, new RegExp(`\\b${command}\\b`));
  if (process.platform !== 'win32') {
    const syntax = spawnSync('bash', ['-n'], { input: result.stdout, encoding: 'utf8' });
    assert.equal(syntax.status, 0, syntax.stderr);
  }
  assert.equal(cli(['completion', '--shell', 'fish']).status, 2);
});

(async () => {
  for (const run of pending) await run();
  if (!process.exitCode) process.stdout.write(`1..${count}\n`);
})();
