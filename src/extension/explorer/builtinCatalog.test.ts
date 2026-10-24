import { describe, expect, it } from 'vitest';
import { BUILTIN_CATALOG } from './builtinCatalog';
import { pathParamNames } from '../../shared/requestBuilder';

const endpoints = BUILTIN_CATALOG.flatMap((g) => g.endpoints);

describe('BUILTIN_CATALOG', () => {
  it('has unique ids', () => {
    const ids = endpoints.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(endpoints.map((e) => [e.name, e] as const))(
    '%s declares exactly the params in its path',
    (_, endpoint) => {
      const declared = endpoint.params.filter((p) => p.in === 'path').map((p) => p.name);
      expect(declared).toEqual(pathParamNames(endpoint.path));
    },
  );

  it('uses absolute paths under a known service', () => {
    for (const endpoint of endpoints) {
      expect(endpoint.path).toMatch(/^\/(artifactory|access|router)\//);
    }
  });

  it('has valid JSON in JSON body examples', () => {
    for (const endpoint of endpoints) {
      if (endpoint.body?.contentType === 'application/json') {
        expect(() => JSON.parse(endpoint.body!.example!)).not.toThrow();
      }
    }
  });

  it('has unique param names per endpoint', () => {
    for (const endpoint of endpoints) {
      const names = endpoint.params.map((p) => p.name);
      expect(new Set(names).size, endpoint.name).toBe(names.length);
    }
  });
});
