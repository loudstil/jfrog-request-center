// The REST API Explorer's description of an endpoint. Shared with the request form webview.

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

export interface EndpointParam {
  name: string;
  in: 'path' | 'query';
  required?: boolean;
  description?: string;
  /** Allowed values; the form shows a dropdown. */
  enum?: string[];
  placeholder?: string;
  /**
   * A query flag sent as a bare key (`?list`). Optional flags are a checkbox in the form;
   * required flags are always sent (they select what the endpoint does).
   */
  flag?: boolean;
  /** For path params holding a path (e.g. `folder/file.jar`): keep the slashes unencoded. */
  allowSlashes?: boolean;
}

export interface EndpointBody {
  contentType: string;
  /** Pre-filled in the form's body editor. */
  example?: string;
}

export interface Endpoint {
  /** Unique across the whole explorer. */
  id: string;
  name: string;
  method: HttpMethod;
  /** Path from the platform URL, with `{param}` placeholders, e.g. `/artifactory/api/repositories/{repoKey}`. */
  path: string;
  description?: string;
  params: EndpointParam[];
  body?: EndpointBody;
  /** Set for non-GET endpoints that only read data (e.g. searches), to skip the confirmation. */
  readOnly?: boolean;
}

export interface EndpointGroup {
  name: string;
  endpoints: Endpoint[];
}

/** True if sending the endpoint may change data on the server, so the user should confirm. */
export function isMutating(endpoint: Endpoint): boolean {
  return endpoint.method !== 'GET' && endpoint.method !== 'HEAD' && !endpoint.readOnly;
}

/** True if the endpoint can be sent without asking for any input. */
export function needsNoInput(endpoint: Endpoint): boolean {
  return !endpoint.body && endpoint.params.every((p) => !p.required);
}
