#!/usr/bin/env bash
# TierDecay guard — per-agent PreToolUse hook carried by executor and
# heavy-executor (see their frontmatter).
#
# SPEC §5 invariant 1 says only the orchestrator writes the learned state.
# The prompt asks executors to comply; this hook makes the tool layer refuse.
#
# Precision matters both ways:
#   - File tools (Write/Edit/MultiEdit/NotebookEdit) are judged by their
#     TARGET PATH only. Judging the whole payload would block legitimate
#     work whose *content* merely mentions the state paths — e.g. adding
#     `.tierdecay/` to .gitignore (the exact choice SECURITY.md recommends)
#     or documenting the protocol in a README.
#   - Bash is judged by its command string: an executor shell command that
#     references the state paths at all is suspect — blocking reads too is
#     an acceptable loss for executors (state reaches them through the
#     playbook preload and the brief, not through ad-hoc shell access).
#
# Hook contract (code.claude.com/docs/en/hooks): the tool-call JSON arrives
# on stdin; exit 2 blocks the call and returns stderr to the agent.
set -euo pipefail

deny_no_node() {
  {
    echo "TierDecay guard: .claude/ and .tierdecay/ are orchestrator-only (SPEC §5)."
    echo "Executors never touch routing state - put PLAYBOOK feedback in your REPORT instead."
  } >&2
  exit 2
}

if ! command -v node >/dev/null 2>&1; then
  deny_no_node
fi

# This adapter requires Node (documented in its README). Parsing here avoids
# treating JSON escape sequences as inert text and keeps path checks portable.
exec node -e '
const path = require("path");
const fs = require("fs");

const stateDirectories = new Set([".claude", ".tierdecay"]);
const maxPathLength = 32768;
const maxPathComponents = 256;
const mutationPaths = new Map([
  ["Write", "file_path"],
  ["Edit", "file_path"],
  ["MultiEdit", "file_path"],
  ["NotebookEdit", "notebook_path"],
]);

function deny() {
  process.stderr.write(
    "TierDecay guard: .claude/ and .tierdecay/ are orchestrator-only (SPEC §5).\n" +
    "Executors never touch routing state - put PLAYBOOK feedback in your REPORT instead.\n"
  );
  process.exit(2);
}

function hasStateSegment(value) {
  const portable = value.replace(/\\/g, "/");
  const normalized = path.posix.normalize(portable).toLowerCase();
  const segments = normalized.split("/");

  return segments.some((segment) => {
    // Windows ignores trailing spaces and dots in ordinary path segments.
    const windowsSegment = segment.replace(/[ .]+$/g, "");
    return stateDirectories.has(segment) || stateDirectories.has(windowsSegment);
  });
}

function rawJoin(base, child) {
  return base + (base.endsWith(path.sep) ? "" : path.sep) + child;
}

function rejectAmbiguousWindowsPath(value) {
  if (process.platform !== "win32") return;
  if (/^[A-Za-z]:[^\\/]/.test(value)) throw new Error("drive-relative path");
  if (/^[\\/](?![\\/])/.test(value)) throw new Error("root-relative path");
  if (/^\\\\[?.]\\/.test(value)) throw new Error("device namespace path");
}

// Preserve the raw component order until the filesystem has resolved every
// existing prefix. In particular, resolving `alias/..` lexically first would
// miss that `alias` may point inside an orchestrator-only directory.
function canonicalize(value, projectRoot) {
  if (typeof value !== "string" || value.length === 0 ||
      value.length > maxPathLength || value.includes("\0")) {
    throw new Error("unsafe path");
  }
  rejectAmbiguousWindowsPath(value);

  let candidate = path.isAbsolute(value) ? value : rawJoin(projectRoot, value);
  const missingSegments = [];

  for (let count = 0; count <= maxPathComponents; count += 1) {
    try {
      const existing = fs.realpathSync.native(candidate);
      return path.normalize(path.join(existing, ...missingSegments));
    } catch (error) {
      if (!error || (error.code !== "ENOENT" && error.code !== "ENOTDIR")) throw error;

      const parent = path.dirname(candidate);
      if (parent === candidate) throw new Error("no existing ancestor");
      missingSegments.unshift(path.basename(candidate));
      candidate = parent;
    }
  }
  throw new Error("path depth exceeded");
}

function comparisonPath(value) {
  const normalized = path.normalize(value);
  if (process.platform !== "win32") return normalized;

  const root = path.parse(normalized).root.toLowerCase();
  const rest = normalized.slice(path.parse(normalized).root.length)
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((segment) => segment.replace(/[ .]+$/g, "").toLowerCase());
  return root + rest.join(path.sep);
}

function isWithin(candidate, root) {
  const checkedCandidate = comparisonPath(candidate);
  const checkedRoot = comparisonPath(root);
  return checkedCandidate === checkedRoot ||
    checkedCandidate.startsWith(checkedRoot + path.sep);
}

function isStatePath(value) {
  if (hasStateSegment(value)) return true;

  try {
    const projectRoot = process.env.CLAUDE_PROJECT_DIR || process.cwd();
    const canonicalPath = canonicalize(value, projectRoot);
    return [".claude", ".tierdecay"].some((directory) => {
      const stateRoot = canonicalize(rawJoin(projectRoot, directory), projectRoot);
      return isWithin(canonicalPath, stateRoot);
    });
  } catch (_) {
    // Mutation-path ambiguity must fail closed.
    return true;
  }
}

let payload;
try {
  payload = JSON.parse(fs.readFileSync(0, "utf8"));
} catch (_) {
  deny();
}

if (!payload || typeof payload !== "object" || Array.isArray(payload)) deny();

const tool = payload.tool_name;
const toolInput = payload.tool_input && typeof payload.tool_input === "object"
  ? payload.tool_input
  : payload;

if (mutationPaths.has(tool)) {
  const target = toolInput[mutationPaths.get(tool)];
  if (typeof target !== "string" || target.length === 0 || isStatePath(target)) deny();
}

if (tool === "Bash") {
  const command = toolInput.command;
  if (typeof command !== "string" || command.length === 0) deny();

  // Bash references are deliberately stricter than file-tool targets: any
  // observable state-directory identifier is suspect, including assignments
  // such as `d=.tierdecay; cat "$d/playbook.md"`. Dynamically assembled names
  // with no observable state literal remain subject to orchestrator VERIFY.
  const stateReference = /(^|[^A-Za-z0-9_.-])\.(?:claude|tierdecay)(?=$|[\\/]|[^A-Za-z0-9_.-])/i;
  if (stateReference.test(command)) deny();
}
'
