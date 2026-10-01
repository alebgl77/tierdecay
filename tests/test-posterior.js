'use strict';

// Confidence-gated decay, recertification, status/export, in-memory playbook
// evolution, and the order-robustness bench.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { stableStringify } = require('../core/engine/canonical');
const { parseLedger, parsePlaybook } = require('../core/engine/markdown');
const { route } = require('../core/engine/route');
const { replay } = require('../core/engine/replay');
const { bench, permutation } = require('../core/engine/bench');
const { status } = require('../core/engine/status');
const { exportPosterior, BINDINGS } = require('../core/engine/export');
const { REQUIRED_HITS, requiredHits, passRateLowerBound, PASS_RATE_FLOOR, DECAY_ALPHA } = require('../core/engine/decay');

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'bin/tierdecay.js');
const EMPTY_LEDGER = '# Routing Ledger\n\n## LOG\n\n| date | class | predicted | executed | outcome | esc | playbook | obs_id | resource_cost | failures | incident_loss | risk | epoch |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';

function playbookText(entries, quarantine = []) {
  const block = (e) => [
    `### ${e.id} · ${e.class}`,
    `provenance: ${e.provenance} 2026-10 · hits: ${e.hits || 0}`,
    ...(e.risk !== undefined ? [`risk: ${e.risk}`] : []),
    ...(e.epoch ? [`epoch: ${e.epoch}`] : []),
    ...(e.floor ? [`floor: ${e.floor}`] : []),
    `WHEN: ${e.when || 'the task matches.'}`,
    'DO: follow the invariants.',
    'VERIFY: run the tests.',
    ''
  ].join('\n');
  return `# Repo Playbook\n\n## PATTERNS\n\n${entries.map(block).join('\n')}\n## QUARANTINE\n\n${quarantine.map(block).join('\n')}`;
}

const config = (overrides = {}) => ({
  enabled: true, calibrated: true, confidenceDelta: 0.1, costCap: 100, incidentCap: 100,
  bindingEpoch: 'e1', costUnit: 'test-unit',
  failurePenalty: 50, escalationPenalty: 10, riskWeight: 10,
  riskExposure: [0, 1, 2, 4], minSamples: 3, margin: 1,
  failureThresholds: [0.5, 0.4, 0.2, 0], probeOverhead: 1,
  minimumVoi: 0, maxProbeRisk: 2, maximumFailures: 2, maximumEscalations: 2,
  ...overrides
});
const request = (overrides = {}) => ({
  class: 'add-thing-cli', risk: 0, critical: false, recurring: true, horizon: 5, epoch: 'e1', playbook: 'PB-1',
  rubric: { ambiguity: 1, reasoning: 1, blastRadius: 1, riskSurface: 0 },
  ...overrides
});

