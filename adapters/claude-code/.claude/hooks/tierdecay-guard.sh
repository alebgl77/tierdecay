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

input="$(cat)"

# First "key":"value" occurrence for a given key (best-effort JSON scrape —
# no jq dependency on user machines).
jstr() { # jstr <key>
  printf '%s' "$input" \
    | grep -oE "\"$1\"[[:space:]]*:[[:space:]]*\"([^\"\\\\]|\\\\.)*\"" \
    | head -n 1 \
    | sed -E "s/^\"$1\"[[:space:]]*:[[:space:]]*\"//; s/\"$//" || true
}

deny() {
  {
    echo "TierDecay guard: .claude/ and .tierdecay/ are orchestrator-only (SPEC §5)."
    echo "Executors never touch routing state - put PLAYBOOK feedback in your REPORT instead."
  } >&2
  exit 2
}

tool="$(jstr tool_name)"

is_state_path() { # is_state_path <path>
  printf '%s' "$1" | grep -qE '(^|/)\.(claude|tierdecay)(/|$)'
}

case "$tool" in
  Write|Edit|MultiEdit)
    path="$(jstr file_path)"
    if [ -n "$path" ] && is_state_path "$path"; then deny; fi
    ;;
  NotebookEdit)
    path="$(jstr notebook_path)"
    if [ -n "$path" ] && is_state_path "$path"; then deny; fi
    ;;
  Bash)
    cmd="$(jstr command)"
    if printf '%s' "$cmd" | grep -qE '\.claude/|\.tierdecay/'; then deny; fi
    ;;
esac

exit 0
