#!/usr/bin/env bash
set -euo pipefail

ROOT="${TIERDECAY_TEST_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
INSTALLER="$ROOT/install.sh"
TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/tierdecay-installer.XXXXXX")"
trap 'rm -rf "$TMP_ROOT"' EXIT

pass=0

new_project() {
  local project="$TMP_ROOT/project-$1"
  mkdir -p "$project"
  printf '%s\n' "$project"
}

run_install() {
  local project="$1"
  shift
  (cd "$project" && bash "$INSTALLER" "$@") >/dev/null
}

new_distribution() {
  local distribution="$TMP_ROOT/distribution-$1"
  mkdir -p "$distribution"
  cp "$INSTALLER" "$distribution/install.sh"
  cp -R "$ROOT/adapters" "$ROOT/core" "$distribution/"
  printf '%s\n' "$distribution"
}

run_distribution() {
  local distribution="$1" project="$2"
  shift 2
  (cd "$project" && bash "$distribution/install.sh" "$@") >/dev/null
}

# Minimal source fixtures keep adversarial mutations out of the real checkout.
source_fixture() {
  distribution="$TMP_ROOT/source-$1"
  project="$(new_project "source-$1")"
  source="$distribution/adapters/claude-code/.claude/agents/scout.md"
  mkdir -p "${source%/*}" "$project/.tierdecay" "$project/.claude/agents"
  cp "$INSTALLER" "$distribution/install.sh"
  cp "$ROOT/adapters/claude-code/.claude/agents/scout.md" "$source"
  printf '%s\n' 'user source sentinel' > "$project/.claude/agents/scout.md"
  {
    printf '%s\n' '# tierdecay install manifest v1'
    printf 'claude\t.claude/agents/scout.md\tadapters/claude-code/.claude/agents/scout.md\n'
  } > "$project/.tierdecay/install-manifest.tsv"
}

assert_source_rejected() {
  local label="$1"
  cp "$project/.tierdecay/install-manifest.tsv" "$project/manifest.before"
  if run_distribution "$distribution" "$project" --uninstall claude 2>/dev/null; then
    printf 'FAIL: %s unexpectedly succeeded\n' "$label" >&2
    exit 1
  fi
  assert_content 'user source sentinel' "$project/.claude/agents/scout.md"
  cmp -s "$project/manifest.before" "$project/.tierdecay/install-manifest.tsv"
  assert_missing "$project/.tierdecay/install.lock"
  [ -z "$(find "$project" -name '.tierdecay-uninstall.*' -print -quit)" ] \
    || { printf 'FAIL: %s quarantined a file\n' "$label" >&2; exit 1; }
}

assert_exists() {
  [ -e "$1" ] || { printf 'FAIL: expected %s to exist\n' "$1" >&2; exit 1; }
}

assert_missing() {
  [ ! -e "$1" ] || { printf 'FAIL: expected %s to be absent\n' "$1" >&2; exit 1; }
}

assert_content() {
  local expected="$1" file="$2"
  [ "$(cat "$file")" = "$expected" ] || { printf 'FAIL: unexpected content in %s\n' "$file" >&2; exit 1; }
}

ok() {
  pass=$((pass + 1))
  printf 'ok %d - %s\n' "$pass" "$1"
}

bash -n "$INSTALLER"
bash -n "$0"
ok "shell syntax"

project="$(new_project user-file)"
printf '%s\n' 'user agents' > "$project/AGENTS.md"
run_install "$project" agents
assert_exists "$project/AGENTS.md.tierdecay"
run_install "$project" --uninstall agents
assert_content 'user agents' "$project/AGENTS.md"
assert_missing "$project/AGENTS.md.tierdecay"
ok "a pre-existing user file survives install and uninstall"

project="$(new_project identical-user-file)"
cp "$ROOT/adapters/agents-md/AGENTS.md" "$project/AGENTS.md"
run_install "$project" agents
run_install "$project" --uninstall agents
assert_exists "$project/AGENTS.md"
cmp -s "$ROOT/adapters/agents-md/AGENTS.md" "$project/AGENTS.md"
ok "a pre-existing identical file is never claimed"

