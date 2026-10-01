'use strict';

// Confidence-gated tier decay (SPEC §4).
//
// A probe pass while a playbook entry is referenced is a Bernoulli success.
// Any acceptance failure quarantines the entry (SPEC §5.2), so the evidence
// behind a live entry is always k passes out of k probes. The one-sided
// Clopper-Pearson lower bound on the pass rate after k/k successes is
// alpha^(1/k). A permanent downgrade requires that bound, at 1 - alpha = 80%
// confidence, to reach the pass-rate floor of the entry's risk level:
//
//   requiredHits(risk) = ceil(ln(alpha) / ln(floor[risk]))
//
// which gives 3 / 4 / 5 hits for risk 0 / 1 / 2. Risk-3 work always routes to
// T3 and never decays. Entries without a `risk:` line are treated as risk 2.

const DECAY_ALPHA = 0.2;
const PASS_RATE_FLOOR = [0.5, 0.6, 0.7];
const DEFAULT_ENTRY_RISK = 2;

function requiredHits(risk) {
  if (!Number.isSafeInteger(risk) || risk < 0 || risk > 3) throw new RangeError('risk must be an integer from 0 to 3');
  if (risk === 3) return null;
  // The epsilon keeps an exact integer ratio from rounding up past itself.
  return Math.ceil(Math.log(DECAY_ALPHA) / Math.log(PASS_RATE_FLOOR[risk]) - 1e-9);
}

const REQUIRED_HITS = Object.freeze([0, 1, 2, 3].map(requiredHits));

function passRateLowerBound(hits) {
  if (!Number.isSafeInteger(hits) || hits < 0) throw new RangeError('hits must be a non-negative integer');
  return hits === 0 ? 0 : DECAY_ALPHA ** (1 / hits);
}

// Decay status of one live entry under the current binding epoch.
function entryDecay(entry, epoch) {
  const risk = entry.risk === null || entry.risk === undefined ? DEFAULT_ENTRY_RISK : entry.risk;
  const required = REQUIRED_HITS[risk];
  const recertify = Boolean(epoch && entry.bindingEpoch && entry.bindingEpoch !== epoch);
  const probeTier = Number(entry.provenance[1]) - 1;
  // No lower probe exists at the T1 execution floor or below a sticky floor.
  const atFloor = probeTier < 1 || Boolean(entry.floor && probeTier < Number(entry.floor[1]));
  return {
    risk,
    riskAssumed: entry.risk === null || entry.risk === undefined,
    hits: entry.hits,
    requiredHits: required,
    lowerBound: passRateLowerBound(entry.hits),
    decayDue: entry.status === 'live' && !recertify && !atFloor && required !== null && entry.hits >= required,
    recertify,
    atFloor
  };
}

module.exports = { DECAY_ALPHA, PASS_RATE_FLOOR, DEFAULT_ENTRY_RISK, REQUIRED_HITS, requiredHits, passRateLowerBound, entryDecay };
