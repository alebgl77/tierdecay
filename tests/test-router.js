'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { stableStringify } = require('../core/engine/canonical');
const { parseLedger, parsePlaybook } = require('../core/engine/markdown');
const { route } = require('../core/engine/route');
const { replay } = require('../core/engine/replay');
const { validateConfig, tierStatistics } = require('../core/engine/statistics');

const ROOT = path.resolve(__dirname, '..');
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
const legacyLedger = () => parseLedger(fixture('legacy-ledger.md'));
const measuredLedger = () => parseLedger(fixture('measured-ledger.md'));
const playbook = () => parsePlaybook(fixture('legacy-playbook.md'));
const disabled = JSON.parse(fs.readFileSync(path.join(ROOT, 'core/router-config.template.json'), 'utf8'));
const config = (overrides = {}) => ({
  enabled: true, calibrated: true, delta: 0.05, costCap: 10, incidentCap: 10,
  bindingEpoch: 'bindings-a', costUnit: 'test-unit',
  failurePenalty: 3, escalationPenalty: 2, riskWeight: 2,
  riskExposure: [0, 1, 2, 4], minSamples: 3, margin: 0.1,
  failureThresholds: [0.5, 0.4, 0.2, 0], probeOverhead: 0.5,
  minimumVoi: 0.1, maxProbeRisk: 2, maximumFailures: 4, maximumEscalations: 2,
  ...overrides
});
const request = (overrides = {}) => ({
  class: 'add-adapter-cli', risk: 1, critical: false, recurring: true,
  horizon: 5, epoch: 'bindings-a', playbook: 'PB-1',
  rubric: { ambiguity: 1, reasoning: 1, blastRadius: 1, riskSurface: 1 },
  ...overrides
});

function observations({ count = 100, risk = 1, epoch = 'bindings-a', lowerCost = 4, incumbentCost = 5, lowerFailures = 0, incumbentFailures = 0 }) {
  const result = [];
  for (let i = 0; i < count; i += 1) {
    for (const [tier, cost, failures, suffix] of [['T1', lowerCost, lowerFailures, 'l'], ['T2', incumbentCost, incumbentFailures, 'i']]) {
      result.push({
        date: '2026-09-20', class: 'add-adapter-cli', predicted: 'T1', executed: tier,
        outcome: failures ? 'fail' : 'pass', escalations: 0, playbook: 'PB-1',
        obsId: `${epoch}-${risk}-${String(i).padStart(4, '0')}-${suffix}`,
        resourceCost: cost, failures: typeof failures === 'function' ? failures(i) : failures,
        incidentLoss: 0, risk, epoch
      });
    }
  }
  return result;
}

function stateWith(rows) {
  return { priors: [], legacy: [], observations: [...rows].sort((a, b) => a.obsId < b.obsId ? -1 : 1) };
}

let count = 0;
function test(name, fn) {
  try { fn(); count += 1; process.stdout.write(`ok ${count} - ${name}\n`); }
  catch (error) { process.stderr.write(`not ok ${count + 1} - ${name}\n${error.stack}\n`); process.exitCode = 1; }
}
function throws(fn, pattern) { assert.throws(fn, pattern); }

test('byte-identical routing output', () => {
  const input = { request: request(), ledger: measuredLedger(), playbook: playbook(), config: disabled, policy: 'shadow' };
  assert.equal(stableStringify(route(input)), stableStringify(route(input)));
});

test('observation permutation leaves decision and hash identical', () => {
  const ledger = measuredLedger();
  const reversed = { ...ledger, observations: [...ledger.observations].reverse() };
  const a = route({ request: request(), ledger, playbook: playbook(), config: disabled, policy: 'shadow' });
  const b = route({ request: request(), ledger: reversed, playbook: playbook(), config: disabled, policy: 'shadow' });
  assert.deepEqual(a, b);
});

test('CRLF and LF parse identically', () => {
  const lf = fixture('measured-ledger.md');
  assert.deepEqual(parseLedger(lf), parseLedger(lf.replace(/\n/g, '\r\n')));
});

