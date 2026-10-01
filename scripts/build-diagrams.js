#!/usr/bin/env node
'use strict';

// Diagrams as code: renders the technical drawings in docs/diagrams/ as
// self-contained SVG (no external fonts or scripts, white canvas so they read
// the same in GitHub's light and dark themes).
//
//   node scripts/build-diagrams.js          write docs/diagrams/*.svg
//   node scripts/build-diagrams.js --check  exit 1 if a committed SVG is stale
const fs = require('node:fs');
const path = require('node:path');
const { VERSION } = require('../core/engine/version');

const OUT = path.join(__dirname, '..', 'docs', 'diagrams');
const FONT = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'Cascadia Mono', Consolas, 'DejaVu Sans Mono', monospace";
const STYLE = {
  client: { fill: '#F5F5F5', stroke: '#666666' },
  surface: { fill: '#DAE8FC', stroke: '#6C8EBF' },
  engine: { fill: '#D5E8D4', stroke: '#82B366' },
  state: { fill: '#FFF2CC', stroke: '#D6B656' },
  danger: { fill: '#F8CECC', stroke: '#B85450' },
  accent: { fill: '#E1D5E7', stroke: '#9673A6' },
  tier3: { fill: '#F8CECC', stroke: '#B85450' },
  tier2: { fill: '#FFE6CC', stroke: '#D79B00' },
  tier1: { fill: '#D5E8D4', stroke: '#82B366' },
  neutral: { fill: '#FFFFFF', stroke: '#666666' }
};

const esc = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function textBlock(x, y, lines, { size = 13, weight = 400, color = '#1F2D3D', anchor = 'middle', family = FONT, gap = 1.3 } = {}) {
  const list = Array.isArray(lines) ? lines : [lines];
  const start = y - ((list.length - 1) * size * gap) / 2;
  return list.map((line, index) => {
    const spec = typeof line === 'string' ? { text: line } : line;
    return `<text x="${x}" y="${(start + index * size * gap).toFixed(1)}" font-family="${spec.mono ? MONO : family}" font-size="${spec.size || size}" font-weight="${spec.weight || weight}" fill="${spec.color || color}" text-anchor="${anchor}" dominant-baseline="central">${esc(spec.text)}</text>`;
  }).join('');
}

function box(x, y, w, h, kind, lines, { rx = 6, size = 13, dashed = false } = {}) {
  const style = STYLE[kind];
  return `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5"${dashed ? ' stroke-dasharray="6 4"' : ''} filter="url(#shadow)"/>${textBlock(x + w / 2, y + h / 2, lines, { size })}</g>`;
}

function pill(x, y, w, h, kind, lines, options = {}) {
  return box(x, y, w, h, kind, lines, { ...options, rx: h / 2 });
}

function diamond(cx, cy, w, h, kind, lines, { size = 12 } = {}) {
  const style = STYLE[kind];
  const points = [[cx, cy - h / 2], [cx + w / 2, cy], [cx, cy + h / 2], [cx - w / 2, cy]].map((p) => p.join(',')).join(' ');
  return `<g><polygon points="${points}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5" filter="url(#shadow)"/>${textBlock(cx, cy, lines, { size })}</g>`;
}

function document(x, y, w, h, kind, lines, { size = 13 } = {}) {
  const style = STYLE[kind];
  const wave = `M${x},${y} H${x + w} V${y + h - 8} C${x + w * 0.75},${y + h - 22} ${x + w * 0.5},${y + h + 6} ${x + w * 0.25},${y + h - 6} C${x + w * 0.12},${y + h - 12} ${x + w * 0.05},${y + h - 10} ${x},${y + h - 6} Z`;
  return `<g><path d="${wave}" fill="${style.fill}" stroke="${style.stroke}" stroke-width="1.5" filter="url(#shadow)"/>${textBlock(x + w / 2, y + h / 2 - 5, lines, { size })}</g>`;
}

