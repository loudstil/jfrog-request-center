// Server profiles: reading them from settings, choosing the active one, and naming their
// secrets. No vscode imports.
import { normalizeBaseUrl } from './jfrogClient';

/** A JFrog Platform the user can switch to. Its token is kept in SecretStorage, not here. */
export interface ServerProfile {
  name: string;
  url: string;
  username?: string;
}

/**
 * Validates the `servers` setting, which users can edit by hand: skips entries without a name or
 * an http(s) URL, normalizes URLs, and keeps only the first of several entries with the same name.
 */
export function readServerProfiles(raw: unknown): ServerProfile[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const servers: ServerProfile[] = [];
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) {
      continue;
    }
    const { name, url, username } = entry as Record<string, unknown>;
    if (typeof name !== 'string' || !name.trim() || typeof url !== 'string' || !isHttpUrl(url)) {
      continue;
    }
    const key = nameKey(name);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    servers.push({
      name: name.trim(),
      url: normalizeBaseUrl(url),
      username: typeof username === 'string' && username.trim() ? username.trim() : undefined,
    });
  }
  return servers;
}

/** The server named `activeName` (ignoring case), or the first server if that one is gone. */
export function pickActive(
  servers: readonly ServerProfile[],
  activeName: string | undefined,
): ServerProfile | undefined {
  const key = activeName === undefined ? undefined : nameKey(activeName);
  return servers.find((s) => nameKey(s.name) === key) ?? servers[0];
}

export function findServer(
  servers: readonly ServerProfile[],
  name: string,
): ServerProfile | undefined {
  return servers.find((s) => nameKey(s.name) === nameKey(name));
}

/** SecretStorage key for a server's token. Case-insensitive, like server names. */
export function tokenSecretKey(name: string): string {
  return `jfrogRequestCenter.token.${encodeURIComponent(nameKey(name))}`;
}

/** A readable default name for a server: its host, e.g. "mycompany.jfrog.io". */
export function defaultServerName(url: string): string {
  try {
    return new URL(url.trim()).host || url.trim();
  } catch {
    return url.trim();
  }
}

/** An error message for an invalid or taken name, or undefined if it's fine. */
export function validateServerName(
  name: string,
  servers: readonly ServerProfile[],
  currentName?: string,
): string | undefined {
  if (!name.trim()) {
    return 'Enter a name';
  }
  const clash = findServer(servers, name);
  if (clash && (currentName === undefined || nameKey(clash.name) !== nameKey(currentName))) {
    return `A server named "${clash.name}" already exists`;
  }
  return undefined;
}

/** Replaces the server named `previousName` (or appends `profile`), keeping the list's order. */
export function upsertServer(
  servers: readonly ServerProfile[],
  profile: ServerProfile,
  previousName?: string,
): ServerProfile[] {
  const key = nameKey(previousName ?? profile.name);
  const index = servers.findIndex((s) => nameKey(s.name) === key);
  return index === -1 ? [...servers, profile] : servers.map((s, i) => (i === index ? profile : s));
}

export function removeServer(servers: readonly ServerProfile[], name: string): ServerProfile[] {
  return servers.filter((s) => nameKey(s.name) !== nameKey(name));
}

/** The pre-0.1 single connection (platformUrl/username settings) as a server profile. */
export function legacyProfile(
  platformUrl: string | undefined,
  username: string | undefined,
): ServerProfile | undefined {
  if (!platformUrl?.trim() || !isHttpUrl(platformUrl)) {
    return undefined;
  }
  return {
    name: defaultServerName(platformUrl),
    url: normalizeBaseUrl(platformUrl),
    username: username?.trim() || undefined,
  };
}

/** Settings form of a profile: no undefined fields, so settings.json stays tidy. */
export function toSetting(profile: ServerProfile): Record<string, string> {
  return {
    name: profile.name,
    url: profile.url,
    ...(profile.username ? { username: profile.username } : {}),
  };
}

export function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value.trim());
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

function nameKey(name: string): string {
  return name.trim().toLocaleLowerCase();
}
