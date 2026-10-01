'use strict';

// Export the learned posterior to native routers and Agent Skills tools.
// TierDecay does not compete with a CLI's own model router: it hands it a
// per-repo routing table (which class runs at which tier, bound to which
// model alias and effort) and, optionally, compiles live playbook entries into
// Agent Skills so any skills-aware tool can load them on demand.
const fs = require('node:fs');
const path = require('node:path');
const { status } = require('./status');
const { playbookBlocks } = require('./markdown');

// Tier bindings per target. Aliases and effort levels only — never a model
// version (core/MODELS.md is the single place that may name one, and states
// the cheapest-family exclusion policy). The cheap tiers use the fast
// workhorse alias at lower effort.
const BINDINGS = Object.freeze({
  claude: {
    T3: { agent: 'main thread / oracle', model: 'opus', effort: 'xhigh' },
    T2: { agent: 'heavy-executor', model: 'opus', effort: 'high' },
    T1: { agent: 'executor', model: 'sonnet', effort: 'medium' },
    T0: { agent: 'scout', model: 'sonnet', effort: 'low' }
  },
  codex: {
    T3: { profile: 'tierdecay-t3', effort: 'xhigh', model: 'frontier coding model' },
    T2: { profile: 'tierdecay-t2', effort: 'high', model: 'frontier coding model' },
    T1: { profile: 'tierdecay-t1', effort: 'medium', model: 'fast coding model' },
    T0: { profile: 'tierdecay-t0', effort: 'low', model: 'fast coding model' }
  },
  antigravity: {
    T3: { mode: 'Planning', model: 'frontier model (Pro / Opus class)' },
    T2: { mode: 'Planning', model: 'strong model' },
    T1: { mode: 'Fast', model: 'fast model (Flash / Sonnet class)' },
    T0: { mode: 'Fast', model: 'fast model, read-only' }
  },
  cursor: {
    T3: { mode: 'Auto (Intelligence) or your frontier model' },
    T2: { mode: 'Auto (Balance)' },
    T1: { mode: 'Auto (Cost)' }
  },
  generic: {
    T3: { model: 'frontier' },
    T2: { model: 'strong workhorse' },
    T1: { model: 'fast workhorse' }
  }
});

const FORMATS = ['json', 'claude', 'codex', 'antigravity', 'cursor', 'skills'];
const SKILL_PREFIX = 'tierdecay-';
const GENERATED_MARKER = 'generated-by: tierdecay';

function routes(state) {
  return state.classes
    .filter((row) => row.route.tier)
    .map((row) => ({
      class: row.class,
      tier: row.route.tier,
      action: row.route.action,
      source: row.route.source,
      playbook: row.route.playbook || null
    }));
}

function why(route) {
  if (route.source === 'playbook') return `${route.action} via ${route.playbook}`;
  if (route.source === 'quarantined') return `${route.playbook} quarantined: fail closed`;
  if (route.source === 'sticky-floor') return 'sticky floor';
  return 'ledger PRIORS';
}

function table(header, rows) {
  const line = (cells) => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

const FOOTER = 'Per-request safety still applies: critical or risk-3 work routes to T3 regardless of this table. Classes not listed are scored with the rubric.';

function exportClaude(state) {
  const rows = routes(state).map((route) => {
    const binding = BINDINGS.claude[route.tier];
    return [`\`${route.class}\``, route.tier, `\`${binding.agent}\``, `\`${binding.model}\``, `\`${binding.effort}\``, why(route)];
  });
  return `# TierDecay routes (Claude Code)\n\n${table(['class', 'tier', 'agent', 'model', 'effort', 'why'], rows)}\n\n${FOOTER}\n`;
}

function exportCodex(state) {
  const rows = routes(state).map((route) => {
    const binding = BINDINGS.codex[route.tier];
    return [`\`${route.class}\``, route.tier, `\`codex --profile ${binding.profile}\``, `\`${binding.effort}\``, why(route)];
  });
  return `# TierDecay routes (Codex)\n\nRun each task with the profile its tier maps to (profiles: \`.codex/config.toml\` from the TierDecay Codex adapter).\n\n${table(['class', 'tier', 'command', 'reasoning effort', 'why'], rows)}\n\n${FOOTER}\n`;
}

function exportAntigravity(state) {
  const rows = routes(state).map((route) => {
    const binding = BINDINGS.antigravity[route.tier];
    return [`\`${route.class}\``, route.tier, binding.mode, binding.model, why(route)];
  });
  return `# TierDecay routes (Antigravity)\n\nStart the conversation that carries the task in this agent mode, with this model class.\n\n${table(['class', 'tier', 'agent mode', 'model', 'why'], rows)}\n\n${FOOTER}\n`;
}

function exportCursor(state) {
  const rows = routes(state).map((route) => [`\`${route.class}\``, route.tier, BINDINGS.cursor[route.tier].mode, why(route)]);
  return `# TierDecay routes (Cursor)\n\nPick the Cursor model or Auto goal for the conversation that carries the task.\n\n${table(['class', 'tier', 'Cursor model / Auto goal', 'why'], rows)}\n\n${FOOTER}\n`;
}

function exportJson(state) {
  return {
    schemaVersion: 1,
    epoch: state.epoch,
    bindings: BINDINGS,
    routes: routes(state).map((route) => ({
      ...route,
      claude: BINDINGS.claude[route.tier],
      codex: BINDINGS.codex[route.tier],
      antigravity: BINDINGS.antigravity[route.tier],
      cursor: BINDINGS.cursor[route.tier],
      generic: BINDINGS.generic[route.tier]
    }))
  };
}

function skillName(entry) {
  const name = `${SKILL_PREFIX}${entry.id.toLowerCase()}-${entry.class}`;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
    throw Object.assign(new Error(`cannot derive a valid Agent Skills name for ${entry.id}`), { exitCode: 3 });
  }
  return name;
}

