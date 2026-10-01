'use strict';

// Reference solutions, applied as edits so earlier instances of a class can be
// layered under later ones (a recurring class meets its own prior instances).
const fs = require('node:fs');
const path = require('node:path');

function edit(dir, file, fn) {
  const target = path.join(dir, file);
  fs.writeFileSync(target, fn(fs.readFileSync(target, 'utf8')));
}
function write(dir, file, text) { fs.writeFileSync(path.join(dir, file), text); }
function registerSorted(source, marker, line) {
  const start = source.indexOf(marker);
  const end = source.indexOf('];', start);
  const lines = source.slice(start + marker.length, end).split('\n').filter((l) => l.trim());
  lines.push(line);
  lines.sort();
  return `${source.slice(0, start + marker.length)}\n${lines.join('\n')}\n${source.slice(end)}`;
}
function readmeRow(dir, row) {
  edit(dir, 'README.md', (s) => {
    const lines = s.split('\n');
    const start = lines.findIndex((l) => l.startsWith('| command |')) + 2;
    let end = start;
    while (lines[end] && lines[end].startsWith('|')) end += 1;
    const rows = lines.slice(start, end).concat(row).sort();
    lines.splice(start, end - start, ...rows);
    return lines.join('\n');
  });
}
function changelog(dir, line) {
  edit(dir, 'CHANGELOG.md', (s) => s.replace('## Unreleased\n', `## Unreleased\n\n- ${line}\n`).replace(/(- .*\n)\n(- )/, '$1$2'));
}
function docsRow(dir, file, header, row) {
  edit(dir, file, (s) => `${s.trimEnd()}\n${row}\n`);
}

