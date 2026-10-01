'use strict';

const { SchemaError } = require('../errors');

const TYPES = ['string', 'number', 'boolean', 'object', 'array', 'null'];

function kindOf(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

module.exports = {
  name: 'type',
  code: 'E_TYPE',
  checkParam(param) {
    if (!TYPES.includes(param)) throw new SchemaError(`type must be one of ${TYPES.join(', ')}`);
  },
  check(value, param) {
    if (value === undefined) return null;
    const actual = kindOf(value);
    return actual === param ? null : { expected: param, actual };
  },
  examples: {
    params: ['string', 'array'],
    badParams: ['str', 3, undefined],
    valid: [['string', 'a'], ['array', []], ['null', null], ['number', undefined]],
    invalid: [['string', 3], ['object', []]]
  }
};
