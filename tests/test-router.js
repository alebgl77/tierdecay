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
  enabled: true, calibrated: true, confidenceDelta: 0.05, costCap: 10, incidentCap: 10,
  bindingEpoch: 'bindings-a', costUnit: 'test-unit',
  failurePenalty: 3, escalationPenalty: 2, riskWeight: 2,
  riskExposure: [0, 1, 2, 4], minSamples: 3, margin: 0.1,
  failureThresholds: [0.5, 0.4, 0.2, 0], probeOverhead: 0.5,
  minimumVoi: 0.1, maxProbeRisk: 2, maximumFailures: 4, maximumEscalations: 2,
  ...overrides
});
const request = (overrides = {}) => {
  const base = {
    class: 'add-adapter-cli', risk: 1, critical: false, recurring: true,
    horizon: 5, epoch: 'bindings-a', playbook: 'PB-1',
    rubric: { ambiguity: 1, reasoning: 1, blastRadius: 1, riskSurface: 1 }
  };
  const merged = { ...base, ...overrides };
  if (overrides.risk !== undefined && overrides.rubric === undefined) {
    merged.rubric = { ...base.rubric, riskSurface: overrides.risk };
  }
  return merged;
};

function observations({ count = 100, risk = 1, epoch = 'bindings-a', lowerCost = 4, incumbentCost = 5, lowerFailures = 0, incumbentFailures = 0 }) {
  const result = [];
  for (let i = 0; i < count; i += 1) {
    for (const [tier, cost, failures, suffix] of [['T1', lowerCost, lowerFailures, 'l'], ['T2', incumbentCost, incumbentFailures, 'i']]) {
      const failureCount = typeof failures === 'function' ? failures(i) : failures;
      result.push({
        date: '2026-09-20', class: 'add-adapter-cli', predicted: 'T1', executed: tier,
        outcome: failureCount ? 'fail' : 'pass', escalations: 0, playbook: 'PB-1',
        obsId: `${epoch}-${risk}-${String(i).padStart(4, '0')}-${suffix}`,
        resourceCost: cost, failures: failureCount,
        incidentLoss: 0, risk, epoch
      });
    }
  }
  return result;
}

function tierObservations({ tier, count = 500, risk = 1, epoch = 'bindings-a', cost = 1, failures = 0, prefix = tier.toLowerCase() }) {
  const result = [];
  for (let i = 0; i < count; i += 1) {
    const failureCount = typeof failures === 'function' ? failures(i) : failures;
    result.push({
      date: '2026-09-20', class: 'add-adapter-cli', predicted: tier, executed: tier,
      outcome: failureCount ? 'fail' : 'pass', escalations: 0, playbook: 'PB-1',
      obsId: `${prefix}-${String(i).padStart(4, '0')}`,
      resourceCost: typeof cost === 'function' ? cost(i) : cost, failures: failureCount,
      incidentLoss: 0, risk, epoch
    });
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
function caught(fn, pattern) {
  let error;
  try { fn(); } catch (candidate) { error = candidate; }
  assert.ok(error, 'expected function to throw');
  assert.match(String(error), pattern);
  return error;
}

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
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.reason, 'no-observed-safe-tier');
});

test('legacy seven-column ledger remains valid but has no measurements', () => {
  const ledger = legacyLedger();
  assert.equal(ledger.legacy.length, 2);
  assert.equal(ledger.observations.length, 0);
});

test('legacy dates are opaque non-empty text and remain unchanged', () => {
  const ledger = parseLedger(fixture('legacy-ledger.md').replace('| 2026-09-20 |', '| 2026-09 |'));
  assert.equal(ledger.legacy[0].date, '2026-09');
});

