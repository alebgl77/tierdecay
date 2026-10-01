'use strict';

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.exitCode = 2;
  }
}

const REQUIRED_NUMBERS = [
  'costCap', 'incidentCap', 'failurePenalty', 'escalationPenalty', 'riskWeight',
  'margin', 'probeOverhead', 'minimumVoi'
];
const CONFIG_KEYS = new Set([
  'enabled', 'calibrated', 'bindingEpoch', 'costUnit', 'confidenceDelta', ...REQUIRED_NUMBERS,
  'riskExposure', 'minSamples', 'failureThresholds', 'maxProbeRisk',
  'maximumFailures', 'maximumEscalations'
]);

function finite(value, label, allowZero = true) {
  if (!Number.isFinite(value) || value < 0 || (!allowZero && value === 0)) {
    throw new ValidationError(`${label} must be ${allowZero ? 'non-negative' : 'positive'} and finite`);
  }
}

function validateConfig(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new ValidationError('config must be an object');
  for (const key of Object.keys(config)) if (!CONFIG_KEYS.has(key)) throw new ValidationError(`unknown config property: ${key}`);
  if (typeof config.enabled !== 'boolean' || typeof config.calibrated !== 'boolean') {
    throw new ValidationError('config enabled and calibrated must be booleans');
  }
  if (config.enabled && !config.calibrated) throw new ValidationError('enabled config must be calibrated');
  if (!config.enabled && config.calibrated) throw new ValidationError('disabled config cannot be calibrated');
  if (!config.enabled) return { ...config, enabled: false, calibrated: false };
  if (typeof config.bindingEpoch !== 'string' || !config.bindingEpoch || /\s/.test(config.bindingEpoch)) {
    throw new ValidationError('bindingEpoch must be a non-empty token');
  }
  if (typeof config.costUnit !== 'string' || !config.costUnit.trim()) throw new ValidationError('costUnit must be a non-empty string');
  for (const key of REQUIRED_NUMBERS) finite(config[key], key, !['costCap', 'incidentCap'].includes(key));
  finite(config.confidenceDelta, 'confidenceDelta', false);
  if (config.confidenceDelta >= 1) throw new ValidationError('confidenceDelta must be less than 1');
  for (const key of ['minSamples', 'maximumFailures', 'maximumEscalations', 'maxProbeRisk']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) throw new ValidationError(`${key} must be a non-negative safe integer`);
  }
  if (config.minSamples < 1) throw new ValidationError('minSamples must be at least 1');
  if (config.maximumEscalations < 1) throw new ValidationError('maximumEscalations must be at least 1');
  if (config.maximumFailures < 1) throw new ValidationError('maximumFailures must be at least 1');
  if (config.maxProbeRisk > 2) throw new ValidationError('maxProbeRisk cannot exceed 2');
  const exposure = config.riskExposure;
  const thresholds = config.failureThresholds;
  if (!Array.isArray(exposure) || exposure.length !== 4 || !Array.isArray(thresholds) || thresholds.length !== 4) {
    throw new ValidationError('riskExposure and failureThresholds must contain four values');
  }
  exposure.forEach((value, index) => finite(value, `riskExposure[${index}]`));
  thresholds.forEach((value, index) => {
    finite(value, `failureThresholds[${index}]`);
    if (value > 1) throw new ValidationError(`failureThresholds[${index}] must not exceed 1`);
  });
  for (let i = 1; i < 4; i += 1) {
    if (exposure[i] < exposure[i - 1]) throw new ValidationError('riskExposure must be non-decreasing');
    if (thresholds[i] > thresholds[i - 1]) throw new ValidationError('failureThresholds must be non-increasing');
  }
  return { ...config };
}

