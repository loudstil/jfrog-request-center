import { describe, expect, it } from 'vitest';
import { parseOpenApi } from './openApi';

const spec = {
  openapi: '3.0.1',
  info: { title: 'Artifactory Repositories' },
  servers: [{ url: 'https://{host}/artifactory/api/', variables: { host: { default: 'x' } } }],
  components: {
    parameters: {
      RepoKey: {
        name: 'repoKey',
        in: 'path',
        description: 'Repository key',
        schema: { type: 'string' },
      },
    },
  },
  paths: {
    '/repositories': {
      get: {
        summary: 'Get Repositories',
        tags: ['Repositories'],
        parameters: [
          { name: 'type', in: 'query', schema: { enum: ['local', 'remote', 'virtual'] } },
          { name: 'X-Trace', in: 'header' },
        ],
      },
    },
    '/repositories/{repoKey}': {
      parameters: [{ $ref: '#/components/parameters/RepoKey' }],
      put: {
        operationId: 'createRepository',
        tags: ['Repositories'],
        requestBody: {
          content: {
            'text/plain': {},
            'application/json': { example: { key: 'my-repo', rclass: 'local' } },
          },
        },
      },
      delete: { summary: 'Delete Repository', tags: ['Repositories'] },
    },
    '/system/ping': {
      get: { summary: 'Ping', description: '  Health check.  ' },
    },
    '/search/aql': {
      post: {
        summary: 'AQL',
        tags: ['Searches'],
        requestBody: { content: { 'text/plain': { examples: { a: { value: 'items.find()' } } } } },
      },
    },
  },
};

describe('parseOpenApi', () => {
  const parsed = parseOpenApi(spec, 'repos.json');
  const endpoint = (id: string) =>
    parsed.groups.flatMap((g) => g.endpoints).find((e) => e.id === `repos.json:${id}`)!;

  it('uses the spec title', () => {
    expect(parsed.title).toBe('Artifactory Repositories');
  });

  it('groups by first tag, alphabetically, with untagged operations last', () => {
    expect(parsed.groups.map((g) => g.name)).toEqual(['Repositories', 'Searches', 'Other']);
    expect(parsed.groups[0].endpoints.map((e) => e.name)).toEqual([
      'Get Repositories',
      'createRepository',
      'Delete Repository',
    ]);
  });

  it('prefixes paths with the server URL path', () => {
    expect(endpoint('GET /artifactory/api/repositories').path).toBe(
      '/artifactory/api/repositories',
    );
  });

  it('keeps path and query params, with enums, and drops headers', () => {
    expect(endpoint('GET /artifactory/api/repositories').params).toEqual([
      {
        name: 'type',
        in: 'query',
        required: false,
        description: undefined,
        enum: ['local', 'remote', 'virtual'],
        placeholder: undefined,
      },
    ]);
  });

  it('resolves $ref params declared on the path and marks path params required', () => {
    const del = endpoint('DELETE /artifactory/api/repositories/{repoKey}');
    expect(del.params).toEqual([
      expect.objectContaining({
        name: 'repoKey',
        in: 'path',
        required: true,
        description: 'Repository key',
      }),
    ]);
  });

  it('prefers a JSON body and formats its example', () => {
    expect(endpoint('PUT /artifactory/api/repositories/{repoKey}').body).toEqual({
      contentType: 'application/json',
      example: '{\n  "key": "my-repo",\n  "rclass": "local"\n}',
    });
  });

  it('uses the first named example for non-JSON bodies', () => {
    expect(endpoint('POST /artifactory/api/search/aql').body).toEqual({
      contentType: 'text/plain',
      example: 'items.find()',
    });
  });

  it('trims descriptions', () => {
    expect(endpoint('GET /artifactory/api/system/ping').description).toBe('Health check.');
  });

  it('rejects documents that are not OpenAPI 3', () => {
    expect(() => parseOpenApi({ swagger: '2.0' }, 'x')).toThrow('Not an OpenAPI 3 document');
    expect(() => parseOpenApi('nope', 'x')).toThrow('Not an OpenAPI 3 document');
  });

  it('handles a spec without servers or paths', () => {
    expect(parseOpenApi({ openapi: '3.1.0' }, 'empty')).toEqual({ title: 'empty', groups: [] });
  });
});