project="$(new_project owned-file)"
run_install "$project" agents
assert_exists "$project/AGENTS.md"
run_install "$project" --uninstall agents
assert_missing "$project/AGENTS.md"
ok "an unchanged owned context file is removed"

project="$(new_project edited-file)"
run_install "$project" agents
printf '%s\n' 'user edit after install' > "$project/AGENTS.md"
run_install "$project" --uninstall agents
assert_content 'user edit after install' "$project/AGENTS.md"
run_install "$project" --uninstall agents
assert_content 'user edit after install' "$project/AGENTS.md"
ok "an edited owned file is preserved and ownership is relinquished"

project="$(new_project edited-sidecar)"
printf '%s\n' 'user agents' > "$project/AGENTS.md"
run_install "$project" agents
printf '%s\n' 'user merged sidecar' > "$project/AGENTS.md.tierdecay"
run_install "$project" --uninstall agents
assert_content 'user agents' "$project/AGENTS.md"
assert_content 'user merged sidecar' "$project/AGENTS.md.tierdecay"
ok "an edited sidecar is preserved"

project="$(new_project scoped-target)"
run_install "$project" agents
run_install "$project" claude || {
  printf 'FAIL: native distribution installation failed; every managed file needs an explicit manifest allowlist entry\n' >&2
  exit 1
}
while IFS= read -r -d '' native_file; do
  native_rel="${native_file#"$ROOT/adapters/claude-code/"}"
  case "$native_rel" in .claude/routing-ledger.md|.claude/skills/repo-playbook/SKILL.md) continue ;; esac
  native_entry="$(printf 'claude\t%s\tadapters/claude-code/%s' "$native_rel" "$native_rel")"
  grep -Fqx "$native_entry" "$project/.tierdecay/install-manifest.tsv" \
    || { printf 'FAIL: native distribution file is missing explicit manifest authorization: %s\n' "$native_rel" >&2; exit 1; }
done < <(find "$ROOT/adapters/claude-code/.claude" -type f -print0)
ok "every current managed native distribution file has explicit manifest authorization"
assert_exists "$project/AGENTS.md"
assert_exists "$project/CLAUDE.md"
run_install "$project" --uninstall claude
assert_exists "$project/AGENTS.md"
assert_missing "$project/CLAUDE.md"
ok "uninstall is scoped to its requested target"

project="$(new_project learned-state)"
run_install "$project" agents
run_install "$project" claude
printf '%s\n' 'learned ledger' > "$project/.tierdecay/ledger.md"
printf '%s\n' 'learned playbook' > "$project/.tierdecay/playbook.md"
printf '%s\n' 'learned routing' > "$project/.claude/routing-ledger.md"
printf '%s\n' 'learned Claude playbook' > "$project/.claude/skills/repo-playbook/SKILL.md"
run_install "$project" --uninstall agents
run_install "$project" --uninstall claude
assert_content 'learned ledger' "$project/.tierdecay/ledger.md"
assert_content 'learned playbook' "$project/.tierdecay/playbook.md"
assert_content 'learned routing' "$project/.claude/routing-ledger.md"
assert_content 'learned Claude playbook' "$project/.claude/skills/repo-playbook/SKILL.md"
ok "learned state always survives"

project="$(new_project idempotent)"
run_install "$project" agents
cp "$project/.tierdecay/install-manifest.tsv" "$project/manifest.before"
run_install "$project" agents
cmp -s "$project/manifest.before" "$project/.tierdecay/install-manifest.tsv"
cmp -s "$ROOT/adapters/agents-md/AGENTS.md" "$project/AGENTS.md"
ok "reinstallation is idempotent"

