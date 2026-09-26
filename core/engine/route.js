'use strict';

const { CLASS_RE, TIERS, StateError } = require('./markdown');
const { canonicalHash, serialized } = require('./canonical');
const { ValidationError, validateConfig, validateMeasurements, tierStatistics, ensureFinite } = require('./statistics');

const TIER_NUMBER = { T1: 1, T2: 2, T3: 3 };
const NUMBER_TIER = { 1: 'T1', 2: 'T2', 3: 'T3' };

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new ValidationError('request must be an object');
  if (!CLASS_RE.test(request.class || '')) throw new ValidationError('request.class must be an exact 2-4 token class signature');
  if (!Number.isSafeInteger(request.risk) || request.risk < 0 || request.risk > 3) throw new ValidationError('request.risk must be a safe integer from 0 to 3');
  if (typeof request.critical !== 'boolean' || typeof request.recurring !== 'boolean') throw new ValidationError('request.critical and recurring must be booleans');
  if (!Number.isSafeInteger(request.horizon) || request.horizon < 1) throw new ValidationError('request.horizon must be a positive safe integer');
  if (!request.epoch || typeof request.epoch !== 'string' || /\s/.test(request.epoch)) throw new ValidationError('request.epoch must be a non-empty token');
  if (request.playbook !== undefined && !/^PB-[1-9][0-9]*$/.test(request.playbook)) throw new ValidationError('request.playbook must be a PB-n id');
  if (!request.rubric || typeof request.rubric !== 'object') throw new ValidationError('request.rubric is required');
  const allowed = new Set(['class', 'risk', 'critical', 'recurring', 'horizon', 'epoch', 'playbook', 'rubric']);
  for (const key of Object.keys(request)) if (!allowed.has(key)) throw new ValidationError(`unknown request property: ${key}`);
  const axes = ['ambiguity', 'reasoning', 'blastRadius', 'riskSurface'];
  for (const key of Object.keys(request.rubric)) if (!axes.includes(key)) throw new ValidationError(`unknown rubric property: ${key}`);
  for (const axis of axes) {
    const maximum = axis === 'reasoning' || axis === 'riskSurface' ? 3 : 2;
    if (!Number.isInteger(request.rubric[axis]) || request.rubric[axis] < 0 || request.rubric[axis] > maximum) {
      throw new ValidationError(`rubric.${axis} must be an integer from 0 to ${maximum}`);
    }
  }
  if (request.risk !== request.rubric.riskSurface) throw new ValidationError('request.risk must equal rubric.riskSurface');
  return { ...request, rubric: { ...request.rubric } };
}

function rubricTier(rubric) {
  const values = Object.values(rubric);
  const score = values.reduce((sum, value) => sum + value, 0);
  if (values.includes(3) || score >= 7) return { tier: 'T3', score };
  if (score >= 4) return { tier: 'T2', score };
  return { tier: 'T1', score };
}

function resolveClassState(request, playbook) {
  const entries = playbook.entries.filter((entry) => entry.class === request.class);
  const live = entries.filter((entry) => entry.status === 'live');
  const quarantined = entries.filter((entry) => entry.status === 'quarantined');
  if (live.length > 1) throw new StateError(`ambiguous live playbooks for class: ${request.class}`);
  if (live.length && quarantined.length) throw new StateError(`class has live and quarantined playbooks: ${request.class}`);
  const floors = new Set(entries.map((entry) => entry.floor).filter(Boolean));
  if (floors.size > 1) throw new StateError(`contradictory floors for class: ${request.class}`);
  const state = { entries, live: live[0] || null, quarantined: quarantined.length > 0, floor: [...floors][0] || null, selected: null };
  if (state.quarantined || !request.playbook) return state;
  const selected = playbook.entries.find((candidate) => candidate.id === request.playbook);
  if (!selected) throw new StateError(`referenced playbook does not exist: ${request.playbook}`);
  if (selected.class !== request.class) throw new StateError(`referenced playbook class mismatch: ${selected.id}`);
  state.selected = selected;
  return state;
}

function higherTier(a, b) { return TIER_NUMBER[a] >= TIER_NUMBER[b] ? a : b; }

