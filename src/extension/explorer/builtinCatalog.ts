// A curated set of commonly used JFrog Platform REST endpoints, shown in the API Explorer
// out of the box. Users can add complete OpenAPI specs via the `openApiSpecs` setting.
import type { Endpoint, EndpointGroup, EndpointParam } from '../../shared/endpoints';

const repoKey = (description = 'Repository key'): EndpointParam => ({
  name: 'repoKey',
  in: 'path',
  required: true,
  description,
  placeholder: 'libs-release-local',
});

const itemPath = (required: boolean): EndpointParam => ({
  name: 'itemPath',
  in: 'path',
  required,
  allowSlashes: true,
  description: 'Path inside the repository',
  placeholder: 'org/example/app/1.0/app-1.0.jar',
});

const repos: EndpointParam = {
  name: 'repos',
  in: 'query',
  description: 'Comma-separated repositories to search (all if empty)',
  placeholder: 'libs-release-local,libs-snapshot-local',
};

const json = (value: unknown) => ({
  contentType: 'application/json',
  example: JSON.stringify(value, null, 2),
});

type EndpointSpec = Omit<Endpoint, 'id' | 'params'> & { params?: EndpointParam[] };

function group(name: string, specs: EndpointSpec[]): EndpointGroup {
  return {
    name,
    endpoints: specs.map((spec) => ({
      ...spec,
      id: `builtin:${spec.method} ${spec.path}:${spec.name}`,
      params: spec.params ?? [],
    })),
  };
}