distribution="$(new_distribution missing-source)"
project="$(new_project missing-source)"
run_distribution "$distribution" "$project" claude
run_distribution "$distribution" "$project" agents
printf '%s\n' 'user sentinel' > "$project/.claude/sentinel"
printf '%s\n' 'learned ledger' > "$project/.tierdecay/ledger.md"
printf '%s\n' 'learned routing' > "$project/.claude/routing-ledger.md"
printf '%s\n' 'learned Claude playbook' > "$project/.claude/skills/repo-playbook/SKILL.md"
mv "$distribution/adapters/claude-code/.claude/agents/scout.md" "$distribution/scout.retired"
cp "$project/.tierdecay/install-manifest.tsv" "$project/manifest.before"
(cd "$project" && bash "$distribution/install.sh" --dry-run --uninstall claude) > "$project/dry-run.log"
grep -q 'source for .*scout.md is unavailable' "$project/dry-run.log"
cmp -s "$project/manifest.before" "$project/.tierdecay/install-manifest.tsv"
cmp -s "$distribution/scout.retired" "$project/.claude/agents/scout.md"
ok "dry-run preserves ownership and artifacts when an authorized source is missing"

run_distribution "$distribution" "$project" claude
run_distribution "$distribution" "$project" agents
cmp -s "$project/manifest.before" "$project/.tierdecay/install-manifest.tsv"
run_distribution "$distribution" "$project" --uninstall agents
assert_missing "$project/AGENTS.md"
grep -q $'^claude\t.claude/agents/scout.md\t' "$project/.tierdecay/install-manifest.tsv"
ok "a retired native source does not block reinstall or another target's uninstall"

(cd "$project" && bash "$distribution/install.sh" --uninstall claude) > "$project/uninstall.log"
grep -q 'source for .*scout.md is unavailable.*preserving it and relinquishing ownership' "$project/uninstall.log"
cmp -s "$distribution/scout.retired" "$project/.claude/agents/scout.md"
assert_missing "$project/.claude/agents/executor.md"
assert_missing "$project/CLAUDE.md"
assert_content '# tierdecay install manifest v1' "$project/.tierdecay/install-manifest.tsv"
assert_content 'user sentinel' "$project/.claude/sentinel"
assert_content 'learned ledger' "$project/.tierdecay/ledger.md"
assert_content 'learned routing' "$project/.claude/routing-ledger.md"
assert_content 'learned Claude playbook' "$project/.claude/skills/repo-playbook/SKILL.md"
ok "missing-source uninstall preserves the artifact and learned state while relinquishing selected ownership"

distribution="$(new_distribution missing-source-parent)"
project="$(new_project missing-source-parent)"
run_distribution "$distribution" "$project" claude
mv "$distribution/adapters/claude-code/.claude/agents" "$distribution/retired-agents"
run_distribution "$distribution" "$project" claude
run_distribution "$distribution" "$project" --uninstall claude
for retired_agent in "$distribution/retired-agents/"*; do
  cmp -s "$retired_agent" "$project/.claude/agents/${retired_agent##*/}"
done
assert_content '# tierdecay install manifest v1' "$project/.tierdecay/install-manifest.tsv"
ok "missing source parent directories are legitimate absence without authorizing removal"

for availability in absent existing; do
  source_fixture "invented-$availability"
  if [ "$availability" = existing ]; then
    cp "$source" "${source%/*}/invented.md"
  fi
  printf '%s\n' 'invented mapping sentinel' > "$project/.claude/agents/invented.md"
  {
    printf '%s\n' '# tierdecay install manifest v1'
    printf 'claude\t.claude/agents/invented.md\tadapters/claude-code/.claude/agents/invented.md\n'
  } > "$project/.tierdecay/install-manifest.tsv"
  assert_source_rejected "invented $availability source mapping"
  assert_content 'invented mapping sentinel' "$project/.claude/agents/invented.md"
  ok "an invented $availability native source is not authorized by a forged manifest"
done

