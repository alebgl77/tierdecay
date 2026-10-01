'use strict';

// Read-only view of the learned posterior: one row per known class with its
// effective default route and the next protocol action the orchestrator owes
// (recertify, decay, add a PRIORS row, ...). Never writes state.
const { DECAY_ALPHA, PASS_RATE_FLOOR, REQUIRED_HITS, DEFAULT_ENTRY_RISK, entryDecay } = require('./decay');
const { TIER_NUMBER, NUMBER_TIER } = require('./route');

const lexical = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function classRows(ledger, taskClass) {
  return [...ledger.legacy, ...ledger.observations].filter((row) => row.class === taskClass);
}

// Default route for a class with no request-specific facts (risk, criticality):
// the same precedence as SPEC §2 — quarantine, live playbook, PRIORS.
function defaultRoute(taskClass, ledger, playbook, epoch) {
  const entries = playbook.entries.filter((entry) => entry.class === taskClass);
  const live = entries.find((entry) => entry.status === 'live') || null;
  const quarantined = entries.find((entry) => entry.status === 'quarantined') || null;
  const floor = entries.map((entry) => entry.floor).find(Boolean) || null;
  const prior = ledger.priors.find((candidate) => candidate.class === taskClass) || null;
  if (quarantined) return { tier: 'T3', action: 'refusal', source: 'quarantined', playbook: quarantined.id, floor };
  if (live) {
    const decay = entryDecay(live, epoch);
    if (decay.recertify) return { tier: live.provenance, action: 'recertify', source: 'playbook', playbook: live.id, floor, decay };
    if (live.provenance === 'T1') return { tier: 'T1', action: 'exploit', source: 'playbook', playbook: live.id, floor, decay };
    const probe = NUMBER_TIER[TIER_NUMBER[live.provenance] - 1];
    if (floor && TIER_NUMBER[probe] < TIER_NUMBER[floor]) return { tier: floor, action: 'refusal', source: 'sticky-floor', playbook: live.id, floor, decay };
    return { tier: probe, action: 'probe', source: 'playbook', playbook: live.id, floor, decay };
  }
  if (prior) {
    const tier = floor && TIER_NUMBER[prior.defaultTier] < TIER_NUMBER[floor] ? floor : prior.defaultTier;
    return { tier, action: 'route', source: 'prior', floor };
  }
  return { tier: null, action: 'score-rubric', source: 'rubric', floor };
}

function nextAction(route, rows, prior) {
  if (route.action === 'recertify') return 'recertify: run at provenance with the entry quoted; reset hits and rewrite epoch on pass';
  if (route.decay && route.decay.decayDue) return `decay: rewrite provenance to ${route.tier}, reset hits to 0`;
  if (route.source === 'quarantined') return 'revise or delete the quarantined entry';
  if (!prior && rows >= 3) return 'add a PRIORS row (class has >=3 ledger rows)';
  if (route.action === 'probe') return `probe at ${route.tier} with the entry quoted (${route.decay.hits}/${route.decay.requiredHits} hits)`;
  return 'none';
}

function status({ ledger, playbook, epoch }) {
  if (epoch !== undefined && (typeof epoch !== 'string' || !epoch || /\s/.test(epoch))) {
    throw Object.assign(new Error('epoch must be a non-empty token'), { exitCode: 2 });
  }
  const classes = new Set([
    ...ledger.priors.map((prior) => prior.class),
    ...playbook.entries.map((entry) => entry.class),
    ...ledger.legacy.map((row) => row.class),
    ...ledger.observations.map((row) => row.class)
  ]);
  const rows = [...classes].sort(lexical).map((taskClass) => {
    const route = defaultRoute(taskClass, ledger, playbook, epoch);
    const history = classRows(ledger, taskClass);
    const prior = ledger.priors.find((candidate) => candidate.class === taskClass) || null;
    return {
      class: taskClass,
      route,
      prior: prior ? prior.defaultTier : null,
      ledgerRows: history.length,
      escalations: history.reduce((sum, row) => sum + row.escalations, 0),
      executed: ['T1', 'T2', 'T3'].reduce((counts, tier) => ({ ...counts, [tier]: history.filter((row) => row.executed === tier).length }), {}),
      next: nextAction(route, history.length, prior)
    };
  });
  return {
    schemaVersion: 1,
    epoch: epoch || null,
    rules: {
      decayConfidence: 1 - DECAY_ALPHA,
      passRateFloor: PASS_RATE_FLOOR,
      requiredHits: REQUIRED_HITS,
      defaultEntryRisk: DEFAULT_ENTRY_RISK
    },
    classes: rows,
    summary: {
      classes: rows.length,
      probing: rows.filter((row) => row.route.action === 'probe').length,
      decayDue: rows.filter((row) => row.route.decay && row.route.decay.decayDue).length,
      recertify: rows.filter((row) => row.route.action === 'recertify').length,
      quarantined: rows.filter((row) => row.route.source === 'quarantined').length,
      atT1: rows.filter((row) => row.route.tier === 'T1').length
    }
  };
}

module.exports = { status, defaultRoute };
