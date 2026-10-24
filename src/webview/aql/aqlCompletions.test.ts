import { describe, expect, it } from 'vitest';
import { detectDomain, getAqlCompletions } from './aqlCompletions';

function labels(text: string): string[] {
  return getAqlCompletions(text).suggestions.map((s) => s.label);
}

describe('getAqlCompletions', () => {
  it('suggests domains at the start of the query', () => {
    const result = getAqlCompletions('it');
    expect(result.partial).toBe('it');
    expect(result.suggestions.map((s) => s.kind)).toEqual(expect.arrayContaining(['domain']));
    expect(labels('')).toContain('items');
  });

  it('keeps suggesting dotted domains while they are typed', () => {
    const result = getAqlCompletions('build.');
    expect(result.partial).toBe('build.');
    expect(result.suggestions.map((s) => s.label)).toContain('build.promotions');
  });

  it('suggests methods after a domain and a dot', () => {
    const result = getAqlCompletions('items.fi');
    expect(result.partial).toBe('fi');
    expect(result.suggestions.map((s) => s.label)).toContain('find');
    expect(result.suggestions.every((s) => s.kind === 'method')).toBe(true);
  });

  it('suggests methods after a closing parenthesis', () => {
    expect(labels('items.find({"repo": "libs"}).')).toEqual(
      expect.arrayContaining(['include', 'sort', 'limit']),
    );
  });

  it('suggests item fields inside a key string', () => {
    const result = getAqlCompletions('items.find({\n  "re');
    expect(result.partial).toBe('re');
    expect(result.suggestions.map((s) => s.label)).toEqual(
      expect.arrayContaining(['repo', 'path', 'name', 'sha256']),
    );
  });

  it('suggests fields for the detected domain', () => {
    const builds = labels('builds.find({"');
    expect(builds).toContain('number');
    expect(builds).not.toContain('repo');
  });

  it('suggests fields inside include()', () => {
    expect(labels('items.find({}).include("')).toContain('name');
  });

  it('suggests operators when a string starts with $', () => {
    const result = getAqlCompletions('items.find({"name": {"$m');
    expect(result.partial).toBe('$m');
    expect(result.suggestions.map((s) => s.label)).toContain('$match');
  });

  it('suggests nothing inside a value string', () => {
    expect(labels('items.find({"name": "*.ja')).toEqual([]);
  });

  it('is not fooled by escaped quotes', () => {
    expect(labels('items.find({"name": "a\\"b", "')).toContain('repo');
  });

  it('suggests nothing in the middle of other syntax', () => {
    expect(labels('items.find({"repo": "libs", ')).toEqual([]);
  });
});

describe('detectDomain', () => {
  it.each([
    ['items.find({})', 'items'],
    ['  builds . find({})', 'builds'],
    ['build.promotions.find({})', 'build.promotions'],
    ['archive.entries.find({})', 'archive.entries'],
    ['items', undefined],
  ])('%s -> %s', (text, expected) => {
    expect(detectDomain(text)).toBe(expected);
  });
});
