import { describe, expect, it } from 'vitest';
import { type AqlDiagnostic, lineColumnAt, validateAql } from './aqlValidator';

/** Diagnostics as "severity: message @ marked text", which is easy to read in failures. */
function check(query: string): string[] {
  return validateAql(query).map(
    (d: AqlDiagnostic) => `${d.severity}: ${d.message} @ ${query.slice(d.start, d.end)}`,
  );
}

describe('validateAql: valid queries', () => {
  it.each([
    ['empty', ''],
    ['whitespace', '  \n '],
    ['no criteria', 'items.find()'],
    ['empty criteria', 'items.find({})'],
    [
      'the default query',
      `items.find({
  "repo": "my-local-repo",
  "name": {"$match": "*.jar"}
}).include("name", "repo", "path", "created").limit(50)`,
    ],
    [
      'logical operators and comparisons',
      'items.find({"$and": [{"repo": "libs"}, {"$or": [{"size": {"$gt": 1000}}, {"name": {"$nmatch": "*.pom"}}]}]})',
    ],
    ['$or with an object', 'items.find({"$or": {"repo": "a"}})'],
    [
      'properties and relative time',
      'items.find({"@build.name": "app", "created": {"$last": "7d"}})',
    ],
    ['$msp', 'items.find({"$msp": [{"@license": "MIT"}, {"@team": "web"}]})'],
    [
      'every modifier',
      'items.find().include("*").sort({"$desc": ["size", "name"]}).offset(10).limit(5).distinct(false).transitive()',
    ],
    ['dotted domain', 'build.promotions.find({"status": "released"})'],
    [
      'numbers, booleans and null',
      'items.find({"size": 0, "depth": -1.5e2, "@virtual": true, "@x": null})',
    ],
    ['escaped quotes', 'items.find({"name": "a\\"b"})'],
    [
      'related fields',
      'items.find({"artifact.module.build.name": "app", "stat.downloads": {"$gt": 0}, "archive.entry.name": "x"})',
    ],
    [
      'build fields',
      'builds.find({"module.artifact.item.repo": "libs", "promotion.status": "ok"})',
    ],
    [
      'entry fields',
      'entries.find({"archive.item.repo": "libs"}).include("name", "archive.item.*")',
    ],
    ['include wildcards', 'items.find().include("*", "property.*", "stat.*", "@build.name")'],
  ])('%s', (_, query) => {
    expect(check(query)).toEqual([]);
  });
});

describe('validateAql: syntax errors', () => {
  it.each([
    ['missing find', 'items', 'error: Expected .find(...) after "items" @ '],
    ['misspelled find', 'items.fnd({})', 'error: Expected .find(...) after "items" @ fnd'],
    ['no domain', '.find({})', 'error: A query starts with a domain, e.g. items.find({...}) @ .'],
    ['unclosed find', 'items.find({"repo": "libs"}', 'error: Missing ")" to close this "(" @ ('],
    ['unclosed object', 'items.find({"repo": "libs"', 'error: Missing "}" to close this "{" @ {'],
    [
      'ends after a comma',
      'items.find({"repo": "libs",',
      'error: Unexpected end of query: missing "}" @ ',
    ],
    [
      'missing comma',
      'items.find({"repo": "libs" "name": "x"})',
      'error: Expected "," or "}" but found "name" @ "name"',
    ],
    ['trailing comma', 'items.find({"repo": "libs",})', 'error: Trailing comma @ ,'],
    ['trailing comma in include', 'items.find().include("a",)', 'error: Unexpected ")" @ )'],
    ['missing colon', 'items.find({"repo" "libs"})', 'error: Expected ":" after "repo" @ "libs"'],
    [
      'unquoted key',
      'items.find({repo: "libs"})',
      'error: Property names must be in double quotes: "repo" @ repo',
    ],
    [
      'unquoted value',
      'items.find({"repo": libs})',
      'error: Unexpected "libs". Did you mean "libs" (in double quotes)? @ libs',
    ],
    [
      'single quotes',
      "items.find({'repo': 'x'})",
      'error: Strings must use double quotes (") @ \'',
    ],
    ['unterminated string', 'items.find({"repo": "libs})', 'error: Unterminated string @ "libs})'],
    ['stray character', 'items.find({}) ;', 'error: Unexpected ";" @ ;'],
    [
      'text after the query',
      'items.find({}) limit(5)',
      'error: Unexpected "limit" after the end of the query @ limit',
    ],
    ['two find arguments', 'items.find({}, {})', 'error: Expected ")" but found "," @ ,'],
    ['method without parentheses', 'items.find().limit', 'error: Expected "(" after limit @ '],
  ])('%s', (_, query, expected) => {
    expect(check(query)).toEqual([expected]);
  });

  it('marks an unclosed string only up to the end of its line', () => {
    const query = 'items.find({"name": "x\n})';
    const [d] = validateAql(query);
    expect(query.slice(d.start, d.end)).toBe('"x');
  });
});