source_fixture directory-leaf
mv "$source" "$distribution/scout.retired"
mkdir "$source"
assert_source_rejected 'non-regular source leaf'
ok "an existing source directory is rejected instead of treated as missing"

source_fixture non-directory-parent
mv "${source%/*}" "$distribution/retired-agents"
printf '%s\n' 'not a source directory' > "${source%/*}"
assert_source_rejected 'non-directory source parent'
ok "an existing non-directory source parent fails closed"

for component in leaf parent; do
  for availability in existing absent; do
    source_fixture "symlink-$component-$availability"
    if [ "$component" = leaf ]; then
      source_link="$source"
    else
      source_link="${source%/*}"
    fi
    mv "$source_link" "$distribution/retired-component"
    link_target="$distribution/retired-component"
    [ "$availability" = existing ] || link_target="$distribution/absent-component"
    if ln -s "$link_target" "$source_link" 2>/dev/null && [ -L "$source_link" ]; then
      assert_source_rejected "$availability symlinked source $component"
      ok "an $availability symlinked source $component fails closed"
    else
      ok "$availability source-$component symlink guard skipped where symlinks are unavailable"
    fi
  done
done

project="$(new_project auto-target)"
run_install "$project" agents
run_install "$project" --uninstall auto
assert_missing "$project/AGENTS.md"
ok "auto-detected uninstall remains target-scoped"

project="$(new_project dry-run)"
run_install "$project" agents
run_install "$project" --dry-run --uninstall agents
assert_exists "$project/AGENTS.md"
ok "dry-run uninstall changes nothing"

project="$(new_project no-manifest)"
printf '%s\n' 'legacy user file' > "$project/AGENTS.md"
run_install "$project" --uninstall agents
assert_content 'legacy user file' "$project/AGENTS.md"
ok "missing ownership metadata fails closed"

project="$(new_project unsafe-manifest)"
mkdir -p "$project/.tierdecay"
printf '%s\n' 'outside victim' > "$TMP_ROOT/victim"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'agents\t../victim\tadapters/agents-md/AGENTS.md\n'
} > "$project/.tierdecay/install-manifest.tsv"
if run_install "$project" --uninstall agents 2>/dev/null; then
  printf 'FAIL: unsafe manifest unexpectedly succeeded\n' >&2
  exit 1
fi
assert_content 'outside victim' "$TMP_ROOT/victim"
ok "unsafe manifest paths fail closed"

project="$(new_project forged-claude-directory)"
mkdir -p "$project/.tierdecay" "$project/.claude"
printf '%s\n' 'claude sentinel' > "$project/.claude/sentinel"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'claude\t.claude\tadapters/claude-code/.claude\n'
} > "$project/.tierdecay/install-manifest.tsv"
if run_install "$project" --uninstall claude 2>/dev/null; then
  printf 'FAIL: forged Claude directory mapping unexpectedly succeeded\n' >&2
  exit 1
fi
assert_content 'claude sentinel' "$project/.claude/sentinel"
[ -z "$(find "$project" -name '.tierdecay-uninstall.*' -print -quit)" ] \
  || { printf 'FAIL: forged Claude directory mapping moved content\n' >&2; exit 1; }
ok "a manifest cannot claim the .claude directory"

project="$(new_project forged-arbitrary-file)"
mkdir -p "$project/.tierdecay"
cp "$ROOT/adapters/agents-md/AGENTS.md" "$project/arbitrary.md"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'agents\tarbitrary.md\tadapters/agents-md/AGENTS.md\n'
} > "$project/.tierdecay/install-manifest.tsv"
if run_install "$project" --uninstall agents 2>/dev/null; then
  printf 'FAIL: forged arbitrary-file mapping unexpectedly succeeded\n' >&2
  exit 1
fi
cmp -s "$ROOT/adapters/agents-md/AGENTS.md" "$project/arbitrary.md"
[ -z "$(find "$project" -name '.tierdecay-uninstall.*' -print -quit)" ] \
  || { printf 'FAIL: forged arbitrary file was quarantined\n' >&2; exit 1; }
