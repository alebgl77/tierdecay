'use strict';

// All output goes through an injected context so commands stay testable.
// Commands must never write to process.stdout / console directly.
function createIO({ stdout = process.stdout, stderr = process.stderr } = {}) {
  return {
    out(line) { stdout.write(`${line}\n`); },
    err(line) { stderr.write(`${line}\n`); }
  };
}

module.exports = { createIO };
