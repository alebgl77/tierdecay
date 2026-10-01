#!/usr/bin/env bash
# TierDecay plugin — SessionStart hook. Plain stdout is added to the session
# context. Projects that opted in (state seeded by /tierdecay:init) get the
# orchestrator protocol; other projects get one line and nothing else.
set -euo pipefail

root="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
project="${CLAUDE_PROJECT_DIR:-$PWD}"

if [ -f "$project/.claude/routing-ledger.md" ]; then
  cat "$root/ORCHESTRATOR.md"
  cat <<'EOF'

TierDecay plugin: the subagents are tierdecay:scout, tierdecay:executor,
tierdecay:heavy-executor, and tierdecay:oracle. Run `tierdecay status` to list
decays, recertifications, and missing PRIORS.
EOF
else
  echo "TierDecay plugin is installed; this project is not opted in. Run /tierdecay:init to seed its routing state."
fi
