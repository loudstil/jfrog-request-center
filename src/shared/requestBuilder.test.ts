import { describe, expect, it } from 'vitest';
import type { Endpoint } from './endpoints';
import { buildRequest, pathParamNames } from './requestBuilder';

const fileList: Endpoint = {
  id: 'file-list',
  name: 'File List',
  method: 'GET',
  path: '/artifactory/api/storage/{repoKey}/{itemPath}',
  params: [
    { name: 'repoKey', in: 'path', required: true },
    { name: 'itemPath', in: 'path', allowSlashes: true },
    { name: 'list', in: 'query', flag: true },
    { name: 'deep', in: 'query' },
    { name: 'mdTimestamps', in: 'query' },
  ],
};

function built(endpoint: Endpoint, values: Record<string, string>) {
  const result = buildRequest(endpoint, values);
  if (!result.ok) {
    throw new Error(`missing ${result.missing}`);
  }
  return result.request;
}

describe('pathParamNames', () => {
  it('finds placeholders in order', () => {
    expect(pathParamNames('/api/build/{buildName}/{buildNumber}')).toEqual([
      'buildName',
      'buildNumber',
    ]);
    expect(pathParamNames('/api/system/ping')).toEqual([]);
  });
});

describe('buildRequest', () => {
  it('fills path params, keeping slashes in path-valued params', () => {
    const request = built(fileList, { repoKey: 'libs-release', itemPath: 'org/app/1.0' });
    expect(request).toEqual({
      method: 'GET',
      path: '/artifactory/api/storage/libs-release/org/app/1.0',
    });
  });

  it('encodes special characters in each segment', () => {
    const request = built(fileList, { repoKey: 'my repo', itemPath: '/dir #1/a?b.jar' });
    expect(request.path).toBe('/artifactory/api/storage/my%20repo/dir%20%231/a%3Fb.jar');
  });

  it('encodes slashes in params that are not paths', () => {
    const endpoint: Endpoint = {
      ...fileList,
      path: '/api/build/{buildName}',
      params: [{ name: 'buildName', in: 'path', required: true }],
    };
    expect(built(endpoint, { buildName: 'team/app' }).path).toBe('/api/build/team%2Fapp');
  });

  it('drops an empty optional path param without leaving slashes behind', () => {
    expect(built(fileList, { repoKey: 'libs' }).path).toBe('/artifactory/api/storage/libs');
  });

  it('sends flags as bare keys and skips empty query values', () => {
    const request = built(fileList, {
      repoKey: 'libs',
      list: 'true',
      deep: '1',
      mdTimestamps: ' ',
    });
    expect(request.path).toBe('/artifactory/api/storage/libs?list&deep=1');
    expect(built(fileList, { repoKey: 'libs', list: 'false' }).path).toBe(
      '/artifactory/api/storage/libs',
    );
  });

  it('encodes query values', () => {
    const endpoint: Endpoint = {
      ...fileList,
      path: '/api/copy/{from}',
      params: [
        { name: 'from', in: 'path', required: true, allowSlashes: true },
        { name: 'to', in: 'query', required: true },
      ],
    };
    expect(built(endpoint, { from: 'a/b.jar', to: '/target/b c.jar' }).path).toBe(
      '/api/copy/a/b.jar?to=%2Ftarget%2Fb%20c.jar',
    );
  });

  it('always sends required flags', () => {
    const stats: Endpoint = {
      ...fileList,
      path: '/artifactory/api/storage/{repoKey}',
      params: [
        { name: 'repoKey', in: 'path', required: true },
        { name: 'stats', in: 'query', flag: true, required: true },
      ],
    };
    expect(built(stats, { repoKey: 'libs', stats: 'false' }).path).toBe(
      '/artifactory/api/storage/libs?stats',
    );
  });

  it('reports every missing required param', () => {
    const endpoint: Endpoint = {
      ...fileList,
      params: [
        { name: 'repoKey', in: 'path', required: true },
        { name: 'itemPath', in: 'path', required: true },
        { name: 'list', in: 'query', flag: true, required: true },
      ],
    };
    expect(buildRequest(endpoint, { repoKey: '  ' })).toEqual({
      ok: false,
      missing: ['repoKey', 'itemPath'],
    });
  });

  it('keeps placeholders for missing params when previewing', () => {
    const result = buildRequest(fileList, { list: 'true' }, { keepPlaceholders: true });
    expect(result).toEqual({
      ok: true,
      request: { method: 'GET', path: '/artifactory/api/storage/{repoKey}?list' },
    });
  });
});