function oneLine(text, limit) {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= limit ? flat : `${flat.slice(0, limit - 1).trimEnd()}…`;
}

function skillDocument(entry, body) {
  const when = (body.find((line) => line.startsWith('WHEN:')) || 'WHEN: the task matches this class').slice(5).trim();
  const description = oneLine(`Repo playbook ${entry.id} for task class ${entry.class}. Use when ${when}`, 1000);
  return [
    '---',
    `name: ${skillName(entry)}`,
    `description: ${JSON.stringify(description)}`,
    'metadata:',
    `  ${GENERATED_MARKER}`,
    `  source: ${entry.id}`,
    `  class: ${entry.class}`,
    `  provenance: ${entry.provenance} ${entry.provenanceDate}`,
    '---',
    '',
    `<!-- Generated by \`tierdecay export --format skills\`. Do not edit: edit the playbook and re-export. -->`,
    '',
    ...body,
    '',
    `Report \`PLAYBOOK: ${entry.id} applied → pass|fail\` or \`PLAYBOOK: ${entry.id} stale: <why>\`.`,
    ''
  ].join('\n');
}

// Writes one Agent Skills directory per LIVE entry under `out`, and removes
// previously generated TierDecay skills that are no longer live (for example a
// newly quarantined entry). Directories it did not generate are never touched.
function exportSkills(playbook, playbookText, out) {
  if (!out) throw Object.assign(new Error('--format skills requires --out DIR'), { exitCode: 2 });
  const root = path.resolve(out);
  fs.mkdirSync(root, { recursive: true });
  const blocks = playbookBlocks(playbookText);
  const live = playbook.entries.filter((entry) => entry.status === 'live');
  const wanted = new Map(live.map((entry) => [skillName(entry), entry]));
  const written = [];
  const removed = [];
  for (const [name, entry] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const dir = path.join(root, name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'SKILL.md'), skillDocument(entry, blocks.get(entry.id) || []));
    written.push(name);
  }
  for (const name of fs.readdirSync(root).sort()) {
    if (!name.startsWith(SKILL_PREFIX) || wanted.has(name)) continue;
    const file = path.join(root, name, 'SKILL.md');
    if (!fs.existsSync(file) || !fs.readFileSync(file, 'utf8').includes(GENERATED_MARKER)) continue;
    fs.rmSync(path.join(root, name), { recursive: true, force: true });
    removed.push(name);
  }
  return { schemaVersion: 1, out: root, written, removed };
}

function exportPosterior({ ledger, playbook, playbookText, epoch, format, out }) {
  if (!FORMATS.includes(format)) throw Object.assign(new Error(`format must be one of ${FORMATS.join(', ')}`), { exitCode: 2 });
  if (format === 'skills') return { kind: 'json', value: exportSkills(playbook, playbookText, out) };
  const state = status({ ledger, playbook, epoch });
  if (format === 'json') return { kind: 'json', value: exportJson(state) };
  const render = { claude: exportClaude, codex: exportCodex, antigravity: exportAntigravity, cursor: exportCursor }[format];
  return { kind: 'text', value: render(state) };
}

module.exports = { BINDINGS, FORMATS, exportPosterior, skillName };
