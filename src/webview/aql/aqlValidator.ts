// Syntax check for AQL queries. Pure functions with no Monaco dependency, so they can be unit-tested.
//
// Structure is checked strictly (it's the same for every Artifactory version); things that vary
// between versions, like the set of domains and their fields, only produce warnings.

import { AQL_DOMAINS, AQL_METHODS } from './aqlCompletions';
import { checkFieldPath } from './aqlSchema';

export interface AqlDiagnostic {
  message: string;
  severity: 'error' | 'warning';
  /** Offsets into the query text: [start, end). */
  start: number;
  end: number;
}

const METHOD_NAMES = new Set(AQL_METHODS.map((m) => m.label));
const COMPARISON_OPERATORS = new Set([
  '$eq',
  '$ne',
  '$gt',
  '$gte',
  '$lt',
  '$lte',
  '$match',
  '$nmatch',
  '$before',
  '$last',
]);
const LOGICAL_OPERATORS = new Set(['$and', '$or', '$msp']);
const STRING_ONLY_OPERATORS = new Set(['$match', '$nmatch', '$before', '$last']);

/** 1-based line and column of an offset, as shown to users ("line 3, column 12"). */
export function lineColumnAt(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  return { line, column: offset - before.lastIndexOf('\n') };
}

/** A parsed query, e.g. `items.find({...}).include("name").limit(10)`. */
export interface AqlQuery {
  domain: string;
  /** The find() argument; undefined for `find()`. */
  criteria?: AqlValue;
  methods: { name: string; args: AqlValue[] }[];
}

export interface AqlParseResult {
  /** Undefined for an empty query, or when a syntax error stopped the parser. */
  query?: AqlQuery;
  diagnostics: AqlDiagnostic[];
}

/** Checks a query. An empty query has no diagnostics. */
export function validateAql(text: string): AqlDiagnostic[] {
  return parseAql(text).diagnostics;
}

/** Parses and checks a query. Syntax errors stop at the first one; other problems are all kept. */
export function parseAql(text: string): AqlParseResult {
  try {
    return new Parser(tokenize(text)).parseQuery();
  } catch (err) {
    if (err instanceof SyntaxProblem) {
      return {
        diagnostics: [{ message: err.message, severity: 'error', start: err.start, end: err.end }],
      };
    }
    throw err;
  }
}

// ---- Tokens ----

type TokenKind = 'ident' | 'string' | 'number' | 'punct' | 'eof';

interface Token {
  kind: TokenKind;
  value: string;
  start: number;
  end: number;
}

class SyntaxProblem extends Error {
  constructor(
    message: string,
    readonly start: number,
    readonly end: number,
  ) {
    super(message);
  }
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (/\s/.test(ch)) {
      i++;
    } else if ('.(){}[]:,'.includes(ch)) {
      tokens.push({ kind: 'punct', value: ch, start: i, end: i + 1 });
      i++;
    } else if (ch === '"') {
      tokens.push(readString(text, i));
      i = tokens[tokens.length - 1].end;
    } else if (ch === "'") {
      throw new SyntaxProblem('Strings must use double quotes (")', i, i + 1);
    } else if (/[-\d]/.test(ch)) {
      const match = /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
      if (!match) {
        throw new SyntaxProblem(`Unexpected "${ch}"`, i, i + 1);
      }
      tokens.push({ kind: 'number', value: match[0], start: i, end: i + match[0].length });
      i += match[0].length;
    } else if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_]\w*/.exec(text.slice(i))!;
      tokens.push({ kind: 'ident', value: match[0], start: i, end: i + match[0].length });
      i += match[0].length;
    } else {
      throw new SyntaxProblem(`Unexpected "${ch}"`, i, i + 1);
    }
  }
  tokens.push({ kind: 'eof', value: '', start: text.length, end: text.length });
  return tokens;
}

function readString(text: string, start: number): Token {
  let i = start + 1;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\\') {
      i += 2;
    } else if (ch === '"') {
      return { kind: 'string', value: text.slice(start + 1, i), start, end: i + 1 };
    } else if (ch === '\n') {
      break;
    } else {
      i++;
    }
  }
  const lineEnd = text.indexOf('\n', start);
  throw new SyntaxProblem('Unterminated string', start, lineEnd === -1 ? text.length : lineEnd);
}

// ---- Values (the JSON-like parts) ----

/** Strings and keys keep their text as written (escapes included), numbers keep `raw`. */
export type AqlValue =
  | { type: 'object'; entries: AqlEntry[]; start: number; end: number }
  | { type: 'array'; items: AqlValue[]; start: number; end: number }
  | { type: 'string'; value: string; start: number; end: number }
  | { type: 'number'; value: number; raw: string; start: number; end: number }
  | { type: 'boolean'; value: boolean; start: number; end: number }
  | { type: 'null'; start: number; end: number };

