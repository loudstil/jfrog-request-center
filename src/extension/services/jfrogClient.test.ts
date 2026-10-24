import { describe, expect, it, vi } from 'vitest';
import { type Connection, JFrogClient, JFrogError, normalizeBaseUrl } from './jfrogClient';

const connection: Connection = { baseUrl: 'https://acme.jfrog.io', token: 'secret-token' };

function mockFetch(response: Response | Error) {
  return vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
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
    const result = await JFrogClient.forConnection(connection, fetchFn).ping();

    expect(result).toBe('OK');
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://acme.jfrog.io/artifactory/api/system/ping');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('uses Basic auth when a username is set', async () => {
    const fetchFn = mockFetch(jsonResponse({ version: '7.90.0', revision: '1' }));
    await JFrogClient.forConnection({ ...connection, username: 'alice' }, fetchFn).version();

    const headers = fetchFn.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa('alice:secret-token')}`);
  });

  it('posts AQL as text/plain and parses the JSON response', async () => {
    const body = { results: [{ name: 'a.jar' }], range: { start_pos: 0, end_pos: 1, total: 1 } };
    const fetchFn = mockFetch(jsonResponse(body));
    const query = 'items.find({"repo":"libs"})';

    const result = await JFrogClient.forConnection(connection, fetchFn).aql(query);

    expect(result).toEqual(body);
    const [url, init] = fetchFn.mock.calls[0];
    expect(String(url)).toBe('https://acme.jfrog.io/artifactory/api/search/aql');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe(query);
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
  });

  it('serializes object bodies as JSON and adds query parameters', async () => {
    const fetchFn = mockFetch(jsonResponse({}));
    await JFrogClient.forConnection(connection, fetchFn).request('PUT', 'artifactory/api/x', {
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
    const client = new JFrogClient(async () => undefined, fetchFn);

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
    const err = await catchError(JFrogClient.forConnection(connection, fetchFn).ping());
    expect(err.kind).toBe(kind);
    expect(err.status).toBe(status);
  });

  it("includes Artifactory's error messages", async () => {
    const fetchFn = mockFetch(
      jsonResponse({ errors: [{ status: 400, message: 'Failed to parse query' }] }, 400),
    );
    const err = await catchError(JFrogClient.forConnection(connection, fetchFn).aql('bad'));
    expect(err.message).toContain('Failed to parse query');
  });

  it('reports the underlying cause of network failures', async () => {
    const failure = new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND') });
    const err = await catchError(JFrogClient.forConnection(connection, mockFetch(failure)).ping());
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
    const response = await JFrogClient.forConnection(connection, fetchFn).send(
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
      JFrogClient.forConnection(connection, mockFetch(new TypeError('fetch failed'))).send(
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
      JFrogClient.forConnection(connection, fetchFn).aql('q', controller.signal),
    );
    expect(err.kind).toBe('cancelled');
  });
});