ok "a manifest cannot claim an arbitrary identical file"

project="$(new_project forged-windows-backslash)"
mkdir -p "$project/.tierdecay" "$project/.claude"
cp "$ROOT/adapters/claude-code/CLAUDE.md" "$project/CLAUDE.md"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'claude\t.claude/..\\CLAUDE.md\tadapters/claude-code/.claude/..\\CLAUDE.md\n'
} > "$project/.tierdecay/install-manifest.tsv"
if run_install "$project" --uninstall claude 2>/dev/null; then
  printf 'FAIL: Windows backslash traversal manifest unexpectedly succeeded\n' >&2
  exit 1
fi
assert_exists "$project/CLAUDE.md"
[ -z "$(find "$project" -name '.tierdecay-uninstall.*' -print -quit)" ] \
  || { printf 'FAIL: Windows backslash traversal moved a file\n' >&2; exit 1; }
ok "a manifest cannot hide parent traversal behind Windows backslashes"

project="$(new_project forged-learned-state)"
mkdir -p "$project/.tierdecay"
printf '%s\n' 'learned ledger' > "$project/.tierdecay/ledger.md"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'agents\t.tierdecay/ledger.md\tcore/ledger.template.md\n'
} > "$project/.tierdecay/install-manifest.tsv"
if run_install "$project" --uninstall agents 2>/dev/null; then
  printf 'FAIL: learned-state ownership mapping unexpectedly succeeded\n' >&2
  exit 1
fi
assert_content 'learned ledger' "$project/.tierdecay/ledger.md"
ok "a manifest can never authorize learned-state removal"

project="$(new_project forged-claude-playbook-state)"
mkdir -p "$project/.tierdecay" "$project/.claude/skills/repo-playbook"
printf '%s\n' 'learned Claude playbook' > "$project/.claude/skills/repo-playbook/SKILL.md"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'claude\t.claude/skills/repo-playbook/SKILL.md\tadapters/claude-code/.claude/skills/repo-playbook/SKILL.md\n'
} > "$project/.tierdecay/install-manifest.tsv"
if run_install "$project" --uninstall claude 2>/dev/null; then
  printf 'FAIL: Claude playbook ownership mapping unexpectedly succeeded\n' >&2
  exit 1
fi
assert_content 'learned Claude playbook' "$project/.claude/skills/repo-playbook/SKILL.md"
ok "a manifest can never authorize Claude playbook removal"

project="$(new_project partial-manifest)"
mkdir -p "$project/.tierdecay"
printf '%s\n' 'user agents' > "$project/AGENTS.md"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'agents\tAGENTS.md\t\n'
} > "$project/.tierdecay/install-manifest.tsv"
if run_install "$project" --uninstall agents 2>/dev/null; then
  printf 'FAIL: partial manifest unexpectedly succeeded\n' >&2
  exit 1
fi
assert_content 'user agents' "$project/AGENTS.md"
ok "a partial manifest entry fails closed"

project="$(new_project symlink-manifest)"
mkdir -p "$project/.tierdecay"
printf '%s\n' 'user agents' > "$project/AGENTS.md"
external_manifest="$TMP_ROOT/external-manifest"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'agents\tAGENTS.md\tadapters/agents-md/AGENTS.md\n'
} > "$external_manifest"
if ln -s "$external_manifest" "$project/.tierdecay/install-manifest.tsv" 2>/dev/null && [ -L "$project/.tierdecay/install-manifest.tsv" ]; then
  if run_install "$project" --uninstall agents 2>/dev/null; then
    printf 'FAIL: symlinked manifest unexpectedly succeeded\n' >&2
    exit 1
  fi
  assert_content 'user agents' "$project/AGENTS.md"
  ok "a symlinked manifest fails closed"
else
  ok "symlinked-manifest guard skipped where symlinks are unavailable"
fi

