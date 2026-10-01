#!/usr/bin/env node
'use strict';

// Pilot-v1 harness. Every command is deterministic except the model runs
// themselves, which happen outside this script (one subagent per brief).
//
//   node harness.js validate
//       Hidden tests must FAIL on each task's baseline and PASS once its
//       reference solution is applied; the visible suite must pass on both.
//   node harness.js prepare TASK DIR
//       Isolated run directory: sandbox + reference solutions of the earlier
//       instances of the same class (a recurring class meets its own history),
//       committed as a git baseline.
//   node harness.js brief TASK DIR [PLAYBOOK_FILE]
//       Executor prompt. Identical for every arm except the optional playbook
//       entry quoted in CONTEXT (the TierDecay probe condition).
//   node harness.js grade TASK DIR
//       Visible suite + hidden acceptance tests; prints JSON.
//   node harness.js record RUN_ID DIR TRANSCRIPT DURATION_MS TOOL_USES
//       Grade, aggregate billed usage from the subagent transcript, append one
//       row to data/results.jsonl.
//   node harness.js final TRANSCRIPT
//       Print a subagent's final report verbatim (used for distilled entries).
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { REFS } = require('./reference');
const { aggregate } = require('./usage');

const HERE = __dirname;
const TASKS = JSON.parse(fs.readFileSync(path.join(HERE, 'tasks.json'), 'utf8'));

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

function task(id) {
  if (!TASKS.tasks[id]) fail(`unknown task: ${id}`);
  return TASKS.tasks[id];
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b);
  }
}

function earlier(id) {
  const ids = TASKS.classes[task(id).class];
  return ids.slice(0, ids.indexOf(id));
}

