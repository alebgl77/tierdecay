#!/usr/bin/env node
'use strict';

// Aggregate billed usage from a subagent JSONL transcript; prints aggregates
// only. Prices: USD per million tokens, first-party list prices cached
// 2026-09-25 (claude-api skill). 5-minute cache writes bill 1.25x input,
// 1-hour cache writes 2x input.
//
// Measurement notes (see benchmarks/pilot-v1/RESULTS.md):
// - Input-side usage (input, cache writes, cache reads) is exact: it is known
//   when a message starts streaming.
// - The transcript's output_tokens are captured at stream start and are
//   truncated; hidden thinking is not recorded at all. Output is therefore
//   estimated from visible content (text + tool-call JSON, 4 chars/token) and
//   is a LOWER BOUND.
// - usdWarm prices the first call's cache writes (the subagent's fixed system
//   prompt + tool definitions, identical across arms) as cache reads, which
//   removes the dependence of raw cost on which run happened to go first.
const fs = require('node:fs');

const PRICES = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 }
};

function visibleOutputTokens(content) {
  let chars = 0;
  for (const block of content || []) {
    if (block.type === 'text') chars += block.text.length;
    if (block.type === 'tool_use') chars += JSON.stringify(block.input || {}).length + block.name.length;
  }
  return Math.ceil(chars / 4);
}

function aggregate(file) {
  const byId = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    const message = event.message;
    if (event.type !== 'assistant' || !message || !message.usage || !message.id) continue;
    const entry = byId.get(message.id) || { model: message.model, usage: message.usage, content: [] };
    entry.content.push(...(message.content || []));
    byId.set(message.id, entry);
  }
  const totals = {
    calls: 0, input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, outputEstimated: 0,
    usdInput: 0, usdOutput: 0, usd: 0, usdWarm: 0, models: []
  };
  const models = new Set();
  [...byId.values()].forEach((entry, index) => {
    const u = entry.usage;
    const price = PRICES[entry.model];
    if (!price) throw new Error(`no price for ${entry.model}`);
    models.add(entry.model);
    const w5 = u.cache_creation?.ephemeral_5m_input_tokens ?? u.cache_creation_input_tokens ?? 0;
    const w1 = u.cache_creation?.ephemeral_1h_input_tokens ?? 0;
    const output = Math.max(u.output_tokens || 0, visibleOutputTokens(entry.content));
    totals.calls += 1;
    totals.input += u.input_tokens || 0;
    totals.cacheWrite5m += w5;
    totals.cacheWrite1h += w1;
    totals.cacheRead += u.cache_read_input_tokens || 0;
    totals.outputEstimated += output;
    const reads = (u.input_tokens || 0) * price.input + (u.cache_read_input_tokens || 0) * price.cacheRead;
    const writes = w5 * price.input * 1.25 + w1 * price.input * 2;
    const out = output * price.output;
    totals.usdInput += (reads + writes) / 1e6;
    totals.usdOutput += out / 1e6;
    totals.usd += (reads + writes + out) / 1e6;
    totals.usdWarm += (reads + (index === 0 ? (w5 + w1) * price.cacheRead : writes) + out) / 1e6;
  });
  for (const key of ['usdInput', 'usdOutput', 'usd', 'usdWarm']) totals[key] = Number(totals[key].toFixed(6));
  totals.models = [...models].sort();
  return totals;
}

module.exports = { aggregate, PRICES };
if (require.main === module) console.log(JSON.stringify(aggregate(process.argv[2])));
