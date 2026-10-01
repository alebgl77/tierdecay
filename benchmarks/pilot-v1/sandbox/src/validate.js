'use strict';

const { RULES } = require('./rules');
const { format } = require('./messages');
const { SchemaError } = require('./errors');

// A schema node is { rules?: { [ruleName]: param }, properties?: { [key]: node } }.
// compile() validates every parameter up front so validation never meets a bad
// schema at runtime. Paths are JSON Pointers ("" is the root, "/a/b" nested).
function compile(schema, pointer = '') {
  if (!schema || typeof schema !== 'object') throw new SchemaError(`schema at "${pointer}" must be an object`);
  const rules = [];
  for (const [name, param] of Object.entries(schema.rules || {})) {
    const rule = RULES.find((candidate) => candidate.name === name);
    if (!rule) throw new SchemaError(`unknown rule "${name}" at "${pointer}"`);
    rule.checkParam(param);
    rules.push({ rule, param });
  }
  const properties = {};
  for (const [key, child] of Object.entries(schema.properties || {})) {
    properties[key] = compile(child, `${pointer}/${escape(key)}`);
  }
  return { rules, properties };
}

function escape(key) {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

function validate(compiled, value, pointer = '') {
  const errors = [];
  for (const { rule, param } of compiled.rules) {
    const details = rule.check(value, param);
    if (details) {
      const path = pointer || '/';
      errors.push({ code: rule.code, path, message: format(rule.code, { ...details, path }) });
    }
  }
  const isObject = value !== null && typeof value === 'object' && !Array.isArray(value);
  for (const [key, child] of Object.entries(compiled.properties)) {
    errors.push(...validate(child, isObject ? value[key] : undefined, `${pointer}/${escape(key)}`));
  }
  return errors;
}

module.exports = { compile, validate };
