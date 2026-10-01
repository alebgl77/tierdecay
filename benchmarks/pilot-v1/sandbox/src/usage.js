'use strict';

// Canonical one-line usage string for a command. README's command table must
// show exactly this string for every registered command.
function usage(command) {
  const parts = ['kvlite', command.name];
  for (const name of command.spec.positionals || []) parts.push(`<${name}>`);
  for (const [flag, kind] of Object.entries(command.spec.flags || {})) {
    parts.push(kind === 'boolean' ? `[--${flag}]` : `[--${flag} <${flag}>]`);
  }
  return parts.join(' ');
}

module.exports = { usage };
