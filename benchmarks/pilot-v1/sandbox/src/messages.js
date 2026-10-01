'use strict';

// Message catalog: one template per error code. Placeholders use {name} and
// are filled from the rule's failure details plus {path}. Every placeholder in
// a template must be provided, or format() throws.
const MESSAGES = {
  E_REQUIRED: '{path} is required',
  E_TYPE: '{path} must be of type {expected} (got {actual})',
};

function format(code, details) {
  const template = MESSAGES[code];
  if (!template) throw new Error(`no message for code ${code}`);
  return template.replace(/\{([a-zA-Z]+)\}/g, (match, name) => {
    if (details[name] === undefined) throw new Error(`message ${code} is missing placeholder ${name}`);
    return String(details[name]);
  });
}

module.exports = { MESSAGES, format };
