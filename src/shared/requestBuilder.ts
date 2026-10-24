// Turns an endpoint plus the user's form values into a concrete request. No vscode imports.
import type { Endpoint } from './endpoints';

export interface BuiltRequest {
  method: string;
  /** Path including the encoded query string, ready to append to the platform URL. */
  path: string;
}

export type BuildResult = { ok: true; request: BuiltRequest } | { ok: false; missing: string[] };

/** Placeholders like `{repoKey}` in an endpoint path. */
export function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

/**
 * Fills path placeholders and appends query params. Empty values are left out, flags are sent
 * as bare keys (`?list&deep=1`), and missing required params are reported instead.
 *
 * With `keepPlaceholders` (for previews), missing params never fail: empty path params stay
 * as `{name}`.
 */
export function buildRequest(
  endpoint: Endpoint,
  values: Record<string, string>,
  options: { keepPlaceholders?: boolean } = {},
): BuildResult {
  const value = (name: string) => values[name]?.trim() ?? '';
  const missing = endpoint.params
    .filter((p) => p.required && !p.flag && !value(p.name))
    .map((p) => p.name);
  if (missing.length && !options.keepPlaceholders) {
    return { ok: false, missing };
  }

  let path = endpoint.path;
  for (const param of endpoint.params.filter((p) => p.in === 'path')) {
    const raw = value(param.name).replace(/^\/+/, '');
    if (!raw && options.keepPlaceholders && param.required) {
      continue;
    }
    const encoded = param.allowSlashes
      ? raw.split('/').map(encodeURIComponent).join('/')
      : encodeURIComponent(raw);
    path = path.replace(`{${param.name}}`, encoded);
  }
  // A path param left empty (only possible when optional) shouldn't leave "//" or a trailing "/".
  path = path.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1');

  const query = endpoint.params
    .filter((p) => p.in === 'query')
    .flatMap((p) => {
      const v = value(p.name);
      if (p.flag) {
        return p.required || v === 'true' ? [encodeURIComponent(p.name)] : [];
      }
      return v ? [`${encodeURIComponent(p.name)}=${encodeURIComponent(v)}`] : [];
    });

  return {
    ok: true,
    request: { method: endpoint.method, path: query.length ? `${path}?${query.join('&')}` : path },
  };
}
