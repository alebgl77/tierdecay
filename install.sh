#!/usr/bin/env bash
# TierDecay installer — run from the repo you want to equip:
#   /path/to/tierdecay/install.sh [--dry-run] [--uninstall] <claude|agents|cursor|gemini|aider|cline|goose|windsurf|auto>
#   /path/to/tierdecay/install.sh --help
# Bash (not strict POSIX): uses BASH_SOURCE and arrays.
set -euo pipefail

VERSION="0.2.1"
SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
DEST="$(pwd -P)"

DRY_RUN=0
UNINSTALL=0
MANIFEST_REL=".tierdecay/install-manifest.tsv"
MANIFEST="$DEST/$MANIFEST_REL"
MANIFEST_HEADER="# tierdecay install manifest v1"
LOCK_DIR="$DEST/.tierdecay/install.lock"
LOCK_HELD=0
STAGE_SEQ=0
QUARANTINE_SEQ=0
LOCK_FILES=()
ACTIVE_ORIGINAL=""
ACTIVE_QUARANTINED=""

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
[ "$#" -le 1 ] || die "expected at most one target (see --help)"

[ "$SRC" = "$DEST" ] && die "run this from YOUR project, not from the tierdecay checkout"

# --- ownership manifest ----------------------------------------------------
valid_rel_path() { # valid_rel_path <relative-path>
  local backslash=$'\\'
  [ -n "$1" ] || return 1
  case "$1" in *"$backslash"*) return 1 ;; esac
  case "$1" in
    /*|.|..|../*|*/..|*/../*|*$'\t'*|*$'\r'*|*$'\n'*) return 1 ;;
  esac
}

valid_target() {
  case "$1" in
    claude|agents|cursor|gemini|aider|cline|goose|windsurf) return 0 ;;
    *) return 1 ;;
  esac
}

assert_safe_destination() { # assert_safe_destination <absolute-path>
  local path="$1" rel parent current part physical previous
  local parts=()
  case "$path" in
    "$DEST"/*) rel="${path#"$DEST"/}" ;;
    *) die "refusing destination outside project: $path" ;;
  esac
  valid_rel_path "$rel" || die "refusing unsafe destination: $path"
  parent="${rel%/*}"
  [ "$parent" != "$rel" ] || return 0
  current="$DEST"
  IFS=/ read -r -a parts <<< "$parent"
  for part in "${parts[@]}"; do
    current="$current/$part"
    [ ! -L "$current" ] || die "refusing symlinked destination parent: $current"
    if [ -e "$current" ]; then
      [ -d "$current" ] || die "destination parent is not a directory: $current"
      previous="$PWD"
      cd -P "$current" || die "cannot resolve destination parent: $current"
      physical="$PWD"
      cd "$previous" || die "cannot restore working directory after resolving $current"
      case "$physical" in
        "$DEST"|"$DEST"/*) ;;
        *) die "resolved destination escapes project: $current" ;;
      esac
    fi
  done
}

release_lock() {
  local staged
  [ "$LOCK_HELD" = 1 ] || return 0
  for staged in ${LOCK_FILES[@]+"${LOCK_FILES[@]}"}; do
    if [ -e "$staged" ] || [ -L "$staged" ]; then rm -f "$staged" 2>/dev/null || true; fi
  done
  if ! rmdir "$LOCK_DIR" 2>/dev/null; then
    warn "could not remove installer lock $LOCK_DIR; remove it after checking for recovery files"
  fi
  LOCK_HELD=0
}

cleanup() {
  local status="$1"
  trap - EXIT HUP INT TERM
  resolve_active_quarantine || true
  release_lock
  exit "$status"
}

acquire_lock() {
  [ "$DRY_RUN" = 1 ] && return
  local attempts=0
  assert_safe_destination "$LOCK_DIR"
  mkdir -p "$DEST/.tierdecay"
  assert_safe_destination "$LOCK_DIR"
  while ! mkdir "$LOCK_DIR" 2>/dev/null; do
    [ ! -L "$LOCK_DIR" ] || die "refusing symlinked installer lock: $LOCK_DIR"
    attempts=$((attempts + 1))
    [ "$attempts" -lt 300 ] || die "another TierDecay operation holds $LOCK_DIR"
    sleep 0.1
    assert_safe_destination "$LOCK_DIR"
  done
  LOCK_HELD=1
  trap 'cleanup $?' EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM
}

new_lock_stage() { # sets STAGED to a unique path under the held lock
  [ "$LOCK_HELD" = 1 ] || die "internal error: manifest mutation without installer lock"
  STAGE_SEQ=$((STAGE_SEQ + 1))
  STAGED="$LOCK_DIR/stage-$STAGE_SEQ"
  if [ -e "$STAGED" ] || [ -L "$STAGED" ]; then
    die "unexpected installer staging collision: $STAGED"
  fi
  LOCK_FILES+=("$STAGED")
}

parse_manifest_line() { # sets MF_OWNER, MF_DEST, MF_SOURCE
  local line="$1" rest
  case "$line" in *$'\t'*) ;; *) return 1 ;; esac
  MF_OWNER="${line%%$'\t'*}"
  rest="${line#*$'\t'}"
  case "$rest" in *$'\t'*) ;; *) return 1 ;; esac
  MF_DEST="${rest%%$'\t'*}"
  MF_SOURCE="${rest#*$'\t'}"
  case "$MF_SOURCE" in *$'\t'*) return 1 ;; esac
  valid_target "$MF_OWNER" && valid_rel_path "$MF_DEST" && valid_rel_path "$MF_SOURCE"
}

is_preserved_state() { # is_preserved_state <relative-path>
  case "$1" in
    .tierdecay/*|.claude/routing-ledger.md|.claude/routing-ledger.md.tierdecay|.claude/skills/repo-playbook/SKILL.md|.claude/skills/repo-playbook/SKILL.md.tierdecay) return 0 ;;
    *) return 1 ;;
  esac
}

canonical_regular_source() { # canonical_regular_source <source-rel>
  local source="$SRC/$1" directory basename physical
  [ -f "$source" ] && [ ! -L "$source" ] || return 1
  directory="${source%/*}"
  basename="${source##*/}"
  physical="$(cd -P "$directory" 2>/dev/null && printf '%s/%s\n' "$PWD" "$basename")" || return 1
  [ "$physical" = "$source" ] || return 1
  case "$physical" in "$SRC"/*) return 0 ;; *) return 1 ;; esac
}

# An authorized source may have been retired in a newer distribution. Check
# every existing component without following links, then resolve the deepest
# existing parent; only genuine absence is allowed, never an unsafe path.
safe_source_path() { # safe_source_path <source-rel>
  local rel="$1" source="$SRC/$1" current="$SRC" next part physical
  local parts=()
  valid_rel_path "$rel" || return 1
  case "$rel" in ./*|*/./*|*/.|*//*|*/) return 1 ;; esac
  [ -d "$SRC" ] && [ ! -L "$SRC" ] || return 1
  IFS=/ read -r -a parts <<< "$rel"
  for part in "${parts[@]}"; do
    next="$current/$part"
    [ ! -L "$next" ] || return 1
    [ -e "$next" ] || break
    if [ "$next" = "$source" ]; then
      [ -f "$next" ] || return 1
      break
    fi
    [ -d "$next" ] || return 1
    current="$next"
  done
  physical="$(cd -P "$current" 2>/dev/null && printf '%s\n' "$PWD")" || return 1
  [ "$physical" = "$current" ]
}

