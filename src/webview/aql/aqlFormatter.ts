// Pretty-printer for AQL queries. Pure functions with no Monaco dependency, so they can be unit-tested.
//
// Style, matching the default query:
//   items.find({
//     "repo": "my-local-repo",
//     "name": {"$match": "*.jar"}
//   }).include("name", "repo").limit(50)
// Criteria with two or more conditions get one per line; anything else stays on one line while it
// fits in MAX_WIDTH, and is broken up one entry per line when it doesn't.

import { type AqlValue, parseAql } from './aqlValidator';

const INDENT = '  ';
const MAX_WIDTH = 80;

/** The formatted query, or undefined when a syntax error means it can't be parsed. */
export function formatAql(text: string): string | undefined {
  const { query } = parseAql(text);
  if (!query) {
    return text.trim() ? undefined : text;
  }

  const head = `${query.domain}.find(`;
  let criteria = '';
  if (query.criteria) {
    const forceBreak = query.criteria.type === 'object' && query.criteria.entries.length > 1;
    criteria = formatValue(query.criteria, '', head.length, forceBreak);
  }
  const findCall = `${head}${criteria})`;

  const methods = query.methods.map((m) => `.${m.name}(${m.args.map(inline).join(', ')})`);
  const lastLine = findCall.slice(findCall.lastIndexOf('\n') + 1);
  if (lastLine.length + methods.join('').length <= MAX_WIDTH) {
    return findCall + methods.join('');
  }
  // Too long for one line: one method per line.
  return [findCall, ...methods.map((m) => INDENT + m)].join('\n');
}

/** A value starting at `column` on a line indented by `indent`. */
function formatValue(value: AqlValue, indent: string, column: number, forceBreak = false): string {
  const flat = inline(value);
  if (!forceBreak && column + flat.length <= MAX_WIDTH) {
    return flat;
  }
  const inner = indent + INDENT;
  if (value.type === 'object' && value.entries.length) {
    const lines = value.entries.map((entry) => {
      const prefix = `${inner}"${entry.key}": `;
      return prefix + formatValue(entry.value, inner, prefix.length);
    });
    return `{\n${lines.join(',\n')}\n${indent}}`;
  }
  if (value.type === 'array' && value.items.length) {
    const lines = value.items.map((item) => inner + formatValue(item, inner, inner.length));
    return `[\n${lines.join(',\n')}\n${indent}]`;
  }
  return flat; // scalars and empty containers can't be broken up
}

/** A value on a single line. */
function inline(value: AqlValue): string {
  switch (value.type) {
    case 'object':
      return `{${value.entries.map((e) => `"${e.key}": ${inline(e.value)}`).join(', ')}}`;
    case 'array':
      return `[${value.items.map(inline).join(', ')}]`;
    case 'string':
      return `"${value.value}"`;
    case 'number':
      return value.raw;
    case 'boolean':
      return String(value.value);
    case 'null':
      return 'null';
  }
}
