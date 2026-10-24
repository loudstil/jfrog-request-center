// Context-aware AQL completions. Pure functions with no Monaco dependency, so they can be unit-tested.

export type AqlSuggestionKind = 'domain' | 'method' | 'operator' | 'field';

export interface AqlSuggestion {
  label: string;
  kind: AqlSuggestionKind;
  insertText: string;
  /** insertText uses snippet syntax ($1, ${1:default}, $0). */
  snippet?: boolean;
  detail: string;
}

export interface AqlCompletionResult {
  /** The partially typed word before the cursor, replaced when a suggestion is accepted. */
  partial: string;
  suggestions: AqlSuggestion[];
}

export const AQL_DOMAINS = [
  'items',
  'builds',
  'entries',
  'archive.entries',
  'build.promotions',
  'releases',
] as const;

export const AQL_METHODS: readonly AqlSuggestion[] = [
  method('find', 'find({$0})', 'Criteria to match'),
  method('include', 'include("$1")', 'Fields to return'),
  method('sort', 'sort({"\\$${1|asc,desc|}": ["$2"]})', 'Sort by fields'),
  method('limit', 'limit(${1:50})', 'Maximum number of results'),
  method('offset', 'offset(${1:0})', 'Number of results to skip'),
  method('distinct', 'distinct(${1:true})', 'Remove duplicate results'),
  method('transitive', 'transitive()', 'Search remote and virtual repositories'),
];

export const AQL_OPERATORS: readonly AqlSuggestion[] = [
  operator('$eq', 'Equals'),
  operator('$ne', 'Not equal'),
  operator('$gt', 'Greater than'),
  operator('$gte', 'Greater than or equal'),
  operator('$lt', 'Less than'),
  operator('$lte', 'Less than or equal'),
  operator('$match', 'Matches a wildcard pattern (* and ?)'),
  operator('$nmatch', 'Does not match a wildcard pattern'),
  operator('$before', 'Older than a relative time, e.g. "2w"'),
  operator('$last', 'Within a relative time, e.g. "7d"'),
  operator('$and', 'All criteria must match'),
  operator('$or', 'Any criterion must match'),
  operator('$msp', 'Properties must match on the same item'),
  operator('$asc', 'Sort ascending'),
  operator('$desc', 'Sort descending'),
];

const ITEM_FIELDS = [
  'repo',
  'path',
  'name',
  'type',
  'size',
  'depth',
  'created',
  'created_by',
  'modified',
  'modified_by',
  'updated',
  'original_md5',
  'actual_md5',
  'original_sha1',
  'actual_sha1',
  'sha256',
  'virtual_repos',
  '@',
  'property.key',
  'property.value',
  'stat.downloads',
  'stat.downloaded',
  'stat.downloaded_by',
  'artifact.module.build.name',
  'artifact.module.build.number',
  'archive.entry.name',
  'archive.entry.path',
];

const BUILD_FIELDS = [
  'name',
  'number',
  'url',
  'started',
  'created',
  'created_by',
  'modified',
  'modified_by',
  'module.name',
  'module.artifact.name',
  'module.dependency.name',
  'property.key',
  'property.value',
  'promotion.status',
];

const ENTRY_FIELDS = ['name', 'path', 'archive.item.name', 'archive.item.repo'];

const PROMOTION_FIELDS = ['created', 'created_by', 'status', 'repo', 'comment', 'user'];

const RELEASE_FIELDS = ['name', 'version', 'status', 'created', 'signature'];

const FIELDS_BY_DOMAIN: Record<string, readonly string[]> = {
  items: ITEM_FIELDS,
  builds: BUILD_FIELDS,
  entries: ENTRY_FIELDS,
  'archive.entries': ENTRY_FIELDS,
  'build.promotions': PROMOTION_FIELDS,
  releases: RELEASE_FIELDS,
};

/** Suggestions for the cursor position, given all query text before the cursor. */
export function getAqlCompletions(textBeforeCursor: string): AqlCompletionResult {
  const stringStart = openStringStart(textBeforeCursor);

  if (stringStart !== undefined) {
    const partial = textBeforeCursor.slice(stringStart + 1);
    // Values (after a colon), like "*.jar", are free text: nothing to suggest.
    if (textBeforeCursor.slice(0, stringStart).trimEnd().endsWith(':')) {
      return { partial, suggestions: [] };
    }
    if (partial.startsWith('$')) {
      return { partial, suggestions: [...AQL_OPERATORS] };
    }
    const fields = FIELDS_BY_DOMAIN[detectDomain(textBeforeCursor) ?? 'items'] ?? ITEM_FIELDS;
    return { partial, suggestions: fields.map(field) };
  }

  const afterDot = /\.\s*(\w*)$/.exec(textBeforeCursor);
  if (afterDot && startsWithDomain(textBeforeCursor)) {
    return { partial: afterDot[1], suggestions: [...AQL_METHODS] };
  }

  const leading = /^\s*([\w.]*)$/.exec(textBeforeCursor);
  if (leading) {
    return { partial: leading[1], suggestions: AQL_DOMAINS.map(domain) };
  }

  return { partial: '', suggestions: [] };
}

/** The domain the query searches, e.g. "items" in `items.find(...)`. */
export function detectDomain(text: string): string | undefined {
  return /^\s*([a-z_]+(?:\.[a-z_]+)?)\s*\.\s*find\b/.exec(text)?.[1];
}

/** True once the text starts with a known domain, so a "." means "call a method". */
function startsWithDomain(text: string): boolean {
  const head = /^\s*([a-z_]+(?:\.[a-z_]+)?)/.exec(text)?.[1] ?? '';
  return AQL_DOMAINS.some((d) => head === d || head.startsWith(`${d}.`));
}

/** Index of the opening quote if the cursor is inside a string literal. */
function openStringStart(text: string): number | undefined {
  let start: number | undefined;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start !== undefined && ch === '\\') {
      i++; // skip the escaped character
    } else if (ch === '"') {
      start = start === undefined ? i : undefined;
    }
  }
  return start;
}

function method(label: string, insertText: string, detail: string): AqlSuggestion {
  return { label, kind: 'method', insertText, snippet: true, detail };
}

function operator(label: string, detail: string): AqlSuggestion {
  return { label, kind: 'operator', insertText: label, detail };
}

function field(name: string): AqlSuggestion {
  return {
    label: name,
    kind: 'field',
    insertText: name,
    detail: name === '@' ? 'Property, e.g. "@build.name"' : 'Field',
  };
}

function domain(name: string): AqlSuggestion {
  return { label: name, kind: 'domain', insertText: name, detail: 'Domain' };
}