manifest_mapping_allowed() { # manifest_mapping_allowed <owner> <dest-rel> <source-rel>
  local owner="$1" dest="$2" source="$3" expected=""
  is_preserved_state "$dest" && return 1
  case "$owner:$source" in
    agents:adapters/agents-md/AGENTS.md) expected="AGENTS.md" ;;
    gemini:adapters/gemini-cli/GEMINI.md) expected="GEMINI.md" ;;
    aider:adapters/aider/CONVENTIONS.md) expected="CONVENTIONS.md" ;;
    cline:adapters/cline/AGENTS.md|goose:adapters/goose/AGENTS.md|windsurf:adapters/windsurf/AGENTS.md|cursor:adapters/cursor/AGENTS.md)
      expected="AGENTS.md"
      ;;
    claude:adapters/claude-code/CLAUDE.md) expected="CLAUDE.md" ;;
    # Explicit current/historical managed files (v0.2.0 onward). Retain an
    # entry when retiring its source so old manifests remain usable. Learned
    # routing/playbook state is deliberately not part of this allowlist.
    claude:adapters/claude-code/.claude/agents/executor.md|\
    claude:adapters/claude-code/.claude/agents/heavy-executor.md|\
    claude:adapters/claude-code/.claude/agents/oracle.md|\
    claude:adapters/claude-code/.claude/agents/scout.md|\
    claude:adapters/claude-code/.claude/hooks/tierdecay-guard.sh|\
    claude:adapters/claude-code/.claude/settings.json|\
    claude:adapters/claude-code/.claude/skills/execution-standards/SKILL.md|\
    claude:adapters/claude-code/.claude/skills/model-routing/SKILL.md|\
    claude:adapters/claude-code/.claude/skills/tier-decay/SKILL.md)
      expected="${source#adapters/claude-code/}"
      ;;
    *) return 1 ;;
  esac
  [ "$dest" = "$expected" ] || [ "$dest" = "$expected.tierdecay" ]
}

