'use strict';

const { UsageError } = require('./errors');

// Strict argument parser. `spec.flags` maps flag name -> 'boolean' | 'string'.
// `spec.positionals` is the exact list of required positional names; extra or
// missing positionals and unknown flags are usage errors.
function parseArgs(argv, spec) {
  const flags = {};
  const positionals = [];
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      const name = token.slice(2);
      const kind = (spec.flags || {})[name];
      if (!kind) throw new UsageError(`unknown flag: --${name}`);
      if (kind === 'boolean') { flags[name] = true; continue; }
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`flag --${name} requires a value`);
      flags[name] = value;
      i += 1;
    } else {
      positionals.push(token);
    }
  }
  const names = spec.positionals || [];
  if (positionals.length !== names.length) {
    throw new UsageError(`expected ${names.length} argument(s): ${names.map((n) => `<${n}>`).join(' ') || '(none)'}`);
  }
  const named = {};
  names.forEach((name, index) => { named[name] = positionals[index]; });
  return { flags, args: named };
}

module.exports = { parseArgs };
