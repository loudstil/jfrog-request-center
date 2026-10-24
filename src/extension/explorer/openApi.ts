// Converts an OpenAPI 3 document into explorer endpoint groups. No vscode imports.
import type {
  Endpoint,
  EndpointBody,
  EndpointGroup,
  EndpointParam,
  HttpMethod,
} from '../../shared/endpoints';

const METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'];
const UNTAGGED_GROUP = 'Other';

// Just the parts of OpenAPI 3 we read; everything is optional because real specs vary.
interface OpenApiDocument {
  openapi?: string;
  info?: { title?: string };
  servers?: { url?: string; variables?: Record<string, { default?: string }> }[];
  paths?: Record<string, PathItem | undefined>;
  components?: { parameters?: Record<string, ParameterObject | RefObject> };
}

interface PathItem {
  parameters?: (ParameterObject | RefObject)[];
  [method: string]: unknown;
}

interface Operation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  parameters?: (ParameterObject | RefObject)[];
  requestBody?: { content?: Record<string, MediaType> } | RefObject;
}

interface ParameterObject {
  name?: string;
  in?: string;
  required?: boolean;
  description?: string;
  schema?: { enum?: unknown[]; default?: unknown; example?: unknown; type?: string };
  example?: unknown;
}

interface MediaType {
  example?: unknown;
  examples?: Record<string, { value?: unknown }>;
}

interface RefObject {
  $ref: string;
}

export interface ParsedSpec {
  title: string;
  groups: EndpointGroup[];
}

/** Parses an OpenAPI 3 document. `idPrefix` keeps endpoint ids unique across several specs. */
export function parseOpenApi(doc: unknown, idPrefix: string): ParsedSpec {
  if (!isObject(doc) || typeof (doc as OpenApiDocument).openapi !== 'string') {
    throw new Error('Not an OpenAPI 3 document (missing the "openapi" field).');
  }
  const spec = doc as OpenApiDocument;
  const prefix = serverPathPrefix(spec);
  const groups = new Map<string, Endpoint[]>();

  for (const [rawPath, item] of Object.entries(spec.paths ?? {})) {
    if (!isObject(item)) {
      continue;
    }
    for (const method of METHODS) {
      const operation = item[method.toLowerCase()];
      if (!isObject(operation)) {
        continue;
      }
      const op = operation as Operation;
      const path = joinPaths(prefix, rawPath);
      const endpoint: Endpoint = {
        id: `${idPrefix}:${method} ${path}`,
        name: op.summary?.trim() || op.operationId || `${method} ${rawPath}`,
        method,
        path,
        description: op.description?.trim() || undefined,
        params: mergeParams(spec, item.parameters, op.parameters),
        body: requestBody(op.requestBody),
      };
      const group = op.tags?.[0] || UNTAGGED_GROUP;
      groups.set(group, [...(groups.get(group) ?? []), endpoint]);
    }
  }

  return {
    title: spec.info?.title?.trim() || idPrefix,
    groups: [...groups.entries()]
      .sort(([a], [b]) =>
        a === UNTAGGED_GROUP ? 1 : b === UNTAGGED_GROUP ? -1 : a.localeCompare(b),
      )
      .map(([name, endpoints]) => ({ name, endpoints })),
  };
}

/** The path part of the first server URL, e.g. `https://{host}/artifactory/api` → `/artifactory/api`. */
function serverPathPrefix(spec: OpenApiDocument): string {
  const server = spec.servers?.[0];
  if (!server?.url) {
    return '';
  }
  const withVariables = server.url.replace(
    /\{([^}]+)\}/g,
    (_, name: string) => server.variables?.[name]?.default ?? '',
  );
  const path = withVariables.replace(/^[a-z][a-z0-9+.-]*:\/\/[^/]*/i, '');
  return path.replace(/\/+$/, '');
}

function joinPaths(prefix: string, path: string): string {
  return `${prefix}/${path.replace(/^\/+/, '')}`.replace(/\/{2,}/g, '/');
}

/** Path-level params apply to every operation; operation-level ones with the same name win. */
function mergeParams(
  spec: OpenApiDocument,
  pathLevel: (ParameterObject | RefObject)[] | undefined,
  operationLevel: (ParameterObject | RefObject)[] | undefined,
): EndpointParam[] {
  const byKey = new Map<string, EndpointParam>();
  for (const raw of [...(pathLevel ?? []), ...(operationLevel ?? [])]) {
    const param = resolve(spec, raw);
    if (!param?.name || (param.in !== 'path' && param.in !== 'query')) {
      continue; // headers and cookies are handled by the client
    }
    const enumValues = param.schema?.enum?.map(String);
    const example = param.example ?? param.schema?.example ?? param.schema?.default;
    byKey.set(`${param.in}:${param.name}`, {
      name: param.name,
      in: param.in,
      // Path params are always required in OpenAPI.
      required: param.in === 'path' || param.required === true,
      description: param.description?.trim() || undefined,
      enum: enumValues?.length ? enumValues : undefined,
      placeholder: example === undefined ? undefined : String(example),
    });
  }
  return [...byKey.values()];
}

/** The preferred (JSON if offered) request body content type and its example, if any. */
function requestBody(raw: Operation['requestBody']): EndpointBody | undefined {
  const body = raw && '$ref' in raw ? undefined : raw;
  const content = body?.content;
  if (!content) {
    return undefined;
  }
  const types = Object.keys(content);
  const contentType = types.find((t) => t.includes('json')) ?? types[0];
  if (!contentType) {
    return undefined;
  }
  const media = content[contentType];
  const example = media?.example ?? Object.values(media?.examples ?? {})[0]?.value;
  const isJson = contentType.includes('json');
  return {
    contentType,
    example:
      example === undefined
        ? isJson
          ? '{\n  \n}'
          : undefined
        : typeof example === 'string'
          ? example
          : JSON.stringify(example, null, 2),
  };
}

/** Follows a local `$ref` to components.parameters; other refs are ignored. */
function resolve(
  spec: OpenApiDocument,
  raw: ParameterObject | RefObject,
): ParameterObject | undefined {
  if (!('$ref' in raw)) {
    return raw;
  }
  const match = /^#\/components\/parameters\/(.+)$/.exec(raw.$ref);
  const target = match ? spec.components?.parameters?.[decodeURIComponent(match[1])] : undefined;
  return target && !('$ref' in target) ? target : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
