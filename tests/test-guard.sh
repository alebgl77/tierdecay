#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="$repo_root/adapters/claude-code/.claude/hooks/tierdecay-guard.sh"
temp_root="$(mktemp -d)"
stderr_file="$temp_root/stderr"
trap 'rm -rf "$temp_root"' EXIT

failures=0
skips=0

run_case() { # run_case <label> <expected-exit> <json> [project-root]
  local label="$1"
  local expected="$2"
  local payload="$3"
  local project_root="${4:-$repo_root}"
  local actual

  if printf '%s' "$payload" \
    | CLAUDE_PROJECT_DIR="$project_root" "$guard" 2>"$stderr_file"; then
    actual=0
  else
    actual=$?
  fi

  if [ "$actual" -ne "$expected" ]; then
    printf 'not ok - %s (expected %s, got %s)\n' "$label" "$expected" "$actual"
    failures=$((failures + 1))
  else
    printf 'ok - %s\n' "$label"
  fi
}

run_from_nested_cwd() {
  local project="$temp_root/installed project"
  local nested="$project/work/one/two"
  local actual

  mkdir -p "$project/.claude/hooks" "$nested"
  cp "$guard" "$project/.claude/hooks/tierdecay-guard.sh"
  chmod +x "$project/.claude/hooks/tierdecay-guard.sh"
  if (
    export CLAUDE_PROJECT_DIR="$project"
    cd "$nested"
    printf '%s' '{"tool_name":"Write","tool_input":{"file_path":"src/app.py"}}' \
      | "${CLAUDE_PROJECT_DIR}/.claude/hooks/tierdecay-guard.sh" 2>"$stderr_file"
  ); then
    actual=0
  else
    actual=$?
  fi

  if [ "$actual" -ne 0 ]; then
    printf 'not ok - invocation from nested cwd (expected 0, got %s)\n' "$actual"
    failures=$((failures + 1))
  else
    printf 'ok - invocation from nested cwd\n'
  fi
}

run_symlink_case() {
  local project="$temp_root/symlink-project"
  local alias="$project/state-link"

  mkdir -p "$project/.tierdecay"
  if ln -s .tierdecay "$alias" 2>/dev/null && [ -L "$alias" ]; then
    run_case \
      'symlink alias' \
      2 \
      '{"tool_name":"Write","tool_input":{"file_path":"state-link/playbook.md"}}' \
      "$project"
  else
    printf 'ok - symlink alias # SKIP symlinks unavailable\n'
    skips=$((skips + 1))
  fi
}

run_symlink_parent_case() {
  local project="$temp_root/symlink-parent-project"
  local alias="$project/state-subdir-link"

  mkdir -p "$project/.tierdecay/subdir"
  if ln -s .tierdecay/subdir "$alias" 2>/dev/null && [ -L "$alias" ]; then
    run_case \
      'symlink followed by parent traversal' \
      2 \
      '{"tool_name":"Write","tool_input":{"file_path":"state-subdir-link/../playbook.md"}}' \
      "$project"
  else
    printf 'ok - symlink parent traversal # SKIP symlinks unavailable\n'
    skips=$((skips + 1))
  fi
}

run_external_symlink_case() {
  local project="$temp_root/external-symlink-project"
  local alias="$temp_root/external-state-link"

  mkdir -p "$project/.tierdecay"
  if ln -s "$project/.tierdecay" "$alias" 2>/dev/null && [ -L "$alias" ]; then
    run_case \
      'external symlink returning into state' \
      2 \
      '{"tool_name":"Write","tool_input":{"file_path":"../external-state-link/new.md"}}' \
      "$project"
  else
    printf 'ok - external symlink returning into state # SKIP symlinks unavailable\n'
    skips=$((skips + 1))
  fi
}

run_without_node() {
  local actual

  if printf '%s' '{"tool_name":"Write","tool_input":{"file_path":"src/app.py"}}' \
    | PATH=/definitely-missing "$BASH" "$guard" 2>"$stderr_file"; then
    actual=0
  else
    actual=$?
  fi

  if [ "$actual" -ne 2 ]; then
    printf 'not ok - Node unavailable (expected 2, got %s)\n' "$actual"
    failures=$((failures + 1))
  else
    printf 'ok - Node unavailable\n'
  fi
}

# The payload must contain a literal shell variable for the guard to inspect.
# shellcheck disable=SC2016
bash_variable_payload='{"tool_name":"Bash","tool_input":{"command":"d=.tierdecay; cat \"$d/playbook.md\""}}'

deny_cases=(
  'direct file path|{"tool_name":"Write","tool_input":{"file_path":".tierdecay/playbook.md","content":"x"}}'
  'escaped slash|{"tool_name":"Edit","tool_input":{"file_path":".tierdecay\/playbook.md"}}'
  'unicode slash|{"tool_name":"MultiEdit","tool_input":{"file_path":".tierdecay\u002fplaybook.md"}}'
  'Windows path|{"tool_name":"Write","tool_input":{"file_path":"C:\\repo\\.tierdecay\\playbook.md"}}'
  'Windows UNC path|{"tool_name":"Write","tool_input":{"file_path":"\\\\server\\share\\.tierdecay\\playbook.md"}}'
  'absolute dot segments|{"tool_name":"Write","tool_input":{"file_path":"/repo/src/../.tierdecay/playbook.md"}}'
  'Windows-compatible case|{"tool_name":"NotebookEdit","tool_input":{"notebook_path":"C:\\Repo\\.ClAuDe\\notes.ipynb"}}'
  'Windows trailing dot alias|{"tool_name":"Write","tool_input":{"file_path":"C:\\repo\\.tierdecay.\\playbook.md"}}'
  'Bash direct reference|{"tool_name":"Bash","tool_input":{"command":"cat .tierdecay/playbook.md"}}'
  'Bash escaped Unicode reference|{"tool_name":"Bash","tool_input":{"command":"cat .claude\u002fsettings.json"}}'
  "Bash simple variable|$bash_variable_payload"
  'malformed JSON|{"tool_name":"Write"'
  'mutation without target|{"tool_name":"Write","tool_input":{"content":"x"}}'
)

allow_cases=(
  'ordinary source write|{"tool_name":"Write","tool_input":{"file_path":"src/app.py","content":"x"}}'
  'README content mention|{"tool_name":"Write","tool_input":{"file_path":"README.md","content":"Document .tierdecay/ here"}}'
  'ordinary source read|{"tool_name":"Bash","tool_input":{"command":"cat src/app.py"}}'
  'ordinary lint|{"tool_name":"Bash","tool_input":{"command":"npm run lint"}}'
  'similar non-state path|{"tool_name":"Write","tool_input":{"file_path":"docs/.tierdecay-example.md","content":"x"}}'
  'normalized path outside state|{"tool_name":"Write","tool_input":{"file_path":".tierdecay/../README.md","content":"x"}}'
)

for entry in "${deny_cases[@]}"; do
  run_case "${entry%%|*}" 2 "${entry#*|}"
done

for entry in "${allow_cases[@]}"; do
  run_case "${entry%%|*}" 0 "${entry#*|}"
done

run_without_node
run_from_nested_cwd
run_symlink_case
run_symlink_parent_case
run_external_symlink_case

if [ "$failures" -ne 0 ]; then
  printf '%s guard test(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'all %s guard checks completed (%s skipped)\n' \
  "$(( ${#deny_cases[@]} + ${#allow_cases[@]} + 5 ))" "$skips"
