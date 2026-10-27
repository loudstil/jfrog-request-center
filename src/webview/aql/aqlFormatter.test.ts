import { describe, expect, it } from 'vitest';
import { formatAql } from './aqlFormatter';

describe('formatAql', () => {
  it('puts each of several conditions on its own line', () => {
    expect(
      formatAql(
        'items.find({"repo":"my-local-repo","name":{"$match":"*.jar"}}).include("name","repo").limit(50)',
      ),
    ).toBe(`items.find({
  "repo": "my-local-repo",
  "name": {"$match": "*.jar"}
}).include("name", "repo").limit(50)`);
  });

  it('keeps short queries on one line', () => {
    expect(formatAql('  items.find( { "repo" :"libs" } )\n.limit( 5 )  ')).toBe(
      'items.find({"repo": "libs"}).limit(5)',
    );
    expect(formatAql('items.find()')).toBe('items.find()');
    expect(formatAql('items.find({})')).toBe('items.find({})');
  });

  it('breaks up values that are too long for one line', () => {
    expect(
      formatAql(
        'items.find({"$or":[{"name":{"$match":"*.jar"}},{"name":{"$match":"*.war"}},{"name":{"$match":"*.ear"}}],"repo":"libs-release-local"})',
      ),
    ).toBe(`items.find({
  "$or": [
    {"name": {"$match": "*.jar"}},
    {"name": {"$match": "*.war"}},
    {"name": {"$match": "*.ear"}}
  ],
  "repo": "libs-release-local"
})`);
  });

  it('puts methods on their own lines when the chain is too long', () => {
    expect(
      formatAql(
        'items.find({"repo":"libs"}).include("name","repo","path","created","modified","size").sort({"$desc":["size"]}).limit(10)',
      ),
    ).toBe(`items.find({"repo": "libs"})
  .include("name", "repo", "path", "created", "modified", "size")
  .sort({"$desc": ["size"]})
  .limit(10)`);
  });

  it('keeps strings and numbers exactly as written', () => {
    expect(formatAql('items.find({"name":"a\\"b\\\\c","size":{"$gt":1.5e3}})')).toBe(`items.find({
  "name": "a\\"b\\\\c",
  "size": {"$gt": 1.5e3}
})`);
  });

  it('formats queries with other problems, but not syntax errors', () => {
    expect(formatAql('items.find({"nmae":"x"}).limit(-1)')).toBe(
      'items.find({"nmae": "x"}).limit(-1)',
    );
    expect(formatAql('items.find({"repo": "libs",})')).toBeUndefined();
    expect(formatAql('')).toBe('');
  });

  it('is stable when run twice', () => {
    const queries = [
      'items.find({"repo":"a","$or":[{"name":"x"},{"name":"y"}]}).include("name").limit(5)',
      'builds.find({"name":{"$match":"app-*"},"started":{"$last":"7d"},"promotion.status":"released"}).sort({"$desc":["started"]})',
    ];
    for (const query of queries) {
      const once = formatAql(query)!;
      expect(formatAql(once)).toBe(once);
    }
  });
});