project="$(new_project symlink-parent)"
outside="$TMP_ROOT/outside"
mkdir -p "$project/.tierdecay" "$outside"
cp "$ROOT/adapters/agents-md/AGENTS.md" "$outside/AGENTS.md"
{
  printf '%s\n' '# tierdecay install manifest v1'
  printf 'agents\tlinked/AGENTS.md\tadapters/agents-md/AGENTS.md\n'
} > "$project/.tierdecay/install-manifest.tsv"
if ln -s "$outside" "$project/linked" 2>/dev/null && [ -L "$project/linked" ]; then
  if run_install "$project" --uninstall agents 2>/dev/null; then
    printf 'FAIL: symlinked parent unexpectedly succeeded\n' >&2
    exit 1
  fi
  assert_exists "$outside/AGENTS.md"
  ok "a symlinked parent cannot redirect deletion"
else
  ok "symlink-parent guard skipped where symlinks are unavailable"
fi

project="$(new_project invalid-target)"
printf '%s\n' 'user agents' > "$project/AGENTS.md"
if run_install "$project" --uninstall invalid-target 2>/dev/null; then
  printf 'FAIL: invalid target unexpectedly succeeded\n' >&2
  exit 1
fi
assert_content 'user agents' "$project/AGENTS.md"
ok "invalid uninstall target cannot delete files"

project="$(new_project claude-symlink)"
outside="$TMP_ROOT/claude-outside"
mkdir -p "$outside"
if ln -s "$outside" "$project/.claude" 2>/dev/null && [ -L "$project/.claude" ]; then
  if run_install "$project" claude 2>/dev/null; then
    printf 'FAIL: install through symlinked .claude unexpectedly succeeded\n' >&2
    exit 1
  fi
  assert_missing "$project/CLAUDE.md"
  assert_missing "$project/.tierdecay"
  [ -z "$(find "$outside" -mindepth 1 -print -quit)" ] || { printf 'FAIL: wrote through symlinked .claude\n' >&2; exit 1; }
  ok "install rejects symlinked .claude before writing"
else
  ok "symlinked .claude install guard skipped where symlinks are unavailable"
fi

project="$(new_project claude-subparent-symlink)"
outside="$TMP_ROOT/agents-outside"
mkdir -p "$project/.claude" "$outside"
if ln -s "$outside" "$project/.claude/agents" 2>/dev/null && [ -L "$project/.claude/agents" ]; then
  if run_install "$project" claude 2>/dev/null; then
    printf 'FAIL: install through symlinked Claude sub-parent unexpectedly succeeded\n' >&2
    exit 1
  fi
  assert_missing "$project/CLAUDE.md"
  assert_missing "$project/.tierdecay"
  [ -z "$(find "$outside" -mindepth 1 -print -quit)" ] || { printf 'FAIL: wrote through symlinked Claude sub-parent\n' >&2; exit 1; }
  ok "Claude preflight rejects a symlinked sub-parent before writing"
else
  ok "Claude sub-parent symlink guard skipped where symlinks are unavailable"
fi

no_node_bin="$TMP_ROOT/no-node-bin"
mkdir -p "$no_node_bin"
cp "$(command -v dirname)" "$no_node_bin/dirname"
project="$(new_project no-node-explicit)"
if (cd "$project" && PATH="$no_node_bin" "$BASH" "$INSTALLER" claude) >/dev/null 2>&1; then
  printf 'FAIL: Claude install without node unexpectedly succeeded\n' >&2
  exit 1
fi
assert_missing "$project/CLAUDE.md"
assert_missing "$project/.tierdecay"
project="$(new_project no-node-auto)"
mkdir -p "$project/.claude"
if (cd "$project" && PATH="$no_node_bin" "$BASH" "$INSTALLER" auto) >/dev/null 2>&1; then
  printf 'FAIL: auto-detected Claude install without node unexpectedly succeeded\n' >&2
  exit 1
