import { describe, expect, it } from 'vitest';
import { getAqlCompletions } from './aqlCompletions';
import { checkFieldPath } from './aqlSchema';

describe('checkFieldPath', () => {
  it('accepts fields and related fields of each domain', () => {
    expect(checkFieldPath('items', 'name')).toBeUndefined();
    expect(checkFieldPath('items', 'property.key')).toBeUndefined();
    expect(checkFieldPath('items', 'release_artifact.release.version')).toBeUndefined();
    expect(checkFieldPath('builds', 'module.property.value')).toBeUndefined();
    expect(checkFieldPath('archive.entries', 'path')).toBeUndefined();
    expect(checkFieldPath('build.promotions', 'build.number')).toBeUndefined();
    expect(checkFieldPath('releases', 'release_artifact.item.sha256')).toBeUndefined();
  });

  it('skips properties and unknown domains', () => {
    expect(checkFieldPath('items', '@anything.goes')).toBeUndefined();
    expect(checkFieldPath('mystery', 'anything')).toBeUndefined();
  });

  it('accepts wildcards only when asked', () => {
    expect(checkFieldPath('items', '*', { allowWildcard: true })).toBeUndefined();
    expect(checkFieldPath('items', 'artifact.module.*', { allowWildcard: true })).toBeUndefined();
    expect(checkFieldPath('items', '*')).toBeDefined();
  });

  it('suggests fields through relations with no fields of their own', () => {
    expect(checkFieldPath('items', 'archive')).toBe(
      '"archive" names related archives, not a field; for example "archive.entry.name"',
    );
  });

  it('agrees with every field that autocomplete suggests', () => {
    for (const domain of [
      'items',
      'builds',
      'entries',
      'archive.entries',
      'build.promotions',
      'releases',
    ]) {
      const query = `${domain}.find({"`;
      for (const { label } of getAqlCompletions(query).suggestions) {
        expect(checkFieldPath(domain, label), `${domain}: ${label}`).toBeUndefined();
      }
    }
  });
});
