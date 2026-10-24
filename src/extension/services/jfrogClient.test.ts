import { describe, expect, it, vi } from 'vitest';
import {
  type Connection,
  JFrogClient,
  JFrogError,
  normalizeBaseUrl,
  retryDelayMs,
} from './jfrogClient';

const connection: Connection = { baseUrl: 'https://acme.jfrog.io', token: 'secret-token' };

function mockFetch(response: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) {
      throw response;
    }
    // A fresh copy per call, since a retried request reads the response again.
    return response.clone();
  });
}

/** Test client options: the given fetch, and no real waiting between retries. */
function opts(fetchFn: typeof fetch, sleep = async () => {}) {
  return { fetchFn, sleep };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function catchError(promise: Promise<unknown>): Promise<JFrogError> {
  const err = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(JFrogError);
  return err as JFrogError;
}

describe('normalizeBaseUrl', () => {
  it.each([
    ['https://acme.jfrog.io', 'https://acme.jfrog.io'],
    ['https://acme.jfrog.io/', 'https://acme.jfrog.io'],
    ['https://acme.jfrog.io/artifactory', 'https://acme.jfrog.io'],
    ['  https://acme.jfrog.io/artifactory//  ', 'https://acme.jfrog.io'],
    ['https://host/prefix', 'https://host/prefix'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeBaseUrl(input)).toBe(expected);
  });
});

describe('JFrogClient', () => {
  it('sends the token as a Bearer token when no username is set', async () => {
    const fetchFn = mockFetch(new Response('OK', { headers: { 'Content-Type': 'text/plain' } }));
    const result = await JFrogClient.forConnection(connection, opts(fetchFn)).ping();

    expect(result).toBe('OK');
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://acme.jfrog.io/artifactory/api/system/ping');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('uses Basic auth when a username is set', async () => {
    const fetchFn = mockFetch(jsonResponse({ version: '7.90.0', revision: '1' }));
    await JFrogClient.forConnection({ ...connection, username: 'alice' }, opts(fetchFn)).version();

    const headers = fetchFn.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa('alice:secret-token')}`);
  });

  it('posts AQL as text/plain and parses the JSON response', async () => {
    const body = { results: [{ name: 'a.jar' }], range: { start_pos: 0, end_pos: 1, total: 1 } };
    const fetchFn = mockFetch(jsonResponse(body));
    const query = 'items.find({"repo":"libs"})';

    const result = await JFrogClient.forConnection(connection, opts(fetchFn)).aql(query);

    expect(result).toEqual(body);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://acme.jfrog.io/artifactory/api/search/aql');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(query);
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
  });

  it('serializes object bodies as JSON and adds query parameters', async () => {
    const fetchFn = mockFetch(jsonResponse({}));
    await JFrogClient.forConnection(connection, opts(fetchFn)).request('PUT', 'artifactory/api/x', {
      body: { key: 'value' },
      query: { recursive: 1, skip: undefined },
    });

    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://acme.jfrog.io/artifactory/api/x?recursive=1');
    expect(init?.body).toBe('{"key":"value"}');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('fails with notConfigured when there is no connection', async () => {
    const fetchFn = mockFetch(jsonResponse({}));
    const client = new JFrogClient(async () => undefined, opts(fetchFn));

    const err = await catchError(client.ping());
    expect(err.kind).toBe('notConfigured');
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'unauthorized'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [429, 'rateLimited'],
    [500, 'http'],
  ])('maps HTTP %i to %s', async (status, kind) => {
    const fetchFn = mockFetch(jsonResponse({}, status));
    const err = await catchError(JFrogClient.forConnection(connection, opts(fetchFn)).ping());
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
  });

  it("includes Artifactory's error messages", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ errors: [{ status: 400, message: 'Failed to parse query' }] }, 400),
    );
    const err = await catchError(JFrogClient.forConnection(connection, opts(fetchFn)).aql('bad'));
    expect(err.message).toContain('Failed to parse query');
  });

  it('reports the underlying cause of network failures', async () => {
    const failure = new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') });
    const err = await catchError(
      JFrogClient.forConnection(connection, opts(mockFetch(failure))).ping(),
    );
    expect(err.kind).toBe('network');
    expect(err.message).toContain('ENOTFOUND');
  });

  it('send() returns error responses instead of throwing', async () => {
    const fetchFn = mockFetch(
      new Response('{"errors":[{"status":404,"message":"Not here"}]}', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const response = await JFrogClient.forConnection(connection, opts(fetchFn)).send(
      'GET',
      '/artifactory/api/repositories/missing',
    );
    expect(response).toMatchObject({
      url: 'https://acme.jfrog.io/artifactory/api/repositories/missing',
      status: 404,
      statusText: 'Not Found',
      ok: false,
      contentType: 'application/json',
      body: '{"errors":[{"status":404,"message":"Not here"}]}',
    });
    expect(response.elapsedMs).toBeGreaterThanOrEqual(0);
  });

  it('send() still throws for network failures', async () => {
    const err = await catchError(
      JFrogClient.forConnection(connection, opts(mockFetch(new TypeError('fetch failed')))).send(
        'GET',
        '/x',
      ),
    );
    expect(err.kind).toBe('network');
  });

  it('reports cancellation when the caller aborts', async () => {
    const controller = new AbortController();
    const fetchFn = vi.fn<typeof fetch>(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    const err = await catchError(
      JFrogClient.forConnection(connection, opts(fetchFn)).aql('q', controller.signal),
    );
    expect(err.kind).toBe('cancelled');
  });

  it('retries rate-limited requests, honoring Retry-After', async () => {
    const responses = [
      new Response('slow down', { status: 429, headers: { 'Retry-After': '2' } }),
      new Response('slow down', { status: 429 }),
      jsonResponse({ version: '7.90.0' }),
    ];
    const fetchFn = vi.fn<typeof fetch>(async () => responses.shift()!);
    const sleep = vi.fn(async () => {});
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const result = await JFrogClient.forConnection(connection, {
      fetchFn,
      sleep,
      logger,
    }).version();

    expect(result.version).toBe('7.90.0');
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((call) => (call as unknown[])[0])).toEqual([2000, 2000]);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringMatching(
        /^GET https:\/\/acme\.jfrog\.io\/artifactory\/api\/system\/version → 200/,
      ),
    );
  });

  it('gives up after two retries and reports the rate limit', async () => {
    const fetchFn = mockFetch(new Response('', { status: 429 }));
    const err = await catchError(JFrogClient.forConnection(connection, opts(fetchFn)).ping());
    expect(err.kind).toBe('rateLimited');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a POST that got 503', async () => {
    const fetchFn = mockFetch(new Response('', { status: 503 }));
    const response = await JFrogClient.forConnection(connection, opts(fetchFn)).send('POST', '/x');
    expect(response.status).toBe(503);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('never logs the token', async () => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await JFrogClient.forConnection(connection, {
      fetchFn: mockFetch(jsonResponse({})),
      logger,
    }).send('GET', '/x');
    await catchError(
      JFrogClient.forConnection(connection, {
        fetchFn: mockFetch(new TypeError('fetch failed')),
        logger,
      }).send('GET', '/y'),
    );
    const logged = [...logger.info.mock.calls, ...logger.error.mock.calls].flat().join('\n');
    expect(logged).toContain('GET https://acme.jfrog.io/x');
    expect(logged).not.toContain('secret-token');
  });
});

describe('retryDelayMs', () => {
  const now = Date.parse('2026-10-24T12:00:00Z');

  it('backs off exponentially without Retry-After', () => {
    expect(retryDelayMs('GET', 429, null, 0, now)).toBe(1000);
    expect(retryDelayMs('GET', 429, null, 1, now)).toBe(2000);
  });

  it('stops after two retries', () => {
    expect(retryDelayMs('GET', 429, null, 2, now)).toBeUndefined();
  });

  it('honors Retry-After in seconds and as an HTTP date', () => {
    expect(retryDelayMs('POST', 429, '3', 0, now)).toBe(3000);
    expect(retryDelayMs('GET', 429, 'Sat, 24 Oct 2026 12:00:05 GMT', 0, now)).toBe(5000);
    expect(retryDelayMs('GET', 429, 'Sat, 24 Oct 2026 11:59:00 GMT', 0, now)).toBe(0);
  });

  it('does not wait for long Retry-After values', () => {
    expect(retryDelayMs('GET', 429, '60', 0, now)).toBeUndefined();
  });

  it('retries 503 only for GET and HEAD, and nothing else', () => {
    expect(retryDelayMs('GET', 503, null, 0, now)).toBe(1000);
    expect(retryDelayMs('HEAD', 503, null, 0, now)).toBe(1000);
    expect(retryDelayMs('PUT', 503, null, 0, now)).toBeUndefined();
    expect(retryDelayMs('GET', 500, null, 0, now)).toBeUndefined();
    expect(retryDelayMs('GET', 404, null, 0, now)).toBeUndefined();
  });
});