export interface AqlEntry {
  key: string;
  keyStart: number;
  keyEnd: number;
  value: AqlValue;
}

class Parser {
  private index = 0;
  private readonly diagnostics: AqlDiagnostic[] = [];
  /** The query's domain, for checking field names. */
  private domain = '';

  constructor(private readonly tokens: Token[]) {}

  parseQuery(): AqlParseResult {
    if (this.peek().kind === 'eof') {
      return { diagnostics: [] };
    }

    // Domain: one name, or two joined by a dot (archive.entries, build.promotions).
    const first = this.expectIdent('A query starts with a domain, e.g. items.find({...})');
    let domain = first.value;
    let domainEnd = first.end;
    // Only a "name.name." prefix is a dotted domain; "items.fnd(" is a misspelled find.
    while (
      this.isPunct('.') &&
      this.peek(1).kind === 'ident' &&
      this.peek(1).value !== 'find' &&
      this.peek(2).kind === 'punct' &&
      this.peek(2).value === '.'
    ) {
      this.next();
      const part = this.next();
      domain += `.${part.value}`;
      domainEnd = part.end;
    }
    if (!(AQL_DOMAINS as readonly string[]).includes(domain)) {
      this.warn(
        `Unknown domain "${domain}". Common domains: ${AQL_DOMAINS.join(', ')}`,
        first.start,
        domainEnd,
      );
    }

    if (!this.isPunct('.') || this.peek(1).value !== 'find') {
      const at = this.isPunct('.') ? this.peek(1) : this.peek();
      throw new SyntaxProblem(
        `Expected .find(...) after "${domain}"`,
        at.start,
        Math.max(at.end, at.start + 1),
      );
    }
    this.domain = domain;
    const query: AqlQuery = { domain, methods: [] };
    this.next();
    this.next();
    const findOpen = this.expectPunct('(', 'Expected "(" after find');
    if (!this.isPunct(')')) {
      const criteria = this.parseValue();
      query.criteria = criteria;
      if (criteria.type !== 'object') {
        this.error(
          'find() takes a criteria object, e.g. {"repo": "my-repo"}',
          criteria.start,
          criteria.end,
        );
      } else {
        this.checkCriteria(criteria);
      }
    }
    this.expectClosing(')', findOpen);

    const used = new Set<string>();
    while (this.isPunct('.')) {
      this.next();
      const name = this.expectIdent('Expected a method name after "."');
      const open = this.expectPunct('(', `Expected "(" after ${name.value}`);
      const args: AqlValue[] = [];
      if (!this.isPunct(')')) {
        args.push(this.parseValue());
        while (this.isPunct(',')) {
          this.next();
          args.push(this.parseValue());
        }
      }
      const close = this.expectClosing(')', open);
      query.methods.push({ name: name.value, args });
      this.checkMethod(name, args, close.end, used);
    }

    const extra = this.peek();
    if (extra.kind !== 'eof') {
      throw new SyntaxProblem(
        `Unexpected "${extra.value}" after the end of the query`,
        extra.start,
        extra.end,
      );
    }
    return { query, diagnostics: this.diagnostics };
  }

  private parseValue(): AqlValue {
    const token = this.peek();
    if (token.kind === 'punct' && token.value === '{') {
      return this.parseObject();
    }
    if (token.kind === 'punct' && token.value === '[') {
      return this.parseArray();
    }
    this.next();
    switch (token.kind) {
      case 'string':
        return { type: 'string', value: token.value, start: token.start, end: token.end };
      case 'number':
        return {
          type: 'number',
          value: Number(token.value),
          raw: token.value,
          start: token.start,
          end: token.end,
        };
      case 'ident':
        if (token.value === 'true' || token.value === 'false') {
          return {
            type: 'boolean',
            value: token.value === 'true',
            start: token.start,
            end: token.end,
          };
        }
        if (token.value === 'null') {
          return { type: 'null', start: token.start, end: token.end };
        }
        throw new SyntaxProblem(
          `Unexpected "${token.value}". Did you mean "${token.value}" (in double quotes)?`,
          token.start,
          token.end,
        );
      case 'eof':
        throw new SyntaxProblem('Unexpected end of query', token.start, token.end);
      default:
        throw new SyntaxProblem(`Unexpected "${token.value}"`, token.start, token.end);
    }
  }

