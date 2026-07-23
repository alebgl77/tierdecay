#!/usr/bin/env bash
# TierDecay installer — run from the repo you want to equip:
#   /path/to/tierdecay/install.sh [--dry-run] [--uninstall] <claude|agents|cursor|gemini|aider|cline|goose|windsurf|auto>
#   /path/to/tierdecay/install.sh --help
# Bash (not strict POSIX): uses BASH_SOURCE and arrays.
set -euo pipefail

VERSION="0.1.0"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST="$(pwd)"

DRY_RUN=0
UNINSTALL=0

say()  { printf '\033[1;32m✔\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
die()  { printf '\033[1;31m✘\033[0m %s\n' "$*" >&2; exit 1; }
plan() { printf '\033[1;36m→\033[0m would %s\n' "$*"; }

usage() {
  cat <<EOF
TierDecay installer ${VERSION}

Usage: /path/to/tierdecay/install.sh [options] [target]

Targets:  claude | agents | cursor | gemini | aider | cline | goose | windsurf | auto
          (auto reads project signals first — .claude, .cursor, .clinerules,
           .windsurf, .goosehints, GEMINI.md, CONVENTIONS.md, AGENTS.md — then
           installed CLIs; pass a target explicitly to override)

Options:
  --dry-run     print every write that WOULD happen; change nothing
  --uninstall   remove installed context files; NEVER touch learned state
                (.tierdecay/ and .claude/routing-ledger.md are preserved)
  --version     print installer version and exit
  -h, --help    this help

Run it from the repo you want to equip, not from the tierdecay checkout.
EOF
}

# --- arg parsing -----------------------------------------------------------
pos=()
for a in "$@"; do
  case "$a" in
    -h|--help)   usage; exit 0 ;;
    --version)   echo "TierDecay installer ${VERSION}"; exit 0 ;;
    --dry-run)   DRY_RUN=1 ;;
    --uninstall) UNINSTALL=1 ;;
    --) ;;
    -*) die "unknown flag '$a' (see --help)" ;;
    *)  pos+=("$a") ;;
  esac
done
set -- ${pos[@]+"${pos[@]}"}
TARGET="${1:-auto}"

[ "$SRC" = "$DEST" ] && die "run this from YOUR project, not from the tierdecay checkout"

# --- copy helpers (never clobber; dry-run aware) ---------------------------
do_cp() { # do_cp <src> <dest> [label]
  if [ "$DRY_RUN" = 1 ]; then plan "write ${3:-$2}"; return; fi
  cp "$1" "$2"; say "installed ${3:-$2}"
}

# Non-destructive single-file install: identical → skip; existing but
# different → write a *.tierdecay sidecar WITHOUT overwriting a pending one.
copy_safe() { # copy_safe <src> <dest>
  if [ ! -e "$2" ]; then do_cp "$1" "$2"; return; fi
  if cmp -s "$1" "$2"; then return; fi                      # already up to date
  local side="$2.tierdecay"
  if [ -e "$side" ] && ! cmp -s "$1" "$side"; then
    warn "$2 differs and $side already pending your merge — leaving both untouched"
    return
  fi
  if [ "$DRY_RUN" = 1 ]; then plan "write $side (for you to merge)"; return; fi
  warn "$2 exists — writing $side for you to merge"
  cp "$1" "$side"
}

# Non-destructive recursive install: applies copy_safe to every file under a
# source tree. Portable across all cp versions (no reliance on `cp -n`).
copy_tree() { # copy_tree <src_dir> <dest_dir>
  local src="$1" dst="$2" rel d
  while IFS= read -r -d '' f; do
    rel="${f#"$src"/}"
    d="$dst/$rel"
    if [ "$DRY_RUN" != 1 ]; then mkdir -p "$(dirname "$d")"; fi
    copy_safe "$f" "$d"
  done < <(find "$src" -type f -print0)
}

seed_state() {
  [ "$DRY_RUN" = 1 ] || mkdir -p "$DEST/.tierdecay"
  if [ ! -e "$DEST/.tierdecay/ledger.md" ]; then
    do_cp "$SRC/core/ledger.template.md" "$DEST/.tierdecay/ledger.md" ".tierdecay/ledger.md"
  fi
  if [ ! -e "$DEST/.tierdecay/playbook.md" ]; then
    do_cp "$SRC/core/playbook.template.md" "$DEST/.tierdecay/playbook.md" ".tierdecay/playbook.md"
  fi
  # Ship the full protocol so signature discipline + integrity invariants
  # travel with non-native adapters (they reference .tierdecay/PROTOCOL.md).
  copy_safe "$SRC/core/SPEC.md" "$DEST/.tierdecay/PROTOCOL.md"
}

