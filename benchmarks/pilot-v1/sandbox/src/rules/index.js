'use strict';

// Rule registry, sorted by rule name. Every rule module exports:
//   name        — schema keyword
//   code        — error code, E_<UPPER_SNAKE_NAME>; must have a template in src/messages.js
//   checkParam(param)  — throws SchemaError for an invalid schema parameter
//   check(value, param) — returns null when valid, otherwise a details object
//                         providing every placeholder of the message template
//                         except {path}
//   examples    — { params: [...valid params], badParams: [...], valid: [[param, value]...], invalid: [[param, value]...] }
// Rules other than `required` treat `undefined` as valid: absence is the job
// of `required`.
const RULES = [
  require('./required'),
  require('./type'),
];

module.exports = { RULES };
