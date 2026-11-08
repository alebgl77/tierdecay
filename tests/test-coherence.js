'use strict';

// Cross-surface contracts: the CLI, MCP, status and export must agree.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { parseLedger, parsePlaybook } = require('../core/engine/markdown');
const { route, rubricTier } = require('../core/engine/route');
const { status } = require('../core/engine/status');
const { exportPosterior } = require('../core/engine/export');
const { createServer } = require('../core/engine/mcp');
const { doctor } = require('../core/engine/doctor');
const ROOT = path.resolve(__dirname, '..');
const ledgerText = fs.readFileSync(path.join(ROOT, 'core/ledger.template.md'), 'utf8');
const ledger = parseLedger(ledgerText);
const entry = (id = 'PB-1', risk = 0) => `### ${id} · fix-widget-cli\nprovenance: T3 2026-11 · hits: 0\nrisk: ${risk}\nepoch: e1\nWHEN: fixing a widget.\nDO: apply the fix.\nVERIFY: run tests.\n`;
const book = (live = entry(), quarantined = '') => `# Playbook\n\n## PATTERNS\n\n${live}\n## QUARANTINE\n\n${quarantined}`;
const request = { class: 'fix-widget-cli', risk: 0, critical: false, recurring: true, horizon: 3, epoch: 'e1', playbook: 'PB-1', rubric: { ambiguity: 1, reasoning: 1, blastRadius: 1, riskSurface: 0 } };
let count = 0;
function test(name, fn) {
  try { fn(); console.log(`ok ${++count} - ${name}`); }
  catch (error) { console.error(`not ok - ${name}\n${error.stack}`); process.exitCode = 1; }
}
function workspace(text) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tierdecay-coherence-'));
  fs.mkdirSync(path.join(root, '.tierdecay'));
  fs.writeFileSync(path.join(root, '.tierdecay/ledger.md'), ledgerText);
  fs.writeFileSync(path.join(root, '.tierdecay/playbook.md'), text);
  return root;
}
function call(server, name, args) {
  return server.handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }).result;
}

test('CLI and MCP route a fresh installation without an economic config identically', () => {
  const root = workspace(book());
  const file = path.join(root, 'request.json');
  fs.writeFileSync(file, JSON.stringify(request));
  const result = spawnSync(process.execPath, [path.join(ROOT, 'bin/tierdecay.js'), 'route', '--root', root, '--request', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const mcp = call(createServer({ root }), 'tierdecay_route', { request });
  assert.deepEqual(JSON.parse(result.stdout), mcp.structuredContent);
  assert.equal(mcp.structuredContent.policy, 'legacy');
});

test('MCP rubric rejects malformed values rather than advertising a cheap tier', () => {
  const server = createServer();
  for (const rubric of [null, [], {}, { ...request.rubric, riskSurface: -1 }, { ...request.rubric, ambiguity: 3 }, { ...request.rubric, reasoning: '3' }, { ...request.rubric, unknown: 1 }]) {
    assert.equal(call(server, 'tierdecay_rubric', { rubric }).isError, true, JSON.stringify(rubric));
  }
  assert.equal(rubricTier({ ambiguity: 2, reasoning: 0, blastRadius: 0, riskSurface: 0 }).tier, 'T1');
  assert.equal(rubricTier({ ambiguity: 0, reasoning: 3, blastRadius: 0, riskSurface: 0 }).tier, 'T3');
});

test('status and every routing export retain T3 for known risk-3 classes', () => {
  const text = book(entry('PB-1', 3));
  const playbook = parsePlaybook(text);
  for (const epoch of ['e1', 'e2']) {
    const view = status({ ledger, playbook, epoch });
    assert.equal(view.classes[0].route.tier, 'T3');
    assert.equal(view.classes[0].route.action, 'safety');
    assert.doesNotMatch(view.classes[0].next, /null hits/);
    assert.equal(view.summary.probing, 0);
    for (const format of ['json', 'claude', 'codex', 'antigravity', 'cursor']) {
      const output = exportPosterior({ ledger, playbook, playbookText: text, epoch, format }).value;
      if (format === 'json') assert.equal(output.routes[0].tier, 'T3');
      else assert.match(output, /fix-widget-cli` \| T3/);
    }
  }
});

test('ambiguous class state is rejected consistently, and doctor reports failure', () => {
  for (const text of [book(entry() + entry('PB-2')), book(entry(), entry('PB-2'))]) {
    assert.throws(() => parsePlaybook(text), /class|ambiguous/);
    const first = parsePlaybook(book()).entries[0];
    const playbook = { entries: [first, { ...first, id: 'PB-2', status: text.includes('## QUARANTINE\n\n###') ? 'quarantined' : 'live' }] };
    assert.throws(() => route({ request, ledger, playbook, policy: 'legacy' }), /class|ambiguous/);
    assert.throws(() => status({ ledger, playbook }), /class|ambiguous/);
    for (const format of ['json', 'skills']) assert.throws(() => exportPosterior({ ledger, playbook, playbookText: text, format }), /class|ambiguous/);
    const root = workspace(text);
    const report = doctor({ root });
    assert.equal(report.healthy, false);
    assert.ok(report.checks.some((c) => c.id === 'playbook' && c.status === 'fail'));
    const server = createServer({ root });
    for (const name of ['tierdecay_status', 'tierdecay_playbook', 'tierdecay_export']) {
      assert.equal(call(server, name, { class: request.class, format: 'json' }).isError, true);
    }
  }
});

test('skills export refuses unowned collisions before writing any skill', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tierdecay-skills-'));
  const text = book(entry().replaceAll('fix-widget-cli', 'fix-first-cli') + entry('PB-2'));
  const collision = path.join(out, 'tierdecay-pb-2-fix-widget-cli');
  fs.mkdirSync(collision);
  fs.writeFileSync(path.join(collision, 'SKILL.md'), 'manual work');
  assert.throws(() => exportPosterior({ ledger, playbook: parsePlaybook(text), playbookText: text, format: 'skills', out }), /unowned/);
  assert.equal(fs.readFileSync(path.join(collision, 'SKILL.md'), 'utf8'), 'manual work');
  assert.equal(fs.existsSync(path.join(out, 'tierdecay-pb-1-fix-first-cli')), false);
});

test('quarantine removes generated skill instructions but preserves added files', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tierdecay-skills-'));
  const first = book();
  exportPosterior({ ledger, playbook: parsePlaybook(first), playbookText: first, format: 'skills', out });
  const dir = path.join(out, 'tierdecay-pb-1-fix-widget-cli');
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'keep this');
  const second = book('', entry());
  exportPosterior({ ledger, playbook: parsePlaybook(second), playbookText: second, format: 'skills', out });
  assert.equal(fs.existsSync(path.join(dir, 'SKILL.md')), false);
  assert.equal(fs.readFileSync(path.join(dir, 'notes.txt'), 'utf8'), 'keep this');
});

console.log(`1..${count}`);