function arrow(points, { label, dashed = false, color = '#4D4D4D', labelAt = 0.5, labelDx = 0, labelDy = -9, end = true, start = false } = {}) {
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ');
  let tag = '';
  if (label) {
    // Place the label on the segment containing the requested fraction.
    const lengths = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
    let target = lengths.reduce((a, b) => a + b, 0) * labelAt;
    let i = 0;
    while (i < lengths.length - 1 && target > lengths[i]) { target -= lengths[i]; i += 1; }
    const t = lengths[i] ? target / lengths[i] : 0;
    const lx = points[i][0] + (points[i + 1][0] - points[i][0]) * t + labelDx;
    const ly = points[i][1] + (points[i + 1][1] - points[i][1]) * t + labelDy;
    const width = String(label).length * 6.3 + 10;
    tag = `<rect x="${(lx - width / 2).toFixed(1)}" y="${(ly - 9).toFixed(1)}" width="${width.toFixed(1)}" height="18" rx="3" fill="#FFFFFF" fill-opacity="0.92"/>${textBlock(lx, ly, label, { size: 11, color: '#333333' })}`;
  }
  return `<g><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"${dashed ? ' stroke-dasharray="6 4"' : ''}${end ? ' marker-end="url(#arrow)"' : ''}${start ? ' marker-start="url(#arrow-start)"' : ''}/>${tag}</g>`;
}

function lane(y, h, width, title, { shade = '#F7F9FC' } = {}) {
  return `<g><rect x="20" y="${y}" width="${width - 40}" height="${h}" fill="${shade}" stroke="#B7C3D0" stroke-width="1"/><rect x="20" y="${y}" width="34" height="${h}" fill="#DCE4EE" stroke="#B7C3D0" stroke-width="1"/><text transform="translate(${37},${y + h / 2}) rotate(-90)" font-family="${FONT}" font-size="12" font-weight="600" fill="#2B3A4A" text-anchor="middle" dominant-baseline="central">${esc(title)}</text></g>`;
}

function titleBlock(width, height, title, sheet) {
  const x = width - 400;
  const y = height - 74;
  return `<g font-family="${FONT}">
<rect x="${x}" y="${y}" width="380" height="58" fill="#FFFFFF" stroke="#2B3A4A" stroke-width="1.2"/>
<line x1="${x}" y1="${y + 26}" x2="${x + 380}" y2="${y + 26}" stroke="#2B3A4A" stroke-width="0.8"/>
<line x1="${x + 190}" y1="${y + 26}" x2="${x + 190}" y2="${y + 58}" stroke="#2B3A4A" stroke-width="0.8"/>
<line x1="${x + 290}" y1="${y + 26}" x2="${x + 290}" y2="${y + 58}" stroke="#2B3A4A" stroke-width="0.8"/>
${textBlock(x + 190, y + 13, title, { size: 12, weight: 700 })}
${textBlock(x + 95, y + 42, `TierDecay v${VERSION}`, { size: 11 })}
${textBlock(x + 240, y + 42, 'Rev. 2026-10', { size: 11 })}
${textBlock(x + 335, y + 42, sheet, { size: 11 })}
</g>`;
}

function legend(x, y, items) {
  const parts = [`<text x="${x}" y="${y}" font-family="${FONT}" font-size="11" font-weight="700" fill="#2B3A4A">Legend</text>`];
  items.forEach(([kind, label, shape], index) => {
    const cx = x + (index % 4) * 175;
    const cy = y + 14 + Math.floor(index / 4) * 22;
    if (shape === 'line') parts.push(`<line x1="${cx}" y1="${cy + 7}" x2="${cx + 26}" y2="${cy + 7}" stroke="#4D4D4D" stroke-width="1.6"${kind === 'dashed' ? ' stroke-dasharray="6 4"' : ''} marker-end="url(#arrow)"/>`);
    else parts.push(`<rect x="${cx}" y="${cy}" width="26" height="14" rx="3" fill="${STYLE[kind].fill}" stroke="${STYLE[kind].stroke}" stroke-width="1.2"/>`);
    parts.push(`<text x="${cx + 34}" y="${cy + 7}" font-family="${FONT}" font-size="11" fill="#333333" dominant-baseline="central">${esc(label)}</text>`);
  });
  return `<g>${parts.join('')}</g>`;
}