describe('validateAql: semantic errors', () => {
  it.each([
    [
      'find criteria not an object',
      'items.find("libs")',
      'error: find() takes a criteria object, e.g. {"repo": "my-repo"} @ "libs"',
    ],
    [
      'unknown operator',
      'items.find({"name": {"$like": "x"}})',
      'error: Unknown operator $like @ "$like"',
    ],
    [
      'comparison at top level',
      'items.find({"$match": "x"})',
      'error: $match compares a field, e.g. {"name": {"$match": ...}} @ "$match"',
    ],
    [
      'unknown logical operator',
      'items.find({"$xor": []})',
      'error: Unknown operator $xor @ "$xor"',
    ],
    [
      'logical operator on a field',
      'items.find({"name": {"$or": []}})',
      'error: $or combines criteria and can\'t be applied to a single field @ "$or"',
    ],
    [
      'nested field instead of operator',
      'items.find({"name": {"value": "x"}})',
      'error: Expected a comparison operator such as $eq or $match, not "value" @ "value"',
    ],
    [
      'empty comparison',
      'items.find({"name": {}})',
      'error: Expected a comparison such as {"$eq": ...} for "name" @ {}',
    ],
    [
      '$match with a number',
      'items.find({"name": {"$match": 5}})',
      'error: $match takes a string @ 5',
    ],
    [
      'comparison with an object',
      'items.find({"size": {"$gt": {"a": 1}}})',
      'error: $gt takes a single value @ {"a": 1}',
    ],
    [
      '$and with a string',
      'items.find({"$and": ["x"]})',
      'error: $and takes criteria objects, e.g. [{"repo": "a"}, {"repo": "b"}] @ "x"',
    ],
    ['empty $or', 'items.find({"$or": []})', 'error: $or needs at least one condition @ []'],
    ['empty field name', 'items.find({"": "x"})', 'error: Empty field name @ ""'],
    [
      'unknown method',
      'items.find().order("name")',
      'error: Unknown method "order". Expected one of: include, sort, limit, offset, distinct, transitive @ order',
    ],
    [
      'find as a modifier',
      'items.find().find()',
      'error: find() can only come right after the domain @ find()',
    ],
    [
      'include without fields',
      'items.find().include()',
      'error: include() needs at least one field, e.g. include("name", "repo") @ include()',
    ],
    [
      'include with a number',
      'items.find().include("name", 5)',
      'error: include() takes field names in double quotes @ 5',
    ],
    [
      'negative limit',
      'items.find().limit(-1)',
      'error: limit() takes one whole number, e.g. limit(50) @ limit(-1)',
    ],
    [
      'fractional offset',
      'items.find().offset(1.5)',
      'error: offset() takes one whole number, e.g. offset(0) @ offset(1.5)',
    ],
    [
      'limit as a string',
      'items.find().limit("10")',
      'error: limit() takes one whole number, e.g. limit(50) @ limit("10")',
    ],
    [
      'distinct without a boolean',
      'items.find().distinct()',
      'error: distinct() takes true or false @ distinct()',
    ],
    [
      'transitive with arguments',
      'items.find().transitive(true)',
      'error: transitive() takes no arguments @ transitive(true)',
    ],
    [
      'sort with the wrong key',
      'items.find().sort({"$up": ["name"]})',
      'error: Expected "$asc" or "$desc" @ "$up"',
    ],
    [
      'sort with a string',
      'items.find().sort({"$asc": "name"})',
      'error: $asc takes a list of field names, e.g. ["name"] @ "name"',
    ],
    [
      'sort with nothing',
      'items.find().sort()',
      'error: sort() takes one object, e.g. sort({"$asc": ["name"]}) @ sort()',
    ],
    [
      'repeated method',
      'items.find().limit(1).limit(2)',
      'error: limit() is used more than once @ limit(2)',
    ],
  ])('%s', (_, query, expected) => {
    expect(check(query)).toEqual([expected]);
  });

  it('reports several semantic problems at once', () => {
    expect(check('items.find({"name": {"$like": "x"}}).limit(-1)')).toEqual([
      'error: Unknown operator $like @ "$like"',
      'error: limit() takes one whole number, e.g. limit(50) @ limit(-1)',
    ]);
  });
});