function git(dir, ...args) {
  const result = spawnSync('git', args, { cwd: dir, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
}

function prepare(id, dir) {
  if (fs.existsSync(dir)) fail(`run directory exists: ${dir}`);
  copyDir(path.join(HERE, 'sandbox'), dir);
  for (const previous of earlier(id)) REFS[previous](dir);
  git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, '-c', 'user.name=bench', '-c', 'user.email=bench@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'baseline');
}

function brief(id, dir, playbookFile) {
  const spec = task(id);
  const entry = playbookFile ? fs.readFileSync(playbookFile, 'utf8').trim() : null;
  const context = [
    `kvlite is a zero-dependency Node.js 18+ key/value CLI and library. The repository root is ${dir}.`,
    entry ? `Repo playbook entry for this task class (distilled from an earlier solution; follow it and report it in PLAYBOOK):\n\n${entry}` : null
  ].filter(Boolean).join('\n\n');
  return `You are the \`executor\` agent for one benchmark task. You implement exactly what the brief specifies — nothing more, nothing less.

Isolation rules (mandatory): work ONLY inside ${dir}. Do not read, list, search, or modify anything outside that directory (no parent directories, no sibling runs). No network access, no package installation, do not modify or delete existing tests.

Process:
1. Read the files you need before editing anything.
2. Match existing conventions — neighboring code is the style guide.
3. Implement. Keep the diff minimal and focused on the OBJECTIVE.
4. Prove it: run \`npm test\` inside ${dir}.

If the brief is ambiguous or forces a design decision, STOP and return \`BLOCKED: <what> / <why> / <options>\`.

BRIEF
OBJECTIVE:   ${spec.objective}
CONTEXT:     ${context}
FILES:       anything under ${dir} that the change requires.
CONSTRAINTS: follow the repository's existing conventions; no new dependencies; existing tests stay unmodified.
ACCEPTANCE:
${spec.acceptance.map((line) => `  - ${line}`).join('\n')}
REPORT:      (under 120 words)
  - CHANGES: one line per file
  - TESTS: command run + final pass/fail counts
  - DEVIATIONS: must be empty; otherwise justify
  - PLAYBOOK: ${entry ? '`PB applied → pass|fail` or `PB stale: <why>`' : '`no entry matched`'}
  - BLOCKERS: if any
`;
}

function runTests(dir) {
  const files = fs.readdirSync(path.join(dir, 'test')).filter((f) => f.endsWith('.test.js')).sort().map((f) => path.join('test', f));
  const result = spawnSync(process.execPath, ['--test', ...files], { cwd: dir, encoding: 'utf8' });
  const pass = Number((/^# pass (\d+)/m.exec(result.stdout) || [])[1] || 0);
  const failed = Number((/^# fail (\d+)/m.exec(result.stdout) || [])[1] || 0);
  const failing = [...result.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { ok: result.status === 0 && failed === 0, pass, fail: failed, failing };
}

function grade(id, dir) {
  task(id);
  const visible = runTests(dir);
  const hiddenFile = path.join(dir, 'test', `zz-hidden-${id}.test.js`);
  fs.copyFileSync(path.join(HERE, 'hidden', `${id}.test.js`), hiddenFile);
  let hidden;
  try { hidden = runTests(dir); } finally { fs.unlinkSync(hiddenFile); }
  let diff = '';
  let untracked = [];
  if (fs.existsSync(path.join(dir, '.git'))) {
    diff = git(dir, 'diff', '--stat', 'HEAD').trim().split('\n').pop();
    untracked = git(dir, 'ls-files', '--others', '--exclude-standard').trim().split('\n').filter(Boolean);
  }
  return { task: id, accepted: hidden.ok, visible, hidden, diff, untracked };
}

function validate() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tierdecay-pilot-'));
  const report = {};
  try {
    for (const id of Object.keys(TASKS.tasks)) {
      const before = path.join(tmp, `${id}-before`);
      prepare(id, before);
      const pre = grade(id, before);
      const after = path.join(tmp, `${id}-after`);
      prepare(id, after);
      REFS[id](after);
      const post = grade(id, after);
      report[id] = {
        baselineVisibleOk: pre.visible.ok,
        baselineAccepted: pre.accepted,
        referenceVisibleOk: post.visible.ok,
        referenceAccepted: post.accepted,
        referenceFailing: post.hidden.failing
      };
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return report;
}

function record(runId, dir, transcript, durationMs, toolUses) {
  const [id, arm, rep] = runId.split('-');
  const graded = grade(id, path.resolve(dir));
  const row = {
    run: runId, task: id, arm, rep,
    accepted: graded.accepted, failing: graded.hidden.failing, visibleOk: graded.visible.ok,
    diff: graded.diff, untracked: graded.untracked,
    durationMs: Number(durationMs), toolUses: Number(toolUses),
    usage: aggregate(transcript)
  };
  fs.appendFileSync(path.join(HERE, 'data', 'results.jsonl'), `${JSON.stringify(row)}\n`);
  return { run: runId, accepted: row.accepted, failing: row.failing, usd: row.usage.usd, usdWarm: row.usage.usdWarm };
}

function finalReport(transcript) {
  let text = null;
  let handback = null;
  for (const line of fs.readFileSync(transcript, 'utf8').split('\n')) {
    if (!line) continue;
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event.type !== 'assistant' || !event.message) continue;
    for (const block of event.message.content || []) {
      if (block.type === 'text' && block.text.trim()) text = block.text;
      if (block.type === 'tool_use' && /handback/i.test(block.name)) {
        const input = block.input || {};
        handback = input.report ?? input.message ?? input.content ?? input.text ?? JSON.stringify(input);
      }
    }
  }
  return `${String(handback ?? text ?? '').trim()}\n`;
}

if (require.main === module) {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'validate') {
    const report = validate();
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    const ok = Object.values(report).every((r) => r.baselineVisibleOk && !r.baselineAccepted && r.referenceVisibleOk && r.referenceAccepted);
    process.exitCode = ok ? 0 : 1;
  } else if (command === 'prepare' && args.length === 2) {
    prepare(args[0], path.resolve(args[1]));
    process.stdout.write(`${path.resolve(args[1])}\n`);
  } else if (command === 'brief' && (args.length === 2 || args.length === 3)) {
    process.stdout.write(brief(args[0], path.resolve(args[1]), args[2]));
  } else if (command === 'grade' && args.length === 2) {
    process.stdout.write(`${JSON.stringify(grade(args[0], path.resolve(args[1])))}\n`);
  } else if (command === 'record' && args.length === 5) {
    process.stdout.write(`${JSON.stringify(record(...args))}\n`);
  } else if (command === 'final' && args.length === 1) {
    process.stdout.write(finalReport(args[0]));
  } else {
    fail('usage: harness.js validate | prepare TASK DIR | brief TASK DIR [PLAYBOOK] | grade TASK DIR | record RUN DIR TRANSCRIPT MS TOOLS | final TRANSCRIPT');
  }
}

module.exports = { prepare, brief, grade, validate };