validate_manifest() {
  local line first=1 line_number=0
  [ ! -L "$DEST/.tierdecay" ] || die "state directory is symlinked — leaving all files untouched"
  if [ ! -f "$MANIFEST" ] || [ -L "$MANIFEST" ]; then
    die "ownership manifest is missing or symlinked — leaving all files untouched"
  fi
  while IFS= read -r line || [ -n "$line" ]; do
    line_number=$((line_number + 1))
    if [ "$first" = 1 ]; then
      [ "$line" = "$MANIFEST_HEADER" ] || die "ownership manifest is corrupted at line 1 — leaving all files untouched"
      first=0
      continue
    fi
    parse_manifest_line "$line" || die "ownership manifest is corrupted at line $line_number — leaving all files untouched"
    assert_safe_destination "$DEST/$MF_DEST"
    manifest_mapping_allowed "$MF_OWNER" "$MF_DEST" "$MF_SOURCE" \
      || die "ownership manifest has an unauthorized mapping at line $line_number — leaving all files untouched"
    safe_source_path "$MF_SOURCE" \
      || die "ownership manifest has an unsafe source at line $line_number — leaving all files untouched"
  done < "$MANIFEST"
  [ "$first" = 0 ] || die "ownership manifest is empty — leaving all files untouched"
}

prepare_manifest() {
  [ "$DRY_RUN" = 1 ] && return
  assert_safe_destination "$MANIFEST"
  if [ -e "$MANIFEST" ]; then
    validate_manifest
    return
  fi
  new_lock_stage
  printf '%s\n' "$MANIFEST_HEADER" > "$STAGED"
  assert_safe_destination "$MANIFEST"
  if ln "$STAGED" "$MANIFEST" 2>/dev/null; then
    rm -f "$STAGED"
    return
  fi
  rm -f "$STAGED"
  validate_manifest
}