const REFS = {
  A1(dir) {
    write(dir, 'src/commands/delete.js', `'use strict';

const { NotFoundError } = require('../errors');

module.exports = {
  name: 'delete',
  summary: 'Remove a key and its value',
  spec: { positionals: ['key'], flags: {} },
  run(ctx, { args }) {
    if (!ctx.store.has(args.key)) throw new NotFoundError(\`no such key: \${args.key}\`);
    ctx.store.remove(args.key);
    ctx.store.save();
    ctx.io.out(\`deleted \${args.key}\`);
    return 0;
  }
};
`);
    edit(dir, 'src/commands/index.js', (s) => registerSorted(s, 'const COMMANDS = [', "  require('./delete'),"));
    readmeRow(dir, '| delete | `kvlite delete <key>` | Remove a key and its value |');
    changelog(dir, 'Added `delete` command.');
  },
  A2(dir) {
    write(dir, 'src/commands/rename.js', `'use strict';

const { NotFoundError, ConflictError } = require('../errors');

module.exports = {
  name: 'rename',
  summary: 'Move a value to a new key',
  spec: { positionals: ['from', 'to'], flags: { force: 'boolean' } },
  run(ctx, { args, flags }) {
    if (!ctx.store.has(args.from)) throw new NotFoundError(\`no such key: \${args.from}\`);
    if (args.from === args.to) { ctx.io.out(\`renamed \${args.from} -> \${args.to}\`); return 0; }
    if (ctx.store.has(args.to) && !flags.force) throw new ConflictError(\`key exists: \${args.to}\`);
    const record = ctx.store.get(args.from);
    ctx.store.remove(args.from);
    ctx.store.put(args.to, record);
    ctx.store.save();
    ctx.io.out(\`renamed \${args.from} -> \${args.to}\`);
    return 0;
  }
};
`);
    edit(dir, 'src/commands/index.js', (s) => registerSorted(s, 'const COMMANDS = [', "  require('./rename'),"));
    readmeRow(dir, '| rename | `kvlite rename <from> <to> [--force]` | Move a value to a new key |');
    changelog(dir, 'Added `rename` command.');
  },
  A3(dir) {
    write(dir, 'src/commands/count.js', `'use strict';

module.exports = {
  name: 'count',
  summary: 'Print how many keys exist',
  spec: { positionals: [], flags: { prefix: 'string', json: 'boolean' } },
  run(ctx, { flags }) {
    const prefix = flags.prefix || '';
    const count = ctx.store.keys().filter((key) => key.startsWith(prefix)).length;
    ctx.io.out(flags.json ? JSON.stringify({ count }) : String(count));
    return 0;
  }
};
`);
    edit(dir, 'src/commands/index.js', (s) => registerSorted(s, 'const COMMANDS = [', "  require('./count'),"));
    readmeRow(dir, '| count | `kvlite count [--prefix <prefix>] [--json]` | Print how many keys exist |');
    changelog(dir, 'Added `count` command.');
  },
  B1(dir) {
    write(dir, 'src/migrations/003-add-tags.js', `'use strict';

// v3: every record carries a \`tags\` array (empty when absent).
module.exports = {
  version: 3,
  name: 'add-tags',
  up(doc) {
    const records = {};
    for (const [key, record] of Object.entries(doc.records)) {
      records[key] = Array.isArray(record.tags) ? record : { ...record, tags: [] };
    }
    return { ...doc, records };
  }
};
`);
    edit(dir, 'src/migrations/index.js', (s) => registerSorted(s, 'const MIGRATIONS = [', "  require('./003-add-tags'),"));
    docsRow(dir, 'docs/MIGRATIONS.md', null, '| 3 | add-tags | every record carries a `tags` array |');
    changelog(dir, 'Migration `003-add-tags`: records carry `tags`.');
  },
  B2(dir) {
    write(dir, 'src/migrations/004-trim-values.js', `'use strict';

// v4: string values lose leading and trailing whitespace.
module.exports = {
  version: 4,
  name: 'trim-values',
  up(doc) {
    const records = {};
    for (const [key, record] of Object.entries(doc.records)) {
      records[key] = typeof record.value === 'string' ? { ...record, value: record.value.trim() } : record;
    }
    return { ...doc, records };
  }
};
`);
    edit(dir, 'src/migrations/index.js', (s) => registerSorted(s, 'const MIGRATIONS = [', "  require('./004-trim-values'),"));
    docsRow(dir, 'docs/MIGRATIONS.md', null, '| 4 | trim-values | string values are trimmed |');
    changelog(dir, 'Migration `004-trim-values`: string values are trimmed.');
  },
  B3(dir) {
    write(dir, 'src/migrations/005-rename-legacy-val.js', `'use strict';

// v5: the legacy \`val\` field becomes \`value\`; \`value\` wins when both exist.
module.exports = {
  version: 5,
  name: 'rename-legacy-val',
  up(doc) {
    const records = {};
    for (const [key, record] of Object.entries(doc.records)) {
      if (!Object.prototype.hasOwnProperty.call(record, 'val')) { records[key] = record; continue; }
      const { val, ...rest } = record;
      records[key] = Object.prototype.hasOwnProperty.call(rest, 'value') ? rest : { ...rest, value: val };
    }
    return { ...doc, records };
  }
};
`);
    edit(dir, 'src/migrations/index.js', (s) => registerSorted(s, 'const MIGRATIONS = [', "  require('./005-rename-legacy-val'),"));
    docsRow(dir, 'docs/MIGRATIONS.md', null, '| 5 | rename-legacy-val | legacy `val` becomes `value` |');
    changelog(dir, 'Migration `005-rename-legacy-val`: legacy `val` becomes `value`.');
  },
  C1(dir) {
    write(dir, 'src/rules/minLength.js', `'use strict';

const { SchemaError } = require('../errors');

module.exports = {
  name: 'minLength',
  code: 'E_MIN_LENGTH',
  checkParam(param) {
    if (!Number.isSafeInteger(param) || param < 0) throw new SchemaError('minLength expects a non-negative integer');
  },
  check(value, param) {
    if (typeof value !== 'string' && !Array.isArray(value)) return null;
    return value.length >= param ? null : { min: param, actual: value.length };
  },
  examples: {
    params: [0, 2],
    badParams: [-1, 1.5, '2'],
    valid: [[2, 'ab'], [1, ['x']], [2, 5], [3, undefined]],
    invalid: [[2, 'a'], [1, []]]
  }
};
`);
    edit(dir, 'src/rules/index.js', (s) => registerSorted(s, 'const RULES = [', "  require('./minLength'),"));
    edit(dir, 'src/messages.js', (s) => s.replace("  E_REQUIRED:", "  E_MIN_LENGTH: '{path} must have length >= {min} (got {actual})',\n  E_REQUIRED:"));
    docsRow(dir, 'docs/RULES.md', null, '| minLength | E_MIN_LENGTH | non-negative integer |');
    changelog(dir, 'Rule `minLength`.');
  },
  C2(dir) {
    write(dir, 'src/rules/pattern.js', `'use strict';

const { SchemaError } = require('../errors');

module.exports = {
  name: 'pattern',
  code: 'E_PATTERN',
  checkParam(param) {
    if (typeof param !== 'string') throw new SchemaError('pattern expects a regular expression source string');
    try { new RegExp(param, 'u'); } catch (error) { throw new SchemaError(\`invalid pattern: \${error.message}\`); }
  },
  check(value, param) {
    if (typeof value !== 'string') return null;
    return new RegExp(param, 'u').test(value) ? null : { pattern: param };
  },
  examples: {
    params: ['^a', '\\\\d+'],
    badParams: ['(', 3, null],
    valid: [['^a', 'abc'], ['^a', 3], ['^a', undefined]],
    invalid: [['^a', 'bac']]
  }
};
`);
    edit(dir, 'src/rules/index.js', (s) => registerSorted(s, 'const RULES = [', "  require('./pattern'),"));
    edit(dir, 'src/messages.js', (s) => s.replace("  E_REQUIRED:", "  E_PATTERN: '{path} must match /{pattern}/',\n  E_REQUIRED:"));
    docsRow(dir, 'docs/RULES.md', null, '| pattern | E_PATTERN | regular expression source string |');
    changelog(dir, 'Rule `pattern`.');
  },
  C3(dir) {
    write(dir, 'src/rules/enum.js', `'use strict';

const { SchemaError } = require('../errors');

const PRIMITIVE = new Set(['string', 'number', 'boolean']);

module.exports = {
  name: 'enum',
  code: 'E_ENUM',
  checkParam(param) {
    if (!Array.isArray(param) || param.length === 0) throw new SchemaError('enum expects a non-empty array');
    for (const item of param) {
      if (item !== null && !PRIMITIVE.has(typeof item)) throw new SchemaError('enum values must be primitives');
    }
  },
  check(value, param) {
    if (value === undefined) return null;
    return param.includes(value) ? null : { allowed: param.map((item) => JSON.stringify(item)).join(', ') };
  },
  examples: {
    params: [['a', 'b'], [1, null]],
    badParams: [[], 'a', [{}]],
    valid: [[['a', 'b'], 'a'], [[1, null], null], [['a'], undefined]],
    invalid: [[['a', 'b'], 'c'], [[1], '1']]
  }
};
`);
    edit(dir, 'src/rules/index.js', (s) => registerSorted(s, 'const RULES = [', "  require('./enum'),"));
    edit(dir, 'src/messages.js', (s) => s.replace("  E_REQUIRED:", "  E_ENUM: '{path} must be one of {allowed}',\n  E_REQUIRED:"));
    docsRow(dir, 'docs/RULES.md', null, '| enum | E_ENUM | non-empty array of primitives |');
    changelog(dir, 'Rule `enum`.');
  }
};

module.exports = { REFS };
