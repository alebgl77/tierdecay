'use strict';

const { CLASS_RE, TIERS, StateError } = require('./markdown');
const { canonicalHash, serialized } = require('./canonical');
const { ValidationError, validateConfig, validateMeasurements, tierStatistics } = require('./statistics');

const TIER_NUMBER = { T1: 1, T2: 2, T3: 3 };
const NUMBER_TIER = { 1: 'T1', 2: 'T2', 3: 'T3' };

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new ValidationError('request must be an object');
  if (!CLASS_RE.test(request.class || '')) throw new ValidationError('request.class must be an exact 2-4 token class signature');
  if (!Number.isInteger(request.risk) || request.risk < 0 || request.risk > 3) throw new ValidationError('request.risk must be an integer from 0 to 3');
  if (typeof request.critical !== 'boolean' || typeof request.recurring !== 'boolean') throw new ValidationError('request.critical and recurring must be booleans');
  if (!Number.isInteger(request.horizon) || request.horizon < 1) throw new ValidationError('request.horizon must be a positive integer');
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
  return { ...request, rubric: { ...request.rubric } };
}

function rubricTier(rubric) {
  const values = Object.values(rubric);
  const score = values.reduce((sum, value) => sum + value, 0);
  if (values.includes(3) || score >= 7) return { tier: 'T3', score };
  if (score >= 4) return { tier: 'T2', score };
  return { tier: 'T1', score };
}

function resolveEntry(request, playbook) {
  if (!request.playbook) return null;
  const entry = playbook.entries.find((candidate) => candidate.id === request.playbook);
  if (!entry) throw new StateError(`referenced playbook does not exist: ${request.playbook}`);
  if (entry.class !== request.class) throw new StateError(`referenced playbook class mismatch: ${entry.id}`);
  return entry;
}

function baselineWithoutPlaybook(request, ledger) {
  const prior = ledger.priors.find((candidate) => candidate.class === request.class);
  if (prior) return { tier: prior.defaultTier, source: 'prior' };
  const rubric = rubricTier(request.rubric);
  return { tier: rubric.tier, source: 'rubric', score: rubric.score };
}

function legacyRoute(request, ledger, playbook) {
  if (request.critical || request.risk === 3) return { tier: 'T3', action: 'safety', reason: 'critical-or-risk3' };
  const entry = resolveEntry(request, playbook);
  if (entry) {
    if (entry.status === 'quarantined') {
      return { tier: 'T3', action: 'refusal', reason: 'quarantined-playbook', playbook: entry.id };
    }
    const provenance = TIER_NUMBER[entry.provenance];
    if (provenance === 1) return { tier: 'T1', action: 'exploit', reason: 'playbook-at-floor', playbook: entry.id };
    const candidate = NUMBER_TIER[provenance - 1];
    if (entry.floor && TIER_NUMBER[candidate] < TIER_NUMBER[entry.floor]) {
      return { tier: entry.floor, action: 'refusal', reason: 'sticky-floor', playbook: entry.id };
    }
    return { tier: candidate, action: 'probe', reason: 'live-playbook', playbook: entry.id };
  }
  const baseline = baselineWithoutPlaybook(request, ledger);
  return { ...baseline, action: 'route', reason: baseline.source };
}

function exactCell(ledger, request, initialTier) {
  return ledger.observations.filter((observation) => observation.class === request.class
    && observation.risk === request.risk
    && observation.epoch === request.epoch
    && observation.predicted === initialTier)
    .sort((a, b) => a.obsId < b.obsId ? -1 : a.obsId > b.obsId ? 1 : 0);
}

function safetyPromotion(tier, stats, request, config) {
  if (tier === 'T3' || !stats || stats.n < config.minSamples) return null;
  if (stats.failureUpper <= config.failureThresholds[request.risk]) return null;
  return NUMBER_TIER[TIER_NUMBER[tier] + 1];
}

function evidencePromotion(incumbent, cell, request, config) {
  let promoted = incumbent;
  let promotedStats = tierStatistics(cell, promoted, config);
  const all = {};
  if (promotedStats) all[promoted] = promotedStats;
  for (let number = TIER_NUMBER[incumbent] + 1; number <= 3; number += 1) {
    const tier = NUMBER_TIER[number];
    const candidate = tierStatistics(cell, tier, config);
    if (candidate) all[tier] = candidate;
    if (candidate && promotedStats
        && candidate.n >= config.minSamples && promotedStats.n >= config.minSamples
        && candidate.upper + config.margin < promotedStats.lower) {
      promoted = tier;
      promotedStats = candidate;
    }
  }
  const failurePromotion = safetyPromotion(promoted, promotedStats, request, config);
  if (failurePromotion) return { tier: failurePromotion, reason: 'failure-upper-bound', statistics: all };
  if (promoted !== incumbent) return { tier: promoted, reason: 'higher-tier-dominates', statistics: all };
  return null;
}

function optimizedRoute(request, ledger, playbook, config, legacy) {
  if (request.critical || request.risk === 3) return { ...legacy, action: 'safety' };
  const entry = resolveEntry(request, playbook);
  const initialTier = legacy.tier;
  const cell = exactCell(ledger, request, initialTier);

  if (!entry || entry.status !== 'live') {
    const incumbentStats = tierStatistics(cell, legacy.tier, config);
    const promotion = evidencePromotion(legacy.tier, cell, request, config);
    if (promotion) return { tier: promotion.tier, action: 'promotion', reason: promotion.reason, statistics: promotion.statistics };
    return { ...legacy, statistics: incumbentStats ? { incumbent: incumbentStats } : {} };
  }

  const provenanceNumber = TIER_NUMBER[entry.provenance];
  if (provenanceNumber === 1) return { tier: 'T1', action: 'exploit', reason: 'playbook-at-floor', playbook: entry.id };
  const incumbent = entry.provenance;
  const lower = NUMBER_TIER[provenanceNumber - 1];
  if (entry.floor && TIER_NUMBER[lower] < TIER_NUMBER[entry.floor]) {
    return { tier: incumbent, action: 'refusal', reason: 'sticky-floor', playbook: entry.id };
  }

  const incumbentStats = tierStatistics(cell, incumbent, config);
  const lowerStats = tierStatistics(cell, lower, config);
  const promotion = evidencePromotion(incumbent, cell, request, config);
  if (promotion) {
    return { tier: promotion.tier, action: 'promotion', reason: promotion.reason, playbook: entry.id, statistics: { ...promotion.statistics, lower: lowerStats } };
  }

  const statistics = { incumbent: incumbentStats, lower: lowerStats };
  if (incumbentStats && lowerStats
      && incumbentStats.n >= config.minSamples && lowerStats.n >= config.minSamples
      && lowerStats.upper + config.margin < incumbentStats.lower
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
    voi = (request.horizon - 1) * Math.max(0, incumbentStats.mean - lowerStats.lower)
      - (Math.max(0, lowerStats.upper - incumbentStats.mean) + config.probeOverhead);
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
  const legacy = legacyRoute(checkedRequest, ledger, playbook);
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
      recommended = optimizedRoute(checkedRequest, ledger, playbook, checkedConfig, legacy);
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
      initialTier: legacy.tier, horizon: checkedRequest.horizon
    },
    stateHash: canonicalHash(state)
  });
}

module.exports = { TIER_NUMBER, validateRequest, rubricTier, legacyRoute, route };