test('empty legacy dates are rejected while measured dates remain ISO', () => {
  throws(() => parseLedger(fixture('legacy-ledger.md').replace('| 2026-09-20 |', '|  |')), /date must not be empty/);
  throws(() => parseLedger(fixture('measured-ledger.md').replace('| 2026-09-20 |', '| 2026-09 |')), /date must be a valid YYYY-MM-DD date/);
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
  ledger.observations[0].outcome = 'fail';
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

test('request risk and rubric riskSurface cannot diverge in either direction', () => {
  const lowRubric = request({ risk: 3, rubric: { ambiguity: 0, reasoning: 0, blastRadius: 0, riskSurface: 0 } });
  const highRubric = request({ risk: 0, rubric: { ambiguity: 0, reasoning: 0, blastRadius: 0, riskSurface: 3 } });
  for (const candidate of [lowRubric, highRubric]) {
    const error = caught(() => route({ request: candidate, ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' }), /must equal/);
    assert.equal(error.exitCode, 2);
  }
});

test('quarantined playbook fails closed', () => {
  const result = route({ request: request({ class: 'fix-api-client', playbook: 'PB-2' }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.action, 'refusal');
});

test('class quarantine fails closed without an id and cannot be bypassed by another id', () => {
  const withoutId = route({ request: request({ class: 'fix-api-client', playbook: undefined }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' });
  const wrongId = route({ request: request({ class: 'fix-api-client', playbook: 'PB-1' }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' });
  assert.equal(withoutId.effective.tier, 'T3');
  assert.equal(wrongId.effective.tier, 'T3');
});

test('class floor applies without an explicit playbook id', () => {
  const pb = parsePlaybook(fixture('legacy-playbook.md').replace('floor: T1', 'floor: T2'));
  const low = request({ risk: 0, playbook: undefined, rubric: { ambiguity: 0, reasoning: 0, blastRadius: 0, riskSurface: 0 } });
  const result = route({ request: low, ledger: { priors: [], legacy: [], observations: [] }, playbook: pb, config: null, policy: 'legacy' });
  assert.equal(result.effective.tier, 'T2');
  assert.equal(result.effective.reason, 'sticky-floor');
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
  const ledger = stateWith(observations({ count: 1000 }));
  const cfg = config({ minSamples: 1000, probeOverhead: 2, minimumVoi: 0.1 });
  const short = route({ request: request({ horizon: 2 }), ledger, playbook: playbook(), config: cfg, policy: 'optimize' });
  const long = route({ request: request({ horizon: 8 }), ledger, playbook: playbook(), config: cfg, policy: 'optimize' });
  assert.notEqual(short.effective.action, 'probe');
  assert.equal(long.effective.action, 'probe');
  assert.ok(long.effective.voi > short.effective.voi);
});

test('risk penalty cannot make a failing lower tier more attractive', () => {
  const failRate = (i) => i < 20 ? 1 : 0;
  const scaledFailRate = (i) => i < 100 ? 1 : 0;
  const rows = [...observations({ count: 1000, risk: 0, lowerFailures: scaledFailRate }), ...observations({ count: 1000, risk: 2, lowerFailures: scaledFailRate })];
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
  const result = route({ request: request({ horizon: 20 }), ledger, playbook: playbook(), config: config({ minSamples: 200, probeOverhead: 0, minimumVoi: 0 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T2');
});

test('statistically dominant safe higher tier promotes before descent', () => {
  const rows = [
    ...tierObservations({ tier: 'T2', cost: 9 }),
    ...tierObservations({ tier: 'T3', cost: 1 })
  ];
  const result = route({ request: request(), ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 500 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.action, 'promotion');
  assert.equal(result.effective.reason, 'higher-tier-dominates');
});

test('unsafe T1 promotes through safe T2 to dominant safe T3', () => {
  const rows = [
    ...tierObservations({ tier: 'T1', cost: 1, failures: 1 }),
    ...tierObservations({ tier: 'T2', cost: 9 }),
    ...tierObservations({ tier: 'T3', cost: 1 })
  ];
  const lowRequest = request({ playbook: undefined, rubric: { ambiguity: 0, reasoning: 0, blastRadius: 0, riskSurface: 1 } });
  const result = route({ request: lowRequest, ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 500 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.reason, 'higher-tier-dominates');
});

test('unsafe cheaper middle tier is skipped between safe tiers', () => {
  const rows = [
    ...tierObservations({ tier: 'T1', cost: 9 }),
    ...tierObservations({ tier: 'T2', cost: 0.5, failures: 1 }),
    ...tierObservations({ tier: 'T3', cost: 1 })
  ];
  const lowRequest = request({ playbook: undefined, rubric: { ambiguity: 0, reasoning: 0, blastRadius: 0, riskSurface: 1 } });
  const result = route({ request: lowRequest, ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 500 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.reason, 'higher-tier-dominates');
});

test('unsafe cheaper higher tier cannot displace a safe incumbent', () => {
  const rows = [
    ...tierObservations({ tier: 'T2', cost: 9 }),
    ...tierObservations({ tier: 'T3', cost: 1, failures: 1 })
  ];
  const result = route({ request: request({ playbook: undefined }), ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 500 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T2');
  assert.notEqual(result.effective.action, 'promotion');
});

test('equal safe higher-tier mean promotes with deterministic tie-break', () => {
  const rows = [
    ...tierObservations({ tier: 'T2', cost: 5 }),
    ...tierObservations({ tier: 'T3', cost: 5 })
  ];
  const result = route({ request: request({ playbook: undefined }), ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 500 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.reason, 'higher-tier-tie');
});

test('under-sampled higher tier cannot promote economically', () => {
  const rows = [
    ...tierObservations({ tier: 'T2', cost: 9 }),
    ...tierObservations({ tier: 'T3', count: 499, cost: 1 })
  ];
  const result = route({ request: request({ playbook: undefined }), ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 500 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T2');
  assert.notEqual(result.effective.action, 'promotion');
});

test('overlapping bounds prevent higher-tier promotion when means differ', () => {
  const rows = [
    ...tierObservations({ tier: 'T2', cost: 9 }),
    ...tierObservations({ tier: 'T3', cost: 8.9 })
  ];
  const cfg = config({ minSamples: 500 });
  const incumbent = tierStatistics(rows, 'T2', cfg);
  const candidate = tierStatistics(rows, 'T3', cfg);
  assert.notEqual(candidate.mean, incumbent.mean);
  assert.ok(candidate.upper + cfg.margin >= incumbent.lower);
  const result = route({ request: request({ playbook: undefined }), ledger: stateWith(rows), playbook: playbook(), config: cfg, policy: 'optimize' });
  assert.equal(result.effective.tier, 'T2');
  assert.notEqual(result.effective.action, 'promotion');
});

test('economic selection never descends below its incumbent', () => {
  const rows = [
    ...tierObservations({ tier: 'T1', cost: 1 }),
    ...tierObservations({ tier: 'T2', cost: 9 })
  ];
  const result = route({ request: request({ playbook: undefined }), ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 500 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T2');
  assert.notEqual(result.effective.action, 'promotion');
});

test('higher-tier economic promotion is invariant to observation permutation', () => {
  const rows = [
    ...tierObservations({ tier: 'T2', cost: (i) => 8.8 + (i % 3) / 10 }),
    ...tierObservations({ tier: 'T3', cost: (i) => 0.8 + (i % 3) / 10 })
  ];
  const input = { request: request(), playbook: playbook(), config: config({ minSamples: 500 }), policy: 'optimize' };
  const a = route({ ...input, ledger: { priors: [], legacy: [], observations: rows } });
  const b = route({ ...input, ledger: { priors: [], legacy: [], observations: [...rows].reverse() } });
  assert.deepEqual(a, b);
  assert.equal(a.effective.reason, 'higher-tier-dominates');
});

test('higher-tier economic promotion is invariant to homogeneous scaling', () => {
  const rows = [
    ...tierObservations({ tier: 'T2', cost: 9 }),
    ...tierObservations({ tier: 'T3', cost: 1 })
  ];
  const base = config({ minSamples: 500 });
  const scaled = config({ minSamples: 500, costCap: 100, incidentCap: 100, failurePenalty: 30, escalationPenalty: 20, riskWeight: 20, margin: 1, probeOverhead: 5, minimumVoi: 1 });
  const scaledRows = rows.map((row) => ({ ...row, resourceCost: row.resourceCost * 10, incidentLoss: row.incidentLoss * 10 }));
  const a = route({ request: request(), ledger: stateWith(rows), playbook: playbook(), config: base, policy: 'optimize' });
  const b = route({ request: request(), ledger: stateWith(scaledRows), playbook: playbook(), config: scaled, policy: 'optimize' });
  assert.equal(a.effective.tier, b.effective.tier);
  assert.equal(a.effective.action, b.effective.action);
  assert.equal(a.effective.reason, b.effective.reason);
});

test('known unsafe incumbent promotes to first observed safe higher tier', () => {
  const rows = observations({ count: 200, lowerCost: 4, incumbentCost: 5, incumbentFailures: 1 });
  for (let i = 0; i < 200; i += 1) {
    rows.push({ ...rows[i * 2 + 1], executed: 'T3', resourceCost: 1, failures: 0, outcome: 'pass', obsId: `bindings-a-1-${String(i).padStart(4, '0')}-h` });
  }
  const result = route({ request: request(), ledger: stateWith(rows), playbook: playbook(), config: config(), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.reason, 'failure-upper-bound');
});

test('no observed safe tier fails closed at T3 without descent', () => {
  const rows = observations({ count: 200, incumbentFailures: 1 });
  for (let i = 0; i < 200; i += 1) {
    rows.push({ ...rows[i * 2 + 1], executed: 'T3', failures: 1, outcome: 'fail', obsId: `unsafe-${String(i).padStart(4, '0')}` });
  }
  const result = route({ request: request(), ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 200 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T3');
  assert.equal(result.effective.reason, 'no-observed-safe-tier');
});

test('executed tier, not predicted label, determines statistical evidence', () => {
  const rows = observations({ count: 1000 }).map((row) => ({ ...row, predicted: 'T3' }));
  const result = route({ request: request({ horizon: 8 }), ledger: stateWith(rows), playbook: playbook(), config: config({ minSamples: 1000 }), policy: 'optimize' });
  assert.equal(result.effective.tier, 'T1');
  assert.equal(result.effective.action, 'probe');
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

test('live and quarantined entries for one class are rejected', () => {
  const text = fixture('legacy-playbook.md').replace('### PB-2 · fix-api-client', '### PB-2 · add-adapter-cli');
  throws(() => parsePlaybook(text), /live and quarantined/);
});

test('contradictory class floors are rejected', () => {
  const extra = '### PB-3 · fix-api-client\nprovenance: T3 2026-09 · hits: 0\nfloor: T1\nWHEN: duplicate quarantine.\nDO: stop.\nVERIFY: review.\n\n';
  const text = fixture('legacy-playbook.md').replace('## QUARANTINE\n\n', `## QUARANTINE\n\n${extra}`);
  throws(() => parsePlaybook(text), /contradictory floors/);
});

test('playbook sections are exact, unique, and reset on unrelated headings', () => {
  throws(() => parsePlaybook(fixture('legacy-playbook.md').replace('## PATTERNS', '## OTHER')), /outside PATTERNS|exactly one/);
  throws(() => parsePlaybook(fixture('legacy-playbook.md').replace('## QUARANTINE', '## PATTERNS\n\n## QUARANTINE')), /exactly one/);
  throws(() => parsePlaybook(fixture('legacy-playbook.md').replace('## QUARANTINE', '## OTHER\n\n## QUARANTINE').replace('### PB-2', '## OTHER TWO\n\n### PB-2')), /outside PATTERNS/);
});

test('duplicate unique playbook fields are rejected', () => {
  const source = fixture('legacy-playbook.md');
  const variants = [
    source.replace('provenance: T2 2026-09 · hits: 0', 'provenance: T2 2026-09 · hits: 0\nprovenance: T2 2026-09 · hits: 0'),
    source.replace('floor: T1', 'floor: T1\nfloor: T1'),
    source.replace('floor: T1', 'floor: T1\nstatus: live\nstatus: live'),
    source.replace('floor: T1', 'floor: T1\nepoch: bindings-a\nepoch: bindings-a')
  ];
  for (const text of variants) throws(() => parsePlaybook(text), /duplicate/);
});

test('contradictory playbook floor is rejected', () => {
  throws(() => parsePlaybook(fixture('legacy-playbook.md').replace('floor: T1', 'floor: T3')), /contradictory floor/);
});

test('empty measured epoch is rejected', () => {
  throws(() => parseLedger(fixture('measured-ledger.md').replace(' | bindings-a |', ' |  |')), /epoch is empty/);
});

test('old epoch may exceed current caps but remains globally validated', () => {
  const ledger = measuredLedger();
  ledger.observations.push({ ...ledger.observations[0], obsId: 'old-large', epoch: 'old', resourceCost: 100, incidentLoss: 100, failures: 20, outcome: 'fail', escalations: 20 });
  assert.doesNotThrow(() => route({ request: request(), ledger, playbook: playbook(), config: config(), policy: 'optimize' }));
  const invalid = { ...ledger, observations: ledger.observations.map((row) => row.obsId === 'old-large' ? { ...row, resourceCost: -1 } : row) };
  throws(() => route({ request: request(), ledger: invalid, playbook: playbook(), config: config(), policy: 'optimize' }), /finite and non-negative/);
  const duplicate = { ...ledger, observations: [...ledger.observations, { ...ledger.observations[0], epoch: 'old' }] };
  throws(() => route({ request: request(), ledger: duplicate, playbook: playbook(), config: config(), policy: 'optimize' }), /duplicate obs_id/);
});

test('safe-integer and arithmetic overflow become validation errors', () => {
  throws(() => route({ request: request({ horizon: Number.MAX_SAFE_INTEGER + 1 }), ledger: legacyLedger(), playbook: playbook(), config: null, policy: 'legacy' }), /safe integer/);
  throws(() => validateConfig({ ...config(), maximumFailures: Number.MAX_SAFE_INTEGER + 1 }), /safe integer/);
  const overflow = config({ failurePenalty: Number.MAX_VALUE, riskWeight: Number.MAX_VALUE });
  const error = caught(() => route({ request: request(), ledger: stateWith(observations({ count: 3 })), playbook: playbook(), config: overflow, policy: 'optimize' }), /must remain finite/);
  assert.equal(error.exitCode, 2);
});

test('confidenceDelta is divided across 4 metrics and 3 tiers', () => {
  const rows = observations({ count: 100 });
  const stats = tierStatistics(rows, 'T1', config());
  const expected = Math.sqrt(Math.log(2 / (0.05 / 12)) / (2 * 100));
  assert.equal(stats.components.failure.width, expected);
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
  for (const decision of a.decisions) {
    assert.equal(decision.predicted, decision.tier);
    assert.equal(decision.executed, decision.tier);
  }
});

test('missing replay date is byte-identical to the deterministic epoch date', () => {
  const scenario = JSON.parse(fixture('adversarial-replay.jsonl').split('\n')[0]);
  delete scenario.date;
  const withEpochDate = { ...scenario, date: '1970-01-01' };
  const run = (value) => replay({ jsonl: JSON.stringify(value), ledger: measuredLedger(), playbook: playbook(), config: config(), policy: 'shadow' });
  assert.equal(stableStringify(run(scenario)), stableStringify(run(withEpochDate)));
});

test('replay rejects invalid or non-string dates', () => {
  const scenario = JSON.parse(fixture('adversarial-replay.jsonl').split('\n')[0]);
  for (const date of ['2026-02-30', '', 19700101, ['1970-01-01']]) {
    throws(() => replay({ jsonl: JSON.stringify({ ...scenario, date }), ledger: measuredLedger(), playbook: playbook(), config: config(), policy: 'shadow' }), /date must be a valid YYYY-MM-DD date/);
  }
});

test('replay refuses causal comparison for incomplete outcomes', () => {
  const line = JSON.parse(fixture('adversarial-replay.jsonl').split('\n')[0]);
  delete line.outcomes.T2;
  throws(() => replay({ jsonl: JSON.stringify(line), ledger: measuredLedger(), playbook: playbook(), config: config(), policy: 'shadow' }), /outcome is missing/);
});

test('replay cumulative arithmetic overflow is validation error code 2', () => {
  const req = request({ risk: 0, playbook: undefined, rubric: { ambiguity: 0, reasoning: 0, blastRadius: 0, riskSurface: 0 } });
  const outcome = { resourceCost: 1e308, failures: 0, escalations: 0, incidentLoss: 0 };
  const jsonl = ['overflow-1', 'overflow-2'].map((id) => JSON.stringify({ id, date: '2026-09-25', request: req, outcomes: { T1: outcome, T2: outcome, T3: outcome } })).join('\n');
  const cfg = config({ costCap: Number.MAX_VALUE, failurePenalty: 0, escalationPenalty: 0, riskWeight: 0 });
  const error = caught(() => replay({ jsonl, ledger: legacyLedger(), playbook: playbook(), config: cfg, policy: 'legacy' }), /cumulative fully loaded loss must remain finite/);
  assert.equal(error.exitCode, 2);
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
  const stringFields = ['date', 'class', 'predicted', 'executed', 'outcome', 'playbook', 'obsId', 'epoch'];
  for (const field of stringFields) {
    const invalid = write(`observation-string-${field}.json`, JSON.stringify({ ...validObservation, [field]: 1 }));
    const rejected = spawnSync(process.execPath, [cli, 'observe', '--observation', invalid], { encoding: 'utf8' });
    assert.equal(rejected.status, 2, `${field}: ${rejected.stderr}`);
    assert.match(rejected.stderr, /must be a JSON string/);
  }
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
  const semanticInvalid = [
    [{ date: '2026-02-30' }, /valid YYYY-MM-DD/],
    [{ class: 'bad' }, /2-4 token/],
    [{ predicted: 'T0' }, /must be T1/],
    [{ epoch: 'two words' }, /non-empty token/],
    [{ outcome: 'pass', failures: 1 }, /pass observation/],
    [{ outcome: 'fail', failures: 0 }, /fail observation/]
  ];
  for (let i = 0; i < semanticInvalid.length; i += 1) {
    const [change, pattern] = semanticInvalid[i];
    const invalid = write(`observation-semantic-${i}.json`, JSON.stringify({ ...validObservation, ...change }));
    const rejected = spawnSync(process.execPath, [cli, 'observe', '--observation', invalid], { encoding: 'utf8' });
    assert.equal(rejected.status, 2, rejected.stderr);
    assert.match(rejected.stderr, pattern);
  }
  const custom = write('observation-custom-outcome.json', JSON.stringify({ ...validObservation, outcome: 'reviewed', failures: 1 }));
  assert.equal(spawnSync(process.execPath, [cli, 'observe', '--observation', custom], { encoding: 'utf8' }).status, 0);
  const legacyNoConfig = spawnSync(process.execPath, [cli, 'route', '--request', req, '--ledger', ledger, '--playbook', pb, '--policy', 'legacy'], { encoding: 'utf8', cwd: tmp });
  assert.equal(legacyNoConfig.status, 0, legacyNoConfig.stderr);
  assert.equal(JSON.parse(legacyNoConfig.stdout).policy, 'legacy');
  const replayed = spawnSync(process.execPath, [cli, 'replay', '--scenario', scenario, '--ledger', ledger, '--playbook', pb, '--config', cfg], { encoding: 'utf8' });
  assert.equal(replayed.status, 0, replayed.stderr);
  assert.equal(JSON.parse(replayed.stdout).scenarios, 2);
});

test('versioned route and replay goldens are byte-identical and document the benchmark hash', () => {
  const cli = path.join(ROOT, 'bin/tierdecay.js');
  const common = ['--ledger', path.join(__dirname, 'fixtures/measured-ledger.md'), '--playbook', path.join(__dirname, 'fixtures/legacy-playbook.md'), '--config', path.join(ROOT, 'benchmarks/synthetic-v1.config.json'), '--policy', 'shadow'];
  const routed = spawnSync(process.execPath, [cli, 'route', '--request', path.join(__dirname, 'fixtures/golden-request.json'), ...common], { encoding: 'utf8' });
  const replayed = spawnSync(process.execPath, [cli, 'replay', '--scenario', path.join(ROOT, 'benchmarks/synthetic-v1.jsonl'), ...common], { encoding: 'utf8' });
  assert.equal(routed.status, 0, routed.stderr);
  assert.equal(replayed.status, 0, replayed.stderr);
  assert.equal(routed.stdout, fixture('golden-shadow-route.json'));
  assert.equal(replayed.stdout, fixture('golden-shadow-replay.json'));
  const hash = JSON.parse(replayed.stdout).finalStateHash;
  assert.match(fs.readFileSync(path.join(ROOT, 'benchmarks/README.md'), 'utf8'), new RegExp(hash));
});

process.on('exit', () => {
  if (!process.exitCode) process.stdout.write(`1..${count}\n`);
});