  private parseObject(): AqlValue {
    const open = this.next();
    const entries: AqlEntry[] = [];
    if (!this.isPunct('}')) {
      for (;;) {
        const key = this.peek();
        if (key.kind !== 'string') {
          throw new SyntaxProblem(
            key.kind === 'eof'
              ? 'Unexpected end of query: missing "}"'
              : key.kind === 'ident'
                ? `Property names must be in double quotes: "${key.value}"`
                : 'Expected a property name in double quotes',
            key.start,
            Math.max(key.end, key.start + 1),
          );
        }
        this.next();
        this.expectPunct(':', `Expected ":" after "${key.value}"`);
        entries.push({
          key: key.value,
          keyStart: key.start,
          keyEnd: key.end,
          value: this.parseValue(),
        });
        if (!this.isPunct(',')) {
          break;
        }
        const comma = this.next();
        if (this.isPunct('}')) {
          throw new SyntaxProblem('Trailing comma', comma.start, comma.end);
        }
      }
    }
    const close = this.expectClosing('}', open);
    return { type: 'object', entries, start: open.start, end: close.end };
  }

  private parseArray(): AqlValue {
    const open = this.next();
    const items: AqlValue[] = [];
    if (!this.isPunct(']')) {
      for (;;) {
        items.push(this.parseValue());
        if (!this.isPunct(',')) {
          break;
        }
        const comma = this.next();
        if (this.isPunct(']')) {
          throw new SyntaxProblem('Trailing comma', comma.start, comma.end);
        }
      }
    }
    const close = this.expectClosing(']', open);
    return { type: 'array', items, start: open.start, end: close.end };
  }

  // ---- Semantic checks ----

  private checkCriteria(criteria: Extract<AqlValue, { type: 'object' }>): void {
    for (const entry of criteria.entries) {
      if (entry.key.startsWith('$')) {
        this.checkLogical(entry);
      } else if (!entry.key.trim()) {
        this.error('Empty field name', entry.keyStart, entry.keyEnd);
      } else {
        this.checkField(entry.key, entry.keyStart, entry.keyEnd);
        this.checkFieldValue(entry);
      }
    }
  }

  private checkLogical(entry: AqlEntry): void {
    if (COMPARISON_OPERATORS.has(entry.key)) {
      this.error(
        `${entry.key} compares a field, e.g. {"name": {"${entry.key}": ...}}`,
        entry.keyStart,
        entry.keyEnd,
      );
      return;
    }
    if (!LOGICAL_OPERATORS.has(entry.key)) {
      this.error(`Unknown operator ${entry.key}`, entry.keyStart, entry.keyEnd);
      return;
    }
    const { value } = entry;
    const parts = value.type === 'array' ? value.items : [value];
    if (value.type === 'array' && !value.items.length) {
      this.error(`${entry.key} needs at least one condition`, value.start, value.end);
    }
    for (const part of parts) {
      if (part.type === 'object') {
        this.checkCriteria(part);
      } else {
        this.error(
          `${entry.key} takes criteria objects, e.g. [{"repo": "a"}, {"repo": "b"}]`,
          part.start,
          part.end,
        );
      }
    }
  }

  private checkFieldValue(entry: AqlEntry): void {
    const { value } = entry;
    if (value.type === 'array') {
      this.warn(
        `To match several values, use $or, e.g. {"$or": [{"${entry.key}": ...}, ...]}`,
        value.start,
        value.end,
      );
      return;
    }
    if (value.type !== 'object') {
      return; // equality with a scalar
    }
    if (!value.entries.length) {
      this.error(
        `Expected a comparison such as {"$eq": ...} for "${entry.key}"`,
        value.start,
        value.end,
      );
    }
    for (const comparison of value.entries) {
      if (!comparison.key.startsWith('$')) {
        this.error(
          `Expected a comparison operator such as $eq or $match, not "${comparison.key}"`,
          comparison.keyStart,
          comparison.keyEnd,
        );
      } else if (!COMPARISON_OPERATORS.has(comparison.key)) {
        this.error(
          LOGICAL_OPERATORS.has(comparison.key)
            ? `${comparison.key} combines criteria and can't be applied to a single field`
            : `Unknown operator ${comparison.key}`,
          comparison.keyStart,
          comparison.keyEnd,
        );
      } else if (comparison.value.type === 'object' || comparison.value.type === 'array') {
        this.error(
          `${comparison.key} takes a single value`,
          comparison.value.start,
          comparison.value.end,
        );
      } else if (STRING_ONLY_OPERATORS.has(comparison.key) && comparison.value.type !== 'string') {
        this.error(
          `${comparison.key} takes a string`,
          comparison.value.start,
          comparison.value.end,
        );
      }
    }
  }

