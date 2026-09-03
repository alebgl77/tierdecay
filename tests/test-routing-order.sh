#!/usr/bin/env bash
set -euo pipefail

repo_root="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

fail() {
  echo "::error::$*" >&2
  exit 1
}

section_between() {
  local file="$1" start="$2" stop="$3"
  awk -v start="$start" -v stop="$stop" '
    $0 ~ start { found = 1; inside = 1 }
    inside && $0 ~ stop { exit }
    inside { print }
    END { if (!found) exit 2 }
  ' "$file"
}

first_offset() {
  local text="$1" needle="$2"
  awk -v needle="$needle" '
    BEGIN { needle = tolower(needle); offset = 0 }
    {
      pos = index(tolower($0), needle)
      if (pos) { print offset + pos - 1; exit }
      offset += length($0) + 1
    }
  ' <<< "$text"
}

check_order() {
  local relative="$1" start="$2" stop="$3" file section
  local playbook_offset priors_offset score_offset
  file="$repo_root/$relative"
  [ -f "$file" ] || fail "$relative: missing file"
  if ! section="$(section_between "$file" "$start" "$stop")"; then
    fail "$relative: routing section not found"
  fi

  playbook_offset="$(first_offset "$section" "playbook")"
  priors_offset="$(first_offset "$section" "priors")"
  score_offset="$(first_offset "$section" "score")"
  [ -n "$playbook_offset" ] || fail "$relative: routing section has no playbook decision"
  [ -n "$priors_offset" ] || fail "$relative: routing section has no PRIORS fallback"
  [ -n "$score_offset" ] || fail "$relative: routing section has no rubric scoring fallback"
  [ "$playbook_offset" -lt "$priors_offset" ] ||
    fail "$relative: live playbook must be checked before PRIORS"
  [ "$priors_offset" -lt "$score_offset" ] ||
    fail "$relative: PRIORS must be checked before rubric scoring"
  grep -qi "live" <<< "$section" || fail "$relative: playbook decision is not limited to live entries"
  grep -q "PROBE" <<< "$section" || fail "$relative: live playbook decision does not trigger a PROBE"
  echo "$relative: live playbook -> PRIORS -> rubric"
}

check_order "README.md" '^### Routing a task$' '^### One task, end to end$'
check_order "adapters/agents-md/AGENTS.md" '^2[.] .*PLAN' '^3[.] '
check_order "adapters/aider/CONVENTIONS.md" '^## Rules for the architect$' '^## Rules for the editor$'
check_order "adapters/claude-code/CLAUDE.md" '^2[.] .*PLAN' '^3[.] '
check_order "adapters/cline/AGENTS.md" '^2[.] .*PLAN' '^3[.] '
check_order "adapters/cursor/AGENTS.md" '^2[.] .*PLAN' '^3[.] '
check_order "adapters/gemini-cli/GEMINI.md" '^2[.] .*PLAN' '^3[.] '
check_order "adapters/goose/AGENTS.md" '^2[.] .*PLAN' '^3[.] '
check_order "adapters/windsurf/AGENTS.md" '^2[.] .*PLAN' '^3[.] '

for file in "$repo_root"/adapters/*/AGENTS.md "$repo_root"/adapters/*/CLAUDE.md \
            "$repo_root"/adapters/*/GEMINI.md "$repo_root"/adapters/*/CONVENTIONS.md; do
  relative="${file#"$repo_root"/}"
  lines="$(wc -l < "$file")"
  [ "$lines" -le 120 ] || fail "$relative: $lines lines exceeds the 120-line cap"
done

echo "Routing order and context line caps are conformant."
