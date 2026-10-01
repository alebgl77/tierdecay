'use strict';

const { SchemaError } = require('../errors');

module.exports = {
  name: 'required',
  code: 'E_REQUIRED',
  checkParam(param) {
    if (typeof param !== 'boolean') throw new SchemaError('required expects a boolean');
  },
  check(value, param) {
    if (param && value === undefined) return {};
    return null;
  },
  examples: {
    params: [true, false],
    badParams: ['yes', 1, null],
    valid: [[true, 'x'], [false, undefined], [true, 0]],
    invalid: [[true, undefined]]
  }
};