fi
assert_missing "$project/CLAUDE.md"
assert_missing "$project/.tierdecay"
ok "Claude requires node before explicit or auto-detected writes"

project="$(new_project non-regular-owned-path)"
run_install "$project" agents
rm -f "$project/AGENTS.md"
mkdir "$project/AGENTS.md"
printf '%s\n' 'directory sentinel' > "$project/AGENTS.md/sentinel"
run_install "$project" --uninstall agents
assert_content 'directory sentinel' "$project/AGENTS.md/sentinel"
[ -z "$(find "$project" -name '.tierdecay-uninstall.*' -print -quit)" ] \
  || { printf 'FAIL: non-regular owned path was moved\n' >&2; exit 1; }
ok "uninstall refuses a non-regular owned path without moving it"

project="$(new_project symlink-owned-path)"
run_install "$project" agents
outside="$TMP_ROOT/symlink-owned-outside"
printf '%s\n' 'outside sentinel' > "$outside"
rm -f "$project/AGENTS.md"
if ln -s "$outside" "$project/AGENTS.md" 2>/dev/null && [ -L "$project/AGENTS.md" ]; then
  run_install "$project" --uninstall agents
  [ -L "$project/AGENTS.md" ] || { printf 'FAIL: owned symlink was moved\n' >&2; exit 1; }
  assert_content 'outside sentinel' "$outside"
  [ -z "$(find "$project" -name '.tierdecay-uninstall.*' -print -quit)" ] \
    || { printf 'FAIL: owned symlink created quarantine state\n' >&2; exit 1; }
  ok "uninstall refuses an owned symlink without moving it"
else
  ok "owned-symlink guard skipped where symlinks are unavailable"
fi

project="$(new_project quarantine-term)"
run_install "$project" agents
term_bin="$TMP_ROOT/term-bin"
term_signal="$TMP_ROOT/term-signal"
term_log="$TMP_ROOT/term.log"
real_cmp="$(command -v cmp)"
mkdir -p "$term_bin"
{
  printf '%s\n' '#!/usr/bin/env bash'
  printf '%s\n' 'case " $* " in'
  printf '%s\n' "  *'.tierdecay-uninstall.'*)"
  # Generated script expands TERM_SIGNAL when it runs.
  # shellcheck disable=SC2016
  printf '%s\n' '    : > "$TERM_SIGNAL"'
  printf '%s\n' '    sleep 2'
  printf '%s\n' '    ;;'
  printf '%s\n' 'esac'
  # Generated script expands REAL_CMP and its arguments when it runs.
  # shellcheck disable=SC2016
  printf '%s\n' 'exec "$REAL_CMP" "$@"'
} > "$term_bin/cmp"
chmod +x "$term_bin/cmp"
(
  cd "$project"
  exec env PATH="$term_bin:$PATH" TERM_SIGNAL="$term_signal" REAL_CMP="$real_cmp" \
    bash "$INSTALLER" --uninstall agents
) >"$term_log" 2>&1 &
term_pid=$!
deadline=$((SECONDS + 60))
term_wait_failure=""
while [ ! -e "$term_signal" ]; do
  if ! kill -0 "$term_pid" 2>/dev/null; then
    term_wait_failure="child exited before reaching quarantine"
    break
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    term_wait_failure="timed out waiting for quarantine"
    break
  fi
done
if [ -n "$term_wait_failure" ]; then
  if kill -0 "$term_pid" 2>/dev/null; then
    kill -TERM "$term_pid" 2>/dev/null || true
    term_cleanup_deadline=$((SECONDS + 3))
    while kill -0 "$term_pid" 2>/dev/null && [ "$SECONDS" -lt "$term_cleanup_deadline" ]; do :; done
    if kill -0 "$term_pid" 2>/dev/null; then
      kill -KILL "$term_pid" 2>/dev/null || true
    fi
  fi
  wait "$term_pid" 2>/dev/null || true
  printf 'FAIL: TERM preparation %s\n' "$term_wait_failure" >&2
  cat "$term_log" >&2
  exit 1
