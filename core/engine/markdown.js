'use strict';

const CLASS_RE = /^[a-z0-9]+(?:-[a-z0-9]+){1,3}$/;
const TIERS = new Set(['T1', 'T2', 'T3']);

class StateError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StateError';
    this.exitCode = 3;
  }
}

function linesOf(text) {
  if (typeof text !== 'string') throw new StateError('markdown state must be text');
  return text.replace(/\r\n?/g, '\n').split('\n');
}

function cells(line) {
  const trimmed = line.trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function isSeparator(row) {
  return row && row.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function isIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function parseTier(value, legacy = false) {
  const tier = legacy ? /^T[1-3]/.exec(value)?.[0] : value;
  if (!TIERS.has(tier)) throw new StateError(`unknown tier: ${value}`);
  return tier;
}

function uint(value, label) {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new StateError(`${label} must be a non-negative integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new StateError(`${label} exceeds the safe integer range`);
  return parsed;
}

function nonnegative(value, label) {
  if (value === '') throw new StateError(`${label} is empty`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) throw new StateError(`${label} must be finite and non-negative`);
  return Object.is(parsed, -0) ? 0 : parsed;
}

function locateTable(lines, prefix) {
  const heading = lines.findIndex((line) => line.startsWith(prefix));
  if (heading < 0) return null;
  for (let index = heading + 1; index < lines.length; index += 1) {
    if (lines[index].startsWith('## ')) break;
    const row = cells(lines[index]);
    if (row) return { index, header: row };
  }
  return null;
}

function parseLedger(text) {
  const lines = linesOf(text);
  if (lines.filter((line) => line.startsWith('## PRIORS')).length > 1) throw new StateError('multiple PRIORS sections');
  if (lines.filter((line) => line.startsWith('## LOG')).length !== 1) throw new StateError('ledger must contain exactly one LOG section');
  const priors = [];
  const observations = [];
  const legacy = [];
  const priorTable = locateTable(lines, '## PRIORS');
  if (priorTable) {
    if (priorTable.header.length !== 3 || priorTable.header[0] !== 'class' || priorTable.header[1] !== 'default tier') {
      throw new StateError('PRIORS table must use the canonical three-column header');
    }
    let index = priorTable.index + 1;
    if (!isSeparator(cells(lines[index]))) throw new StateError('PRIORS table separator is invalid');
    for (index += 1; index < lines.length; index += 1) {
      const row = cells(lines[index]);
      if (!row) break;
      if (row.length !== 3) throw new StateError('PRIORS row has the wrong column count');
      if (!CLASS_RE.test(row[0])) throw new StateError(`invalid class signature: ${row[0]}`);
      if (priors.some((prior) => prior.class === row[0])) throw new StateError(`duplicate PRIOR class: ${row[0]}`);
      priors.push({ class: row[0], defaultTier: parseTier(row[1]), evidence: row[2] });
    }
  }

  const logTable = locateTable(lines, '## LOG');
  if (!logTable) throw new StateError('missing canonical LOG table');
  const base = ['date', 'class', 'predicted', 'executed', 'outcome', 'esc', 'playbook'];
  const measured = [...base, 'obs_id', 'resource_cost', 'failures', 'incident_loss', 'risk', 'epoch'];
  const header = logTable.header;
  const isLegacyTable = header.length === base.length && header.every((value, i) => value === base[i]);
  const isMeasuredTable = header.length === measured.length && header.every((value, i) => value === measured[i]);
  if (!isLegacyTable && !isMeasuredTable) throw new StateError('LOG table must use the canonical legacy or measured header');
  let index = logTable.index + 1;
  if (!isSeparator(cells(lines[index]))) throw new StateError('LOG table separator is invalid');
  const ids = new Set();
  for (index += 1; index < lines.length; index += 1) {
    const row = cells(lines[index]);
    if (!row) break;
    if (row.length !== header.length) throw new StateError('partial measured row or wrong LOG column count');
    const common = {
      date: row[0],
      class: row[1],
      predicted: parseTier(row[2], !isMeasuredTable),
      executed: parseTier(row[3], !isMeasuredTable),
      outcome: row[4],
      escalations: uint(row[5], 'esc'),
      playbook: row[6]
    };
    if (!common.date) throw new StateError('date must not be empty');
    if (isMeasuredTable && !isIsoDate(common.date)) throw new StateError('date must be a valid YYYY-MM-DD date');
    if (!common.outcome) throw new StateError('outcome must not be empty');
    if (!CLASS_RE.test(common.class)) throw new StateError(`invalid class signature: ${common.class}`);
    if (!isMeasuredTable) {
      legacy.push(common);
      continue;
    }
    const [obsId, resourceCost, failures, incidentLoss, risk, epoch] = row.slice(7);
    if (!obsId || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(obsId)) throw new StateError('obs_id is invalid or empty');
    if (ids.has(obsId)) throw new StateError(`duplicate obs_id: ${obsId}`);
    ids.add(obsId);
    if (!epoch || /\s/.test(epoch)) throw new StateError('epoch is empty or contains whitespace');
    const numericRisk = uint(risk, 'risk');
    if (numericRisk > 3) throw new StateError('risk must be between 0 and 3');
    const numericFailures = uint(failures, 'failures');
    if (common.outcome === 'pass' && numericFailures !== 0) throw new StateError('pass observation must have zero failures');
    if (common.outcome === 'fail' && numericFailures === 0) throw new StateError('fail observation must have failures');
    observations.push({
      ...common,
      obsId,
      resourceCost: nonnegative(resourceCost, 'resource_cost'),
      failures: numericFailures,
      incidentLoss: nonnegative(incidentLoss, 'incident_loss'),
      risk: numericRisk,
      epoch
    });
  }
  const lexical = (a, b) => a < b ? -1 : a > b ? 1 : 0;
  observations.sort((a, b) => lexical(a.obsId, b.obsId));
  priors.sort((a, b) => lexical(a.class, b.class));
  return { priors, observations, legacy };
}

function parsePlaybook(text) {
  const lines = linesOf(text);
  const entries = [];
  let section = null;
  let patternSections = 0;
  let quarantineSections = 0;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith('## ')) {
      section = null;
      if (lines[index] === '## PATTERNS') { patternSections += 1; section = 'live'; }
      if (lines[index] === '## QUARANTINE') { quarantineSections += 1; section = 'quarantined'; }
      continue;
    }
    const heading = /^### (PB-[1-9][0-9]*) · ([a-z0-9]+(?:-[a-z0-9]+){1,3})$/.exec(lines[index]);
    if (!heading && lines[index].startsWith('### PB-')) throw new StateError(`invalid playbook heading: ${lines[index]}`);
    if (!heading) continue;
    if (!section) throw new StateError(`${heading[1]} appears outside PATTERNS or QUARANTINE`);
    const block = [];
    for (index += 1; index < lines.length && !/^#{2,3} /.test(lines[index]); index += 1) block.push(lines[index]);
    index -= 1;
    const uniqueLine = (field, required = false) => {
      const matches = block.filter((line) => line.startsWith(`${field}:`));
      if (matches.length > 1) throw new StateError(`${heading[1]} has duplicate ${field}`);
      if (required && matches.length !== 1) throw new StateError(`${heading[1]} is missing ${field}`);
      return matches[0] || null;
    };
    const provenanceLine = uniqueLine('provenance', true);
    const provenance = /^provenance:\s*(T[1-3])\s+([0-9]{4}-[0-9]{2})\s+·\s+hits:\s*(0|[1-9][0-9]*)/.exec(provenanceLine || '');
    if (!provenance) throw new StateError(`${heading[1]} has an invalid provenance line`);
    const floorLine = uniqueLine('floor');
    let floor = null;
    if (floorLine) {
      const match = /^floor:\s*(T[1-3]|none)\s*$/.exec(floorLine);
      if (!match) throw new StateError(`${heading[1]} has an invalid floor`);
      floor = match[1] === 'none' ? null : match[1];
    }
    const epochLine = uniqueLine('epoch');
    const bindingEpoch = epochLine ? /^epoch:\s*(\S+)\s*$/.exec(epochLine)?.[1] : null;
    if (epochLine && !bindingEpoch) throw new StateError(`${heading[1]} has an invalid epoch`);
    const entry = {
      id: heading[1], class: heading[2], status: section,
      provenance: provenance[1], provenanceDate: provenance[2], bindingEpoch,
      hits: uint(provenance[3], 'hits'), floor
    };
    for (const field of ['WHEN:', 'DO:', 'VERIFY:']) {
      if (!block.some((line) => line.startsWith(field))) throw new StateError(`${entry.id} is missing ${field}`);
    }
    const statusLine = uniqueLine('status');
    if (statusLine) {
      const status = /^status:\s*(live|quarantined)\s*$/.exec(statusLine)?.[1];
      if (!status || status !== section) throw new StateError(`${entry.id} status contradicts its section`);
    }
    if (floor && Number(floor[1]) > Number(entry.provenance[1])) {
      throw new StateError(`${entry.id} has a contradictory floor above provenance`);
    }
    if (entries.some((existing) => existing.id === entry.id)) throw new StateError(`duplicate playbook id: ${entry.id}`);
    entries.push(entry);
  }
  if (patternSections !== 1 || quarantineSections !== 1) {
    throw new StateError('playbook must contain exactly one PATTERNS and one QUARANTINE section');
  }
  const classes = new Map();
  for (const entry of entries) {
    const grouped = classes.get(entry.class) || [];
    grouped.push(entry);
    classes.set(entry.class, grouped);
  }
  for (const [taskClass, grouped] of classes) {
    const live = grouped.filter((entry) => entry.status === 'live');
    const quarantined = grouped.filter((entry) => entry.status === 'quarantined');
    if (live.length > 1) throw new StateError(`ambiguous live playbooks for class: ${taskClass}`);
    if (live.length && quarantined.length) throw new StateError(`class has live and quarantined playbooks: ${taskClass}`);
    const floors = new Set(grouped.map((entry) => entry.floor).filter(Boolean));
    if (floors.size > 1) throw new StateError(`contradictory floors for class: ${taskClass}`);
  }
  entries.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { entries };
}

function observationRow(observation) {
  const fields = [
    observation.date, observation.class, observation.predicted, observation.executed,
    observation.outcome, observation.escalations, observation.playbook || '—', observation.obsId,
    observation.resourceCost, observation.failures, observation.incidentLoss,
    observation.risk, observation.epoch
  ];
  if (!isIsoDate(observation.date)) throw new StateError('observation date must be a valid YYYY-MM-DD date');
  if (!observation.outcome) throw new StateError('observation outcome is required');
  for (const field of fields) {
    if (String(field).includes('|') || String(field).includes('\n')) throw new StateError('observation fields cannot contain pipes or newlines');
  }
  return `| ${fields.join(' | ')} |`;
}

module.exports = { CLASS_RE, TIERS, StateError, isIsoDate, parseLedger, parsePlaybook, observationRow };
