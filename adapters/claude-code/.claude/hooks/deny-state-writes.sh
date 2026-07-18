#!/usr/bin/env bash
# TierDecay integrity guard — enforces SPEC §5 invariant 1
# ("only the orchestrator writes the ledger and playbook") with a real
# mechanism, not just a prompt instruction.
#
# Wired as a PreToolUse hook on Write|Edit in the `executor` and
# `heavy-executor` agent frontmatter, so it applies ONLY to those subagents —
# the main-thread orchestrator is never affected and its DISTILL writes go
# through untouched.
#
# Contract (Claude Code PreToolUse): reads the tool call as JSON on stdin;
# exit 0 = allow, exit 2 = block (stderr is shown to the model). No jq/python
# dependency — the target path is extracted with grep/sed.
set -euo pipefail

payload="$(cat)"

path="$(printf '%s' "$payload" \
  | grep -oE '"file_path"[[:space:]]*:[[:space:]]*"[^"]*"' \
  | head -n 1 \
  | sed -E 's/.*"file_path"[[:space:]]*:[[:space:]]*"([^"]*)".*/\1/' || true)"

# No path found (or a tool without one) → nothing to guard.
[ -n "$path" ] || exit 0

case "$path" in
  */.claude/*|.claude/*|*/.tierdecay/*|.tierdecay/*|*routing-ledger.md|*playbook.md|*repo-playbook/SKILL.md)
    echo "TierDecay integrity guard: executors may not write protected state ($path)." >&2
    echo "Only the orchestrator writes the ledger/playbook (SPEC §5). Report PLAYBOOK feedback instead; the main thread performs the DISTILL write." >&2
    exit 2
    ;;
esac

exit 0