function baselineWithoutPlaybook(request, ledger) {
  const prior = ledger.priors.find((candidate) => candidate.class === request.class);
  if (prior) return { tier: prior.defaultTier, source: 'prior' };
  const rubric = rubricTier(request.rubric);
  return { tier: rubric.tier, source: 'rubric', score: rubric.score };
}

function legacyRoute(request, ledger, playbook, resolved = resolveClassState(request, playbook)) {
  if (request.critical || request.risk === 3) return { tier: 'T3', action: 'safety', reason: 'critical-or-risk3' };
  if (resolved.quarantined) return { tier: 'T3', action: 'refusal', reason: 'quarantined-class' };
  const entry = resolved.selected;
  if (entry) {
    const provenance = TIER_NUMBER[entry.provenance];
    if (provenance === 1) return { tier: higherTier('T1', resolved.floor || 'T1'), action: 'exploit', reason: 'playbook-at-floor', playbook: entry.id };
    const candidate = NUMBER_TIER[provenance - 1];
    if (resolved.floor && TIER_NUMBER[candidate] < TIER_NUMBER[resolved.floor]) {
      return { tier: resolved.floor, action: 'refusal', reason: 'sticky-floor', playbook: entry.id };
    }
    return { tier: candidate, action: 'probe', reason: 'live-playbook', playbook: entry.id };
  }
  const baseline = baselineWithoutPlaybook(request, ledger);
  if (resolved.floor && TIER_NUMBER[baseline.tier] < TIER_NUMBER[resolved.floor]) {
    return { tier: resolved.floor, action: 'refusal', reason: 'sticky-floor' };
  }
  return { ...baseline, action: 'route', reason: baseline.source };
}

function exactCell(ledger, request) {
  return ledger.observations.filter((observation) => observation.class === request.class
    && observation.risk === request.risk
    && observation.epoch === request.epoch)
    .sort((a, b) => a.obsId < b.obsId ? -1 : a.obsId > b.obsId ? 1 : 0);
}

function safeIncumbent(incumbent, cell, request, config) {
  const statistics = {};
  const safeTiers = [];

  for (let number = TIER_NUMBER[incumbent]; number <= 3; number += 1) {
    const tier = NUMBER_TIER[number];
    const stats = tierStatistics(cell, tier, config);
    if (stats) statistics[tier] = stats;
    if (stats && stats.n >= config.minSamples
        && stats.failureUpper <= config.failureThresholds[request.risk]) {
      safeTiers.push(tier);
    }
  }

  if (safeTiers.length === 0) {
    return { tier: 'T3', safe: false, reason: 'no-observed-safe-tier', statistics };
  }

  let selected = safeTiers[0];
  let reason = selected === incumbent ? 'incumbent-safe' : 'failure-upper-bound';

  for (const candidateTier of safeTiers.slice(1)) {
    const current = statistics[selected];
    const candidate = statistics[candidateTier];
    const dominates = ensureFinite(candidate.upper + config.margin, 'promotion comparison') < current.lower;
    const tie = candidate.mean === current.mean;

    if (dominates || tie) {
      selected = candidateTier;
      reason = dominates ? 'higher-tier-dominates' : 'higher-tier-tie';
    }
  }

  return { tier: selected, safe: true, reason, statistics };
}