let count = 0;
function test(name, fn) {
  try { fn(); count += 1; process.stdout.write(`ok ${count} - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok ${count + 1} - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}
const tmpdir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tierdecay-posterior-'));
const cli = (args, options = {}) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', ...options });

// ---------------------------------------------------------------- decay rule

test('required hits are 3/4/5 for risk 0/1/2 and risk 3 never decays', () => {
  assert.deepEqual([...REQUIRED_HITS], [3, 4, 5, null]);
});

test('required hits are the minimal k whose 80% Clopper-Pearson bound reaches the floor', () => {
  for (const risk of [0, 1, 2]) {
    const k = requiredHits(risk);
    assert.ok(passRateLowerBound(k) >= PASS_RATE_FLOOR[risk], `risk ${risk}: k=${k} insufficient`);
    assert.ok(passRateLowerBound(k - 1) < PASS_RATE_FLOOR[risk], `risk ${risk}: k-1 already sufficient`);
  }
  assert.equal(passRateLowerBound(0), 0);
  assert.equal(passRateLowerBound(1), DECAY_ALPHA);
  assert.throws(() => requiredHits(4), RangeError);
});

test('playbook risk is parsed, validated, and absent risk leaves no key', () => {
  const withRisk = parsePlaybook(playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', risk: 1 }]));
  assert.equal(withRisk.entries[0].risk, 1);
  const without = parsePlaybook(playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2' }]));
  assert.equal('risk' in without.entries[0], false);
  assert.throws(() => parsePlaybook(playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', risk: 4 }])), /invalid risk/);
});

// ------------------------------------------------------------ recertification

test('an entry from another binding epoch recertifies at its provenance tier', () => {
  const playbook = parsePlaybook(playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', epoch: 'e0' }]));
  const ledger = parseLedger(EMPTY_LEDGER);
  const result = route({ request: request(), ledger, playbook, config: null, policy: 'legacy' });
  assert.deepEqual(result.effective, { action: 'recertify', playbook: 'PB-1', reason: 'epoch-changed', tier: 'T2' });
  const same = route({ request: request({ epoch: 'e0' }), ledger, playbook, config: null, policy: 'legacy' });
  assert.equal(same.effective.action, 'probe');
  assert.equal(same.effective.tier, 'T1');
});

test('entries without an epoch line keep the v0.3 probe behaviour', () => {
  const playbook = parsePlaybook(playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2' }]));
  const result = route({ request: request(), ledger: parseLedger(EMPTY_LEDGER), playbook, config: null, policy: 'legacy' });
  assert.equal(result.effective.action, 'probe');
});

test('optimize never descends while recertifying and fails closed without evidence', () => {
  const playbook = parsePlaybook(playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', epoch: 'e0' }]));
  const result = route({ request: request(), ledger: parseLedger(EMPTY_LEDGER), playbook, config: config(), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.reason, 'no-observed-safe-tier');
});

// --------------------------------------------------------------------- status

test('status reports decay due, recertification, quarantine, and missing PRIORS', () => {
  const ledgerText = EMPTY_LEDGER.replace(/\|---\|.*\n$/, (sep) => `${sep}${[1, 2, 3].map((i) => `| 2026-10-0${i} | fix-bug-api | T2 | T2 | pass | 0 | — | o${i} | 1 | 0 | 0 | 1 | e1 |`).join('\n')}\n`);
  const playbook = parsePlaybook(playbookText([
    { id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', risk: 0, hits: 3 },
    { id: 'PB-2', class: 'add-other-cli', provenance: 'T3', risk: 2, hits: 4 },
    { id: 'PB-3', class: 'old-thing-cli', provenance: 'T2', epoch: 'e0' },
    { id: 'PB-5', class: 'add-floor-cli', provenance: 'T2', floor: 'T2', hits: 9 }
  ], [{ id: 'PB-4', class: 'bad-thing-cli', provenance: 'T2' }]));
  const view = status({ ledger: parseLedger(ledgerText), playbook, epoch: 'e1' });
  const byClass = Object.fromEntries(view.classes.map((row) => [row.class, row]));
  assert.equal(byClass['add-thing-cli'].route.decay.decayDue, true);
  assert.match(byClass['add-thing-cli'].next, /^decay: rewrite provenance to T1/);
  assert.equal(byClass['add-other-cli'].route.decay.decayDue, false);
  assert.match(byClass['add-other-cli'].next, /4\/5 hits/);
  assert.equal(byClass['old-thing-cli'].route.action, 'recertify');
  assert.equal(byClass['bad-thing-cli'].route.tier, 'T3');
  assert.equal(byClass['add-floor-cli'].route.action, 'refusal');
  assert.equal(byClass['add-floor-cli'].route.decay.decayDue, false, 'a sticky floor blocks decay');
  assert.match(byClass['fix-bug-api'].next, /PRIORS/);
  assert.equal(view.summary.decayDue, 1);
  assert.deepEqual(view.rules.requiredHits, [3, 4, 5, null]);
});

// --------------------------------------------------------------------- export

test('claude, cursor, and json exports bind tiers by alias and effort, never Haiku', () => {
  const ledger = parseLedger(EMPTY_LEDGER);
  const text = playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', risk: 1 }]);
  const playbook = parsePlaybook(text);
  const claude = exportPosterior({ ledger, playbook, playbookText: text, format: 'claude' }).value;
  assert.match(claude, /\| `add-thing-cli` \| T1 \| `executor` \| `sonnet` \| `medium` \| probe via PB-1 \|/);
  const cursor = exportPosterior({ ledger, playbook, playbookText: text, format: 'cursor' }).value;
  assert.match(cursor, /Auto \(Cost\)/);
  const json = exportPosterior({ ledger, playbook, playbookText: text, format: 'json' }).value;
  assert.equal(json.routes[0].claude.model, 'sonnet');
  assert.doesNotMatch(JSON.stringify(BINDINGS) + claude + cursor, /haiku/i);
  assert.deepEqual(Object.keys(BINDINGS.claude), ['T3', 'T2', 'T1', 'T0']);
  assert.deepEqual(new Set(Object.values(BINDINGS.claude).map((b) => b.model)), new Set(['opus', 'sonnet']));
});

test('skills export writes live entries, prunes its own stale output, and leaves other skills alone', () => {
  const dir = tmpdir();
  const ledger = parseLedger(EMPTY_LEDGER);
  const first = playbookText([
    { id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', when: 'adding a thing to the CLI.' },
    { id: 'PB-2', class: 'add-other-cli', provenance: 'T2' }
  ]);
  fs.mkdirSync(path.join(dir, 'my-own-skill'));
  fs.writeFileSync(path.join(dir, 'my-own-skill', 'SKILL.md'), '---\nname: my-own-skill\n---\n');
  fs.mkdirSync(path.join(dir, 'tierdecay-handmade'));
  fs.writeFileSync(path.join(dir, 'tierdecay-handmade', 'SKILL.md'), 'not generated');
  const result = exportPosterior({ ledger, playbook: parsePlaybook(first), playbookText: first, format: 'skills', out: dir }).value;
  assert.deepEqual(result.written, ['tierdecay-pb-1-add-thing-cli', 'tierdecay-pb-2-add-other-cli']);
  const skill = fs.readFileSync(path.join(dir, 'tierdecay-pb-1-add-thing-cli', 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: tierdecay-pb-1-add-thing-cli\ndescription: "Repo playbook PB-1 for task class add-thing-cli\. Use when adding a thing to the CLI\."/);
  assert.match(skill, /^DO: follow the invariants\.$/m);
  // PB-2 is quarantined now: its generated skill must disappear.
  const second = playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2' }], [{ id: 'PB-2', class: 'add-other-cli', provenance: 'T2' }]);
  const again = exportPosterior({ ledger, playbook: parsePlaybook(second), playbookText: second, format: 'skills', out: dir }).value;
  assert.deepEqual(again.removed, ['tierdecay-pb-2-add-other-cli']);
  assert.ok(fs.existsSync(path.join(dir, 'my-own-skill', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(dir, 'tierdecay-handmade', 'SKILL.md')), 'non-generated tierdecay-* dirs are kept');
  assert.equal(fs.existsSync(path.join(dir, 'tierdecay-pb-2-add-other-cli')), false);
});

// ------------------------------------------------- replay evolution and bench

function scenarios(spec) {
  return spec.map(([id, t1Failures]) => JSON.stringify({
    id, date: '2026-10-01', request: request(),
    outcomes: {
      T1: { resourceCost: 10, failures: t1Failures, escalations: 0, incidentLoss: 0 },
      T2: { resourceCost: 30, failures: 0, escalations: 0, incidentLoss: 0 },
      T3: { resourceCost: 60, failures: 0, escalations: 0, incidentLoss: 0 }
    }
  })).join('\n');
}
const pb = () => parsePlaybook(playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', risk: 0 }]));

test('default replay output is unchanged by the evolution feature', () => {
  const result = replay({ jsonl: scenarios([['s1', 0]]), ledger: parseLedger(EMPTY_LEDGER), playbook: pb(), config: config() });
  assert.equal('lifecycle' in result, false);
  assert.equal('playbookChange' in result.decisions[0], false);
});

test('evolving replay counts hits, decays after the required hits, and quarantines on failure', () => {
  const ledger = parseLedger(EMPTY_LEDGER);
  const passing = replay({ jsonl: scenarios([['s1', 0], ['s2', 0], ['s3', 0], ['s4', 0]]), ledger, playbook: pb(), config: config(), evolvePlaybook: true });
  assert.deepEqual(passing.decisions.map((d) => d.playbookChange), ['hit', 'hit', 'decay', 'hit']);
  assert.deepEqual(passing.finalPlaybook[0], { class: 'add-thing-cli', floor: null, hits: 1, id: 'PB-1', provenance: 'T1', status: 'live' });
  const failing = replay({ jsonl: scenarios([['s1', 1], ['s2', 0]]), ledger, playbook: pb(), config: config(), evolvePlaybook: true });
  assert.equal(failing.decisions[0].playbookChange, 'quarantine');
  assert.equal(failing.decisions[1].action, 'refusal');
  assert.equal(failing.decisions[1].tier, 'T3');
  assert.deepEqual(failing.finalPlaybook[0], { class: 'add-thing-cli', floor: 'T1', hits: 0, id: 'PB-1', provenance: 'T2', status: 'quarantined' });
  assert.equal(pb().entries[0].status, 'live', 'the caller playbook is never mutated');
});

test('bench is deterministic, permutation 0 is the file order, and baselines are order-free', () => {
  const jsonl = scenarios([['s1', 0], ['s2', 0], ['s3', 1], ['s4', 0], ['s5', 0]]);
  const args = { jsonl, ledger: parseLedger(EMPTY_LEDGER), playbook: pb(), config: config(), permutations: 12, seed: 3 };
  const a = bench(args);
  assert.equal(stableStringify(a), stableStringify(bench(args)));
  assert.deepEqual(permutation(5, 9), permutation(5, 9));
  assert.deepEqual([...permutation(5, 9)].sort(), [0, 1, 2, 3, 4]);
  assert.equal(a.baselines.staticT3, 300);
  assert.equal(a.baselines.staticT1, 4 * 10 + (10 + 50));
  const fileOrder = replay({ jsonl, ledger: parseLedger(EMPTY_LEDGER), playbook: pb(), config: config(), policy: 'shadow', evolvePlaybook: true });
  assert.ok(a.policies.protocol.fullyLoadedLoss.min <= fileOrder.totals.fullyLoadedLoss);
  assert.ok(a.policies.protocol.fullyLoadedLoss.max >= fileOrder.totals.fullyLoadedLoss);
});

test('bench exposes order sensitivity when an early failure quarantines the entry', () => {
  const jsonl = scenarios([['s1', 0], ['s2', 0], ['s3', 0], ['s4', 0], ['s5', 1], ['s6', 0]]);
  const result = bench({ jsonl, ledger: parseLedger(EMPTY_LEDGER), playbook: pb(), config: config(), permutations: 30, seed: 11 });
  assert.ok(result.policies.protocol.orderSpread > 0, 'failure position must change the protocol loss');
  assert.ok(result.policies.protocol.quarantines.min >= 1);
});

test('bench validates its parameters', () => {
  const base = { jsonl: scenarios([['s1', 0]]), ledger: parseLedger(EMPTY_LEDGER), playbook: pb(), config: config() };
  assert.throws(() => bench({ ...base, permutations: 0 }), /permutations/);
  assert.throws(() => bench({ ...base, seed: -1 }), /seed/);
  assert.throws(() => bench({ ...base, config: { enabled: false, calibrated: false } }), /calibrated/);
  assert.throws(() => bench({ ...base, jsonl: '\n' }), /at least one scenario/);
});

// ------------------------------------------------------------------------ CLI

test('CLI status, export, and bench contracts', () => {
  const dir = tmpdir();
  const ledger = path.join(dir, 'ledger.md');
  const playbookFile = path.join(dir, 'playbook.md');
  const cfg = path.join(dir, 'config.json');
  const scenario = path.join(dir, 's.jsonl');
  fs.writeFileSync(ledger, EMPTY_LEDGER);
  fs.writeFileSync(playbookFile, playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2', risk: 0 }]));
  fs.writeFileSync(cfg, JSON.stringify(config()));
  fs.writeFileSync(scenario, scenarios([['s1', 0], ['s2', 0]]));
  const state = ['--ledger', ledger, '--playbook', playbookFile];
  const shown = cli(['status', ...state, '--epoch', 'e1']);
  assert.equal(shown.status, 0, shown.stderr);
  assert.equal(JSON.parse(shown.stdout).summary.probing, 1);
  const table = cli(['export', '--format', 'claude', ...state]);
  assert.equal(table.status, 0, table.stderr);
  assert.match(table.stdout, /^# TierDecay routes \(Claude Code\)/);
  assert.equal(cli(['export', '--format', 'yaml', ...state]).status, 2);
  assert.equal(cli(['export', ...state]).status, 2);
  assert.equal(cli(['export', '--format', 'json', '--out', dir, ...state]).status, 2);
  const skills = cli(['export', '--format', 'skills', '--out', path.join(dir, 'skills'), ...state]);
  assert.equal(skills.status, 0, skills.stderr);
  assert.deepEqual(JSON.parse(skills.stdout).written, ['tierdecay-pb-1-add-thing-cli']);
  const benched = cli(['bench', '--scenario', scenario, '--config', cfg, ...state, '--permutations', '4', '--seed', '2']);
  assert.equal(benched.status, 0, benched.stderr);
  assert.equal(JSON.parse(benched.stdout).permutations, 4);
  assert.equal(cli(['bench', '--scenario', scenario, '--config', cfg, ...state, '--permutations', 'x']).status, 2);
  assert.equal(cli(['status', ...state, '--epoch', 'two words']).status, 2);
});

// ------------------------------------------------------------- shipped state

test('every shipped ledger and playbook template parses (fresh installs work with the CLI)', () => {
  for (const file of ['core/playbook.template.md', 'adapters/claude-code/.claude/skills/repo-playbook/SKILL.md', 'plugins/tierdecay/templates/repo-playbook/SKILL.md']) {
    assert.deepEqual(parsePlaybook(fs.readFileSync(path.join(ROOT, file), 'utf8')).entries, [], file);
  }
  for (const file of ['core/ledger.template.md', 'adapters/claude-code/.claude/routing-ledger.md', 'plugins/tierdecay/templates/routing-ledger.md']) {
    assert.doesNotThrow(() => parseLedger(fs.readFileSync(path.join(ROOT, file), 'utf8')), file);
  }
});

test('fenced entry examples are documentation, not entries', () => {
  const text = `${playbookText([{ id: 'PB-1', class: 'add-thing-cli', provenance: 'T2' }])}\n\`\`\`\n### PB-<n> · <class>\n### PB-9 · add-fake-cli\n\`\`\`\n`;
  assert.deepEqual(parsePlaybook(text).entries.map((entry) => entry.id), ['PB-1']);
});

// --------------------------------------------------------------- pilot record

test('pilot-v1 replay reproduces the documented protocol saving', () => {
  const pilot = path.join(ROOT, 'benchmarks/pilot-v1');
  const result = cli(['bench', '--scenario', path.join(pilot, 'data/scenarios.jsonl'), '--ledger', path.join(pilot, 'state/ledger.md'),
    '--playbook', path.join(pilot, 'state/playbook.md'), '--config', path.join(pilot, 'pilot-v1.config.json'), '--permutations', '20', '--seed', '7']);
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  const saving = (report.policies.protocol.savingsVsStaticT3 * 100).toFixed(1);
  const results = fs.readFileSync(path.join(pilot, 'RESULTS.md'), 'utf8');
  assert.ok(results.includes(`${saving}%`), `RESULTS.md must document the replayed saving ${saving}%`);
  const summary = JSON.parse(fs.readFileSync(path.join(pilot, 'data/summary.json'), 'utf8'));
  assert.equal(summary.runs, 36);
  assert.equal(summary.arms.t1pb.accepted, summary.arms.t1pb.runs);
});

process.on('exit', () => {
  if (!process.exitCode) process.stdout.write(`1..${count}\n`);
});
