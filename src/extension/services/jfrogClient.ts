// Central HTTP client for the JFrog Platform. Deliberately free of `vscode` imports
// so it can be unit-tested in plain Node.
import type { AqlResponse } from '../../shared/aql';

export interface Connection {
  baseUrl: string;
  username?: string;
  token: string;
}

export type ConnectionProvider = () => Promise<Connection | undefined>;

export type JFrogErrorKind =
  | 'notConfigured'
  | 'network'
  | 'timeout'
  | 'cancelled'
  | 'unauthorized'
  | 'forbidden'
  | 'notFound'
  | 'rateLimited'
  | 'http';

export class JFrogError extends Error {
  constructor(
    readonly kind: JFrogErrorKind,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'JFrogError';
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  /** A string is sent as-is; an object is sent as JSON. */
  body?: string | object;
  contentType?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** A completed HTTP exchange, whatever its status. */
export interface RawResponse {
  url: string;
  status: number;
  statusText: string;
  ok: boolean;
  contentType: string;
  body: string;
  elapsedMs: number;
}

export interface VersionInfo {
  version: string;
  revision: string;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_ERROR_DETAIL_LENGTH = 300;

/** Strips trailing slashes and a trailing `/artifactory`, so paths can always start with `/artifactory/...`. */
export function normalizeBaseUrl(url: string): string {
  return url
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/artifactory$/i, '');
}

export class JFrogClient {
  constructor(
    private readonly getConnection: ConnectionProvider,
    private readonly fetchFn: typeof fetch = globalThis.fetch,
  ) {}

  /** A client bound to a fixed connection, e.g. to verify credentials before saving them. */
  static forConnection(connection: Connection, fetchFn?: typeof fetch): JFrogClient {
    return new JFrogClient(async () => connection, fetchFn);
  }

  /** Sends a request and parses the response; non-2xx statuses throw a JFrogError. */
  async request<T>(method: string, path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(method, path, options);
    if (!response.ok) {
      throw toHttpError(response);
    }
    const isJson = response.contentType.includes('json');
    return (isJson && response.body ? JSON.parse(response.body) : response.body) as T;
  }

  /**
   * Sends a request and returns the raw response, including 4xx/5xx ones (for showing them to
   * the user). Only a missing connection, network failures, timeouts and cancellation throw.
   */
  async send(method: string, path: string, options: RequestOptions = {}): Promise<RawResponse> {
    const connection = await this.getConnection();
    if (!connection) {
      throw new JFrogError('notConfigured', 'JFrog connection is not configured.');
    }

    const url = new URL(connection.baseUrl + (path.startsWith('/') ? path : `/${path}`));
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const headers: Record<string, string> = {
      Authorization: authorizationHeader(connection),
      Accept: 'application/json, text/plain;q=0.9',
    };
    let body: string | undefined;
    if (typeof options.body === 'string') {
      body = options.body;
      headers['Content-Type'] = options.contentType ?? 'text/plain';
    } else if (options.body !== undefined) {
      body = JSON.stringify(options.body);
      headers['Content-Type'] = options.contentType ?? 'application/json';
    }

    const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;

    const started = Date.now();
    try {
      const response = await this.fetchFn(url, { method, headers, body, signal });
      return {
        url: url.toString(),
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        contentType: response.headers.get('content-type') ?? '',
        body: await response.text(),
        elapsedMs: Date.now() - started,
      };
    } catch (err) {
      throw toRequestError(err, url, options.signal);
    }
  }

  ping(): Promise<string> {
    return this.request<string>('GET', '/artifactory/api/system/ping');
  }

  version(): Promise<VersionInfo> {
    return this.request<VersionInfo>('GET', '/artifactory/api/system/version');
  }

  aql(query: string, signal?: AbortSignal): Promise<AqlResponse> {
    return this.request<AqlResponse>('POST', '/artifactory/api/search/aql', {
      body: query,
      contentType: 'text/plain',
      signal,
    });
  }
}

function authorizationHeader({ username, token }: Connection): string {
  return username
    ? `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`
    : `Bearer ${token}`;
}

function toRequestError(err: unknown, url: URL, callerSignal: AbortSignal | undefined): JFrogError {
  if (callerSignal?.aborted) {
    return new JFrogError('cancelled', 'Request was cancelled.');
  }
  if (err instanceof Error && err.name === 'TimeoutError') {
    return new JFrogError('timeout', `Request to ${url.host} timed out.`);
  }
  // Node's fetch reports the real reason (ENOTFOUND, ECONNREFUSED, ...) in `cause`.
  const cause = err instanceof Error && err.cause instanceof Error ? err.cause.message : undefined;
  const detail = cause ?? (err instanceof Error ? err.message : String(err));
  return new JFrogError('network', `Could not reach ${url.host}: ${detail}`);
}

function toHttpError(response: RawResponse): JFrogError {
  const detail = extractErrorDetail(response.body);
  const status = response.status;
  const suffix = detail ? `: ${detail}` : '';

  switch (status) {
    case 401:
      return new JFrogError('unauthorized', `Authentication failed (401)${suffix}`, status);
    case 403:
      return new JFrogError('forbidden', `Permission denied (403)${suffix}`, status);
    case 404:
      return new JFrogError('notFound', `Not found (404)${suffix}`, status);
    case 429:
      return new JFrogError('rateLimited', `Rate limited (429)${suffix}`, status);
    default:
      return new JFrogError('http', `${status} ${response.statusText}${suffix}`.trim(), status);
  }
}

/** Artifactory errors usually look like `{"errors":[{"status":400,"message":"..."}]}`. */
function extractErrorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { errors?: { message?: string }[] };
    const messages = parsed.errors?.map((e) => e.message).filter(Boolean);
    if (messages?.length) {
      return messages.join('; ');
    }
  } catch {
    // Not JSON; fall back to the raw text.
  }
  const text = body.trim();
  return text.length > MAX_ERROR_DETAIL_LENGTH
    ? `${text.slice(0, MAX_ERROR_DETAIL_LENGTH)}…`
    : text;
}
