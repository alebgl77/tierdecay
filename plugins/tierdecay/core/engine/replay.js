'use strict';

const { canonicalHash, serialized } = require('./canonical');
const { ValidationError, validateConfig, metricLoss, ensureFinite } = require('./statistics');
const { route, validateRequest } = require('./route');
const { isIsoDate } = require('./markdown');
const { requiredHits, DEFAULT_ENTRY_RISK } = require('./decay');

const DEFAULT_REPLAY_DATE = '1970-01-01';

class IncompleteReplayError extends Error {
  constructor(message) {
    super(message);
    this.name = 'IncompleteReplayError';
    this.exitCode = 4;
  }
}

function parseJsonLines(text) {
  const records = [];
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].trim()) continue;
    try { records.push(JSON.parse(lines[index])); }
    catch (error) { throw new ValidationError(`invalid replay JSON on line ${index + 1}: ${error.message}`); }
  }
  return records;
}

function validateOutcome(value, label, config) {
  if (!value || typeof value !== 'object') throw new IncompleteReplayError(`${label} outcome is missing`);
  const allowed = new Set(['resourceCost', 'failures', 'escalations', 'incidentLoss']);
  for (const key of Object.keys(value)) if (!allowed.has(key)) throw new ValidationError(`${label} has unknown property: ${key}`);
  for (const key of ['resourceCost', 'failures', 'escalations', 'incidentLoss']) {
    if (!Number.isFinite(value[key]) || value[key] < 0) throw new ValidationError(`${label}.${key} must be finite and non-negative`);
  }
  if (!Number.isSafeInteger(value.failures) || !Number.isSafeInteger(value.escalations)) throw new ValidationError(`${label} failures/escalations must be safe integers`);
  if (value.resourceCost > config.costCap || value.incidentLoss > config.incidentCap
      || value.failures > config.maximumFailures || value.escalations > config.maximumEscalations) {
    throw new ValidationError(`${label} outcome exceeds configured caps`);
  }
  return value;
}

// In-memory playbook evolution (opt-in): applies the orchestrator's DISTILL
// bookkeeping to a working copy after each scenario, exactly as SPEC §4–5 ask:
// a failure while an entry is referenced quarantines it and records the failed
// tier as its sticky floor; a pass adds a hit; enough hits for the entry's risk
// rewrite provenance to the tier that passed; a passing recertification adopts
// the current epoch. Markdown files are never written.
function evolve(entries, request, decision, chosen) {
  if (!request.playbook) return null;
  const entry = entries.find((candidate) => candidate.id === request.playbook);
  if (!entry || entry.status !== 'live') return null;
  const tier = decision.effective.tier;
  if (chosen.failures > 0) {
    entry.status = 'quarantined';
    if (!entry.floor || Number(tier[1]) > Number(entry.floor[1])) entry.floor = tier;
    if (Number(entry.floor[1]) > Number(entry.provenance[1])) entry.floor = entry.provenance;
    return 'quarantine';
  }
  if (decision.effective.action === 'recertify') {
    entry.bindingEpoch = request.epoch;
    entry.hits = 0;
    return 'recertified';
  }
  if (!['probe', 'exploit'].includes(decision.effective.action)) return null;
  entry.hits += 1;
  const needed = requiredHits(entry.risk === undefined ? DEFAULT_ENTRY_RISK : entry.risk);
  if (decision.effective.action === 'probe' && needed !== null && entry.hits >= needed && Number(tier[1]) < Number(entry.provenance[1])) {
    entry.provenance = tier;
    entry.hits = 0;
    return 'decay';
  }
  return 'hit';
}

