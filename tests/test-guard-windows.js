"use strict";

// Invoked by test-guard.sh. This must exercise Win32, not a POSIX filename
// containing dots, and must not replace the literal command with encoded code.
if (process.platform !== "win32") {
  console.log("ok - literal Win32 alias integration # SKIP requires Windows");
  process.exit(77);
}

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const [guard, bash, tempRoot] = process.argv.slice(2);
let project;
let scratch;

try {
  assert(guard && bash && tempRoot, "guard, Bash and scratch paths are required");
  assert(path.isAbsolute(tempRoot), "scratch path must be absolute");
  scratch = fs.realpathSync(tempRoot);
  project = fs.mkdtempSync(path.join(scratch, "win32-alias-"));
  assert.strictEqual(path.dirname(fs.realpathSync(project)), scratch);

  const windowsRoot = process.env.SystemRoot || process.env.WINDIR;
  assert(windowsRoot, "Windows system directory is required");
  const powershellDir = path.join(windowsRoot, "System32", "WindowsPowerShell", "v1.0");
  fs.accessSync(path.join(powershellDir, "powershell.exe"));
  // MSYS exposes $BASH without .exe, but native Node filesystem checks do not
  // apply Windows executable-extension lookup.
  const bashExecutable = fs.existsSync(bash) ? bash : bash + ".exe";
  fs.accessSync(bashExecutable);
  fs.accessSync(guard);
  const env = { ...process.env, CLAUDE_PROJECT_DIR: project };
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === "path") || "PATH";
  env[pathKey] = powershellDir + path.delimiter + (env[pathKey] || "");

  function invoke(args, input) {
    const result = spawnSync(bashExecutable, ["--noprofile", "--norc", ...args], {
      cwd: project,
      env,
      input,
      encoding: "utf8",
      timeout: 30000,
      windowsHide: true,
    });
    if (result.error) throw result.error;
    assert.strictEqual(result.signal, null, "Bash must complete without a signal");
    return result;
  }

  function literalCommand(target) {
    const script = "[IO.File]::WriteAllText('" + target.replace(/'/g, "''") + "','changed')";
    // Bash double-quote escaping preserves the literal PowerShell path even
    // when the disposable parent directory contains spaces or metacharacters.
    return 'powershell.exe -NoProfile -NonInteractive -Command "' +
      script.replace(/["\\$`]/g, "\\$&") + '"';
  }

  function execute(command) {
    const result = invoke(["-c", command]);
    assert.strictEqual(result.status, 0, "literal command failed: " + result.stderr);
  }

  function guarded(command) {
    const result = invoke([guard], JSON.stringify({
      tool_name: "Bash", tool_input: { command },
    }));
    // Model the tool boundary: only a successful hook permits execution.
    // The exact command inspected by the hook is the one Bash receives.
    if (result.status === 0) execute(command);
    return result;
  }

  function expectDenied(command, sentinel, label) {
    fs.writeFileSync(sentinel, "sentinel");
    const result = guarded(command);
    const unchanged = fs.readFileSync(sentinel, "utf8") === "sentinel";
    assert(result.status === 2 && unchanged,
      label + ": expected hook exit 2 and unchanged sentinel; got " +
      result.status + ", unchanged=" + unchanged + "; " + result.stderr);
  }

  for (const directory of [".claude", ".tierdecay"]) {
    fs.mkdirSync(path.join(project, directory));
    const sentinel = path.join(project, directory, "routing-ledger.md");
    expectDenied(literalCommand(sentinel), sentinel, directory + " exact path");

    // A single dot is an actual intermediate-directory alias for this Win32
    // API. Wider dot/space suffixes are covered conservatively by lexical tests.
    const command = literalCommand(path.join(project, directory + ".", "routing-ledger.md"));
    fs.writeFileSync(sentinel, "sentinel");
    execute(command);
    assert.strictEqual(fs.readFileSync(sentinel, "utf8"), "changed",
      directory + ". must alias the canonical Win32 directory");
    expectDenied(command, sentinel, directory + ".");
  }

  const ordinary = path.join(project, "ordinary.txt");
  fs.writeFileSync(ordinary, "sentinel");
  const result = guarded(literalCommand(ordinary));
  assert.strictEqual(result.status, 0, "ordinary write must be allowed: " + result.stderr);
  assert.strictEqual(fs.readFileSync(ordinary, "utf8"), "changed");
  console.log("ok - literal Win32 aliases (2 unguarded writes, 2 guarded denials, 2 exact-path denials, 1 ordinary write)");
} catch (error) {
  console.error("literal Win32 alias integration failed: " + error.message);
  process.exitCode = 1;
} finally {
  if (project) {
    // Only remove the exact fixture created here, after checking its resolved
    // absolute parent. Never recurse over a caller-supplied directory.
    assert.strictEqual(path.dirname(fs.realpathSync(project)), scratch);
    fs.rmSync(project, { recursive: true, force: true });
  }
}
