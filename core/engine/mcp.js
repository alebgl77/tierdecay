'use strict';

// TierDecay MCP server: the same deterministic logic for every MCP client
// (Claude Code, Codex, Antigravity, Cursor, Gemini CLI, ...). Zero
// dependencies: newline-delimited JSON-RPC 2.0 over stdio.
//
// Read-only by default. The single write tool, `tierdecay_record`, exists only
// when the server is started with --allow-ledger-append, because MCP tools are
// visible to every agent in a client session — including executors that the
// protocol forbids from writing state (SPEC §5.1). Start it that way only for
// the orchestrator's own session.
const readline = require('node:readline');
const { route, rubricTier } = require('./route');
const { status } = require('./status');
const { exportPosterior, FORMATS } = require('./export');
const { doctor } = require('./doctor');
const { appendObservation, validateObservation } = require('./observation');
const { playbookBlocks } = require('./markdown');
const { entryDecay } = require('./decay');
const { serialized } = require('./canonical');
const { statePaths, loadState, loadConfig } = require('./workspace');

const SERVER = { name: 'tierdecay', version: require('./version').VERSION };
// Both protocol eras, newest first. 2026-07-28 is stateless: no initialize
// handshake; every request carries its version in params._meta, results carry
// resultType, and servers must answer server/discover. The older versions use
// the initialize handshake (Codex, for one, still sends 2025-06-18).
const MODERN_VERSION = '2026-07-28';
const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05'];
const PROTOCOL_VERSIONS = [MODERN_VERSION, ...LEGACY_VERSIONS];
const META_VERSION = 'io.modelcontextprotocol/protocolVersion';
const UNSUPPORTED_PROTOCOL_VERSION = -32022;
const TOOLS_TTL_MS = 3600000;

const INSTRUCTIONS = [
  'TierDecay routes recurring coding-task classes to the cheapest tier that has earned them in this repository.',
  'Before dispatching a task: call tierdecay_playbook with its class signature (verb-object-surface); quote a live entry verbatim in the brief.',
  'Call tierdecay_route for the decision (tier, action, reason); obey refusal/recertify/safety actions.',
  'After the task: record one ledger row (tierdecay_record when enabled, otherwise the Markdown ledger) and run tierdecay_status for owed bookkeeping.',
  'Tiers are roles: T3 frontier planning/review, T2 heavy execution, T1 standard execution, T0 read-only recon.'
].join(' ');

const RUBRIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['ambiguity', 'reasoning', 'blastRadius', 'riskSurface'],
  properties: {
    ambiguity: { type: 'integer', minimum: 0, maximum: 2 },
    reasoning: { type: 'integer', minimum: 0, maximum: 3 },
    blastRadius: { type: 'integer', minimum: 0, maximum: 2 },
    riskSurface: { type: 'integer', minimum: 0, maximum: 3 }
  }
};

const REQUEST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['class', 'risk', 'critical', 'recurring', 'horizon', 'epoch', 'rubric'],
  properties: {
    class: { type: 'string', description: 'Exact 2-4 token class signature, verb-object-surface.' },
    risk: { type: 'integer', minimum: 0, maximum: 3, description: 'Must equal rubric.riskSurface.' },
    critical: { type: 'boolean' },
    recurring: { type: 'boolean' },
    horizon: { type: 'integer', minimum: 1, description: 'Expected occurrences of this class including this one.' },
    epoch: { type: 'string', description: 'Current model/effort binding epoch.' },
    playbook: { type: 'string', pattern: '^PB-[1-9][0-9]*$', description: 'The entry quoted in the brief, if any.' },
    rubric: RUBRIC_SCHEMA
  }
};