function validateMeasurements(observations, config) {
  const ids = new Set();
  for (const row of observations) {
    if (!row || typeof row !== 'object') throw new ValidationError('observation must be an object');
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(row.obsId || '')) throw new ValidationError('obs_id is invalid or empty');
    if (ids.has(row.obsId)) throw new ValidationError(`duplicate obs_id: ${row.obsId}`);
    ids.add(row.obsId);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+){1,3}$/.test(row.class || '')) throw new ValidationError(`invalid class signature: ${row.class}`);
    if (!['T1', 'T2', 'T3'].includes(row.predicted) || !['T1', 'T2', 'T3'].includes(row.executed)) throw new ValidationError(`unknown observation tier for ${row.obsId}`);
    if (typeof row.date !== 'string' || !row.date || typeof row.outcome !== 'string' || !row.outcome) throw new ValidationError(`invalid date or outcome for ${row.obsId}`);
    if (typeof row.playbook !== 'string') throw new ValidationError(`invalid playbook for ${row.obsId}`);
    if (typeof row.epoch !== 'string' || !row.epoch || /\s/.test(row.epoch)) throw new ValidationError(`invalid epoch for ${row.obsId}`);
    if (!Number.isSafeInteger(row.risk) || row.risk < 0 || row.risk > 3) throw new ValidationError(`invalid risk for ${row.obsId}`);
    for (const [key, label] of [['failures', 'failures'], ['escalations', 'esc']]) {
      if (!Number.isSafeInteger(row[key]) || row[key] < 0) throw new ValidationError(`${label} must be a non-negative safe integer for ${row.obsId}`);
    }
    for (const [key, label] of [['resourceCost', 'resource_cost'], ['incidentLoss', 'incident_loss']]) {
      if (!Number.isFinite(row[key]) || row[key] < 0) throw new ValidationError(`${label} must be finite and non-negative for ${row.obsId}`);
    }
    if (row.outcome === 'pass' && row.failures !== 0) throw new ValidationError(`pass observation must have zero failures for ${row.obsId}`);
    if (row.outcome === 'fail' && row.failures === 0) throw new ValidationError(`fail observation must have failures for ${row.obsId}`);
    if (row.epoch !== config.bindingEpoch) continue;
    if (row.resourceCost > config.costCap) throw new ValidationError(`resource_cost exceeds costCap for ${row.obsId}`);
    if (row.incidentLoss > config.incidentCap) throw new ValidationError(`incident_loss exceeds incidentCap for ${row.obsId}`);
    if (row.escalations > config.maximumEscalations) throw new ValidationError(`esc exceeds maximumEscalations for ${row.obsId}`);
    if (row.failures > config.maximumFailures) throw new ValidationError(`failures exceeds maximumFailures for ${row.obsId}`);
  }
}

function mean(values) {
  let sum = 0;
  for (const value of values) {
    sum = ensureFinite(sum + value, 'statistical sum');
  }
  return ensureFinite(sum / values.length, 'statistical mean');
}

function ensureFinite(value, label) {
  if (!Number.isFinite(value)) throw new ValidationError(`${label} must remain finite`);
  return Object.is(value, -0) ? 0 : value;
}

function interval(values, confidenceDelta) {
  if (!values.length) return null;
  const mu = mean(values);
  // Family-wise budget: four metrics across at most three executable tiers.
  const perIntervalDelta = confidenceDelta / 12;
  const width = ensureFinite(Math.sqrt(Math.log(2 / perIntervalDelta) / (2 * values.length)), 'Hoeffding width');
  return { mean: mu, lower: Math.max(0, mu - width), upper: Math.min(1, mu + width), width };
}

function metricLoss(metrics, risk, config) {
  return ensureFinite(metrics.resourceCost
    + config.failurePenalty * (metrics.failures > 0 ? 1 : 0)
    + config.escalationPenalty * metrics.escalations
    + config.riskWeight * config.riskExposure[risk] * (metrics.failures > 0 ? 1 : 0)
    + metrics.incidentLoss, 'fully loaded loss');
}

function tierStatistics(observations, tier, config) {
  const rows = observations.filter((observation) => observation.executed === tier);
  if (!rows.length) return null;
  const x = interval(rows.map((row) => row.resourceCost / config.costCap), config.confidenceDelta);
  const f = interval(rows.map((row) => row.failures > 0 ? 1 : 0), config.confidenceDelta);
  const e = interval(rows.map((row) => row.escalations / config.maximumEscalations), config.confidenceDelta);
  const d = interval(rows.map((row) => row.incidentLoss / config.incidentCap), config.confidenceDelta);
  const risk = rows[0].risk;
  const combine = (bound) => ensureFinite(config.costCap * x[bound]
    + config.failurePenalty * f[bound]
    + config.escalationPenalty * config.maximumEscalations * e[bound]
    + config.riskWeight * config.riskExposure[risk] * f[bound]
    + config.incidentCap * d[bound], `fully loaded ${bound} bound`);
  return {
    n: rows.length,
    mean: combine('mean'), lower: combine('lower'), upper: combine('upper'),
    failureMean: f.mean, failureLower: f.lower, failureUpper: f.upper,
    components: { resource: x, failure: f, escalation: e, incident: d }
  };
}

module.exports = { ValidationError, validateConfig, validateMeasurements, tierStatistics, metricLoss, ensureFinite };