test('exact class match does not fuzzy merge', () => {
  const result = route({ request: request({ class: 'add-adapter-clis', playbook: undefined }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' });
  assert.equal(result.effective.reason, 'rubric');
});

test('exact epoch isolates statistical cells', () => {
  const rows = observations({ epoch: 'old' });
  const result = route({ request: request({ epoch: 'new' }), ledger: stateWith(rows), playbook: playbook(), config: config({ bindingEpoch: 'new' }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T2');
  assert.equal(result.effective.reason, 'insufficient-safe-evidence');
});

test('legacy seven-column ledger remains valid but has no measurements', () => {
  const ledger = legacyLedger();
  assert.equal(ledger.legacy.length, 2);
  assert.equal(ledger.observations.length, 0);
});

test('partial measured row is rejected', () => {
  const broken = fixture('measured-ledger.md').replace(' | bindings-a |', ' |');
  throws(() => parseLedger(broken), /partial measured row|wrong LOG column count/);
});

test('duplicate obs_id is rejected', () => {
  const text = fixture('measured-ledger.md').replace('obs-003', 'obs-001');
  throws(() => parseLedger(text), /duplicate obs_id/);
});

test('negative and nonfinite measured numerics are rejected', () => {
  throws(() => parseLedger(fixture('measured-ledger.md').replace('1.2 | 0', '-1 | 0')), /non-negative/);
  throws(() => parseLedger(fixture('measured-ledger.md').replace('1.2 | 0', 'Infinity | 0')), /finite/);
});

test('values beyond configured caps are rejected', () => {
  const ledger = measuredLedger();
  ledger.observations[0].resourceCost = 11;
  throws(() => route({ request: request(), ledger, playbook: playbook(), config: config(), policy: 'optimize' }), /exceeds costCap/);
});

test('failure counts beyond the calibrated cap are rejected', () => {
  const ledger = measuredLedger();
  ledger.observations[0].failures = 5;
  throws(() => route({ request: request(), ledger, playbook: playbook(), config: config(), policy: 'optimize' }), /exceeds maximumFailures/);
});

test('unknown tier and T0 are rejected', () => {
  throws(() => parseLedger(fixture('legacy-ledger.md').replace('| T2 | T2 | pass', '| T0 | T2 | pass')), /unknown tier/);
});

test('critical request routes T3', () => {
  const result = route({ request: request({ critical: true }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' });
  assert.equal(result.effective.tier, 'T3');
});

test('risk 3 routes T3 before playbook descent', () => {
  const result = route({ request: request({ risk: 3 }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' });
  assert.equal(result.effective.tier, 'T3');
});

test('quarantined playbook fails closed', () => {
  const result = route({ request: request({ class: 'fix-api-client', playbook: 'PB-2' }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.action, 'refusal');
});

test('sticky floor prevents descent', () => {
  const pb = parsePlaybook(fixture('legacy-playbook.md').replace('floor: T1', 'floor: T2'));
  const result = route({ request: request(), ledger: legacyLedger(), playbook: pb, config: null, policy: 'legacy' });
  assert.equal(result.effective.tier, 'T2');
});

test('no descent is possible without explicit live playbook reference', () => {
  const result = route({ request: request({ playbook: undefined }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' });
  assert.equal(result.effective.tier, 'T2');
});

test('playbook descent is at most one tier', () => {
  const pb = parsePlaybook(fixture('legacy-playbook.md').replace('provenance: T2 2026-09', 'provenance: T3 2026-09'));
  const result = route({ request: request(), ledger: legacyLedger(), playbook: pb, config: null, policy: 'legacy' });
  assert.equal(result.effective.tier, 'T2');
});

test('VOI is monotone in horizon for a fixed exact cell', () => {
  const ledger = stateWith(observations({ count: 200 }));
  const cfg = config({ minSamples: 1000, probeOverhead: 2, minimumVoi: 0.1 });
  const short = route({ request: request({ horizon: 2 }), ledger, playbook: playbook(), config: cfg, policy: 'optimize' });
  const long = route({ request: request({ horizon: 8 }), ledger, playbook: playbook(), config: cfg, policy: 'optimize' });
  assert.notEqual(short.effective.action, 'probe');
  assert.equal(long.effective.action, 'probe');
  assert.ok(long.effective.voi > short.effective.voi);
});

test('risk penalty cannot make a failing lower tier more attractive', () => {
  const failRate = (i) => i < 20 ? 1 : 0;
  const rows = [...observations({ count: 200, risk: 0, lowerFailures: failRate }), ...observations({ count: 200, risk: 2, lowerFailures: failRate })];
  const cfg = config({ minSamples: 1000, failurePenalty: 0, riskWeight: 20, riskExposure: [0, 1, 5, 10], failureThresholds: [0.8, 0.8, 0.8, 0] });
  const low = route({ request: request({ risk: 0, horizon: 10 }), ledger: stateWith(rows), playbook: playbook(), config: cfg, policy: 'optimize' });
  const high = route({ request: request({ risk: 2, horizon: 10 }), ledger: stateWith(rows), playbook: playbook(), config: cfg, policy: 'optimize' });
  assert.equal(low.effective.action, 'probe');
  assert.equal(high.effective.action, 'refusal');
});

test('adding failures cannot improve lower-tier upper score', () => {
  const clean = tierStatistics(observations({ count: 100 }), 'T1', config());
  const failed = tierStatistics(observations({ count: 100, lowerFailures: (i) => i === 0 ? 1 : 0 }), 'T1', config());
  assert.ok(failed.upper >= clean.upper);
});

test('homogeneous economic scaling preserves route', () => {
  const rows = observations({ count: 200 });
  const base = config({ minSamples: 1000, probeOverhead: 2, minimumVoi: 0.1 });
  const scaled = config({ minSamples: 1000, costCap: 100, incidentCap: 100, failurePenalty: 30, escalationPenalty: 20, riskWeight: 20, margin: 1, probeOverhead: 20, minimumVoi: 1 });
  const scaledRows = rows.map((row) => ({ ...row, resourceCost: row.resourceCost * 10, incidentLoss: row.incidentLoss * 10 }));
  const a = route({ request: request({ horizon: 8 }), ledger: stateWith(rows), playbook: playbook(), config: base, policy: 'optimize' });
  const b = route({ request: request({ horizon: 8 }), ledger: stateWith(scaledRows), playbook: playbook(), config: scaled, policy: 'optimize' });
  assert.equal(a.effective.tier, b.effective.tier);
  assert.equal(a.effective.action, b.effective.action);
});

test('ties choose the higher tier', () => {
  const ledger = stateWith(observations({ count: 200, lowerCost: 5, incumbentCost: 5 }));
  const result = route({ request: request({ horizon: 20 }), ledger, playbook: playbook(), config: config({ minSamples: 1000, probeOverhead: 0, minimumVoi: 0 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T2');
});

test('statistically dominant higher tier promotes before descent', () => {
  const rows = observations({ count: 200, lowerCost: 4, incumbentCost: 5 });
  for (let i = 0; i < 200; i += 1) {
    rows.push({ ...rows[i * 2 + 1], executed: 'T3', resourceCost: 1, obsId: `bindings-a-1-${String(i).padStart(4, '0')}-h` });
  }
  const result = route({ request: request(), ledger: stateWith(rows), playbook: playbook(), config: config(), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.reason, 'higher-tier-dominates');
});

test('shadow effective decision is exactly legacy', () => {
  const result = route({ request: request(), ledger: measuredLedger(), playbook: playbook(), config: config(), policy: 'shadow' });
  assert.deepEqual(result.effective, result.legacy);
});

test('uncalibrated disabled shadow falls back with warning', () => {
  const result = route({ request: request(), ledger: measuredLedger(), playbook: playbook(), config: disabled, policy: 'shadow' });
  assert.deepEqual(result.recommended, result.legacy);
  assert.equal(result.warnings.length, 1);
});

test('enabled but uncalibrated configuration is invalid', () => {
  throws(() => validateConfig({ enabled: true, calibrated: false }), /must be calibrated/);
});

test('calibrated binding epoch mismatch is rejected', () => {
  throws(() => route({ request: request({ epoch: 'other' }), ledger: measuredLedger(), playbook: playbook(), config: config(), policy: 'optimize' }), /does not match calibrated bindingEpoch/);
});

test('unknown request and config properties are rejected', () => {
  throws(() => route({ request: request({ surprise: true }), ledger: measuredLedger(), playbook: playbook(), config: null, policy: 'legacy' }), /unknown request property/);
  throws(() => validateConfig({ ...config(), surprise: true }), /unknown config property/);
});

test('ambiguous live playbook entries are rejected', () => {
  const text = fixture('legacy-playbook.md').replace('## QUARANTINE', '### PB-3 · add-adapter-cli\nprovenance: T2 2026-09 · hits: 0\nWHEN: duplicate.\nDO: no.\nVERIFY: no.\n\n## QUARANTINE');
  throws(() => parsePlaybook(text), /ambiguous live playbooks/);
});

test('contradictory playbook floor is rejected', () => {
  throws(() => parsePlaybook(fixture('legacy-playbook.md').replace('floor: T1', 'floor: T3')), /contradictory floor/);
});

test('empty measured epoch is rejected', () => {
  throws(() => parseLedger(fixture('measured-ledger.md').replace(' | bindings-a |', ' |  |')), /epoch is empty/);
});

test('current repository examples parse', () => {
  assert.doesNotThrow(() => parseLedger(fs.readFileSync(path.join(ROOT, 'examples/self-build/ledger.md'), 'utf8')));
  assert.doesNotThrow(() => parsePlaybook(fs.readFileSync(path.join(ROOT, 'examples/self-build/playbook.md'), 'utf8')));
});

test('replay is deterministic and reports all cumulative metrics', () => {
  const args = { jsonl: fixture('adversarial-replay.jsonl'), ledger: measuredLedger(), playbook: playbook(), config: config(), policy: 'shadow' };
  const a = replay(args);
  const b = replay(args);
  assert.deepEqual(a, b);
  for (const key of ['fullyLoadedLoss', 'resourceCost', 'failures', 'escalations', 'incidents', 'probes', 'promotions', 'refusals', 'regret']) {
    assert.equal(typeof a.totals[key], 'number');
  }
  assert.match(a.finalStateHash, /^[0-9a-f]{64}$/);
});

test('replay refuses causal comparison for incomplete outcomes', () => {
  const line = JSON.parse(fixture('adversarial-replay.jsonl').split('\n')[0]);
  delete line.outcomes.T2;
  throws(() => replay({ jsonl: JSON.stringify(line), ledger: measuredLedger(), playbook: playbook(), config: config(), policy: 'shadow' }), /outcome is missing/);
});

test('CLI route, observe, and replay contracts work', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tierdecay-router-'));
  const write = (name, value) => { const file = path.join(tmp, name); fs.writeFileSync(file, value); return file; };
  const ledger = write('ledger.md', fixture('measured-ledger.md'));
  const pb = write('playbook.md', fixture('legacy-playbook.md'));
  const cfg = write('config.json', JSON.stringify(config()));
  const req = write('request.json', JSON.stringify(request()));
  const scenario = write('scenario.jsonl', fixture('adversarial-replay.jsonl'));
  const cli = path.join(ROOT, 'bin/tierdecay.js');
  const routed = spawnSync(process.execPath, [cli, 'route', '--request', req, '--ledger', ledger, '--playbook', pb, '--config', cfg], { encoding: 'utf8' });
  assert.equal(routed.status, 0, routed.stderr);
  assert.equal(JSON.parse(routed.stdout).policy, 'shadow');
  const validObservation = { date: '2026-09-25', class: 'add-adapter-cli', predicted: 'T1', executed: 'T1', outcome: 'pass', escalations: 0, playbook: 'PB-1', obsId: 'cli-1', resourceCost: 1, failures: 0, incidentLoss: 0, risk: 1, epoch: 'bindings-a' };
  const observation = write('observation.json', JSON.stringify(validObservation));
  const observed = spawnSync(process.execPath, [cli, 'observe', '--observation', observation], { encoding: 'utf8' });
  assert.equal(observed.status, 0, observed.stderr);
  assert.match(observed.stdout, /^\| 2026-09-25 \|/);
  const numericLabels = { resourceCost: 'resource_cost', failures: 'failures', incidentLoss: 'incident_loss', risk: 'risk', escalations: 'esc' };
  for (const [field, label] of Object.entries(numericLabels)) {
    const invalid = write(`observation-${field}.json`, JSON.stringify({ ...validObservation, [field]: String(validObservation[field]) }));
    const rejected = spawnSync(process.execPath, [cli, 'observe', '--observation', invalid], { encoding: 'utf8' });
    assert.equal(rejected.status, 2, `${field}: ${rejected.stderr}`);
    assert.match(rejected.stderr, new RegExp(`${label} must be a finite JSON number`));
  }
  const invalidNumerics = [
    ['resourceCost', null, /finite JSON number/],
    ['failures', true, /finite JSON number/],
    ['incidentLoss', -1, /finite and non-negative/],
    ['risk', 4, /between 0 and 3/],
    ['escalations', 0.5, /non-negative integer/],
    ['failures', Number.MAX_SAFE_INTEGER + 1, /safe integer range/]
  ];
  for (const [field, value, pattern] of invalidNumerics) {
    const invalid = write(`observation-invalid-${field}.json`, JSON.stringify({ ...validObservation, [field]: value }));
    const rejected = spawnSync(process.execPath, [cli, 'observe', '--observation', invalid], { encoding: 'utf8' });
    assert.equal(rejected.status, 2, `${field}: ${rejected.stderr}`);
    assert.match(rejected.stderr, pattern);
  }
  const overflow = write('observation-nonfinite.json', JSON.stringify(validObservation).replace('"resourceCost":1', '"resourceCost":1e400'));
  const rejectedOverflow = spawnSync(process.execPath, [cli, 'observe', '--observation', overflow], { encoding: 'utf8' });
  assert.equal(rejectedOverflow.status, 2, rejectedOverflow.stderr);
  assert.match(rejectedOverflow.stderr, /resource_cost must be a finite JSON number/);
  const replayed = spawnSync(process.execPath, [cli, 'replay', '--scenario', scenario, '--ledger', ledger, '--playbook', pb, '--config', cfg], { encoding: 'utf8' });
  assert.equal(replayed.status, 0, replayed.stderr);
  assert.equal(JSON.parse(replayed.stdout).scenarios, 2);
});

process.on('exit', () => {
  if (!process.exitCode) process.stdout.write(`1..${count}\n`);
});