  private checkMethod(name: Token, args: AqlValue[], end: number, used: Set<string>): void {
    const span = (message: string) => this.error(message, name.start, end);
    if (name.value === 'find') {
      span('find() can only come right after the domain');
      return;
    }
    if (!METHOD_NAMES.has(name.value)) {
      this.error(
        `Unknown method "${name.value}". Expected one of: ${[...METHOD_NAMES].filter((m) => m !== 'find').join(', ')}`,
        name.start,
        name.end,
      );
      return;
    }
    if (used.has(name.value)) {
      span(`${name.value}() is used more than once`);
    }
    used.add(name.value);

    switch (name.value) {
      case 'include':
        if (!args.length) {
          span('include() needs at least one field, e.g. include("name", "repo")');
        }
        for (const arg of args) {
          if (arg.type !== 'string') {
            this.error('include() takes field names in double quotes', arg.start, arg.end);
          } else {
            this.checkField(arg.value, arg.start, arg.end, true);
          }
        }
        break;
      case 'sort':
        this.checkSort(args, () => span('sort() takes one object, e.g. sort({"$asc": ["name"]})'));
        break;
      case 'limit':
      case 'offset': {
        const [arg] = args;
        if (
          args.length !== 1 ||
          arg.type !== 'number' ||
          !Number.isInteger(arg.value) ||
          arg.value < 0
        ) {
          span(
            `${name.value}() takes one whole number, e.g. ${name.value}(${name.value === 'limit' ? 50 : 0})`,
          );
        }
        break;
      }
      case 'distinct':
        if (args.length !== 1 || args[0].type !== 'boolean') {
          span('distinct() takes true or false');
        }
        break;
      case 'transitive':
        if (args.length) {
          span('transitive() takes no arguments');
        }
        break;
    }
  }

  private checkSort(args: AqlValue[], usage: () => void): void {
    const [arg] = args;
    if (args.length !== 1 || arg.type !== 'object' || arg.entries.length !== 1) {
      usage();
      return;
    }
    const [entry] = arg.entries;
    if (entry.key !== '$asc' && entry.key !== '$desc') {
      this.error('Expected "$asc" or "$desc"', entry.keyStart, entry.keyEnd);
      return;
    }
    const fields = entry.value;
    if (
      fields.type !== 'array' ||
      !fields.items.length ||
      fields.items.some((f) => f.type !== 'string')
    ) {
      this.error(
        `${entry.key} takes a list of field names, e.g. ["name"]`,
        fields.start,
        fields.end,
      );
      return;
    }
    for (const field of fields.items) {
      if (field.type === 'string') {
        this.checkField(field.value, field.start, field.end);
      }
    }
  }

  /** Warns about field names the domain doesn't have. */
  private checkField(path: string, start: number, end: number, allowWildcard = false): void {
    const problem = checkFieldPath(this.domain, path, { allowWildcard });
    if (problem) {
      this.warn(problem, start, end);
    }
  }

  // ---- Token helpers ----

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.index + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const token = this.peek();
    if (token.kind !== 'eof') {
      this.index++;
    }
    return token;
  }

  private isPunct(value: string): boolean {
    const token = this.peek();
    return token.kind === 'punct' && token.value === value;
  }

  private expectIdent(message: string): Token {
    const token = this.peek();
    if (token.kind !== 'ident') {
      throw new SyntaxProblem(message, token.start, Math.max(token.end, token.start + 1));
    }
    return this.next();
  }

  private expectPunct(value: string, message: string): Token {
    if (!this.isPunct(value)) {
      const token = this.peek();
      throw new SyntaxProblem(message, token.start, Math.max(token.end, token.start + 1));
    }
    return this.next();
  }

  /** Expects the bracket closing `open`; the error points at the unclosed opening bracket. */
  private expectClosing(value: string, open: Token): Token {
    if (this.isPunct(value)) {
      return this.next();
    }
    const token = this.peek();
    if (token.kind === 'eof') {
      throw new SyntaxProblem(
        `Missing "${value}" to close this "${open.value}"`,
        open.start,
        open.end,
      );
    }
    // Inside {...} and [...] a comma could also continue the list; parentheses hold one thing.
    const expected = value === ')' ? `"${value}"` : `"," or "${value}"`;
    throw new SyntaxProblem(
      `Expected ${expected} but found "${token.value}"`,
      token.start,
      token.end,
    );
  }

  private error(message: string, start: number, end: number): void {
    this.diagnostics.push({ message, severity: 'error', start, end });
  }

  private warn(message: string, start: number, end: number): void {
    this.diagnostics.push({ message, severity: 'warning', start, end });
  }
}
