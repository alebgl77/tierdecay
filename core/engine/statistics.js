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
  'enabled', 'calibrated', 'bindingEpoch', 'costUnit', 'delta', ...REQUIRED_NUMBERS,
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
  finite(config.delta, 'delta', false);
  if (config.delta >= 1) throw new ValidationError('delta must be less than 1');
  for (const key of ['minSamples', 'maximumFailures', 'maximumEscalations', 'maxProbeRisk']) {
    if (!Number.isInteger(config[key]) || config[key] < 0) throw new ValidationError(`${key} must be a non-negative integer`);
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
  for (const row of observations) {
    if (row.resourceCost > config.costCap) throw new ValidationError(`resource_cost exceeds costCap for ${row.obsId}`);
    if (row.incidentLoss > config.incidentCap) throw new ValidationError(`incident_loss exceeds incidentCap for ${row.obsId}`);
    if (row.escalations > config.maximumEscalations) throw new ValidationError(`esc exceeds maximumEscalations for ${row.obsId}`);
    if (row.failures > config.maximumFailures) throw new ValidationError(`failures exceeds maximumFailures for ${row.obsId}`);
  }
}

function mean(values) {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function interval(values, delta) {
  if (!values.length) return null;
  const mu = mean(values);
  const width = Math.sqrt(Math.log(2 / delta) / (2 * values.length));
  return { mean: mu, lower: Math.max(0, mu - width), upper: Math.min(1, mu + width), width };
}

function metricLoss(metrics, risk, config) {
  return metrics.resourceCost
    + config.failurePenalty * (metrics.failures > 0 ? 1 : 0)
    + config.escalationPenalty * metrics.escalations
    + config.riskWeight * config.riskExposure[risk] * (metrics.failures > 0 ? 1 : 0)
    + metrics.incidentLoss;
}

function tierStatistics(observations, tier, config) {
  const rows = observations.filter((observation) => observation.executed === tier);
  if (!rows.length) return null;
  validateMeasurements(rows, config);
  const x = interval(rows.map((row) => row.resourceCost / config.costCap), config.delta);
  const f = interval(rows.map((row) => row.failures > 0 ? 1 : 0), config.delta);
  const e = interval(rows.map((row) => row.escalations / config.maximumEscalations), config.delta);
  const d = interval(rows.map((row) => row.incidentLoss / config.incidentCap), config.delta);
  const risk = rows[0].risk;
  const combine = (bound) => config.costCap * x[bound]
    + config.failurePenalty * f[bound]
    + config.escalationPenalty * config.maximumEscalations * e[bound]
    + config.riskWeight * config.riskExposure[risk] * f[bound]
    + config.incidentCap * d[bound];
  return {
    n: rows.length,
    mean: combine('mean'), lower: combine('lower'), upper: combine('upper'),
    failureMean: f.mean, failureLower: f.lower, failureUpper: f.upper,
    components: { resource: x, failure: f, escalation: e, incident: d }
  };
}

module.exports = { ValidationError, validateConfig, validateMeasurements, tierStatistics, metricLoss };