function optimizedRoute(request, ledger, playbook, config, legacy, resolved) {
  if (request.critical || request.risk === 3) return { ...legacy, action: 'safety' };
  if (resolved.quarantined) return { tier: 'T3', action: 'refusal', reason: 'quarantined-class' };
  const entry = resolved.selected;
  const cell = exactCell(ledger, request);

  if (!entry || entry.status !== 'live') {
    const incumbentStats = tierStatistics(cell, legacy.tier, config);
    const promotion = safeIncumbent(legacy.tier, cell, request, config);
    if (promotion.safe === false || promotion.tier !== legacy.tier) return { tier: promotion.tier, action: 'promotion', reason: promotion.reason, statistics: promotion.statistics };
    return { ...legacy, statistics: incumbentStats ? { incumbent: incumbentStats } : {} };
  }

  const provenanceNumber = TIER_NUMBER[entry.provenance];
  const incumbent = entry.provenance;
  const promotion = safeIncumbent(incumbent, cell, request, config);
  if (promotion.safe === false || promotion.tier !== incumbent) {
    return { tier: promotion.tier, action: 'promotion', reason: promotion.reason, playbook: entry.id, statistics: promotion.statistics };
  }
  if (provenanceNumber === 1) return { tier: 'T1', action: 'exploit', reason: 'playbook-at-floor', playbook: entry.id, statistics: promotion.statistics };
  const lower = NUMBER_TIER[provenanceNumber - 1];
  if (resolved.floor && TIER_NUMBER[lower] < TIER_NUMBER[resolved.floor]) {
    return { tier: incumbent, action: 'refusal', reason: 'sticky-floor', playbook: entry.id };
  }

  const incumbentStats = tierStatistics(cell, incumbent, config);
  const lowerStats = tierStatistics(cell, lower, config);
  const statistics = { incumbent: incumbentStats, lower: lowerStats };
  if (incumbentStats && lowerStats
      && incumbentStats.n >= config.minSamples && lowerStats.n >= config.minSamples
      && ensureFinite(lowerStats.upper + config.margin, 'exploit comparison') < incumbentStats.lower
      && lowerStats.failureUpper <= config.failureThresholds[request.risk]) {
    return { tier: lower, action: 'exploit', reason: 'established-lower-tier', playbook: entry.id, statistics };
  }

  // Equal expected fully-loaded cost is deliberately not exploration fuel:
  // deterministic ties retain the more capable tier.
  if (incumbentStats && lowerStats && lowerStats.mean >= incumbentStats.mean) {
    return { tier: incumbent, action: 'refusal', reason: 'tie-or-higher-lower-tier-cost', playbook: entry.id, voi: null, statistics };
  }

  let voi = null;
  if (incumbentStats && lowerStats) {
    voi = ensureFinite((request.horizon - 1) * Math.max(0, incumbentStats.mean - lowerStats.lower)
      - (Math.max(0, lowerStats.upper - incumbentStats.mean) + config.probeOverhead), 'VOI');
  }
  if (request.recurring && request.horizon >= 2 && request.risk <= config.maxProbeRisk
      && voi !== null && voi > config.minimumVoi
      && lowerStats.failureUpper <= config.failureThresholds[request.risk]) {
    return { tier: lower, action: 'probe', reason: 'positive-voi', playbook: entry.id, voi, statistics };
  }
  return { tier: incumbent, action: 'refusal', reason: 'insufficient-safe-evidence', playbook: entry.id, voi, statistics };
}

function route({ request, ledger, playbook, config, policy = 'shadow' }) {
  const checkedRequest = validateRequest(request);
  if (!['legacy', 'shadow', 'optimize'].includes(policy)) throw new ValidationError('policy must be legacy, shadow, or optimize');
  const resolved = resolveClassState(checkedRequest, playbook);
  const legacy = legacyRoute(checkedRequest, ledger, playbook, resolved);
  const warnings = [];
  let recommended = legacy;
  let effective = legacy;
  let checkedConfig = config;
  if (policy !== 'legacy') {
    checkedConfig = validateConfig(config);
    if (!checkedConfig.enabled || !checkedConfig.calibrated) {
      if (policy === 'optimize') throw new ValidationError('optimize requires enabled calibrated config');
      warnings.push('economic configuration disabled or uncalibrated; shadow recommendation fell back to legacy');
    } else {
      if (checkedRequest.epoch !== checkedConfig.bindingEpoch) throw new ValidationError('request epoch does not match calibrated bindingEpoch');
      validateMeasurements(ledger.observations, checkedConfig);
      recommended = optimizedRoute(checkedRequest, ledger, playbook, checkedConfig, legacy, resolved);
      if (policy === 'optimize') effective = recommended;
    }
  }
  const state = {
    request: checkedRequest,
    priors: ledger.priors,
    observations: [...ledger.observations].sort((a, b) => a.obsId < b.obsId ? -1 : a.obsId > b.obsId ? 1 : 0),
    playbook: [...playbook.entries].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    config: policy === 'legacy' ? null : checkedConfig
  };
  return serialized({
    schemaVersion: 1,
    policy,
    legacy,
    recommended,
    effective,
    warnings,
    assumptions: {
      classMatch: 'exact', risk: checkedRequest.risk, epoch: checkedRequest.epoch,
      initialTier: effective.tier, horizon: checkedRequest.horizon
    },
    stateHash: canonicalHash(state)
  });
}

module.exports = { TIER_NUMBER, validateRequest, rubricTier, legacyRoute, route };
