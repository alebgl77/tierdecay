#!/usr/bin/env bash
# TierDecay guard — per-agent PreToolUse hook carried by executor and
# heavy-executor (see their frontmatter).
#
# SPEC §5 invariant 1 says only the orchestrator writes the learned state.
# The prompt asks executors to comply; this hook makes the tool layer refuse:
# any executor Write/Edit/Bash call whose input references `.claude/` or
# `.tierdecay/` is blocked before it runs, prompt injection or not.
#
# Hook contract (code.claude.com/docs/en/hooks): the tool-call JSON arrives
# on stdin; exit 2 blocks the call and returns stderr to the agent.

input="$(cat)"

if printf '%s' "$input" | grep -Eq '\.claude/|\.tierdecay/'; then
  {
    echo "TierDecay guard: .claude/ and .tierdecay/ are orchestrator-only (SPEC §5)."
    echo "Executors never touch routing state - put PLAYBOOK feedback in your REPORT instead."
  } >&2
  exit 2
fi
exit 0