const TOOLS = [
  {
    name: 'tierdecay_route',
    title: 'Route a task',
    description: 'Deterministic routing decision for one task: effective tier, action (route/probe/exploit/recertify/refusal/safety/promotion), and reason. Uses the repo ledger and playbook; policy defaults to shadow when a router config exists, else legacy.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['request'],
      properties: { request: REQUEST_SCHEMA, policy: { type: 'string', enum: ['legacy', 'shadow', 'optimize'] } }
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'tierdecay_rubric',
    title: 'Score the cold-start rubric',
    description: 'Score the four-axis rubric for a class with no playbook entry or PRIORS row: 0-3 → T1, 4-6 → T2, ≥7 or any axis maxed → T3.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['rubric'], properties: { rubric: RUBRIC_SCHEMA } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'tierdecay_playbook',
    title: 'Look up a class playbook entry',
    description: 'Return the live playbook entry for a class (verbatim text to quote in a brief) with its decay status, or report that the class is quarantined or has no entry.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['class'],
      properties: { class: { type: 'string' }, epoch: { type: 'string' } }
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'tierdecay_status',
    title: 'Posterior status',
    description: 'Per-class default route, hits against the risk-gated requirement (3/4/5 for risk 0/1/2), and the bookkeeping the orchestrator owes (decay, recertification, PRIORS).',
    inputSchema: { type: 'object', additionalProperties: false, properties: { epoch: { type: 'string' } } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'tierdecay_export',
    title: 'Export routes for a native router',
    description: 'Routing table for a target tool: claude (agent, alias, effort), codex (profile, effort), antigravity (mode, model class), cursor (model or Auto goal), or json.',
    inputSchema: {
      type: 'object', additionalProperties: false, required: ['format'],
      properties: { format: { type: 'string', enum: FORMATS.filter((format) => format !== 'skills') }, epoch: { type: 'string' } }
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'tierdecay_doctor',
    title: 'Health check',
    description: 'Read-only health check of the repo installation: state files, playbook cap, permissions, config, guard, owed bookkeeping.',
    inputSchema: { type: 'object', additionalProperties: false, properties: { epoch: { type: 'string' } } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  },
  {
    name: 'tierdecay_validate_observation',
    title: 'Validate a ledger row',
    description: 'Validate one measured observation and return the canonical Markdown ledger row. Does not write.',
    inputSchema: { type: 'object', additionalProperties: false, required: ['observation'], properties: { observation: { type: 'object' } } },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false }
  }
];

const RECORD_TOOL = {
  name: 'tierdecay_record',
  title: 'Append a ledger row (orchestrator only)',
  description: 'Validate one measured observation and append it to the measured ledger atomically under a lock. Orchestrator-only: executors must never call this.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['observation'], properties: { observation: { type: 'object' } } },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false }
};

function textResult(value) {
  if (typeof value === 'string') return { content: [{ type: 'text', text: value }] };
  const structured = serialized(value);
  return { content: [{ type: 'text', text: JSON.stringify(structured, null, 2) }], structuredContent: structured };
}

function errorResult(error) {
  return { content: [{ type: 'text', text: `${error.name || 'Error'}: ${error.message}` }], isError: true };
}

function createServer({ root, overrides = {}, allowAppend = false } = {}) {
  const tools = allowAppend ? [...TOOLS, RECORD_TOOL] : TOOLS;
  const paths = () => statePaths(root, overrides);

  const handlers = {
    tierdecay_route({ request, policy }) {
      const where = paths();
      const state = loadState(where);
      const config = loadConfig(where);
      const chosen = policy || (config ? 'shadow' : 'legacy');
      return route({ request, ledger: state.ledger, playbook: state.playbook, config: chosen === 'legacy' ? null : config, policy: chosen });
    },
    tierdecay_rubric({ rubric }) {
      return rubricTier(rubric);
    },
    tierdecay_playbook({ class: taskClass, epoch }) {
      const state = loadState(paths());
      const entries = state.playbook.entries.filter((entry) => entry.class === taskClass);
      const live = entries.find((entry) => entry.status === 'live');
      const quarantined = entries.find((entry) => entry.status === 'quarantined');
      if (quarantined) return { class: taskClass, status: 'quarantined', id: quarantined.id, guidance: 'Never apply a quarantined entry; route by the rubric at or above its floor and revise the entry.' };
      if (!live) return { class: taskClass, status: 'none', guidance: 'No entry: route by PRIORS or the rubric.' };
      const body = playbookBlocks(state.playbookText).get(live.id) || [];
      return {
        class: taskClass, status: 'live', id: live.id, provenance: live.provenance, floor: live.floor || null,
        decay: entryDecay(live, epoch), quote: [`### ${live.id} · ${live.class}`, ...body].join('\n')
      };
    },
    tierdecay_status({ epoch }) {
      const state = loadState(paths());
      return status({ ledger: state.ledger, playbook: state.playbook, epoch });
    },
    tierdecay_export({ format, epoch }) {
      if (format === 'skills') throw Object.assign(new Error('skills export writes files; use the CLI'), { exitCode: 2 });
      const state = loadState(paths());
      return exportPosterior({ ledger: state.ledger, playbook: state.playbook, playbookText: state.playbookText, epoch, format }).value;
    },
    tierdecay_doctor({ epoch }) {
      return doctor({ root, overrides, epoch });
    },
    tierdecay_validate_observation({ observation }) {
      return { row: validateObservation(observation) };
    },
    tierdecay_record({ observation }) {
      if (!allowAppend) throw new Error('ledger append is disabled for this server');
      return appendObservation(paths().ledger, observation);
    }
  };

  function fail(id, code, message, data) {
    return { jsonrpc: '2.0', id, error: data === undefined ? { code, message } : { code, message, data } };
  }

  // Returns the response object for a request, or null for a notification.
  function handle(message) {
    if (!message || typeof message !== 'object' || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
      return fail(message && message.id !== undefined ? message.id : null, -32600, 'Invalid Request');
    }
    const { id, method } = message;
    const params = message.params && typeof message.params === 'object' ? message.params : {};
    const notification = id === undefined;
    if (notification) return null;
    // Modern (stateless) requests declare their version in _meta.
    const meta = params._meta && typeof params._meta === 'object' ? params._meta : {};
    const declared = meta[META_VERSION];
    if (declared !== undefined && !PROTOCOL_VERSIONS.includes(declared)) {
      return fail(id, UNSUPPORTED_PROTOCOL_VERSION, 'Unsupported protocol version', { supported: PROTOCOL_VERSIONS, requested: declared });
    }
    const modern = declared === MODERN_VERSION;
    const respond = (requestId, result, cache) => ({
      jsonrpc: '2.0',
      id: requestId,
      result: modern ? { resultType: 'complete', ...result, ...(cache || {}) } : result
    });
    switch (method) {
      case 'initialize': {
        const requested = params.protocolVersion;
        return respond(id, {
          protocolVersion: LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER.name, title: 'TierDecay', version: SERVER.version },
          instructions: INSTRUCTIONS
        });
      }
      case 'server/discover':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            resultType: 'complete',
            supportedVersions: PROTOCOL_VERSIONS,
            capabilities: { tools: {} },
            instructions: INSTRUCTIONS,
            _meta: { 'io.modelcontextprotocol/serverInfo': { name: SERVER.name, title: 'TierDecay', version: SERVER.version } },
            ttlMs: TOOLS_TTL_MS,
            cacheScope: 'private'
          }
        };
      case 'ping':
        return respond(id, {});
      case 'tools/list':
        return respond(id, { tools }, { ttlMs: TOOLS_TTL_MS, cacheScope: 'private' });
      case 'tools/call': {
        const name = params && params.name;
        const tool = tools.find((candidate) => candidate.name === name);
        if (!tool) return fail(id, -32602, `Unknown tool: ${name}`);
        const args = params.arguments && typeof params.arguments === 'object' ? params.arguments : {};
        try {
          return respond(id, textResult(handlers[name](args)));
        } catch (error) {
          return respond(id, errorResult(error));
        }
      }
      default:
        return fail(id, -32601, `Method not found: ${method}`);
    }
  }

  return { handle, tools };
}

function serve({ root, overrides, allowAppend, input = process.stdin, output = process.stdout } = {}) {
  const server = createServer({ root, overrides, allowAppend });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  lines.on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (_) {
      output.write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } })}\n`);
      return;
    }
    const batch = Array.isArray(message) ? message : [message];
    const replies = batch.map((item) => server.handle(item)).filter(Boolean);
    if (replies.length) output.write(`${JSON.stringify(Array.isArray(message) ? replies : replies[0])}\n`);
  });
  return new Promise((resolve) => lines.on('close', resolve));
}

module.exports = { createServer, serve, PROTOCOL_VERSIONS, LEGACY_VERSIONS, MODERN_VERSION, TOOLS, RECORD_TOOL };
