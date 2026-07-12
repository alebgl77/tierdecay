#!/usr/bin/env bash
# TierDecay installer — run from the repo you want to equip:
#   /path/to/tierdecay/install.sh <claude|agents|gemini|aider|cline|goose|windsurf|auto>
set -euo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$(pwd)"
TARGET="${1:-auto}"

say()  { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✘\033[0m %s\n' "$*" >&2; exit 1; }

[ "$SRC" = "$DEST" ] && die "run this from YOUR project, not from the tierdecay checkout"

copy_safe() { # copy_safe <src> <dest>
  if [ -e "$2" ]; then
    warn "$2 exists — writing $2.tierdecay for you to merge"
    cp "$1" "$2.tierdecay"
  else
    cp "$1" "$2"; say "installed $2"
  fi
}

seed_state() {
  mkdir -p "$DEST/.tierdecay"
  [ -e "$DEST/.tierdecay/ledger.md" ]   || { cp "$SRC/core/ledger.template.md"   "$DEST/.tierdecay/ledger.md";   say "seeded .tierdecay/ledger.md"; }
  [ -e "$DEST/.tierdecay/playbook.md" ] || { cp "$SRC/core/playbook.template.md" "$DEST/.tierdecay/playbook.md"; say "seeded .tierdecay/playbook.md"; }
}

detect() {
  command -v claude >/dev/null 2>&1 || [ -d "$DEST/.claude" ] && { echo claude; return; }
  command -v codex  >/dev/null 2>&1 || [ -d "$DEST/.cursor" ] || command -v opencode >/dev/null 2>&1 && { echo agents; return; }
  command -v gemini >/dev/null 2>&1 && { echo gemini; return; }
  command -v aider  >/dev/null 2>&1 && { echo aider; return; }
  echo agents # sane default: the universal standard
}

[ "$TARGET" = "auto" ] && { TARGET="$(detect)"; warn "auto-detected target: $TARGET"; }

case "$TARGET" in
  claude)
    copy_safe "$SRC/adapters/claude-code/CLAUDE.md" "$DEST/CLAUDE.md"
    mkdir -p "$DEST/.claude"
    cp -rn "$SRC/adapters/claude-code/.claude/." "$DEST/.claude/" 2>/dev/null || \
      cp -r "$SRC/adapters/claude-code/.claude/." "$DEST/.claude/"
    say "installed .claude/ (agents, skills, settings, ledger)"
    ;;
  agents)
    copy_safe "$SRC/adapters/agents-md/AGENTS.md" "$DEST/AGENTS.md"
    seed_state
    ;;
  gemini)
    copy_safe "$SRC/adapters/gemini-cli/GEMINI.md" "$DEST/GEMINI.md"
    seed_state
    ;;
  aider)
    copy_safe "$SRC/adapters/aider/CONVENTIONS.md" "$DEST/CONVENTIONS.md"
    seed_state
    printf '\nrun:\n  aider --architect --model <frontier> --editor-model <cheap> --read CONVENTIONS.md\n'
    ;;
  cline|goose|windsurf)
    copy_safe "$SRC/adapters/$TARGET/AGENTS.md" "$DEST/AGENTS.md"
    seed_state
    ;;
  *) die "unknown target '$TARGET' (claude|agents|gemini|aider|cline|goose|windsurf|auto)";;
esac

say "TierDecay installed — first high-tier solve starts the decay."
