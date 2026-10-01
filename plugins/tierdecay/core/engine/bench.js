'use strict';

// Order-robustness benchmark over potential-outcome scenarios.
//
// Self-improving routers are path dependent: what the router learns from early
// tasks changes later decisions, so a single replay order can flatter or hide
// a policy. `bench` replays the same scenarios under N seeded permutations and
// reports the spread, next to order-free static baselines (always T1/T2/T3)
// and the per-scenario oracle. Each replay evolves an in-memory copy of the
// playbook (hits, decays, quarantines), so the protocol's own learning is part
// of what is permuted. Deterministic: a seeded PRNG, no clock.
const { ValidationError, validateConfig, metricLoss, ensureFinite } = require('./statistics');
const { replay, parseJsonLines } = require('./replay');

const METRICS = ['fullyLoadedLoss', 'resourceCost', 'failures', 'escalations', 'incidents', 'regret', 'probes', 'promotions', 'refusals', 'decays', 'quarantines'];

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function permutation(length, seed) {
  const order = Array.from({ length }, (_, index) => index);
  const random = mulberry32(seed);
  for (let i = length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  return order;
}

function describe(values) {
  const n = values.length;
  const mean = values.reduce((sum, value) => sum + value, 0) / n;
  const variance = n > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1) : 0;
  return { mean, sd: Math.sqrt(variance), min: Math.min(...values), max: Math.max(...values) };
}

function bench({ jsonl, ledger, playbook, config, permutations = 20, seed = 1 }) {
  if (!Number.isSafeInteger(permutations) || permutations < 1 || permutations > 10000) {
    throw new ValidationError('permutations must be an integer from 1 to 10000');
  }
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xFFFFFFFF) throw new ValidationError('seed must be an integer from 0 to 4294967295');
  const checkedConfig = validateConfig(config);
  if (!checkedConfig.enabled || !checkedConfig.calibrated) throw new ValidationError('bench requires enabled calibrated config');
  const lines = String(jsonl).replace(/\r\n?/g, '\n').split('\n').filter((line) => line.trim());
  if (!lines.length) throw new ValidationError('bench requires at least one scenario');
  const scenarios = parseJsonLines(lines.join('\n'));

  const policies = { protocol: 'shadow', optimize: 'optimize' };
  const runs = { protocol: [], optimize: [] };
  for (let p = 0; p < permutations; p += 1) {
    // Permutation 0 is the file order, so it matches a plain `replay`.
    const order = p === 0 ? lines.map((_, index) => index) : permutation(lines.length, seed + p);
    const text = order.map((index) => lines[index]).join('\n');
    for (const [label, policy] of Object.entries(policies)) {
      const result = replay({ jsonl: text, ledger, playbook, config: checkedConfig, policy, evolvePlaybook: true });
      runs[label].push({ ...result.totals, ...result.lifecycle });
    }
  }

  const staticLoss = { T1: 0, T2: 0, T3: 0 };
  let oracle = 0;
  for (const scenario of scenarios) {
    const losses = ['T1', 'T2', 'T3'].map((tier) => metricLoss(scenario.outcomes[tier], scenario.request.risk, checkedConfig));
    ['T1', 'T2', 'T3'].forEach((tier, index) => { staticLoss[tier] = ensureFinite(staticLoss[tier] + losses[index], 'static loss'); });
    oracle = ensureFinite(oracle + Math.min(...losses), 'oracle loss');
  }

  const summary = {};
  for (const label of Object.keys(policies)) {
    const metrics = {};
    for (const metric of METRICS) metrics[metric] = describe(runs[label].map((totals) => totals[metric]));
    const loss = metrics.fullyLoadedLoss;
    metrics.savingsVsStaticT3 = staticLoss.T3 > 0 ? 1 - loss.mean / staticLoss.T3 : 0;
    metrics.orderSpread = loss.mean > 0 ? (loss.max - loss.min) / loss.mean : 0;
    summary[label] = metrics;
  }

  return {
    schemaVersion: 1,
    scenarios: scenarios.length,
    permutations,
    seed,
    costUnit: checkedConfig.costUnit,
    baselines: { staticT1: staticLoss.T1, staticT2: staticLoss.T2, staticT3: staticLoss.T3, oracle },
    policies: summary
  };
}

module.exports = { bench, permutation, mulberry32 };