export const BUILTIN_CATALOG: EndpointGroup[] = [
  group('Repositories', [
    {
      name: 'Get Repositories',
      method: 'GET',
      path: '/artifactory/api/repositories',
      description: 'Lists repositories, optionally filtered by type or package type.',
      params: [
        {
          name: 'type',
          in: 'query',
          enum: ['local', 'remote', 'virtual', 'federated', 'distribution'],
        },
        { name: 'packageType', in: 'query', placeholder: 'maven' },
        { name: 'project', in: 'query', description: 'Project key' },
      ],
    },
    {
      name: 'Repository Configuration',
      method: 'GET',
      path: '/artifactory/api/repositories/{repoKey}',
      params: [repoKey()],
    },
    {
      name: 'Create Repository',
      method: 'PUT',
      path: '/artifactory/api/repositories/{repoKey}',
      description: 'Creates a repository. The body is the repository configuration.',
      params: [repoKey('Key of the new repository')],
      body: json({ key: 'my-repo', rclass: 'local', packageType: 'generic', description: '' }),
    },
    {
      name: 'Update Repository Configuration',
      method: 'POST',
      path: '/artifactory/api/repositories/{repoKey}',
      description: 'Updates only the fields present in the body.',
      params: [repoKey()],
      body: json({ description: 'Updated description' }),
    },
    {
      name: 'Delete Repository',
      method: 'DELETE',
      path: '/artifactory/api/repositories/{repoKey}',
      description: 'Deletes the repository and all of its content.',
      params: [repoKey()],
    },
    {
      name: 'Calculate Repository Metadata',
      method: 'POST',
      path: '/artifactory/api/{packageType}/{repoKey}/reindex',
      description: 'Recalculates index metadata for package types that support it.',
      params: [
        {
          name: 'packageType',
          in: 'path',
          required: true,
          enum: [
            'npm',
            'pypi',
            'nuget',
            'gems',
            'helm',
            'conan',
            'cran',
            'cargo',
            'go',
            'terraform',
          ],
        },
        repoKey(),
      ],
    },
  ]),

  group('Artifacts & Storage', [
    {
      name: 'File / Folder Info',
      method: 'GET',
      path: '/artifactory/api/storage/{repoKey}/{itemPath}',
      params: [repoKey(), itemPath(false)],
    },
    {
      name: 'File List',
      method: 'GET',
      path: '/artifactory/api/storage/{repoKey}/{itemPath}',
      description: 'Lists files under a folder.',
      params: [
        repoKey(),
        itemPath(false),
        {
          name: 'list',
          in: 'query',
          flag: true,
          required: true,
          description: 'Required for listing',
        },
        { name: 'deep', in: 'query', enum: ['0', '1'], description: '1 to list recursively' },
        { name: 'depth', in: 'query', placeholder: '3' },
        { name: 'listFolders', in: 'query', enum: ['0', '1'] },
        { name: 'mdTimestamps', in: 'query', enum: ['0', '1'] },
      ],
    },
    {
      name: 'Item Properties',
      description: 'All properties of a file or folder.',
      method: 'GET',
      path: '/artifactory/api/storage/{repoKey}/{itemPath}',
      params: [
        repoKey(),
        itemPath(true),
        { name: 'properties', in: 'query', flag: true, required: true },
      ],
    },
    {
      name: 'Set Item Properties',
      method: 'PUT',
      path: '/artifactory/api/storage/{repoKey}/{itemPath}',
      params: [
        repoKey(),
        itemPath(true),
        {
          name: 'properties',
          in: 'query',
          required: true,
          description: 'key=value pairs separated by ";"; values separated by ","',
          placeholder: 'release=true;team=payments',
        },
        { name: 'recursive', in: 'query', enum: ['0', '1'] },
      ],
    },
    {
      name: 'Delete Item Properties',
      method: 'DELETE',
      path: '/artifactory/api/storage/{repoKey}/{itemPath}',
      params: [
        repoKey(),
        itemPath(true),
        {
          name: 'properties',
          in: 'query',
          required: true,
          description: 'Comma-separated property names',
          placeholder: 'release,team',
        },
        { name: 'recursive', in: 'query', enum: ['0', '1'] },
      ],
    },
    {
      name: 'File Statistics',
      method: 'GET',
      path: '/artifactory/api/storage/{repoKey}/{itemPath}',
      description: 'Download count and last download time.',
      params: [
        repoKey(),
        itemPath(true),
        { name: 'stats', in: 'query', flag: true, required: true },
      ],
    },
    {
      name: 'Copy Item',
      method: 'POST',
      path: '/artifactory/api/copy/{repoKey}/{itemPath}',
      params: [
        repoKey('Source repository'),
        itemPath(true),
        { name: 'to', in: 'query', required: true, placeholder: '/target-repo/path/file.jar' },
        { name: 'dry', in: 'query', enum: ['0', '1'], description: '1 for a dry run' },
        { name: 'suppressLayouts', in: 'query', enum: ['0', '1'] },
        { name: 'failFast', in: 'query', enum: ['0', '1'] },
      ],
    },
    {
      name: 'Move Item',
      method: 'POST',
      path: '/artifactory/api/move/{repoKey}/{itemPath}',
      params: [
        repoKey('Source repository'),
        itemPath(true),
        { name: 'to', in: 'query', required: true, placeholder: '/target-repo/path/file.jar' },
        { name: 'dry', in: 'query', enum: ['0', '1'], description: '1 for a dry run' },
        { name: 'suppressLayouts', in: 'query', enum: ['0', '1'] },
        { name: 'failFast', in: 'query', enum: ['0', '1'] },
      ],
    },
    {
      name: 'Delete Item',
      method: 'DELETE',
      path: '/artifactory/{repoKey}/{itemPath}',
      description: 'Deletes a file or folder (moved to the Trash Can if enabled).',
      params: [repoKey(), itemPath(true)],
    },
    {
      name: 'Storage Summary',
      method: 'GET',
      path: '/artifactory/api/storageinfo',
      description: 'Storage usage per repository (admin).',
    },
  ]),

  group('Searches', [
    {
      name: 'AQL Search',
      method: 'POST',
      path: '/artifactory/api/search/aql',
      description: 'Tip: the AQL Manager offers highlighting, completions and a results table.',
      readOnly: true,
      body: {
        contentType: 'text/plain',
        example: 'items.find({"repo": "libs-release-local"}).limit(10)',
      },
    },
    {
      name: 'Artifact Search (Quick Search)',
      method: 'GET',
      path: '/artifactory/api/search/artifact',
      params: [{ name: 'name', in: 'query', required: true, placeholder: '*.jar' }, repos],
    },
    {
      name: 'Checksum Search',
      method: 'GET',
      path: '/artifactory/api/search/checksum',
      description: 'Fill in one of md5, sha1 or sha256.',
      params: [
        { name: 'sha256', in: 'query' },
        { name: 'sha1', in: 'query' },
        { name: 'md5', in: 'query' },
        repos,
      ],
    },
    {
      name: 'GAVC Search',
      method: 'GET',
      path: '/artifactory/api/search/gavc',
      description: 'Maven coordinates; at least one of g, a, v or c.',
      params: [
        { name: 'g', in: 'query', description: 'Group ID', placeholder: 'org.example' },
        { name: 'a', in: 'query', description: 'Artifact ID' },
        { name: 'v', in: 'query', description: 'Version' },
        { name: 'c', in: 'query', description: 'Classifier' },
        repos,
      ],
    },
    {
      name: 'Artifacts Created in Date Range',
      method: 'GET',
      path: '/artifactory/api/search/creation',
      description: 'Times are milliseconds since the epoch.',
      params: [
        { name: 'from', in: 'query', required: true, placeholder: '1735689600000' },
        { name: 'to', in: 'query', description: 'Defaults to now' },
        repos,
      ],
    },
    {
      name: 'Artifacts Not Downloaded Since',
      method: 'GET',
      path: '/artifactory/api/search/usage',
      description: 'Times are milliseconds since the epoch.',
      params: [
        { name: 'notUsedSince', in: 'query', required: true, placeholder: '1735689600000' },
        { name: 'createdBefore', in: 'query' },
        repos,
      ],
    },
    {
      name: 'Latest Version Search (Maven)',
      method: 'GET',
      path: '/artifactory/api/search/latestVersion',
      params: [
        { name: 'g', in: 'query', required: true, description: 'Group ID' },
        { name: 'a', in: 'query', required: true, description: 'Artifact ID' },
        { name: 'v', in: 'query', description: 'Version prefix, e.g. 1.0-SNAPSHOT' },
        { name: 'remote', in: 'query', enum: ['0', '1'] },
        repos,
      ],
    },
  ]),

  group('Builds', [
    {
      name: 'All Builds',
      method: 'GET',
      path: '/artifactory/api/build',
      params: [{ name: 'project', in: 'query', description: 'Project key' }],
    },
    {
      name: 'Build Runs',
      method: 'GET',
      path: '/artifactory/api/build/{buildName}',
      params: [
        { name: 'buildName', in: 'path', required: true },
        { name: 'project', in: 'query', description: 'Project key' },
      ],
    },
    {
      name: 'Build Info',
      method: 'GET',
      path: '/artifactory/api/build/{buildName}/{buildNumber}',
      params: [
        { name: 'buildName', in: 'path', required: true },
        { name: 'buildNumber', in: 'path', required: true },
        { name: 'project', in: 'query', description: 'Project key' },
      ],
    },
    {
      name: 'Builds Diff',
      method: 'GET',
      path: '/artifactory/api/build/{buildName}/{buildNumber}',
      params: [
        { name: 'buildName', in: 'path', required: true },
        { name: 'buildNumber', in: 'path', required: true },
        { name: 'diff', in: 'query', required: true, description: 'The older build number' },
        { name: 'project', in: 'query', description: 'Project key' },
      ],
    },
    {
      name: 'Build Promotion',
      method: 'POST',
      path: '/artifactory/api/build/promote/{buildName}/{buildNumber}',
      params: [
        { name: 'buildName', in: 'path', required: true },
        { name: 'buildNumber', in: 'path', required: true },
        { name: 'project', in: 'query', description: 'Project key' },
      ],
      body: json({
        status: 'released',
        comment: '',
        targetRepo: 'libs-release-local',
        copy: true,
        dependencies: false,
        dryRun: true,
      }),
    },
    {
      name: 'Delete Builds',
      method: 'POST',
      path: '/artifactory/api/build/delete',
      body: json({ buildName: '', buildNumbers: [''], deleteArtifacts: false, deleteAll: false }),
    },
  ]),

  group('Security & Access', [
    { name: 'Get Users', method: 'GET', path: '/access/api/v2/users' },
    {
      name: 'User Details',
      method: 'GET',
      path: '/access/api/v2/users/{username}',
      params: [{ name: 'username', in: 'path', required: true }],
    },
    { name: 'Get Groups', method: 'GET', path: '/access/api/v2/groups' },
    {
      name: 'Group Details',
      method: 'GET',
      path: '/access/api/v2/groups/{groupName}',
      params: [{ name: 'groupName', in: 'path', required: true }],
    },
    {
      name: 'Get Permission Targets',
      method: 'GET',
      path: '/artifactory/api/v2/security/permissions',
    },
    { name: 'Get Projects', method: 'GET', path: '/access/api/v1/projects' },
    { name: 'Get Tokens', method: 'GET', path: '/access/api/v1/tokens' },
    {
      name: 'Create Token',
      method: 'POST',
      path: '/access/api/v1/tokens',
      description: 'The response contains the new token. It is shown only once.',
      body: json({ scope: 'applied-permissions/user', expires_in: 3600, description: '' }),
    },
    {
      name: 'Revoke Token by ID',
      method: 'DELETE',
      path: '/access/api/v1/tokens/{tokenId}',
      params: [{ name: 'tokenId', in: 'path', required: true }],
    },
  ]),

  group('System', [
    { name: 'Ping', method: 'GET', path: '/artifactory/api/system/ping' },
    { name: 'Version', method: 'GET', path: '/artifactory/api/system/version' },
    {
      name: 'System Info',
      method: 'GET',
      path: '/artifactory/api/system',
      description: 'Admin only.',
    },
    { name: 'Platform Health', method: 'GET', path: '/router/api/v1/system/health' },
  ]),
];