function replay({ jsonl, ledger, playbook, config, policy = 'shadow', evolvePlaybook = false }) {
  const checkedConfig = validateConfig(config);
  if (!checkedConfig.enabled || !checkedConfig.calibrated) throw new ValidationError('replay requires enabled calibrated config');
  const scenarios = parseJsonLines(jsonl);
  const working = { priors: [...ledger.priors], legacy: [...ledger.legacy], observations: [...ledger.observations] };
  const totals = {
    fullyLoadedLoss: 0, resourceCost: 0, failures: 0, escalations: 0,
    incidents: 0, probes: 0, promotions: 0, refusals: 0, regret: 0,
    legacyFullyLoadedLoss: 0
  };
  const decisions = [];
  const seen = new Set(working.observations.map((item) => item.obsId));
  const book = evolvePlaybook ? { entries: playbook.entries.map((entry) => ({ ...entry })) } : playbook;
  const lifecycle = { hits: 0, decays: 0, quarantines: 0, recertifications: 0 };
  for (let index = 0; index < scenarios.length; index += 1) {
    const scenario = scenarios[index];
    if (!scenario || typeof scenario !== 'object' || !scenario.id) throw new ValidationError(`scenario ${index + 1} requires id`);
    const allowed = new Set(['id', 'date', 'request', 'outcomes']);
    for (const key of Object.keys(scenario)) if (!allowed.has(key)) throw new ValidationError(`scenario ${index + 1} has unknown property: ${key}`);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(scenario.id)) throw new ValidationError(`scenario ${index + 1} id is invalid`);
    const observationDate = scenario.date === undefined ? DEFAULT_REPLAY_DATE : scenario.date;
    if (typeof observationDate !== 'string' || !isIsoDate(observationDate)) {
      throw new ValidationError(`scenario ${scenario.id} date must be a valid YYYY-MM-DD date`);
    }
    if (seen.has(scenario.id)) throw new ValidationError(`duplicate replay id: ${scenario.id}`);
    seen.add(scenario.id);
    const request = validateRequest(scenario.request);
    const outcomes = {};
    for (const tier of ['T1', 'T2', 'T3']) outcomes[tier] = validateOutcome(scenario.outcomes?.[tier], `${scenario.id}.${tier}`, checkedConfig);
    const decision = route({ request, ledger: working, playbook: book, config: checkedConfig, policy });
    const chosenTier = decision.effective.tier;
    const chosen = outcomes[chosenTier];
    const legacy = outcomes[decision.legacy.tier];
    const chosenLoss = metricLoss(chosen, request.risk, checkedConfig);
    const legacyLoss = metricLoss(legacy, request.risk, checkedConfig);
    const bestLoss = Math.min(...Object.values(outcomes).map((outcome) => metricLoss(outcome, request.risk, checkedConfig)));
    totals.fullyLoadedLoss = ensureFinite(totals.fullyLoadedLoss + chosenLoss, 'cumulative fully loaded loss');
    totals.legacyFullyLoadedLoss = ensureFinite(totals.legacyFullyLoadedLoss + legacyLoss, 'cumulative legacy loss');
    totals.resourceCost = ensureFinite(totals.resourceCost + chosen.resourceCost, 'cumulative resource cost');
    totals.failures = ensureFinite(totals.failures + chosen.failures, 'cumulative failures');
    totals.escalations = ensureFinite(totals.escalations + chosen.escalations, 'cumulative escalations');
    totals.incidents = ensureFinite(totals.incidents + (chosen.incidentLoss > 0 ? 1 : 0), 'cumulative incidents');
    totals.regret = ensureFinite(totals.regret + chosenLoss - bestLoss, 'cumulative regret');
    if (decision.effective.action === 'probe') totals.probes += 1;
    if (decision.effective.action === 'promotion' || decision.effective.action === 'safety') totals.promotions += 1;
    if (decision.effective.action === 'refusal') totals.refusals += 1;
    working.observations.push({
      date: observationDate, class: request.class, predicted: chosenTier,
      executed: chosenTier, outcome: chosen.failures > 0 ? 'fail' : 'pass', escalations: chosen.escalations,
      playbook: request.playbook || '—', obsId: scenario.id, resourceCost: chosen.resourceCost,
      failures: chosen.failures, incidentLoss: chosen.incidentLoss, risk: request.risk, epoch: request.epoch
    });
    working.observations.sort((a, b) => a.obsId < b.obsId ? -1 : a.obsId > b.obsId ? 1 : 0);
    const record = { id: scenario.id, tier: chosenTier, predicted: chosenTier, executed: chosenTier, action: decision.effective.action, stateHash: decision.stateHash };
    if (evolvePlaybook) {
      const change = evolve(book.entries, request, decision, chosen);
      if (change === 'hit') lifecycle.hits += 1;
      if (change === 'decay') { lifecycle.hits += 1; lifecycle.decays += 1; }
      if (change === 'quarantine') lifecycle.quarantines += 1;
      if (change === 'recertified') lifecycle.recertifications += 1;
      if (change) record.playbookChange = change;
    }
    decisions.push(record);
  }
  const report = {
    schemaVersion: 1,
    policy,
    scenarios: scenarios.length,
    totals,
    decisions,
    finalStateHash: canonicalHash({ ledger: working, playbook: book.entries, config: checkedConfig })
  };
  if (evolvePlaybook) {
    report.lifecycle = lifecycle;
    report.finalPlaybook = book.entries.map(({ id, class: taskClass, status, provenance, hits, floor }) => ({ id, class: taskClass, status, provenance, hits, floor: floor || null }));
  }
  return serialized(report);
}

module.exports = { IncompleteReplayError, parseJsonLines, replay };
