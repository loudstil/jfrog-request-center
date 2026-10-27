// The AQL data model: the fields of each entity and how entities relate, from JFrog's AQL docs.
// Pure functions with no Monaco dependency, so they can be unit-tested.
//
// A field path walks relations from the query's domain, e.g. from items, "artifact.module.build.name"
// goes item -> artifact -> module -> build and names the build's "name" field. Artifactory versions
// differ a little, so problems found here are only ever warnings.

interface Entity {
  /** Shown in messages, e.g. "Unknown field "x" in items". */
  label: string;
  fields: readonly string[];
  /** Relation name -> entity name. */
  relations: Readonly<Record<string, string>>;
}

const ENTITIES: Readonly<Record<string, Entity>> = {
  item: {
    label: 'items',
    fields: [
      'repo',
      'path',
      'name',
      'type',
      'size',
      'depth',
      'created',
      'created_by',
      'modified',
      'modified_by',
      'updated',
      'original_md5',
      'actual_md5',
      'original_sha1',
      'actual_sha1',
      'sha256',
      'virtual_repos',
    ],
    relations: {
      archive: 'archive',
      property: 'itemProperty',
      stat: 'stat',
      artifact: 'artifact',
      dependency: 'dependency',
      release_artifact: 'releaseArtifact',
    },
  },
  archive: { label: 'archives', fields: [], relations: { entry: 'entry', item: 'item' } },
  entry: { label: 'archive entries', fields: ['name', 'path'], relations: { archive: 'archive' } },
  itemProperty: { label: 'item properties', fields: ['key', 'value'], relations: { item: 'item' } },
  stat: {
    label: 'statistics',
    fields: [
      'downloads',
      'downloaded',
      'downloaded_by',
      'remote_downloads',
      'remote_downloaded',
      'remote_downloaded_by',
      'remote_origin',
      'remote_path',
    ],
    relations: { item: 'item' },
  },
  artifact: {
    label: 'build artifacts',
    fields: ['name', 'type', 'sha1', 'md5'],
    relations: { module: 'module', item: 'item' },
  },
  dependency: {
    label: 'build dependencies',
    fields: ['name', 'scope', 'type', 'sha1', 'md5'],
    relations: { module: 'module', item: 'item' },
  },
  module: {
    label: 'build modules',
    fields: ['name'],
    relations: {
      build: 'build',
      artifact: 'artifact',
      dependency: 'dependency',
      property: 'moduleProperty',
    },
  },
  moduleProperty: {
    label: 'module properties',
    fields: ['key', 'value'],
    relations: { module: 'module' },
  },
  build: {
    label: 'builds',
    fields: [
      'name',
      'number',
      'url',
      'started',
      'created',
      'created_by',
      'modified',
      'modified_by',
    ],
    relations: { module: 'module', property: 'buildProperty', promotion: 'promotion' },
  },
  buildProperty: {
    label: 'build properties',
    fields: ['key', 'value'],
    relations: { build: 'build' },
  },
  promotion: {
    label: 'build promotions',
    fields: ['created', 'created_by', 'status', 'repo', 'comment', 'user'],
    relations: { build: 'build' },
  },
  release: {
    label: 'releases',
    fields: ['name', 'version', 'status', 'created', 'signature'],
    relations: { release_artifact: 'releaseArtifact' },
  },
  releaseArtifact: {
    label: 'release artifacts',
    fields: ['path'],
    relations: { item: 'item', release: 'release' },
  },
};

const DOMAIN_ENTITIES: Readonly<Record<string, string>> = {
  items: 'item',
  builds: 'build',
  entries: 'entry',
  'archive.entries': 'entry',
  'build.promotions': 'promotion',
  releases: 'release',
};

export interface FieldCheckOptions {
  /** include() accepts "*" and "relation.*". */
  allowWildcard?: boolean;
}

/**
 * Checks a field path against a domain. Returns a warning message, or undefined if the path is
 * fine or can't be checked (an unknown domain, or a property shorthand such as "@build.name").
 */
export function checkFieldPath(
  domain: string,
  path: string,
  options: FieldCheckOptions = {},
): string | undefined {
  const start = DOMAIN_ENTITIES[domain];
  if (!start || path.startsWith('@')) {
    return undefined;
  }
  const segments = path.split('.');
  let entity = ENTITIES[start];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const last = i === segments.length - 1;
    if (last && options.allowWildcard && segment === '*') {
      return undefined;
    }
    const related = entity.relations[segment];
    if (last) {
      if (entity.fields.includes(segment)) {
        return undefined;
      }
      if (related) {
        const example = firstField(ENTITIES[related]);
        return `"${path}" names related ${ENTITIES[related].label}, not a field${example ? `; for example "${path}.${example}"` : ''}`;
      }
    } else if (related) {
      entity = ENTITIES[related];
      continue;
    }
    const where = i === 0 ? domain : `"${segments.slice(0, i).join('.')}" (${entity.label})`;
    const kind = last ? 'field' : 'relation';
    const candidates = last
      ? [...entity.fields, ...Object.keys(entity.relations)]
      : Object.keys(entity.relations);
    const suggestion = closest(segment, candidates);
    const hint = suggestion
      ? ` Did you mean "${[...segments.slice(0, i), suggestion, ...segments.slice(i + 1)].join('.')}"?`
      : candidates.length
        ? ` Known: ${candidates.join(', ')}`
        : '';
    return `Unknown ${kind} "${segment}" in ${where}.${hint}`;
  }
  return undefined;
}

/** The first plain field of an entity, or one reached through a relation (archives have none). */
function firstField(entity: Entity): string | undefined {
  if (entity.fields.length) {
    return entity.fields[0];
  }
  const [relation, target] = Object.entries(entity.relations)[0] ?? [];
  const nested = target ? ENTITIES[target].fields[0] : undefined;
  return relation && nested ? `${relation}.${nested}` : undefined;
}

/** The candidate within a small edit distance of `word`, if exactly one is closest. */
function closest(word: string, candidates: readonly string[]): string | undefined {
  const maxDistance = word.length <= 4 ? 1 : 2;
  let best: string | undefined;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = editDistance(word.toLowerCase(), candidate);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

/** Edit distance where swapping two neighboring letters ("nmae") counts as one edit. */
function editDistance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}