detect() {
  # Project signals win over machine-global binaries.
  [ -d "$DEST/.claude" ]        && { echo claude;   return; }
  [ -d "$DEST/.cursor" ]        && { echo cursor;   return; }
  [ -d "$DEST/.clinerules" ]    && { echo cline;    return; }
  { [ -d "$DEST/.windsurf" ] || [ -d "$DEST/.devin" ]; } && { echo windsurf; return; }
  [ -f "$DEST/.goosehints" ]    && { echo goose;    return; }
  [ -f "$DEST/GEMINI.md" ]      && { echo gemini;   return; }
  [ -f "$DEST/CONVENTIONS.md" ] && { echo aider;    return; }
  [ -f "$DEST/AGENTS.md" ]      && { echo agents;   return; }
  # Fall back to machine-global CLI availability.
  command -v claude >/dev/null 2>&1 && { echo claude; return; }
  command -v gemini >/dev/null 2>&1 && { echo gemini; return; }
  command -v aider  >/dev/null 2>&1 && { echo aider;  return; }
  command -v goose  >/dev/null 2>&1 && { echo goose;  return; }
  { command -v codex >/dev/null 2>&1 || command -v opencode >/dev/null 2>&1; } && { echo agents; return; }
  echo agents # sane default: the universal standard
}

# --- uninstall (state is sacred; never removed) ----------------------------
rm_safe() { # rm_safe <path>
  [ -e "$1" ] || return 0
  if [ "$DRY_RUN" = 1 ]; then plan "remove $1"; return; fi
  rm -f "$1"; say "removed $1"
}

uninstall() {
  warn "uninstall preserves all learned state (.tierdecay/, .claude/routing-ledger.md)"
  rm_safe "$DEST/CLAUDE.md"
  rm_safe "$DEST/AGENTS.md"
  rm_safe "$DEST/GEMINI.md"
  rm_safe "$DEST/CONVENTIONS.md"
  for f in "$DEST"/*.tierdecay; do rm_safe "$f"; done
  if [ -d "$DEST/.claude" ]; then
    warn ".claude/ left in place — it may hold your routing-ledger.md; remove by hand if intended"
  fi
  say "TierDecay context files removed — state and .claude/ preserved."
  exit 0
}

[ "$UNINSTALL" = 1 ] && uninstall

[ "$TARGET" = "auto" ] && { TARGET="$(detect)"; warn "auto-detected target: $TARGET"; }
[ "$DRY_RUN" = 1 ] && warn "dry run — no files will be changed"

case "$TARGET" in
  claude)
    copy_safe "$SRC/adapters/claude-code/CLAUDE.md" "$DEST/CLAUDE.md"
    # File-by-file through copy_safe (copy_tree): existing files (ledger,
    # playbook, settings) are NEVER clobbered — a differing incoming version
    # lands as a .tierdecay sidecar to merge. Do not "simplify" this back to
    # `cp -rn || cp -r`: on coreutils >= 9.2, `cp -n` exits nonzero when it
    # skips an existing file, which used to trigger the clobbering fallback
    # and silently destroy the learned state.
    [ "$DRY_RUN" = 1 ] || mkdir -p "$DEST/.claude"
    copy_tree "$SRC/adapters/claude-code/.claude" "$DEST/.claude"
    say "installed .claude/ (agents, skills, hooks, settings, ledger — existing files preserved)"
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
  cline|goose|windsurf|cursor)
    copy_safe "$SRC/adapters/$TARGET/AGENTS.md" "$DEST/AGENTS.md"
    seed_state
    ;;
  *) die "unknown target '$TARGET' (claude|agents|cursor|gemini|aider|cline|goose|windsurf|auto)";;
esac

if [ "$DRY_RUN" = 1 ]; then
  say "dry run complete — re-run without --dry-run to apply."
else
  say "TierDecay installed — first high-tier solve starts the decay."
fi