fi
kill -TERM "$term_pid"
if wait "$term_pid"; then
  printf 'FAIL: TERM-interrupted uninstall unexpectedly succeeded\n' >&2
  exit 1
else
  term_status=$?
fi
[ "$term_status" -eq 143 ] || { printf 'FAIL: TERM status was %s, expected 143\n' "$term_status" >&2; exit 1; }
recovered=""
if [ -f "$project/AGENTS.md" ] && cmp -s "$ROOT/adapters/agents-md/AGENTS.md" "$project/AGENTS.md"; then
  recovered="$project/AGENTS.md"
else
  for candidate in "$project"/AGENTS.md.tierdecay-recovered*; do
    if [ -f "$candidate" ] && cmp -s "$ROOT/adapters/agents-md/AGENTS.md" "$candidate"; then
      recovered="$candidate"
      break
    fi
  done
fi
[ -n "$recovered" ] || { printf 'FAIL: TERM lost quarantined content\n' >&2; exit 1; }
[ -z "$(find "$project" -name '.tierdecay-uninstall.*' -print -quit)" ] \
  || { printf 'FAIL: TERM left an orphaned quarantine\n' >&2; exit 1; }
ok "TERM after quarantine restores the original or an explicit recovery"

project="$(new_project quarantine-race)"
run_install "$project" agents
race_bin="$TMP_ROOT/race-bin"
race_signal="$TMP_ROOT/race-signal"
real_cmp="$(command -v cmp)"
mkdir -p "$race_bin"
{
  printf '%s\n' '#!/usr/bin/env bash'
  printf '%s\n' 'case " $* " in'
  printf '%s\n' "  *'.tierdecay-uninstall.'*)"
  # Generated script expands RACE_SIGNAL when it runs.
  # shellcheck disable=SC2016
  printf '%s\n' '    : > "$RACE_SIGNAL"'
  printf '%s\n' '    sleep 1'
  printf '%s\n' '    ;;'
  printf '%s\n' 'esac'
  # Generated script expands REAL_CMP and its arguments when it runs.
  # shellcheck disable=SC2016
  printf '%s\n' 'exec "$REAL_CMP" "$@"'
} > "$race_bin/cmp"
chmod +x "$race_bin/cmp"
(
  deadline=$((SECONDS + 10))
  while [ ! -e "$race_signal" ] && [ "$SECONDS" -lt "$deadline" ]; do :; done
  [ -e "$race_signal" ] || exit 1
  printf '%s\n' 'concurrent user replacement' > "$project/AGENTS.md"
) &
racer=$!
(cd "$project" && PATH="$race_bin:$PATH" RACE_SIGNAL="$race_signal" REAL_CMP="$real_cmp" bash "$INSTALLER" --uninstall agents) >/dev/null
wait "$racer"
assert_content 'concurrent user replacement' "$project/AGENTS.md"
run_install "$project" --uninstall agents
assert_content 'concurrent user replacement' "$project/AGENTS.md"
ok "quarantine closes the compare/remove replacement race"

project="$(new_project concurrent)"
run_install "$project" agents &
pid_agents=$!
run_install "$project" gemini &
pid_gemini=$!
wait "$pid_agents"
wait "$pid_gemini"
assert_exists "$project/AGENTS.md"
assert_exists "$project/GEMINI.md"
run_install "$project" --uninstall agents
assert_missing "$project/AGENTS.md"
assert_exists "$project/GEMINI.md"
run_install "$project" --uninstall gemini
assert_missing "$project/GEMINI.md"
if find "$project" \( -name 'install.lock' -o -name 'stage-*' -o -name '.tierdecay-uninstall.*' \) -print -quit | grep -q .; then
  printf 'FAIL: installer left temporary staging paths\n' >&2
  exit 1
fi
ok "concurrent installs serialize manifest updates without leaks"

printf 'PASS: %d installer checks\n' "$pass"