describe('validateAql: warnings', () => {
  it('warns (not errors) about unknown domains, which vary by version', () => {
    const [d] = validateAql('artifacts.find({})');
    expect(d.severity).toBe('warning');
    expect(d.message).toMatch(/^Unknown domain "artifacts"/);
  });

  it('warns about arrays as field values', () => {
    expect(check('items.find({"repo": ["a", "b"]})')).toEqual([
      'warning: To match several values, use $or, e.g. {"$or": [{"repo": ...}, ...]} @ ["a", "b"]',
    ]);
  });
});

describe('validateAql: field names', () => {
  it.each([
    [
      'misspelled field',
      'items.find({"nmae": "x"})',
      'warning: Unknown field "nmae" in items. Did you mean "name"? @ "nmae"',
    ],
    [
      'field of another domain',
      'builds.find({"repo": "libs"})',
      'warning: Unknown field "repo" in builds. Known: name, number, url, started, created, created_by, modified, modified_by, module, property, promotion @ "repo"',
    ],
    [
      'misspelled relation',
      'items.find({"artifact.modul.build.name": "app"})',
      'warning: Unknown relation "modul" in "artifact" (build artifacts). Did you mean "artifact.module.build.name"? @ "artifact.modul.build.name"',
    ],
    [
      'relation instead of a field',
      'items.find({"stat": "x"})',
      'warning: "stat" names related statistics, not a field; for example "stat.downloads" @ "stat"',
    ],
    [
      'field inside $or',
      'items.find({"$or": [{"repo": "a"}, {"rpo": "b"}]})',
      'warning: Unknown field "rpo" in items. Did you mean "repo"? @ "rpo"',
    ],
    [
      'field in include',
      'items.find().include("name", "szie")',
      'warning: Unknown field "szie" in items. Did you mean "size"? @ "szie"',
    ],
    [
      'wildcard outside include',
      'items.find().sort({"$asc": ["*"]})',
      'warning: Unknown field "*" in items. Known: repo, path, name, type, size, depth, created, created_by, modified, modified_by, updated, original_md5, actual_md5, original_sha1, actual_sha1, sha256, virtual_repos, archive, property, stat, artifact, dependency, release_artifact @ "*"',
    ],
    [
      'field in sort',
      'items.find().sort({"$desc": ["Size"]})',
      'warning: Unknown field "Size" in items. Did you mean "size"? @ "Size"',
    ],
  ])('%s', (_, query, expected) => {
    expect(check(query)).toEqual([expected]);
  });

  it("doesn't check fields of unknown domains", () => {
    expect(check('artifacts.find({"whatever": 1})').map((d) => d.split(':')[0])).toEqual([
      'warning',
    ]);
  });
});

describe('lineColumnAt', () => {
  it('counts lines and columns from 1', () => {
    const text = 'ab\ncd\n\nef';
    expect(lineColumnAt(text, 0)).toEqual({ line: 1, column: 1 });
    expect(lineColumnAt(text, 1)).toEqual({ line: 1, column: 2 });
    expect(lineColumnAt(text, 3)).toEqual({ line: 2, column: 1 });
    expect(lineColumnAt(text, 7)).toEqual({ line: 4, column: 1 });
    expect(lineColumnAt(text, text.length)).toEqual({ line: 4, column: 3 });
  });
});