manifest_record() { # manifest_record <source> <destination>
  [ "$DRY_RUN" = 1 ] && return
  local src_rel dest_rel line
  case "$1" in "$SRC"/*) src_rel="${1#"$SRC"/}" ;; *) die "source is outside TierDecay checkout: $1" ;; esac
  case "$2" in "$DEST"/*) dest_rel="${2#"$DEST"/}" ;; *) die "destination is outside project: $2" ;; esac
  if ! valid_rel_path "$src_rel" || ! valid_rel_path "$dest_rel"; then
    die "refusing unsafe manifest path"
  fi
  is_preserved_state "$dest_rel" && return
  manifest_mapping_allowed "$TARGET" "$dest_rel" "$src_rel" \
    || die "internal error: refusing unauthorized ownership mapping for $dest_rel"
  canonical_regular_source "$src_rel" || die "refusing to record unavailable or unsafe source: $src_rel"
  while IFS= read -r line || [ -n "$line" ]; do
    [ "$line" = "$MANIFEST_HEADER" ] && continue
    parse_manifest_line "$line" || die "ownership manifest changed during installation"
    [ "$MF_OWNER" = "$TARGET" ] && [ "$MF_DEST" = "$dest_rel" ] && [ "$MF_SOURCE" = "$src_rel" ] && return
  done < "$MANIFEST"
  new_lock_stage
  cp "$MANIFEST" "$STAGED" || { rm -f "$STAGED"; die "could not stage ownership manifest update"; }
  printf '%s\t%s\t%s\n' "$TARGET" "$dest_rel" "$src_rel" >> "$STAGED" || { rm -f "$STAGED"; die "could not stage ownership manifest entry"; }
  assert_safe_destination "$MANIFEST"
  [ ! -L "$MANIFEST" ] || die "ownership manifest became symlinked during installation"
  mv "$STAGED" "$MANIFEST"
}

# --- copy helpers (never clobber; dry-run aware) ---------------------------
do_cp() { # do_cp <src> <dest> [label]
  local dir src_rel
  dir="${2%/*}"
  case "$1" in "$SRC"/*) src_rel="${1#"$SRC"/}" ;; *) die "source is outside TierDecay checkout: $1" ;; esac
  canonical_regular_source "$src_rel" || die "refusing to copy unavailable or unsafe source: $src_rel"
  assert_safe_destination "$2"
  if [ "$DRY_RUN" = 1 ]; then plan "write ${3:-$2}"; return; fi
  mkdir -p "$dir"
  assert_safe_destination "$2"
  new_lock_stage
  cp "$1" "$STAGED" || { rm -f "$STAGED"; die "could not stage ${3:-$2}"; }
  assert_safe_destination "$2"
  if ln "$STAGED" "$2" 2>/dev/null; then
    rm -f "$STAGED"
    manifest_record "$1" "$2"
    say "installed ${3:-$2}"
    return 0
  fi
  rm -f "$STAGED"
  [ -e "$2" ] || die "could not install ${3:-$2} atomically"
  return 1
}

# Non-destructive single-file install: identical → skip; existing but
# different → write a *.tierdecay sidecar WITHOUT overwriting a pending one.
copy_safe() { # copy_safe <src> <dest>
  if [ ! -e "$2" ] && do_cp "$1" "$2"; then return; fi
  if cmp -s "$1" "$2"; then return; fi                      # already up to date
  local side="$2.tierdecay"
  if [ ! -e "$side" ]; then
    if [ "$DRY_RUN" = 1 ]; then plan "write $side (for you to merge)"; return; fi
    warn "$2 exists — writing $side for you to merge"
    if do_cp "$1" "$side" "$side (for you to merge)"; then return; fi
  fi
  if ! cmp -s "$1" "$side"; then
    warn "$2 differs and $side already pending your merge — leaving both untouched"
  fi
}

# Non-destructive recursive install: applies copy_safe to every file under a
# source tree. Portable across all cp versions (no reliance on `cp -n`).
copy_tree() { # copy_tree <src_dir> <dest_dir>
  local src="$1" dst="$2" rel d
  while IFS= read -r -d '' f; do
    rel="${f#"$src"/}"
    d="$dst/$rel"
    copy_safe "$f" "$d"
  done < <(find "$src" -type f -print0)
}

seed_state() {
  if [ ! -e "$DEST/.tierdecay/ledger.md" ]; then
    copy_safe "$SRC/core/ledger.template.md" "$DEST/.tierdecay/ledger.md"
  fi
  if [ ! -e "$DEST/.tierdecay/playbook.md" ]; then
    copy_safe "$SRC/core/playbook.template.md" "$DEST/.tierdecay/playbook.md"
  fi
  # Ship the full protocol so signature discipline + integrity invariants
  # travel with non-native adapters (they reference .tierdecay/PROTOCOL.md).
  copy_safe "$SRC/core/SPEC.md" "$DEST/.tierdecay/PROTOCOL.md"
  # Ship the tier->model bindings: the one file to edit when a model ships.
  copy_safe "$SRC/core/MODELS.md" "$DEST/.tierdecay/MODELS.md"
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

preflight_state_paths() {
  assert_safe_destination "$DEST/.tierdecay/ledger.md"
  assert_safe_destination "$DEST/.tierdecay/playbook.md"
  assert_safe_destination "$DEST/.tierdecay/PROTOCOL.md"
  assert_safe_destination "$DEST/.tierdecay/MODELS.md"
}

preflight_install_paths() {
  local f rel
  assert_safe_destination "$MANIFEST"
  assert_safe_destination "$LOCK_DIR"
  case "$TARGET" in
    claude)
      assert_safe_destination "$DEST/CLAUDE.md"
      assert_safe_destination "$DEST/.tierdecay/MODELS.md"
      while IFS= read -r -d '' f; do
        rel="${f#"$SRC/adapters/claude-code/.claude/"}"
        assert_safe_destination "$DEST/.claude/$rel"
      done < <(find "$SRC/adapters/claude-code/.claude" -type f -print0)
      ;;
    agents)
      assert_safe_destination "$DEST/AGENTS.md"
      preflight_state_paths
      ;;
    gemini)
      assert_safe_destination "$DEST/GEMINI.md"
      preflight_state_paths
      ;;
    aider)
      assert_safe_destination "$DEST/CONVENTIONS.md"
      preflight_state_paths
      ;;
    cline|goose|windsurf|cursor)
      assert_safe_destination "$DEST/AGENTS.md"
      preflight_state_paths
      ;;
  esac
}

# --- uninstall (state is sacred; never removed) ----------------------------
manifest_owned_by_other() { # manifest_owned_by_other <dest-rel> <owner>
  local line
  while IFS= read -r line || [ -n "$line" ]; do
    [ "$line" = "$MANIFEST_HEADER" ] && continue
    parse_manifest_line "$line" || return 0
    [ "$MF_DEST" = "$1" ] && [ "$MF_OWNER" != "$2" ] && return 0
  done < "$MANIFEST"
  return 1
}

new_quarantine() { # new_quarantine <owned-path>; sets QUARANTINE_DIR/QUARANTINED
  local path="$1" parent candidate
  parent="${path%/*}"
  assert_safe_destination "$path"
  while :; do
    QUARANTINE_SEQ=$((QUARANTINE_SEQ + 1))
    candidate="$parent/.tierdecay-uninstall.$$.$QUARANTINE_SEQ"
    if mkdir "$candidate" 2>/dev/null; then
      QUARANTINE_DIR="$candidate"
      QUARANTINED="$candidate/file"
      return
    fi
    [ -e "$candidate" ] || [ -L "$candidate" ] || die "could not create uninstall staging beside $path"
  done
}

restore_or_recover() { # restore_or_recover <quarantined> <original>
  local quarantined="$1" original="$2" recovery suffix attempt=0 quarantine_dir
  quarantine_dir="${quarantined%/*}"
  if [ -L "$quarantined" ] || [ ! -f "$quarantined" ]; then
    warn "$original changed during uninstall — non-regular recovery retained at $quarantined"
    return 1
  fi
  if [ ! -e "$original" ] && [ ! -L "$original" ] && ln "$quarantined" "$original" 2>/dev/null; then
    rm -f "$quarantined"
    rmdir "$quarantine_dir" 2>/dev/null || true
    warn "$original changed during uninstall — restored it and relinquished ownership"
    return 0
  fi
  while [ "$attempt" -lt 100 ]; do
    suffix=""
    [ "$attempt" = 0 ] || suffix=".$attempt"
    recovery="$original.tierdecay-recovered$suffix"
    if [ ! -e "$recovery" ] && [ ! -L "$recovery" ] && ln "$quarantined" "$recovery" 2>/dev/null; then
      rm -f "$quarantined"
      rmdir "$quarantine_dir" 2>/dev/null || true
      warn "$original was recreated during uninstall — preserved the quarantined content at $recovery"
      return 0
    fi
    attempt=$((attempt + 1))
  done
  warn "$original changed during uninstall — recovery retained at $quarantined"
  return 1
}

resolve_active_quarantine() {
  [ -n "$ACTIVE_ORIGINAL" ] && [ -n "$ACTIVE_QUARANTINED" ] || return 0
  if [ ! -e "$ACTIVE_QUARANTINED" ] && [ ! -L "$ACTIVE_QUARANTINED" ]; then
    ACTIVE_ORIGINAL=""
    ACTIVE_QUARANTINED=""
    return 0
  fi
  restore_or_recover "$ACTIVE_QUARANTINED" "$ACTIVE_ORIGINAL" || return 1
  ACTIVE_ORIGINAL=""
  ACTIVE_QUARANTINED=""
}

remove_owned_artifact() { # remove_owned_artifact <path> <source>
  local path="$1" source="$2"
  assert_safe_destination "$path"
  if [ -L "$path" ]; then
    warn "$path became a symlink — preserving it and relinquishing ownership"
    return
  fi
  [ -e "$path" ] || return 0
  if [ ! -f "$path" ]; then
    warn "$path is not a regular file — preserving it and relinquishing ownership"
    return
  fi
  new_quarantine "$path"
  assert_safe_destination "$path"
  ACTIVE_ORIGINAL="$path"
  ACTIVE_QUARANTINED="$QUARANTINED"
  if ! mv "$path" "$QUARANTINED"; then
    ACTIVE_ORIGINAL=""
    ACTIVE_QUARANTINED=""
    rmdir "$QUARANTINE_DIR" 2>/dev/null || true
    [ ! -e "$path" ] && [ ! -L "$path" ] && return
    die "could not quarantine $path; leaving ownership manifest unchanged"
  fi
  if [ -f "$QUARANTINED" ] && [ ! -L "$QUARANTINED" ] \
    && canonical_regular_source "${source#"$SRC"/}" && cmp -s "$source" "$QUARANTINED"; then
    if rm -f "$QUARANTINED"; then
      rmdir "$QUARANTINE_DIR" 2>/dev/null || true
      ACTIVE_ORIGINAL=""
      ACTIVE_QUARANTINED=""
      say "removed $path"
    else
      resolve_active_quarantine || true
    fi
    return
  fi
  resolve_active_quarantine || true
}

uninstall_manifest_target() {
  [ -e "$MANIFEST" ] || { warn "no ownership manifest found — leaving all files untouched"; return; }
  validate_manifest
  local tmp="" line path source
  if [ "$DRY_RUN" != 1 ]; then
    new_lock_stage
    tmp="$STAGED"
  fi

  while IFS= read -r line || [ -n "$line" ]; do
    if [ "$line" = "$MANIFEST_HEADER" ]; then
      [ "$DRY_RUN" = 1 ] || printf '%s\n' "$line" >> "$tmp"
      continue
    fi
    parse_manifest_line "$line" || die "ownership manifest changed during uninstall — leaving remaining files untouched"
    if [ "$MF_OWNER" != "$TARGET" ]; then
      [ "$DRY_RUN" = 1 ] || printf '%s\n' "$line" >> "$tmp"
      continue
    fi

    path="$DEST/$MF_DEST"
    source="$SRC/$MF_SOURCE"
    assert_safe_destination "$path"
    if is_preserved_state "$MF_DEST"; then
      [ "$DRY_RUN" = 1 ] || printf '%s\n' "$line" >> "$tmp"
    elif manifest_owned_by_other "$MF_DEST" "$TARGET"; then
      warn "$path is also owned by another target — preserving it"
    elif [ ! -e "$path" ] && [ ! -L "$path" ]; then
      : # Missing artifact: forget stale ownership.
    elif ! canonical_regular_source "${source#"$SRC"/}"; then
      warn "source for $path is unavailable — preserving it and relinquishing ownership"
    elif [ "$DRY_RUN" = 1 ]; then
      if [ ! -L "$path" ] && cmp -s "$source" "$path"; then
        plan "remove $path"
      else
        warn "$path changed since installation — preserving it"
      fi
    else
      remove_owned_artifact "$path" "$source"
    fi
  done < "$MANIFEST"

  if [ "$DRY_RUN" != 1 ]; then
    assert_safe_destination "$MANIFEST"
    [ ! -L "$MANIFEST" ] || die "ownership manifest became symlinked during uninstall"
    mv "$tmp" "$MANIFEST"
  fi
}

uninstall() {
  warn "uninstall preserves all learned state (.tierdecay/, .claude/routing-ledger.md)"
  uninstall_manifest_target
  if [ -d "$DEST/.claude" ]; then
    warn ".claude/ left in place — it may hold your routing-ledger.md; remove by hand if intended"
  fi
  say "TierDecay-owned context files for $TARGET processed — state and .claude/ preserved."
  exit 0
}

[ "$TARGET" = "auto" ] && { TARGET="$(detect)"; warn "auto-detected target: $TARGET"; }
valid_target "$TARGET" || die "unknown target '$TARGET' (claude|agents|cursor|gemini|aider|cline|goose|windsurf|auto)"
[ "$DRY_RUN" = 1 ] && warn "dry run — no files will be changed"

if [ "$UNINSTALL" = 1 ]; then
  if [ -e "$MANIFEST" ] || [ -L "$MANIFEST" ]; then
    validate_manifest
    if [ "$DRY_RUN" != 1 ]; then
      acquire_lock
      validate_manifest
    fi
  fi
  uninstall
fi

if [ "$TARGET" = claude ] && ! command -v node >/dev/null 2>&1; then
  die "Claude target requires node for its fail-closed guard; install Node.js before running TierDecay"
fi

preflight_install_paths
if [ "$DRY_RUN" != 1 ]; then
  acquire_lock
  preflight_install_paths
  prepare_manifest
fi

case "$TARGET" in
  claude)
    copy_safe "$SRC/adapters/claude-code/CLAUDE.md" "$DEST/CLAUDE.md"
    # File-by-file through copy_safe (copy_tree): existing files (ledger,
    # playbook, settings) are NEVER clobbered — a differing incoming version
    # lands as a .tierdecay sidecar to merge. Do not "simplify" this back to
    # `cp -rn || cp -r`: on coreutils >= 9.2, `cp -n` exits nonzero when it
    # skips an existing file, which used to trigger the clobbering fallback
    # and silently destroy the learned state.
    copy_tree "$SRC/adapters/claude-code/.claude" "$DEST/.claude"
    # The tier->model bindings live at the same path for every adapter, so
    # CLAUDE.md can reference .tierdecay/MODELS.md unconditionally.
    copy_safe "$SRC/core/MODELS.md" "$DEST/.tierdecay/MODELS.md"
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
esac

if [ "$DRY_RUN" = 1 ]; then
  say "dry run complete — re-run without --dry-run to apply."
else
  say "TierDecay installed — first high-tier solve starts the decay."
fi