function svg(width, height, title, description, body) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
<title id="title">${esc(title)}</title>
<desc id="desc">${esc(description)}</desc>
<defs>
<marker id="arrow" viewBox="0 0 10 10" refX="9.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4D4D4D"/></marker>
<marker id="arrow-start" viewBox="0 0 10 10" refX="0.5" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#4D4D4D"/></marker>
<filter id="shadow" x="-10%" y="-10%" width="130%" height="140%"><feDropShadow dx="1.5" dy="2" stdDeviation="1.6" flood-color="#000000" flood-opacity="0.18"/></filter>
<pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20,0 L0,0 0,20" fill="none" stroke="#EEF1F5" stroke-width="1"/></pattern>
</defs>
<rect width="${width}" height="${height}" fill="#FFFFFF"/>
<rect width="${width}" height="${height}" fill="url(#grid)"/>
${body}
</svg>
`;
}

function header(width, title, subtitle) {
  return `<rect x="20" y="16" width="${width - 40}" height="52" fill="#2B3A4A"/>${textBlock(40, 34, title, { size: 19, weight: 700, color: '#FFFFFF', anchor: 'start' })}${textBlock(40, 56, subtitle, { size: 12, color: '#C9D6E3', anchor: 'start' })}`;
}

// ------------------------------------------------------------- architecture

function architecture() {
  const W = 1480;
  const H = 1000;
  const parts = [header(W, 'TierDecay — reference architecture', 'One posterior per repository, one deterministic engine, every agent client: native files where a tool reads them, MCP and the CLI where it runs tools.')];
  const lanes = [
    [86, 150, 'Agent clients'],
    [246, 170, 'Integration surfaces'],
    [426, 170, 'Deterministic engine'],
    [606, 170, 'Repository state'],
    [786, 100, 'Operations (Linux)']
  ];
  lanes.forEach(([y, h, t], i) => parts.push(lane(y, h, W, t, { shade: i % 2 ? '#FFFFFF' : '#F7F9FC' })));

  const cw = 196;
  const cx0 = 76;
  const gap = (W - 60 - cx0 - 6 * cw) / 5;
  const col = Array.from({ length: 6 }, (_, i) => cx0 + i * (cw + gap));
  const mid = (i) => col[i] + cw / 2;

  const clients = [
    ['Claude Code', 'plugin · subagents · effort'],
    ['OpenAI Codex', 'roles · effort · hooks · MCP'],
    ['Google Antigravity', 'rules · subagents · MCP'],
    ['Cursor', 'AGENTS.md · Auto goals'],
    ['Gemini CLI', 'GEMINI.md · Pro / Flash'],
    ['Aider · Cline', 'Goose · Windsurf']
  ];
  clients.forEach(([name, sub], i) => parts.push(box(col[i], 112, cw, 76, 'client', [{ text: name, weight: 700 }, { text: sub, size: 11, color: '#4A5A6A' }])));

  const surfaces = [
    ['Context files', 'CLAUDE · AGENTS · GEMINI .md', 'surface'],
    ['Agent Skills', '.agents/skills · live entries', 'surface'],
    ['Native roles', 'subagents · rules · hooks', 'surface'],
    ['MCP server', 'stdio · 7 tools (+ record)', 'accent'],
    ['tierdecay CLI', 'Node ≥ 18 · zero deps', 'surface'],
    ['Claude Code plugin', 'guard hook · /tierdecay:init', 'surface']
  ];
  surfaces.forEach(([name, sub, kind], i) => parts.push(box(col[i], 290, cw, 82, kind, [{ text: name, weight: 700 }, { text: sub, size: 11, color: '#33475B' }])));

  // Bus A: every client reaches the surfaces it supports (see the README matrix).
  const busA = 228;
  clients.forEach((_, i) => parts.push(`<line x1="${mid(i)}" y1="188" x2="${mid(i)}" y2="${busA}" stroke="#4D4D4D" stroke-width="1.6"/>`));
  parts.push(`<line x1="${mid(0)}" y1="${busA}" x2="${mid(5)}" y2="${busA}" stroke="#4D4D4D" stroke-width="3"/>`);
  surfaces.forEach((_, i) => parts.push(arrow([[mid(i), busA], [mid(i), 290]])));
  parts.push(`<rect x="${mid(2) + 40}" y="${busA - 10}" width="330" height="20" rx="3" fill="#FFFFFF"/>`);
  parts.push(textBlock(mid(2) + 205, busA, 'each client uses the surfaces it supports — README matrix', { size: 11, color: '#333333' }));

  const engine = [
    ['route', 'safety → quarantine → recertify', 'probe → PRIORS → rubric'],
    ['decay gate', '3 / 4 / 5 hits by risk', '80% Clopper–Pearson'],
    ['export', 'Claude · Codex · Antigravity', 'Cursor · JSON · Skills'],
    ['status · doctor', 'owed bookkeeping', 'health checks · exit codes'],
    ['bench · replay', 'seeded permutations', 'in-memory evolution'],
    ['observe', 'validated row', 'locked atomic append']
  ];
  engine.forEach(([name, a, b], i) => parts.push(box(col[i], 466, cw, 90, 'engine', [{ text: name, weight: 700, mono: true }, { text: a, size: 11 }, { text: b, size: 11 }])));

  // Bus B: MCP, CLI, and plugin invoke the engine.
  const busB = 414;
  [3, 4, 5].forEach((i) => parts.push(`<line x1="${mid(i)}" y1="372" x2="${mid(i)}" y2="${busB}" stroke="#4D4D4D" stroke-width="1.6"/>`));
  parts.push(`<line x1="${mid(0)}" y1="${busB}" x2="${W - 30}" y2="${busB}" stroke="#4D4D4D" stroke-width="3"/>`);
  [0, 1, 3, 4, 5].forEach((i) => parts.push(arrow([[mid(i), busB], [mid(i), 466]])));
  parts.push(arrow([[mid(2) - 40, busB], [mid(2) - 40, 466]]));
  parts.push(`<rect x="${mid(3) + 8}" y="${busB - 22}" width="190" height="18" rx="3" fill="#FFFFFF"/>`);
  parts.push(textBlock(mid(3) + 103, busB - 13, 'JSON-RPC · CLI · bin/ on PATH', { size: 11, color: '#333333' }));
  // Export generates skills and native rule tables.
  parts.push(arrow([[mid(2) + 20, 466], [mid(2) + 20, 372]], { dashed: true, label: 'generates', labelAt: 0.45, labelDx: 38, labelDy: 0 }));
  parts.push(arrow([[mid(2) - 70, 466], [mid(2) - 70, 448], [mid(1) + 20, 448], [mid(1) + 20, 372]], { dashed: true }));

  const state = [
    ['SPEC rubric', 'cold-start prior'],
    ['ledger.md', 'posterior: predicted vs executed'],
    ['playbook.md', 'compiled patterns · ≤150 lines'],
    ['MODELS.md', 'alias × effort · binding epoch'],
    ['router-config.json', 'calibrated economics'],
    ['SECURITY · guard', 'executors never write state']
  ];
  state.forEach(([name, sub], i) => parts.push(document(col[i], 650, cw, 86, i === 5 ? 'danger' : 'state', [{ text: name, weight: 700, mono: i > 0 && i < 5 }, { text: sub, size: 11 }])));

  // Bus C: the engine reads all state on every call (no cache, no daemon).
  const busC = 586;
  [0, 1, 2, 3, 4].forEach((i) => parts.push(`<line x1="${mid(i)}" y1="556" x2="${mid(i)}" y2="${busC}" stroke="#4D4D4D" stroke-width="1.6"/>`));
  parts.push(`<line x1="${mid(0)}" y1="${busC}" x2="${mid(4)}" y2="${busC}" stroke="#4D4D4D" stroke-width="3"/>`);
  [0, 1, 2, 3, 4].forEach((i) => parts.push(arrow([[mid(i) - 30, busC], [mid(i) - 30, 650]])));
  parts.push(`<rect x="${mid(0) + 10}" y="${busC + 8}" width="210" height="18" rx="3" fill="#FFFFFF"/>`);
  parts.push(textBlock(mid(0) + 115, busC + 17, 'reads on every call · no cache', { size: 11, color: '#333333' }));
  // observe: the one write path.
  parts.push(arrow([[mid(5), 556], [mid(5), 620], [mid(1) + 40, 620], [mid(1) + 40, 650]], { dashed: true, label: 'append (lock + fsync + rename)', labelAt: 0.5, labelDy: -10 }));

  const ops = [
    ['OCI image', 'distroless · nonroot · read-only'],
    ['GitHub Action', 'doctor gate · job summary'],
    ['Release', 'tag → archive · SBOM · SHA256SUMS']
  ];
  const opsX = [col[0] + 40, col[2] + 40, col[4] + 40];
  ops.forEach(([name, sub], i) => parts.push(box(opsX[i], 806, 300, 60, 'neutral', [{ text: name, weight: 700 }, { text: sub, size: 11 }])));
  // Ops reach the engine through a right-hand corridor into bus B.
  const busD = 880;
  [0, 1].forEach((i) => parts.push(`<line x1="${opsX[i] + 150}" y1="866" x2="${opsX[i] + 150}" y2="${busD}" stroke="#4D4D4D" stroke-width="1.6" stroke-dasharray="6 4"/>`));
  parts.push(arrow([[opsX[0] + 150, busD], [W - 30, busD], [W - 30, busB + 2]], { dashed: true, label: 'runs doctor · mcp', labelAt: 0.25 }));

  parts.push(legend(76, 912, [
    ['client', 'Agent client'], ['surface', 'Integration surface'], ['accent', 'MCP server'], ['engine', 'Engine module'],
    ['state', 'Versioned Markdown state'], ['danger', 'Integrity boundary'], ['solid', 'Call / read (bus)', 'line'], ['dashed', 'Generate / write / ops', 'line']
  ]));
  parts.push(titleBlock(W, H, 'Reference architecture', 'Sheet 1 / 3'));
  return svg(W, H, 'TierDecay reference architecture', 'Agent clients (Claude Code, Codex, Antigravity, Cursor, Gemini CLI, others) reach one deterministic engine through context files, Agent Skills, native roles and rules, an MCP server, the CLI, and a Claude Code plugin; the engine reads versioned Markdown state on every call and appends ledger rows under a lock.', parts.join('\n'));
}

// --------------------------------------------------------- routing decision

function routing() {
  const W = 1480;
  const H = 1010;
  const parts = [header(W, 'Routing decision — one task, deterministic precedence', 'Safety first, then quarantine, recertification, live playbook probe, empirical PRIORS, and only then the cold-start rubric.')];
  const y = 160;
  const step = 168;
  const x0 = 120;
  parts.push(pill(40, y - 26, 120, 52, 'neutral', [{ text: 'New task', weight: 700 }, { text: 'class · risk · rubric', size: 10 }]));
  const decisions = [
    ['critical or', 'risk 3?'],
    ['class', 'quarantined?'],
    ['live entry from', 'another epoch?'],
    ['live entry', 'referenced?'],
    ['class in', 'PRIORS?']
  ];
  const outcomes = [
    ['tier3', 'T3 · safety', 'frontier specs + review'],
    ['danger', 'T3 · refusal', 'revise the entry'],
    ['accent', 'RECERTIFY', 'at provenance tier'],
    ['tier1', 'PROBE', 'provenance −1 (T1: exploit)'],
    ['tier2', 'Empirical tier', 'from the ledger posterior']
  ];
  decisions.forEach((lines, i) => {
    const cx = x0 + 160 + i * step + 30;
    parts.push(diamond(cx, y, 138, 96, 'surface', lines));
    const from = i === 0 ? 160 : cx - step + 69;
    parts.push(arrow([[from, y], [cx - 69, y]], { label: i === 0 ? undefined : 'no', labelDy: -10 }));
    const [kind, title, sub] = outcomes[i];
    parts.push(box(cx - 78, y + 120, 156, 64, kind, [{ text: title, weight: 700 }, { text: sub, size: 11 }]));
    parts.push(arrow([[cx, y + 48], [cx, y + 120]], { label: 'yes', labelDx: 18, labelDy: 0 }));
  });

  // Probe floor check under PROBE.
  const probeX = x0 + 160 + 3 * step + 30;
  parts.push(diamond(probeX, y + 280, 150, 92, 'surface', ['probe tier ≥', 'sticky floor?']));
  parts.push(arrow([[probeX, y + 184], [probeX, y + 234]]));
  parts.push(box(probeX - 250, y + 380, 170, 60, 'danger', [{ text: 'Refuse descent', weight: 700 }, { text: 'run at the floor', size: 11 }]));
  parts.push(arrow([[probeX - 75, y + 280], [probeX - 165, y + 280], [probeX - 165, y + 380]], { label: 'no', labelAt: 0.3 }));
  parts.push(box(probeX + 60, y + 380, 200, 60, 'tier1', [{ text: 'Dispatch probe', weight: 700 }, { text: 'entry quoted verbatim', size: 11 }]));
  parts.push(arrow([[probeX + 75, y + 280], [probeX + 160, y + 280], [probeX + 160, y + 380]], { label: 'yes', labelAt: 0.3 }));

  // Rubric branch.
  const rubricX = x0 + 160 + 5 * step + 60;
  const lastDecision = x0 + 160 + 4 * step + 30;
  parts.push(box(rubricX - 20, y - 38, 190, 76, 'neutral', [{ text: 'Score the rubric', weight: 700 }, { text: 'ambiguity · depth', size: 11 }, { text: 'blast radius · risk', size: 11 }]));
  parts.push(arrow([[lastDecision + 69, y], [rubricX - 20, y]], { label: 'no' }));
  const tiers = [['tier1', 'T1 · score 0–3', 'executor'], ['tier2', 'T2 · score 4–6', 'heavy executor'], ['tier3', 'T3 · ≥7 or axis max', 'spec · implement · review']];
  tiers.forEach(([kind, title, sub], i) => {
    const ty = y + 100 + i * 92;
    parts.push(box(rubricX - 10, ty, 170, 62, kind, [{ text: title, weight: 700 }, { text: sub, size: 11 }]));
    parts.push(arrow([[rubricX + 170, y + 20], [rubricX + 200, y + 20], [rubricX + 200, ty + 31], [rubricX + 160, ty + 31]], {}));
  });

  // After execution: verify and distill loop.
  const loopY = y + 600;
  parts.push(box(120, loopY, 230, 70, 'engine', [{ text: 'VERIFY', weight: 700 }, { text: 'acceptance · critical diffs → review', size: 11 }]));
  parts.push(box(420, loopY, 230, 70, 'engine', [{ text: 'LEDGER ROW', weight: 700 }, { text: 'observe → locked append', size: 11 }]));
  parts.push(box(720, loopY, 260, 70, 'engine', [{ text: 'PLAYBOOK UPDATE', weight: 700 }, { text: 'pass: hits +1 · fail: quarantine + floor', size: 11 }]));
  parts.push(box(1050, loopY, 260, 70, 'engine', [{ text: 'DECAY GATE', weight: 700 }, { text: 'hits ≥ 3/4/5 → provenance −1', size: 11 }]));
  parts.push(arrow([[350, loopY + 35], [420, loopY + 35]]));
  parts.push(arrow([[650, loopY + 35], [720, loopY + 35]]));
  parts.push(arrow([[980, loopY + 35], [1050, loopY + 35]]));
  parts.push(arrow([[1180, loopY + 70], [1180, loopY + 110], [100, loopY + 110], [100, y + 26]], { dashed: true, label: 'next occurrence of the class is routed with a stronger posterior', labelAt: 0.32 }));
  parts.push(`<text x="120" y="${loopY - 24}" font-family="${FONT}" font-size="13" font-weight="700" fill="#2B3A4A">After execution — DISTILL (orchestrator only)</text>`);
  parts.push(`<line x1="120" y1="${loopY - 12}" x2="1310" y2="${loopY - 12}" stroke="#B7C3D0" stroke-width="1"/>`);

  parts.push(legend(120, H - 74, [['surface', 'Decision'], ['tier1', 'T1 route'], ['tier2', 'T2 route'], ['tier3', 'T3 route'], ['danger', 'Refusal / floor'], ['accent', 'Recertification'], ['engine', 'Bookkeeping'], ['dashed', 'Feedback loop', 'line']]));
  parts.push(titleBlock(W, H, 'Routing decision flow', 'Sheet 2 / 3'));
  return svg(W, H, 'TierDecay routing decision flow', 'Decision precedence for one task: critical or risk 3 routes T3; a quarantined class is refused at T3; an entry from another binding epoch is recertified; a referenced live entry probes one tier below provenance unless a sticky floor blocks it; PRIORS give an empirical tier; otherwise the rubric scores T1, T2, or T3. After execution the orchestrator verifies, appends a ledger row, updates the playbook, and applies the decay gate.', parts.join('\n'));
}

// ------------------------------------------------------------ decay lifecycle

function lifecycle() {
  const W = 1480;
  const H = 820;
  const parts = [header(W, 'Life of a task class — confidence-gated decay', 'A class earns a cheaper tier only after k consecutive probe passes; any failure quarantines its entry and pins a sticky floor; a model or effort change forces recertification.')];
  const states = {
    scored: [80, 180, 'Scored', 'rubric prior', 'neutral'],
    distilled: [360, 180, 'Distilled', 'entry ≤15 lines · risk · epoch', 'state'],
    probing: [700, 180, 'Probing', 'hits k / required', 'tier1'],
    decayed: [1060, 180, 'Decayed', 'provenance −1 · hits reset', 'engine'],
    quarantined: [700, 440, 'Quarantined', 'sticky floor = failed tier', 'danger'],
    recertifying: [1060, 440, 'Recertifying', 'run at provenance', 'accent'],
    raised: [80, 440, 'Raised', 'default tier +1', 'tier2']
  };
  for (const [x, y, name, sub, kind] of Object.values(states)) parts.push(box(x, y, 240, 84, kind, [{ text: name, weight: 700, size: 15 }, { text: sub, size: 11 }], { rx: 18 }));
  parts.push(`<circle cx="50" cy="222" r="10" fill="#2B3A4A"/>`);
  parts.push(arrow([[60, 222], [80, 222]]));
  parts.push(arrow([[320, 222], [360, 222]]));
  parts.push(textBlock(340, 150, ['T2/T3 success', 'on a recurring class'], { size: 11, color: '#333333' }));
  parts.push(`<line x1="340" y1="166" x2="340" y2="216" stroke="#9AA8B6" stroke-width="1" stroke-dasharray="2 3"/>`);
  parts.push(arrow([[600, 222], [700, 222]], { label: 'next occurrence', labelDy: -14 }));
  parts.push(arrow([[940, 206], [1060, 206]], { label: 'hits ≥ 3 / 4 / 5', labelDy: -14 }));
  parts.push(arrow([[1060, 240], [940, 240]], { label: 'probe next tier down', labelDy: 14 }));
  parts.push(arrow([[820, 264], [820, 440]], { label: 'any acceptance failure', labelDx: 0 }));
  parts.push(arrow([[1180, 264], [1180, 440]], { label: 'model / effort changed', labelDx: 0 }));
  parts.push(arrow([[1060, 470], [1000, 470], [1000, 300], [880, 300], [880, 264]], { label: 'pass: adopt epoch', labelAt: 0.42, labelDx: 0, labelDy: -12 }));
  parts.push(arrow([[700, 500], [480, 500], [480, 264]], { label: 'entry revised', labelAt: 0.35, labelDy: -12, dashed: true }));
  parts.push(arrow([[200, 264], [200, 440]], { label: '2 escalations', labelDx: 0 }));
  parts.push(arrow([[940, 162], [960, 162], [960, 130], [820, 130], [820, 180]], { label: 'pass: hits +1', labelAt: 0.5, labelDy: -12 }));

  // Evidence table.
  const tx = 80;
  const ty = 580;
  const rows = [['risk', 'pass-rate floor', 'required hits', 'bound after k/k'], ['0', '0.50', '3', '0.585'], ['1', '0.60', '4', '0.669'], ['2', '0.70', '5', '0.725'], ['3', '—', 'never decays', 'T3 always']];
  const colW = [80, 140, 140, 150];
  parts.push(`<text x="${tx}" y="${ty - 16}" font-family="${FONT}" font-size="13" font-weight="700" fill="#2B3A4A">Decay gate — one-sided 80% Clopper–Pearson lower bound 0.2^(1/k)</text>`);
  rows.forEach((row, r) => {
    let cx = tx;
    row.forEach((cell, c) => {
      parts.push(`<rect x="${cx}" y="${ty + r * 28}" width="${colW[c]}" height="28" fill="${r === 0 ? '#DCE4EE' : r % 2 ? '#FFFFFF' : '#F7F9FC'}" stroke="#B7C3D0" stroke-width="1"/>`);
      parts.push(textBlock(cx + colW[c] / 2, ty + r * 28 + 14, cell, { size: 12, weight: r === 0 ? 700 : 400, family: r === 0 ? FONT : MONO }));
      cx += colW[c];
    });
  });
  // Invariants box.
  const ix = 700;
  parts.push(box(ix, 560, 620, 168, 'neutral', [
    { text: 'Integrity invariants (SPEC §5)', weight: 700, size: 13 },
    { text: 'Only the orchestrator writes ledger and playbook — executors are guarded', size: 12 },
    { text: 'Any failure while an entry was referenced → instant quarantine', size: 12 },
    { text: 'Playbook hard cap 150 lines · evict lowest hits, oldest first', size: 12 },
    { text: 'A quarantined entry is never applied, exported, or probed', size: 12 },
    { text: 'Executors report PLAYBOOK feedback; they never update counters', size: 12 }
  ], { rx: 4 }));
  parts.push(titleBlock(W, H, 'Class lifecycle and decay gate', 'Sheet 3 / 3'));
  return svg(W, H, 'TierDecay class lifecycle', 'States of a task class: scored by the rubric, distilled into a playbook entry, probed one tier lower, decayed after 3/4/5 passes by risk, quarantined with a sticky floor on any failure, recertified after a model or effort change, raised after two escalations.', parts.join('\n'));
}

const DIAGRAMS = { 'architecture.svg': architecture, 'routing-decision.svg': routing, 'decay-lifecycle.svg': lifecycle };

function main(check) {
  const stale = [];
  fs.mkdirSync(OUT, { recursive: true });
  for (const [file, render] of Object.entries(DIAGRAMS)) {
    const target = path.join(OUT, file);
    const content = render();
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8').replace(/\r\n/g, '\n') : null;
    if (check) { if (current !== content) stale.push(file); continue; }
    if (current !== content) fs.writeFileSync(target, content);
  }
  if (stale.length) {
    process.stderr.write(`docs/diagrams is out of date; run node scripts/build-diagrams.js\n  ${stale.join('\n  ')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`${check ? 'checked' : 'rendered'} ${Object.keys(DIAGRAMS).length} diagrams\n`);
}

main(process.argv.includes('--check'));
