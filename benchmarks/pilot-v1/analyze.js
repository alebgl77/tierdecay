#!/usr/bin/env node
'use strict';

// Pilot-v1 analysis: per-arm summaries, task-paired contrasts with a
// deterministic bootstrap CI, distillation break-even, and a replay scenario
// file built from the measured potential outcomes.
const fs = require('node:fs');
const path = require('node:path');

const here = __dirname;
const data = path.join(here, 'data');
const rows = fs.readFileSync(path.join(data, 'results.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const distill = fs.readFileSync(path.join(data, 'distill.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
const tasks = JSON.parse(fs.readFileSync(path.join(here, 'tasks.json'), 'utf8'));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
const round = (x, d = 4) => Number(x.toFixed(d));

// Bootstrap over tasks (cluster bootstrap: resample task ids, average the
// per-task mean difference). Deterministic seed.
function pairedContrast(armA, armB, metric, taskIds, seed = 20261001) {
  const perTask = taskIds.map((id) => {
    const a = rows.filter((r) => r.task === id && r.arm === armA).map(metric);
    const b = rows.filter((r) => r.task === id && r.arm === armB).map(metric);
    return { id, a: mean(a), b: mean(b), diff: mean(a) - mean(b), ratio: mean(a) / mean(b) };
  });
  const random = mulberry32(seed);
  const diffs = [];
  const ratios = [];
  for (let i = 0; i < 10000; i += 1) {
    const sample = taskIds.map(() => perTask[Math.floor(random() * perTask.length)]);
    diffs.push(mean(sample.map((t) => t.diff)));
    ratios.push(mean(sample.map((t) => t.a)) / mean(sample.map((t) => t.b)));
  }
  diffs.sort((x, y) => x - y);
  ratios.sort((x, y) => x - y);
  const q = (xs, p) => xs[Math.min(xs.length - 1, Math.floor(p * xs.length))];
  return {
    armA, armB, tasks: taskIds.length,
    meanA: round(mean(perTask.map((t) => t.a))), meanB: round(mean(perTask.map((t) => t.b))),
    meanDiff: round(mean(perTask.map((t) => t.diff))), ci95: [round(q(diffs, 0.025)), round(q(diffs, 0.975))],
    ratio: round(mean(perTask.map((t) => t.a)) / mean(perTask.map((t) => t.b)), 3), ratioCi95: [round(q(ratios, 0.025), 3), round(q(ratios, 0.975), 3)],
    tasksWhereALower: perTask.filter((t) => t.diff < 0).length
  };
}

const arms = {};
for (const arm of ['t3cold', 't1cold', 't1pb']) {
  const a = rows.filter((r) => r.arm === arm);
  arms[arm] = {
    runs: a.length, accepted: a.filter((r) => r.accepted).length,
    usdRawMean: round(mean(a.map((r) => r.usage.usd))), usdWarmMean: round(mean(a.map((r) => r.usage.usdWarm))), usdWarmSd: round(sd(a.map((r) => r.usage.usdWarm))),
    usdInputMean: round(mean(a.map((r) => r.usage.usdInput))), usdOutputMean: round(mean(a.map((r) => r.usage.usdOutput))),
    callsMean: round(mean(a.map((r) => r.usage.calls)), 2), toolUsesMean: round(mean(a.map((r) => r.toolUses)), 2),
    secondsMean: round(mean(a.map((r) => r.durationMs / 1000)), 1), cacheReadMean: Math.round(mean(a.map((r) => r.usage.cacheRead))),
    outputEstimatedMean: Math.round(mean(a.map((r) => r.usage.outputEstimated)))
  };
}

const all = Object.keys(tasks.tasks);
const reuse = all.filter((id) => !id.endsWith('1'));
const warm = (r) => r.usage.usdWarm;
const contrasts = {
  sonnetColdVsOpusCold_allTasks: pairedContrast('t1cold', 't3cold', warm, all),
  sonnetPlaybookVsOpusCold_reuseTasks: pairedContrast('t1pb', 't3cold', warm, reuse),
  sonnetPlaybookVsSonnetCold_reuseTasks: pairedContrast('t1pb', 't1cold', warm, reuse),
  sonnetPlaybookVsSonnetCold_calls: pairedContrast('t1pb', 't1cold', (r) => r.usage.calls, reuse)
};

const distillWarm = mean(distill.map((d) => d.usage.usdWarm));
const cHi = contrasts.sonnetPlaybookVsOpusCold_reuseTasks.meanB;
const cLo = contrasts.sonnetPlaybookVsOpusCold_reuseTasks.meanA;
const cCold = contrasts.sonnetPlaybookVsSonnetCold_reuseTasks.meanB;
const breakEven = (cDistill, delta) => (delta > 0 ? { weak: Math.ceil(cDistill / delta), strict: Math.floor(cDistill / delta) + 1 } : null);
const economics = {
  unit: 'USD per task, warm-cache',
  C_distill: round(distillWarm),
  vsStaticFrontier: { C_hi: cHi, C_lo: cLo, delta: round(cHi - cLo), breakEvenReuses: breakEven(distillWarm, cHi - cLo) },
  vsStaticCheapTier: { C_hi: cCold, C_lo: cLo, delta: round(cCold - cLo), breakEvenReuses: breakEven(distillWarm, cCold - cLo) }
};

// Potential-outcome scenarios for `tierdecay replay`/`bench`: one line per
// task instance; T1 = mean Sonnet+playbook (instances 2-3) or Sonnet cold
// (instance 1), T2 = T3 = mean Opus cold (the native binding maps both to
// `opus`). Costs in milli-USD, warm-cache.
const scenarios = all.map((id, index) => {
  const pick = (arm) => rows.filter((r) => r.task === id && r.arm === arm);
  const outcome = (rs) => ({ resourceCost: round(mean(rs.map(warm)) * 1000, 3), failures: rs.every((r) => r.accepted) ? 0 : 1, escalations: 0, incidentLoss: 0 });
  const t1 = id.endsWith('1') ? pick('t1cold') : pick('t1pb');
  const t3 = pick('t3cold');
  const cls = tasks.tasks[id].class;
  const instance = Number(id[1]);
  return {
    id: `pilot-${id}`, date: '2026-10-01',
    request: {
      class: cls, risk: 1, critical: false, recurring: true, horizon: 4 - instance, epoch: 'pilot-v1',
      ...(instance > 1 ? { playbook: `PB-${'ABC'.indexOf(id[0]) + 1}` } : {}),
      rubric: { ambiguity: 1, reasoning: 1, blastRadius: 1, riskSurface: 1 }
    },
    outcomes: { T1: outcome(t1), T2: outcome(t3), T3: outcome(t3) }
  };
});

const report = { generated: 'pilot-v1', runs: rows.length, distillRuns: distill.length, arms, contrasts, economics };
fs.writeFileSync(path.join(data, 'summary.json'), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(data, 'scenarios.jsonl'), scenarios.map((s) => JSON.stringify(s)).join('\n') + '\n');
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
